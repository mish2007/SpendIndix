begin;

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete restrict,
  month_start date not null,
  amount numeric(20, 6) not null check (amount > 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budgets_month_start_check
    check (extract(day from month_start) = 1)
);

create unique index if not exists budgets_user_category_month_unique
  on public.budgets (user_id, category_id, month_start);

create index if not exists budgets_user_month_idx
  on public.budgets (user_id, month_start);

create or replace function public.validate_budget_category()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  category_owner uuid;
  category_type text;
begin
  select c.owner_id, c.type
    into category_owner, category_type
    from public.categories c
    where c.id = new.category_id;

  if not found
     or (category_owner is not null and category_owner <> new.user_id)
     or category_type <> 'expense' then
    raise exception 'Choose an expense category belonging to this user.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists budgets_validate_category on public.budgets;
create trigger budgets_validate_category
  before insert or update of category_id, user_id
  on public.budgets
  for each row execute function public.validate_budget_category();

drop trigger if exists budgets_set_updated_at on public.budgets;
create trigger budgets_set_updated_at
  before update on public.budgets
  for each row execute function public.set_transaction_updated_at();

create or replace function public.prevent_budget_category_type_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.type is distinct from old.type
     and exists (
       select 1
       from public.budgets b
       where b.category_id = old.id
     ) then
    raise exception 'A category used by a budget cannot change type.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists categories_prevent_budget_type_change
  on public.categories;
create trigger categories_prevent_budget_type_change
  before update of type on public.categories
  for each row execute function public.prevent_budget_category_type_change();

create or replace function public.budget_month_expense_totals(
  p_month_start date
)
returns table (
  category_id uuid,
  currency_code text,
  total_amount numeric,
  transaction_count bigint
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required to view budget expenses.';
  end if;

  if p_month_start is null
     or extract(day from p_month_start) <> 1 then
    raise exception using
      errcode = '22023',
      message = 'A valid first day of a month is required.';
  end if;

  return query
  select
    t.category_id,
    t.currency_code,
    sum(t.amount)::numeric,
    count(*)::bigint
  from public.transactions t
  where t.user_id = auth.uid()
    and t.type = 'expense'
    and t.transaction_date >= p_month_start
    and t.transaction_date < (p_month_start + interval '1 month')::date
  group by t.category_id, t.currency_code
  order by t.currency_code, t.category_id;
end;
$$;

alter table public.budgets enable row level security;

drop policy if exists "Users read own budgets" on public.budgets;
create policy "Users read own budgets"
  on public.budgets for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users create own budgets" on public.budgets;
create policy "Users create own budgets"
  on public.budgets for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users update own budgets" on public.budgets;
create policy "Users update own budgets"
  on public.budgets for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users delete own budgets" on public.budgets;
create policy "Users delete own budgets"
  on public.budgets for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.budgets to authenticated;

revoke all on function public.validate_budget_category() from public;
revoke all on function public.prevent_budget_category_type_change() from public;
revoke all on function public.budget_month_expense_totals(date)
  from public, anon, authenticated;
grant execute on function public.budget_month_expense_totals(date)
  to authenticated;

commit;
