import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp, byId } from '../app-context';
import { sb, must } from '../lib/supabase';
import { downloadCsv, money, monthRange, num, r2, thDate, thMonth, today } from '../lib/format';
import type { Rebate, SaleSummary } from '../lib/types';
import { Card, Empty, Kpi } from '../ui';

type Row = Rebate & { sale: SaleSummary };

/** Owner-only list of customer rebates for bills dated in the selected month. */
export function RebatesPage() {
  const { month, customers, toast } = useApp();
  const cust = byId(customers);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [unpaidAll, setUnpaidAll] = useState<number | null>(null);

  const load = useCallback(async () => {
    const { from, to } = monthRange(month);
    try {
      const sales = must(await sb.from('sale_summary').select('*').gte('doc_date', from).lt('doc_date', to)) as SaleSummary[];
      const bySale = byId(sales);
      const rebates = sales.length
        ? (must(await sb.from('rebates').select('*').in('sale_id', sales.map(s => s.id))) as Rebate[])
        : [];
      setRows(rebates.map(r => ({ ...r, sale: bySale.get(r.sale_id)! })).sort((a, b) => a.sale.doc_no.localeCompare(b.sale.doc_no)));
      const pending = must(await sb.from('rebates').select('amount').is('paid_date', null)) as { amount: number }[];
      setUnpaidAll(pending.reduce((s, r) => s + num(r.amount), 0));
    } catch (e) { toast((e as Error).message); }
  }, [month, toast]);
  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    const list = rows ?? [];
    const rebate = list.reduce((s, r) => s + num(r.amount), 0);
    const billed = [...new Map(list.map(r => [r.sale.id, num(r.sale.subtotal)])).values()].reduce((s, v) => s + v, 0);
    return { rebate: r2(rebate), billed: r2(billed), unpaid: r2(list.filter(r => !r.paid_date).reduce((s, r) => s + num(r.amount), 0)) };
  }, [rows]);

  async function markPaid(r: Row) {
    const res = await sb.from('rebates').update({ paid_date: today() }).eq('id', r.id);
    if (res.error) return toast(res.error.message);
    load();
  }

  return (
    <div className="stack">
      <div className="kpis">
        <Kpi label="เงินทอนของบิลเดือนนี้" value={money(totals.rebate)} foot={totals.billed ? `${((totals.rebate / totals.billed) * 100).toFixed(1)}% ของยอดบิลที่มีเงินทอน` : undefined} />
        <Kpi label="ยังไม่คืน (บิลเดือนนี้)" value={money(totals.unpaid)} />
        <Kpi label="ยังไม่คืนทั้งหมด" value={unpaidAll == null ? '…' : money(unpaidAll)} tone={unpaidAll ? 'neg' : undefined} />
      </div>
      <Card title={`เงินทอนลูกค้า · ${thMonth(month)}`} sub="บันทึกภายใน เห็นเฉพาะเจ้าของ ไม่อยู่ในบิล ไม่อยู่ในรายงานภาษี · เพิ่มเงินทอนได้ที่หน้ารายละเอียดบิลขาย"
        actions={<button className="btn" onClick={() => rows && downloadCsv(`เงินทอน-${month}.csv`,
          ['เลขที่บิล', 'วันที่บิล', 'ลูกค้า', 'ยอดบิลก่อน VAT', 'เงินทอน', 'ได้จริง', 'วันที่คืน', 'หมายเหตุ'],
          rows.map(r => [r.sale.doc_no, r.sale.doc_date, cust.get(r.sale.customer_id)?.name, r.sale.subtotal, r.amount, r2(num(r.sale.subtotal) - num(r.amount)), r.paid_date, r.note]))}>ส่งออก Excel</button>}>
        {!rows ? <div className="muted">กำลังโหลด…</div> : rows.length === 0 ? <Empty>ไม่มีเงินทอนของบิลเดือนนี้</Empty> : (
          <div className="tablewrap">
            <table>
              <thead><tr><th>เลขที่บิล</th><th>วันที่</th><th>ลูกค้า</th><th className="n">ยอดบิล</th><th className="n">เงินทอน</th><th className="n">ได้จริง</th><th>สถานะ</th><th /></tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td className="doc">{r.sale.doc_no}</td>
                    <td>{thDate(r.sale.doc_date)}</td>
                    <td>{cust.get(r.sale.customer_id)?.name}</td>
                    <td className="n">{money(r.sale.subtotal)}</td>
                    <td className="n">{money(r.amount)}</td>
                    <td className="n">{money(num(r.sale.subtotal) - num(r.amount))}</td>
                    <td>{r.paid_date ? <span className="pill ok">คืนแล้ว {thDate(r.paid_date)}</span> : <span className="pill warn">ยังไม่คืน</span>}</td>
                    <td className="n">{!r.paid_date && <button className="btn sm" onClick={() => markPaid(r)}>คืนแล้ววันนี้</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
