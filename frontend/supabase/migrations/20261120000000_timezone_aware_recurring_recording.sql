begin;

drop function if exists public.record_due_recurring_transactions(uuid);

create or replace function public.set_recurring_rule_schedule()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  p_timezone text;
  local_today date;
begin
  if tg_op = 'INSERT' then
    new.occurrence_index := 0;
    new.next_due_date := new.start_date;
  elsif new.start_date is distinct from old.start_date
     or new.frequency is distinct from old.frequency then
    p_timezone := nullif(current_setting('spendindix.timezone', true), '');
    if p_timezone is null then
      local_today := current_date;
    elsif not exists (
      select 1
      from pg_catalog.pg_timezone_names
      where name = p_timezone
    ) then
      raise exception using
        errcode = '22023',
        message = 'A valid time zone is required to update a recurring schedule.';
    else
      local_today := (statement_timestamp() at time zone p_timezone)::date;
    end if;

    new.occurrence_index := case
      when new.start_date <= local_today then
        public.recurrence_index_after(
          new.start_date,
          new.frequency,
          local_today
        )
      else 0
    end;
    new.next_due_date := public.calculate_recurrence_date(
      new.start_date,
      new.frequency,
      new.occurrence_index
    );
  end if;

  new.active :=
    not new.paused
    and (new.end_date is null or new.next_due_date <= new.end_date);

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.list_due_recurring_occurrences(
  p_timezone text
)
returns table (
  rule_id uuid,
  transaction_type text,
  amount numeric,
  currency_code text,
  category_id uuid,
  category_name text,
  description text,
  frequency text,
  occurrence_date date
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  local_today date;
  rule_row record;
  due_date date;
  occurrence_index integer;
  occurrence_count integer := 0;
begin
  if auth.uid() is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required to list due transactions.';
  end if;

  if p_timezone is null or not exists (
    select 1
    from pg_catalog.pg_timezone_names
    where name = p_timezone
  ) then
    raise exception using
      errcode = '22023',
      message = 'A valid time zone is required.';
  end if;

  local_today := (statement_timestamp() at time zone p_timezone)::date;

  for rule_row in
    select r.*, c.name as category_name
    from public.recurring_rules r
    join public.categories c on c.id = r.category_id
    where r.user_id = auth.uid()
      and r.active
      and r.next_due_date <= local_today
      and (r.end_date is null or r.next_due_date <= r.end_date)
    order by r.next_due_date, r.id
  loop
    due_date := rule_row.next_due_date;
    occurrence_index := rule_row.occurrence_index;

    while due_date <= local_today
      and (rule_row.end_date is null or due_date <= rule_row.end_date)
    loop
      rule_id := rule_row.id;
      transaction_type := rule_row.type;
      amount := rule_row.amount;
      currency_code := rule_row.currency_code;
      category_id := rule_row.category_id;
      category_name := rule_row.category_name;
      description := rule_row.description;
      frequency := rule_row.frequency;
      occurrence_date := due_date;
      return next;

      occurrence_count := occurrence_count + 1;
      if occurrence_count > 100000 then
        raise exception 'Too many recurring occurrences are due to list.';
      end if;

      occurrence_index := occurrence_index + 1;
      due_date := public.calculate_recurrence_date(
        rule_row.start_date,
        rule_row.frequency,
        occurrence_index
      );
    end loop;
  end loop;

  return;
end;
$$;

create or replace function public.record_due_recurring_transactions(
  p_occurrences jsonb,
  p_timezone text
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  local_today date;
  requested_count integer;
  recorded_count integer := 0;
  has_duplicate boolean;
  requested_rule record;
  requested_occurrence record;
  rule_row public.recurring_rules%rowtype;
begin
  if auth.uid() is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required to record due transactions.';
  end if;

  if p_timezone is null or not exists (
    select 1
    from pg_catalog.pg_timezone_names
    where name = p_timezone
  ) then
    raise exception using
      errcode = '22023',
      message = 'A valid time zone is required.';
  end if;

  if p_occurrences is null or jsonb_typeof(p_occurrences) <> 'array' then
    raise exception using
      errcode = '22023',
      message = 'A list of confirmed occurrences is required.';
  end if;

  requested_count := jsonb_array_length(p_occurrences);
  if requested_count = 0 then
    return 0;
  end if;
  if requested_count > 100000 then
    raise exception using
      errcode = '22023',
      message = 'Too many occurrences were selected.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_occurrences) as item(value)
    where jsonb_typeof(item.value) <> 'object'
      or coalesce(jsonb_typeof(item.value -> 'rule_id'), '') <> 'string'
      or coalesce(jsonb_typeof(item.value -> 'occurrence_date'), '') <> 'string'
      or coalesce(item.value ->> 'occurrence_date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  ) then
    raise exception using
      errcode = '22023',
      message = 'The confirmed occurrences are not valid.';
  end if;

  select exists (
    select 1
    from jsonb_to_recordset(p_occurrences) as item(
      rule_id uuid,
      occurrence_date date
    )
    group by item.rule_id, item.occurrence_date
    having count(*) > 1
  )
  into has_duplicate;

  if has_duplicate then
    raise exception using
      errcode = '22023',
      message = 'The confirmed occurrence list contains duplicates.';
  end if;

  local_today := (statement_timestamp() at time zone p_timezone)::date;

  for requested_rule in
    select distinct item.rule_id
    from jsonb_to_recordset(p_occurrences) as item(
      rule_id uuid,
      occurrence_date date
    )
    order by item.rule_id
  loop
    select r.*
    into rule_row
    from public.recurring_rules r
    where r.id = requested_rule.rule_id
      and r.user_id = auth.uid()
    for update;

    if not found then
      raise exception using
        errcode = 'P0001',
        message = 'A selected schedule is unavailable. Refresh and confirm again.';
    end if;

    for requested_occurrence in
      select item.occurrence_date
      from jsonb_to_recordset(p_occurrences) as item(
        rule_id uuid,
        occurrence_date date
      )
      where item.rule_id = requested_rule.rule_id
      order by item.occurrence_date
    loop
      if not rule_row.active
        or rule_row.paused
        or requested_occurrence.occurrence_date <> rule_row.next_due_date
        or rule_row.next_due_date <> public.calculate_recurrence_date(
          rule_row.start_date,
          rule_row.frequency,
          rule_row.occurrence_index
        )
        or rule_row.next_due_date > local_today
        or (
          rule_row.end_date is not null
          and rule_row.next_due_date > rule_row.end_date
        )
      then
        raise exception using
          errcode = 'P0001',
          message = 'Selected recurring occurrences are no longer due. Refresh and confirm again.';
      end if;

      insert into public.transactions (
        user_id,
        type,
        amount,
        currency_code,
        category_id,
        transaction_date,
        description,
        recurring_rule_id,
        recurrence_date
      )
      values (
        rule_row.user_id,
        rule_row.type,
        rule_row.amount,
        rule_row.currency_code,
        rule_row.category_id,
        rule_row.next_due_date,
        rule_row.description,
        rule_row.id,
        rule_row.next_due_date
      )
      on conflict (recurring_rule_id, recurrence_date)
        where recurring_rule_id is not null
        do nothing;

      if found then
        recorded_count := recorded_count + 1;
      end if;

      rule_row.occurrence_index := rule_row.occurrence_index + 1;
      rule_row.next_due_date := public.calculate_recurrence_date(
        rule_row.start_date,
        rule_row.frequency,
        rule_row.occurrence_index
      );
    end loop;

    update public.recurring_rules
    set occurrence_index = rule_row.occurrence_index,
        next_due_date = rule_row.next_due_date
    where id = rule_row.id
      and user_id = auth.uid();
  end loop;

  return recorded_count;
end;
$$;

create or replace function public.save_recurring_rule(
  p_rule_id uuid,
  p_type text,
  p_amount numeric,
  p_currency_code text,
  p_category_id uuid,
  p_description text,
  p_frequency text,
  p_start_date date,
  p_end_date date,
  p_timezone text
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  saved_rule_id uuid;
begin
  if auth.uid() is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required to save a recurring schedule.';
  end if;

  if p_timezone is null or not exists (
    select 1
    from pg_catalog.pg_timezone_names
    where name = p_timezone
  ) then
    raise exception using
      errcode = '22023',
      message = 'A valid time zone is required.';
  end if;

  perform pg_catalog.set_config('spendindix.timezone', p_timezone, true);

  if p_rule_id is null then
    insert into public.recurring_rules (
      user_id,
      type,
      amount,
      currency_code,
      category_id,
      description,
      frequency,
      start_date,
      end_date
    )
    values (
      auth.uid(),
      p_type,
      p_amount,
      p_currency_code,
      p_category_id,
      p_description,
      p_frequency,
      p_start_date,
      p_end_date
    )
    returning id into saved_rule_id;
  else
    update public.recurring_rules
    set type = p_type,
        amount = p_amount,
        currency_code = p_currency_code,
        category_id = p_category_id,
        description = p_description,
        frequency = p_frequency,
        start_date = p_start_date,
        end_date = p_end_date
    where id = p_rule_id
      and user_id = auth.uid()
    returning id into saved_rule_id;

    if saved_rule_id is null then
      raise exception using
        errcode = 'P0001',
        message = 'This recurring schedule is unavailable.';
    end if;
  end if;

  return saved_rule_id;
end;
$$;

revoke all on function public.list_due_recurring_occurrences(text)
  from public, anon, authenticated;
revoke all on function public.record_due_recurring_transactions(jsonb, text)
  from public, anon, authenticated;
revoke all on function public.save_recurring_rule(
  uuid, text, numeric, text, uuid, text, text, date, date, text
) from public, anon, authenticated;

grant execute on function public.list_due_recurring_occurrences(text) to authenticated;
grant execute on function public.record_due_recurring_transactions(jsonb, text) to authenticated;
grant execute on function public.save_recurring_rule(
  uuid, text, numeric, text, uuid, text, text, date, date, text
) to authenticated;

commit;
