-- Per-bill totals (respects RLS of the caller) and the monthly invoice number sequence
create or replace view acct.sale_summary with (security_invoker = true) as
select s.id, s.doc_no, s.doc_date, s.due_date, s.customer_id, s.salesperson_id, s.has_vat, s.credit_days,
       s.commission_rate, s.note,
       coalesce(i.subtotal, 0) as subtotal,
       case when s.has_vat then round(coalesce(i.subtotal, 0) * st.vat_rate / 100, 2) else 0 end as vat,
       coalesce(i.subtotal, 0) + case when s.has_vat then round(coalesce(i.subtotal, 0) * st.vat_rate / 100, 2) else 0 end as total,
       coalesce(r.received, 0) as received,
       coalesce(r.deducted, 0) as deducted,
       round(coalesce(i.subtotal, 0) * s.commission_rate / 100, 2) as commission
from acct.sales s
cross join acct.settings st
left join (select sale_id, round(sum(qty * unit_price), 2) as subtotal from acct.sale_items group by sale_id) i on i.sale_id = s.id
left join (select sale_id, sum(amount) as received, sum(deduction) as deducted from acct.receipts group by sale_id) r on r.sale_id = s.id;

grant select on acct.sale_summary to authenticated;

-- next document number per month, e.g. IV6910-001 (Buddhist year); security definer so sales staff get a global sequence
create or replace function acct.next_sale_no(d date) returns text
language sql stable security definer set search_path = acct as $$
  select 'IV' || to_char(d, 'YY')::int + 43 || to_char(d, 'MM') || '-' ||
         lpad((coalesce(max(nullif(split_part(doc_no, '-', 2), '')::int), 0) + 1)::text, 3, '0')
  from acct.sales
  where doc_no like 'IV' || (to_char(d, 'YY')::int + 43) || to_char(d, 'MM') || '-%'
    and acct.my_role() is not null
$$;
revoke execute on function acct.next_sale_no(date) from public, anon;
grant execute on function acct.next_sale_no(date) to authenticated;
