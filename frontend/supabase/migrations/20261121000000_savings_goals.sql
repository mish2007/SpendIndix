begin;

create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  target_amount numeric(20, 6) not null check (target_amount > 0),
  initial_amount numeric(20, 6) not null default 0
    check (initial_amount >= 0 and initial_amount <= target_amount),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  target_date date,
  category text check (category is null or length(btrim(category)) > 0),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint savings_goals_id_user_unique unique (id, user_id)
);

create index if not exists savings_goals_user_created_idx
  on public.savings_goals (user_id, created_at desc);

create table if not exists public.savings_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  goal_id uuid not null,
  amount numeric(20, 6) not null check (amount > 0),
  contribution_date date not null default current_date,
  note text,
  created_at timestamptz not null default now(),
  constraint savings_contributions_goal_owner_fk
    foreign key (goal_id, user_id)
    references public.savings_goals (id, user_id)
    on delete cascade
);

create index if not exists savings_contributions_user_goal_date_idx
  on public.savings_contributions (
    user_id,
    goal_id,
    contribution_date desc,
    created_at desc
  );

create or replace function public.validate_savings_goal()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  contribution_total numeric;
begin
  if auth.uid() is null or new.user_id is distinct from auth.uid() then
    raise exception 'Savings goals must belong to the authenticated user.'
      using errcode = '42501';
  end if;

  select coalesce(sum(c.amount), 0)
    into contribution_total
    from public.savings_contributions c
    where c.goal_id = new.id;

  if new.initial_amount + contribution_total > new.target_amount then
    raise exception 'The target amount cannot be lower than the amount already saved.'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE'
     and new.currency_code is distinct from old.currency_code then
    if contribution_total > 0
       or old.initial_amount > 0
       or new.initial_amount > 0 then
      raise exception 'A goal currency cannot be changed after savings are recorded.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists savings_goals_validate on public.savings_goals;
create trigger savings_goals_validate
  before insert or update of
    user_id,
    target_amount,
    initial_amount,
    currency_code
  on public.savings_goals
  for each row execute function public.validate_savings_goal();

drop trigger if exists savings_goals_set_updated_at on public.savings_goals;
create trigger savings_goals_set_updated_at
  before update on public.savings_goals
  for each row execute function public.set_transaction_updated_at();

create or replace function public.validate_savings_contribution()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  goal_record record;
  contribution_total numeric;
begin
  if auth.uid() is null or new.user_id is distinct from auth.uid() then
    raise exception 'Savings contributions must belong to the authenticated user.'
      using errcode = '42501';
  end if;

  select g.user_id, g.initial_amount, g.target_amount
    into goal_record
    from public.savings_goals g
    where g.id = new.goal_id
    for update;

  if not found then
    raise exception 'The savings goal is not available to this user.'
      using errcode = '23503';
  end if;

  if goal_record.user_id is distinct from new.user_id then
    raise exception 'The savings goal is not available to this user.'
      using errcode = '23503';
  end if;

  select coalesce(sum(c.amount), 0)
    into contribution_total
    from public.savings_contributions c
    where c.goal_id = new.goal_id;

  if goal_record.initial_amount + contribution_total + new.amount
     > goal_record.target_amount then
    raise exception 'The contribution exceeds the remaining amount for this goal.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists savings_contributions_validate
  on public.savings_contributions;
create trigger savings_contributions_validate
  before insert on public.savings_contributions
  for each row execute function public.validate_savings_contribution();

alter table public.savings_goals enable row level security;
alter table public.savings_contributions enable row level security;

drop policy if exists "Users read own savings goals" on public.savings_goals;
create policy "Users read own savings goals"
  on public.savings_goals for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users create own savings goals" on public.savings_goals;
create policy "Users create own savings goals"
  on public.savings_goals for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users update own savings goals" on public.savings_goals;
create policy "Users update own savings goals"
  on public.savings_goals for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users delete own savings goals" on public.savings_goals;
create policy "Users delete own savings goals"
  on public.savings_goals for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users read own savings contributions"
  on public.savings_contributions;
create policy "Users read own savings contributions"
  on public.savings_contributions for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users create own savings contributions"
  on public.savings_contributions;
create policy "Users create own savings contributions"
  on public.savings_contributions for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users delete own savings contributions"
  on public.savings_contributions;
create policy "Users delete own savings contributions"
  on public.savings_contributions for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.savings_goals to authenticated;
grant select, insert, delete on public.savings_contributions to authenticated;

revoke all on function public.validate_savings_goal()
  from public, anon, authenticated;
revoke all on function public.validate_savings_contribution()
  from public, anon, authenticated;

commit;
