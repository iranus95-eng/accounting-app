-- Customer rebates (เงินทอนลูกค้า): internal management record, never printed on the bill and not part of VAT.
-- Counted against the sale's month so the owner sees real monthly profit. Owner-only.
create table acct.rebates (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references acct.sales(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  paid_date date,
  note text,
  created_at timestamptz not null default now()
);
create index on acct.rebates (sale_id);

alter table acct.rebates enable row level security;
create policy owner_all on acct.rebates for all to authenticated
  using (acct.my_role() = 'owner') with check (acct.my_role() = 'owner');
grant select, insert, update, delete on acct.rebates to authenticated;
