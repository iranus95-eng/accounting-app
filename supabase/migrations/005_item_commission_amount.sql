-- Commission is a baht amount entered per bill line (differs by product), not a % of the bill.
alter table acct.sale_items add column commission numeric(14,2) not null default 0 check (commission >= 0);
-- optional default per unit, used to prefill the line when the product is picked
alter table acct.products add column commission_per_unit numeric(14,4);

create or replace view acct.sale_summary with (security_invoker = true) as
select s.id, s.doc_no, s.doc_date, s.due_date, s.customer_id, s.salesperson_id, s.has_vat, s.credit_days,
       s.commission_rate, s.note,
       coalesce(i.subtotal, 0) as subtotal,
       case when s.has_vat then round(coalesce(i.subtotal, 0) * st.vat_rate / 100, 2) else 0 end as vat,
       coalesce(i.subtotal, 0) + case when s.has_vat then round(coalesce(i.subtotal, 0) * st.vat_rate / 100, 2) else 0 end as total,
       coalesce(r.received, 0) as received,
       coalesce(r.deducted, 0) as deducted,
       coalesce(i.commission, 0) as commission
from acct.sales s
cross join acct.settings st
left join (select sale_id, round(sum(qty * unit_price), 2) as subtotal, sum(commission) as commission from acct.sale_items group by sale_id) i on i.sale_id = s.id
left join (select sale_id, sum(amount) as received, sum(deduction) as deducted from acct.receipts group by sale_id) r on r.sale_id = s.id;
