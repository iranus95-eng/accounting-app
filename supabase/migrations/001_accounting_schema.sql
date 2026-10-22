-- Wonder Accounting: core schema (applied as migration acct_wonder_accounting_core)
-- All tables live in schema "acct" so they can share a Supabase project with other apps.

create schema if not exists acct;

-- ---------- people & access ----------
create table acct.members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null check (role in ('owner', 'bookkeeper', 'sales')),
  salesperson_id uuid,
  created_at timestamptz not null default now()
);

create or replace function acct.my_role() returns text
language sql stable security definer set search_path = acct as $$
  select role from acct.members where user_id = auth.uid()
$$;

create or replace function acct.my_salesperson() returns uuid
language sql stable security definer set search_path = acct as $$
  select salesperson_id from acct.members where user_id = auth.uid()
$$;

create table acct.settings (
  id int primary key default 1 check (id = 1),
  company_name text not null default 'บริษัท วันเดอร์พริ้น จำกัด',
  vat_rate numeric(5,2) not null default 7,
  sso_rate numeric(5,2) not null default 5,
  sso_min numeric(12,2) not null default 1650,
  sso_max numeric(12,2) not null default 17500,
  petty_limit numeric(12,2) not null default 5000
);
insert into acct.settings default values;

-- ---------- master data ----------
create table acct.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table acct.products (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null,
  category_id uuid not null references acct.categories(id),
  price numeric(14,4) not null default 0,      -- before VAT; some items are priced per sheet
  cost numeric(14,4),
  active boolean not null default true
);

create table acct.customers (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null,
  tax_id text check (tax_id is null or tax_id ~ '^\d{13}$'),
  branch text not null default 'สำนักงานใหญ่',
  credit_days int check (credit_days in (0, 30, 45, 60)),   -- null = choose per bill
  pay_day int check (pay_day between 1 and 31),             -- usual collection day of month
  address text,
  phone text,
  note text,
  active boolean not null default true
);

create table acct.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tax_id text check (tax_id is null or tax_id ~ '^\d{13}$'),
  credit_days int check (credit_days in (0, 30, 45, 60)),
  phone text
);

create table acct.salespeople (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  commission_rate numeric(5,2) not null default 0,   -- % of sales before VAT
  is_employee boolean not null default false,
  active boolean not null default true
);

alter table acct.members
  add constraint members_salesperson_fk foreign key (salesperson_id) references acct.salespeople(id);

create table acct.employees (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  first_name text not null,
  last_name text not null,
  position text,
  start_date date,
  end_date date,
  tax_id text,
  phone text,
  address text,
  salary numeric(12,2) not null default 0,
  in_sso boolean not null default true,
  bank text,
  bank_account text
);

-- ---------- transactions ----------
create table acct.sales (
  id uuid primary key default gen_random_uuid(),
  doc_no text not null unique,
  doc_date date not null,
  customer_id uuid not null references acct.customers(id),
  salesperson_id uuid references acct.salespeople(id),
  commission_rate numeric(5,2) not null default 0,   -- snapshot at billing time
  has_vat boolean not null,
  credit_days int not null check (credit_days in (0, 30, 45, 60)),
  due_date date generated always as (doc_date + credit_days) stored,
  note text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table acct.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references acct.sales(id) on delete cascade,
  product_id uuid references acct.products(id),
  description text not null,
  category_id uuid not null references acct.categories(id),
  qty numeric(14,2) not null check (qty > 0),
  unit_price numeric(14,4) not null check (unit_price >= 0)
);

create table acct.receipts (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references acct.sales(id) on delete cascade,
  receipt_date date not null,
  amount numeric(14,2) not null,
  deduction numeric(14,2) not null default 0,   -- amount withheld by customer (pending user's answer)
  note text
);

create table acct.purchases (
  id uuid primary key default gen_random_uuid(),
  doc_no text,
  doc_date date not null,
  supplier_id uuid not null references acct.suppliers(id),
  category_id uuid references acct.categories(id),
  description text,
  amount numeric(14,2) not null,        -- before VAT, expensed as cost of sales (no stock)
  has_vat boolean not null default true,
  credit_days int not null default 0 check (credit_days in (0, 30, 45, 60)),
  due_date date generated always as (doc_date + credit_days) stored,
  paid_date date
);

create table acct.expenses (
  id uuid primary key default gen_random_uuid(),
  doc_date date not null,
  category text not null,
  description text,
  amount numeric(14,2) not null check (amount > 0)
);

create table acct.petty_cash (
  id uuid primary key default gen_random_uuid(),
  doc_date date not null,
  kind text not null check (kind in ('in', 'out')),
  category text not null,
  description text,
  amount numeric(14,2) not null check (amount > 0)
);

create table acct.payroll (
  id uuid primary key default gen_random_uuid(),
  month date not null,                       -- first day of the month
  employee_id uuid not null references acct.employees(id),
  salary numeric(12,2) not null,
  overtime numeric(12,2) not null default 0,
  sso_employee numeric(12,2) not null,
  sso_employer numeric(12,2) not null,
  advance_deduction numeric(12,2) not null default 0,
  pay_date date,
  unique (month, employee_id)
);

create index on acct.sales (doc_date);
create index on acct.sales (customer_id);
create index on acct.sales (salesperson_id);
create index on acct.sale_items (sale_id);
create index on acct.sale_items (category_id);
create index on acct.receipts (sale_id);
create index on acct.purchases (doc_date);
create index on acct.purchases (supplier_id);
create index on acct.payroll (employee_id);
create index on acct.products (category_id);
create index on acct.members (salesperson_id);

-- ---------- row level security ----------
do $$
declare t text;
begin
  foreach t in array array['settings','categories','products','customers','suppliers','salespeople','employees',
                           'sales','sale_items','receipts','purchases','expenses','petty_cash','payroll','members']
  loop
    execute format('alter table acct.%I enable row level security', t);
  end loop;
end $$;

-- owner and bookkeeper: full access to everything except member management (owner only)
do $$
declare t text;
begin
  foreach t in array array['settings','categories','products','customers','suppliers','salespeople','employees',
                           'sales','sale_items','receipts','purchases','expenses','petty_cash','payroll']
  loop
    execute format($p$create policy staff_all on acct.%I for all to authenticated
      using (acct.my_role() in ('owner','bookkeeper')) with check (acct.my_role() in ('owner','bookkeeper'))$p$, t);
  end loop;
end $$;

create policy owner_members on acct.members for all to authenticated
  using (acct.my_role() = 'owner') with check (acct.my_role() = 'owner');
create policy self_member on acct.members for select to authenticated using (user_id = auth.uid());

-- sales role: read master data, see and create only their own bills
create policy sales_read_categories on acct.categories for select to authenticated using (acct.my_role() = 'sales');
create policy sales_read_products on acct.products for select to authenticated using (acct.my_role() = 'sales');
create policy sales_read_customers on acct.customers for select to authenticated using (acct.my_role() = 'sales');
create policy sales_read_settings on acct.settings for select to authenticated using (acct.my_role() = 'sales');
create policy sales_read_self on acct.salespeople for select to authenticated
  using (acct.my_role() = 'sales' and id = acct.my_salesperson());
create policy sales_own_sales on acct.sales for select to authenticated
  using (acct.my_role() = 'sales' and salesperson_id = acct.my_salesperson());
create policy sales_insert_sales on acct.sales for insert to authenticated
  with check (acct.my_role() = 'sales' and salesperson_id = acct.my_salesperson());
create policy sales_own_items on acct.sale_items for select to authenticated
  using (acct.my_role() = 'sales' and exists (select 1 from acct.sales s where s.id = sale_id and s.salesperson_id = acct.my_salesperson()));
create policy sales_insert_items on acct.sale_items for insert to authenticated
  with check (acct.my_role() = 'sales' and exists (select 1 from acct.sales s where s.id = sale_id and s.salesperson_id = acct.my_salesperson()));
create policy sales_own_receipts on acct.receipts for select to authenticated
  using (acct.my_role() = 'sales' and exists (select 1 from acct.sales s where s.id = sale_id and s.salesperson_id = acct.my_salesperson()));

revoke all on function acct.my_role() from public, anon;
revoke all on function acct.my_salesperson() from public, anon;
grant execute on function acct.my_role() to authenticated;
grant execute on function acct.my_salesperson() to authenticated;
grant usage on schema acct to authenticated;
grant select, insert, update, delete on all tables in schema acct to authenticated;
