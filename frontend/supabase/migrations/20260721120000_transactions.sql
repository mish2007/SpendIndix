create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  name text not null check (length(btrim(name)) between 1 and 80),
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  constraint categories_system_owner_check
    check ((is_system and owner_id is null) or (not is_system and owner_id is not null))
);

create unique index if not exists categories_system_name_unique
  on public.categories (type, lower(name))
  where owner_id is null;

create unique index if not exists categories_user_name_unique
  on public.categories (owner_id, type, lower(name))
  where owner_id is not null;

insert into public.categories (owner_id, type, name, is_system)
values
  (null, 'expense', 'Housing', true),
  (null, 'expense', 'Groceries', true),
  (null, 'expense', 'Dining out', true),
  (null, 'expense', 'Transport', true),
  (null, 'expense', 'Utilities', true),
  (null, 'expense', 'Healthcare', true),
  (null, 'expense', 'Education', true),
  (null, 'expense', 'Shopping', true),
  (null, 'expense', 'Entertainment', true),
  (null, 'expense', 'Subscriptions', true),
  (null, 'expense', 'Travel', true),
  (null, 'expense', 'Personal care', true),
  (null, 'expense', 'Family', true),
  (null, 'expense', 'Insurance', true),
  (null, 'expense', 'Taxes', true),
  (null, 'expense', 'Other expense', true),
  (null, 'income', 'Salary', true),
  (null, 'income', 'Freelance', true),
  (null, 'income', 'Business', true),
  (null, 'income', 'Investments', true),
  (null, 'income', 'Gifts', true),
  (null, 'income', 'Refunds', true),
  (null, 'income', 'Rental income', true),
  (null, 'income', 'Other income', true)
on conflict do nothing;

create table if not exists public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  amount numeric(20, 6) not null check (amount > 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  category_id uuid not null references public.categories (id) on delete restrict,
  description text,
  frequency text not null check (frequency in ('weekly', 'monthly', 'yearly')),
  start_date date not null,
  end_date date,
  next_due_date date not null,
  occurrence_index integer not null default 0 check (occurrence_index >= 0),
  paused boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_rules_end_date_check
    check (end_date is null or end_date >= start_date)
);

alter table public.recurring_rules
  add column if not exists paused boolean not null default false;

create index if not exists recurring_rules_user_due_idx
  on public.recurring_rules (user_id, active, next_due_date);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  amount numeric(20, 6) not null check (amount > 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  category_id uuid not null references public.categories (id) on delete restrict,
  transaction_date date not null,
  description text,
  receipt_path text,
  recurring_rule_id uuid references public.recurring_rules (id) on delete set null,
  recurrence_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_recurrence_fields_check
    check (recurring_rule_id is null or recurrence_date is not null)
);

create index if not exists transactions_user_date_idx
  on public.transactions (user_id, transaction_date desc, id desc);

create index if not exists transactions_user_category_date_idx
  on public.transactions (user_id, category_id, transaction_date desc);

create unique index if not exists transactions_recurring_occurrence_unique
  on public.transactions (recurring_rule_id, recurrence_date)
  where recurring_rule_id is not null;

create or replace function public.validate_finance_category()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  category_owner uuid;
  category_type text;
  recurring_owner uuid;
begin
  select c.owner_id, c.type
    into category_owner, category_type
    from public.categories c
    where c.id = new.category_id;

  if not found
     or (category_owner is not null and category_owner <> new.user_id)
     or category_type <> new.type then
    raise exception 'Choose a category belonging to this user and transaction type.'
      using errcode = '23514';
  end if;

  if tg_table_name = 'transactions' then
    if new.recurring_rule_id is not null then
      select r.user_id
        into recurring_owner
        from public.recurring_rules r
        where r.id = new.recurring_rule_id;

      if not found or recurring_owner <> new.user_id then
        raise exception 'A recurring occurrence must belong to this user.'
          using errcode = '23514';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists transactions_validate_category on public.transactions;
create trigger transactions_validate_category
  before insert or update of
    category_id,
    type,
    user_id,
    recurring_rule_id,
    recurrence_date
  on public.transactions
  for each row execute function public.validate_finance_category();

create or replace function public.set_transaction_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists transactions_set_updated_at on public.transactions;
create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_transaction_updated_at();

drop trigger if exists recurring_rules_validate_category on public.recurring_rules;
create trigger recurring_rules_validate_category
  before insert or update of category_id, type, user_id
  on public.recurring_rules
  for each row execute function public.validate_finance_category();

create or replace function public.calculate_recurrence_date(
  p_start_date date,
  p_frequency text,
  p_occurrence_index integer
)
returns date
language plpgsql
immutable
strict
set search_path = public, pg_temp
as $$
declare
  target_month date;
  target_day integer;
begin
  if p_occurrence_index < 0 then
    raise exception 'Occurrence index cannot be negative.';
  end if;

  if p_frequency = 'weekly' then
    return p_start_date + (p_occurrence_index * 7);
  elsif p_frequency = 'monthly' then
    target_month := (
      date_trunc('month', p_start_date)::date
      + make_interval(months => p_occurrence_index)
    )::date;
  elsif p_frequency = 'yearly' then
    target_month := (
      date_trunc('year', p_start_date)::date
      + make_interval(years => p_occurrence_index)
      + make_interval(months => extract(month from p_start_date)::integer - 1)
    )::date;
  else
    raise exception 'Unsupported recurrence frequency.';
  end if;

  target_day := least(
    extract(day from p_start_date)::integer,
    extract(day from (target_month + interval '1 month - 1 day'))::integer
  );

  return target_month + (target_day - 1);
end;
$$;

create or replace function public.recurrence_index_after(
  p_start_date date,
  p_frequency text,
  p_after_date date
)
returns integer
language plpgsql
immutable
strict
set search_path = public, pg_temp
as $$
declare
  occurrence_index integer := 0;
begin
  while public.calculate_recurrence_date(
    p_start_date,
    p_frequency,
    occurrence_index
  ) <= p_after_date loop
    occurrence_index := occurrence_index + 1;
    if occurrence_index > 100000 then
      raise exception 'Could not calculate the next recurring date.';
    end if;
  end loop;

  return occurrence_index;
end;
$$;

create or replace function public.set_recurring_rule_schedule()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.occurrence_index := 0;
    new.next_due_date := new.start_date;
  elsif new.start_date is distinct from old.start_date
     or new.frequency is distinct from old.frequency then
    new.occurrence_index := case
      when new.start_date <= current_date then
        public.recurrence_index_after(
          new.start_date,
          new.frequency,
          current_date
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

drop trigger if exists recurring_rules_set_schedule on public.recurring_rules;
create trigger recurring_rules_set_schedule
  before insert or update on public.recurring_rules
  for each row execute function public.set_recurring_rule_schedule();

create or replace function public.list_user_transactions(
  p_search text default null,
  p_type text default null,
  p_category_id uuid default null,
  p_from_date date default null,
  p_to_date date default null,
  p_sort text default 'date_desc',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  type text,
  amount numeric,
  currency_code text,
  category_id uuid,
  category_name text,
  category_is_system boolean,
  transaction_date date,
  description text,
  receipt_path text,
  recurring_rule_id uuid,
  recurrence_date date,
  created_at timestamptz,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with filtered as (
    select
      t.id,
      t.type,
      t.amount,
      t.currency_code,
      t.category_id,
      c.name as category_name,
      c.is_system as category_is_system,
      t.transaction_date,
      t.description,
      t.receipt_path,
      t.recurring_rule_id,
      t.recurrence_date,
      t.created_at
    from public.transactions t
    join public.categories c on c.id = t.category_id
    where t.user_id = auth.uid()
      and (p_type is null or t.type = p_type)
      and (p_category_id is null or t.category_id = p_category_id)
      and (p_from_date is null or t.transaction_date >= p_from_date)
      and (p_to_date is null or t.transaction_date <= p_to_date)
      and (
        nullif(btrim(p_search), '') is null
        or coalesce(t.description, '') ilike '%' || btrim(p_search) || '%'
        or c.name ilike '%' || btrim(p_search) || '%'
      )
  )
  select
    f.id,
    f.type,
    f.amount,
    f.currency_code,
    f.category_id,
    f.category_name,
    f.category_is_system,
    f.transaction_date,
    f.description,
    f.receipt_path,
    f.recurring_rule_id,
    f.recurrence_date,
    f.created_at,
    count(*) over ()
  from filtered f
  order by
    case when p_sort = 'date_asc' then f.transaction_date end asc,
    case when p_sort = 'date_desc' then f.transaction_date end desc,
    case when p_sort = 'amount_asc' then f.amount end asc,
    case when p_sort = 'amount_desc' then f.amount end desc,
    f.transaction_date desc,
    f.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function public.transaction_summary(
  p_from_date date default null,
  p_to_date date default null
)
returns table (
  currency_code text,
  type text,
  total_amount numeric,
  transaction_count bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    t.currency_code,
    t.type,
    sum(t.amount)::numeric,
    count(*)::bigint
  from public.transactions t
  where t.user_id = auth.uid()
    and (p_from_date is null or t.transaction_date >= p_from_date)
    and (p_to_date is null or t.transaction_date <= p_to_date)
  group by t.currency_code, t.type
  order by t.currency_code, t.type;
$$;

create or replace function public.category_usage_counts()
returns table (
  category_id uuid,
  transaction_count bigint,
  recurring_count bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    c.id,
    count(distinct t.id)::bigint,
    count(distinct r.id)::bigint
  from public.categories c
  left join public.transactions t
    on t.category_id = c.id
    and t.user_id = auth.uid()
  left join public.recurring_rules r
    on r.category_id = c.id
    and r.user_id = auth.uid()
  where c.owner_id is null or c.owner_id = auth.uid()
  group by c.id;
$$;

create or replace function public.record_due_recurring_transactions(
  p_rule_id uuid default null
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  rule_row public.recurring_rules%rowtype;
  next_index integer;
  recorded_count integer := 0;
begin
  for rule_row in
    select *
    from public.recurring_rules
    where user_id = auth.uid()
      and active
      and next_due_date <= current_date
      and (end_date is null or next_due_date <= end_date)
      and (p_rule_id is null or id = p_rule_id)
    order by next_due_date, id
    for update
  loop
    while rule_row.next_due_date <= current_date
      and (rule_row.end_date is null or rule_row.next_due_date <= rule_row.end_date)
    loop
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

      next_index := rule_row.occurrence_index + 1;
      rule_row.occurrence_index := next_index;
      rule_row.next_due_date := public.calculate_recurrence_date(
        rule_row.start_date,
        rule_row.frequency,
        next_index
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

alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.recurring_rules enable row level security;

drop policy if exists "Categories visible to owner or system" on public.categories;
create policy "Categories visible to owner or system"
  on public.categories for select to authenticated
  using (owner_id is null or owner_id = auth.uid());

drop policy if exists "Users create custom categories" on public.categories;
create policy "Users create custom categories"
  on public.categories for insert to authenticated
  with check (owner_id = auth.uid() and not is_system);

drop policy if exists "Users update custom categories" on public.categories;
create policy "Users update custom categories"
  on public.categories for update to authenticated
  using (owner_id = auth.uid() and not is_system)
  with check (owner_id = auth.uid() and not is_system);

drop policy if exists "Users delete custom categories" on public.categories;
create policy "Users delete custom categories"
  on public.categories for delete to authenticated
  using (owner_id = auth.uid() and not is_system);

drop policy if exists "Users read own transactions" on public.transactions;
create policy "Users read own transactions"
  on public.transactions for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users create own transactions" on public.transactions;
create policy "Users create own transactions"
  on public.transactions for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users update own transactions" on public.transactions;
create policy "Users update own transactions"
  on public.transactions for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users delete own transactions" on public.transactions;
create policy "Users delete own transactions"
  on public.transactions for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users read own recurring rules" on public.recurring_rules;
create policy "Users read own recurring rules"
  on public.recurring_rules for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users create own recurring rules" on public.recurring_rules;
create policy "Users create own recurring rules"
  on public.recurring_rules for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users update own recurring rules" on public.recurring_rules;
create policy "Users update own recurring rules"
  on public.recurring_rules for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users delete own recurring rules" on public.recurring_rules;
create policy "Users delete own recurring rules"
  on public.recurring_rules for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.transactions to authenticated;
grant select, insert, update, delete on public.recurring_rules to authenticated;

revoke all on function public.validate_finance_category() from public;
revoke all on function public.set_transaction_updated_at() from public;
revoke all on function public.calculate_recurrence_date(date, text, integer) from public;
revoke all on function public.recurrence_index_after(date, text, date) from public;
revoke all on function public.set_recurring_rule_schedule() from public;
revoke all on function public.list_user_transactions(text, text, uuid, date, date, text, integer, integer) from public;
revoke all on function public.transaction_summary(date, date) from public;
revoke all on function public.category_usage_counts() from public;
revoke all on function public.record_due_recurring_transactions(uuid) from public;

grant execute on function public.list_user_transactions(text, text, uuid, date, date, text, integer, integer) to authenticated;
grant execute on function public.transaction_summary(date, date) to authenticated;
grant execute on function public.category_usage_counts() to authenticated;
grant execute on function public.record_due_recurring_transactions(uuid) to authenticated;
grant execute on function public.calculate_recurrence_date(date, text, integer) to authenticated;
grant execute on function public.recurrence_index_after(date, text, date) to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'transaction-receipts',
  'transaction-receipts',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users read own transaction receipts" on storage.objects;
create policy "Users read own transaction receipts"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'transaction-receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users upload own transaction receipts" on storage.objects;
create policy "Users upload own transaction receipts"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'transaction-receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users delete own transaction receipts" on storage.objects;
create policy "Users delete own transaction receipts"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'transaction-receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
