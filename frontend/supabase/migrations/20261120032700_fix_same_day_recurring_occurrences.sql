begin;

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
          local_today - 1
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

create or replace function public.repair_due_recurring_rule_schedules(
  p_timezone text
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  local_today date;
  repaired_count integer;
begin
  if auth.uid() is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required to repair recurring schedules.';
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

  with candidates as (
    select
      r.id,
      r.user_id,
      r.start_date,
      r.frequency,
      r.end_date as current_end_date,
      r.occurrence_index as current_occurrence_index,
      r.next_due_date as current_next_due_date,
      public.recurrence_index_after(
        r.start_date,
        r.frequency,
        local_today - 1
      ) as target_occurrence_index
    from public.recurring_rules r
    where r.user_id = auth.uid()
      and r.start_date <= local_today
      and (r.end_date is null or r.end_date >= local_today)
      and r.next_due_date > local_today
      and r.occurrence_index = public.recurrence_index_after(
        r.start_date,
        r.frequency,
        local_today - 1
      ) + 1
      and r.next_due_date = public.calculate_recurrence_date(
        r.start_date,
        r.frequency,
        r.occurrence_index
      )
      and public.calculate_recurrence_date(
        r.start_date,
        r.frequency,
        public.recurrence_index_after(
          r.start_date,
          r.frequency,
          local_today - 1
        )
      ) = local_today
      and not exists (
        select 1
        from public.transactions t
        where t.user_id = auth.uid()
          and t.recurring_rule_id = r.id
          and t.recurrence_date >= local_today
      )
  )
  -- Repair only today's skipped occurrence, never an already recorded one.
  update public.recurring_rules r
  set occurrence_index = c.target_occurrence_index,
      next_due_date = local_today
  from candidates c
  where r.id = c.id
    and r.user_id = auth.uid()
    and r.start_date = c.start_date
    and r.frequency = c.frequency
    and r.end_date is not distinct from c.current_end_date
    and r.occurrence_index = c.current_occurrence_index
    and r.next_due_date = c.current_next_due_date;

  get diagnostics repaired_count = row_count;
  return repaired_count;
end;
$$;

revoke all on function public.repair_due_recurring_rule_schedules(text)
  from public, anon, authenticated;
grant execute on function public.repair_due_recurring_rule_schedules(text)
  to authenticated;

commit;
