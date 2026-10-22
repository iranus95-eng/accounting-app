import { useEffect, useState } from 'react';
import { useApp, byId } from '../app-context';
import { sb, must } from '../lib/supabase';
import { downloadCsv, money, monthRange, num, r2, shiftMonth, thMonth } from '../lib/format';
import type { Expense, Payroll, PettyCash, Purchase, SaleSummary } from '../lib/types';
import { Card, Empty, Kpi } from '../ui';

interface RebateRow { amount: number; paid_date: string | null; sales: { doc_date: string } }
interface ItemRow { qty: number; unit_price: number; category_id: string; sales: { doc_date: string; has_vat: boolean } }

export interface MonthData {
  sales: SaleSummary[];
  items: ItemRow[];
  purchases: Purchase[];
  expenses: Expense[];
  petty: PettyCash[];
  payroll: Payroll[];
  /** empty unless the viewer is the owner (RLS) */
  rebates: RebateRow[];
}

export function useMonthData(month: string) {
  const [data, setData] = useState<MonthData | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setData(null);
    const { from, to } = monthRange(month);
    Promise.all([
      sb.from('sale_summary').select('*').gte('doc_date', from).lt('doc_date', to),
      sb.from('sale_items').select('qty,unit_price,category_id,sales!inner(doc_date,has_vat)').gte('sales.doc_date', from).lt('sales.doc_date', to),
      sb.from('purchases').select('*').gte('doc_date', from).lt('doc_date', to),
      sb.from('expenses').select('*').gte('doc_date', from).lt('doc_date', to),
      sb.from('petty_cash').select('*').gte('doc_date', from).lt('doc_date', to),
      sb.from('payroll').select('*').eq('month', from),
      sb.from('rebates').select('amount,paid_date,sales!inner(doc_date)').gte('sales.doc_date', from).lt('sales.doc_date', to),
    ]).then(([s, i, p, e, pc, pr, rb]) => {
      if (!live) return;
      try {
        setData({
          sales: must(s) as SaleSummary[], items: must(i) as unknown as ItemRow[], purchases: must(p) as Purchase[],
          expenses: must(e) as Expense[], petty: must(pc) as PettyCash[], payroll: must(pr) as Payroll[],
          rebates: must(rb) as unknown as RebateRow[],
        });
      } catch (err) { setError((err as Error).message); }
    });
    return () => { live = false; };
  }, [month]);
  return { data, error };
}

export interface PL {
  /** billed sales before VAT; revenue is after rebates */
  billed: number; rebates: number; revenue: number; cogs: number; gross: number;
  lines: { label: string; amount: number }[];
  opex: number; net: number;
}

export function profitAndLoss(d: MonthData): PL {
  const sum = <T,>(xs: T[], f: (x: T) => number) => r2(xs.reduce((s, x) => s + f(x), 0));
  const billed = sum(d.sales, s => num(s.subtotal));
  const rebates = sum(d.rebates, r => num(r.amount));
  const revenue = r2(billed - rebates);
  const cogs = sum(d.purchases, p => num(p.amount));
  const lines: { label: string; amount: number }[] = [];
  const salaries = sum(d.payroll, p => num(p.salary) + num(p.overtime));
  if (salaries) lines.push({ label: 'เงินเดือนและค่าล่วงเวลา', amount: salaries });
  const ssoEmployer = sum(d.payroll, p => num(p.sso_employer));
  if (ssoEmployer) lines.push({ label: 'ประกันสังคมส่วนนายจ้าง', amount: ssoEmployer });
  const commission = sum(d.sales, s => num(s.commission));
  if (commission) lines.push({ label: 'ค่านายหน้า', amount: commission });
  const deducted = sum(d.sales, s => num(s.deducted));
  if (deducted) lines.push({ label: 'ส่วนที่ลูกค้าหักจากการรับเงิน', amount: deducted });
  const byCat = new Map<string, number>();
  for (const e of d.expenses) byCat.set(e.category, (byCat.get(e.category) ?? 0) + num(e.amount));
  for (const p of d.petty) if (p.kind === 'out') byCat.set(`${p.category} (เงินสดย่อย)`, (byCat.get(`${p.category} (เงินสดย่อย)`) ?? 0) + num(p.amount));
  for (const [label, amount] of [...byCat].sort((a, b) => b[1] - a[1])) lines.push({ label, amount: r2(amount) });
  const opex = sum(lines, l => l.amount);
  return { billed, rebates, revenue, cogs, gross: r2(revenue - cogs), lines, opex, net: r2(revenue - cogs - opex) };
}

export function ReportsPage() {
  const { month } = useApp();
  const [tab, setTab] = useState<'pl' | 'cat' | 'vat' | 'comm'>('pl');
  const { data, error } = useMonthData(month);
  const tabs = [['pl', 'กำไรขาดทุน'], ['cat', 'ยอดขายตามหมวด'], ['vat', 'ภาษีซื้อ-ขาย'], ['comm', 'ค่าคอมมิชชั่น']] as const;
  return (
    <div className="stack">
      <div className="toolbar">
        {tabs.map(([k, label]) => (
          <button key={k} className={`btn ${tab === k ? 'primary' : ''}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      {error ? <div className="err">{error}</div> : !data ? <div className="muted">กำลังโหลด…</div> : (
        <>
          {tab === 'pl' && <PLReport data={data} month={month} />}
          {tab === 'cat' && <CategoryReport data={data} month={month} />}
          {tab === 'vat' && <VatReport data={data} month={month} />}
          {tab === 'comm' && <CommissionReport data={data} month={month} />}
        </>
      )}
    </div>
  );
}

function PLReport({ data, month }: { data: MonthData; month: string }) {
  const pl = profitAndLoss(data);
  const rows: [string, number | null, string?][] = [
    ...(pl.rebates
      ? [['ยอดขายตามบิล (ก่อน VAT)', pl.billed], ['หัก เงินทอนลูกค้า', -pl.rebates], ['ยอดขายสุทธิ', pl.revenue, 'total']] as [string, number, string?][]
      : [['รายได้จากการขาย (ก่อน VAT)', pl.revenue]] as [string, number][]),
    ['หัก ต้นทุนขาย (ซื้อสินค้าในเดือน)', -pl.cogs],
    ['กำไรขั้นต้น', pl.gross, 'total'],
    ['ค่าใช้จ่ายในการขายและบริหาร', null, 'group'],
    ...pl.lines.map(l => [l.label, -l.amount, 'indent'] as [string, number, string]),
    ['รวมค่าใช้จ่าย', -pl.opex, 'total'],
    ['กำไร (ขาดทุน) สุทธิ', pl.net, 'grand'],
  ];
  return (
    <Card title={`งบกำไรขาดทุน · ${thMonth(month)}`} sub="เกณฑ์คงค้างตามวันที่เอกสาร ไม่มีสต๊อก: ซื้อสินค้าเป็นต้นทุนในเดือนที่ซื้อ"
      actions={<button className="btn" onClick={() => downloadCsv(`กำไรขาดทุน-${month}.csv`, ['รายการ', 'จำนวนเงิน'], rows.map(([l, v]) => [l, v ?? '']))}>ส่งออก Excel</button>}>
      <div className="tablewrap">
        <table>
          <tbody>
            {rows.map(([label, v, cls], i) => (
              <tr key={i} className={cls === 'indent' ? '' : cls}>
                <td className={cls === 'indent' ? 'indent' : ''}>{label}</td>
                <td className={`n ${cls === 'grand' ? (num(v) < 0 ? 'neg' : 'pos') : ''}`}>{v == null ? '' : money(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">ภาษีเงินได้นิติบุคคลยังไม่รวม ผู้ทำบัญชีจะปรับปลายปี</p>
    </Card>
  );
}

function CategoryReport({ data, month }: { data: MonthData; month: string }) {
  const { categories } = useApp();
  const totals = new Map<string, { vat: number; novat: number }>();
  for (const i of data.items) {
    const t = totals.get(i.category_id) ?? { vat: 0, novat: 0 };
    const amt = num(i.qty) * num(i.unit_price);
    if (i.sales.has_vat) t.vat += amt; else t.novat += amt;
    totals.set(i.category_id, t);
  }
  const rows = categories.map(c => ({ name: c.name, ...(totals.get(c.id) ?? { vat: 0, novat: 0 }) }))
    .map(r => ({ ...r, total: r2(r.vat + r.novat) }))
    .sort((a, b) => b.total - a.total);
  const grand = rows.reduce((s, r) => s + r.total, 0);
  return (
    <Card title={`ยอดขายตามหมวดสินค้า · ${thMonth(month)}`} sub="ยอดก่อน VAT"
      actions={<button className="btn" onClick={() => downloadCsv(`ขายตามหมวด-${month}.csv`, ['หมวด', 'มี VAT', 'ไม่มี VAT', 'รวม'], rows.map(r => [r.name, r2(r.vat), r2(r.novat), r.total]))}>ส่งออก Excel</button>}>
      {grand === 0 ? <Empty>ยังไม่มียอดขายเดือนนี้</Empty> : (
        <div className="tablewrap">
          <table>
            <thead><tr><th>หมวด</th><th className="n">มี VAT</th><th className="n">ไม่มี VAT</th><th className="n">รวม</th><th className="n">สัดส่วน</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.name}>
                  <td>{r.name}</td><td className="n">{money(r.vat)}</td><td className="n">{money(r.novat)}</td>
                  <td className="n">{money(r.total)}</td><td className="n">{grand ? `${((r.total / grand) * 100).toFixed(1)}%` : ''}</td>
                </tr>
              ))}
              <tr className="total"><td>รวม</td><td className="n">{money(rows.reduce((s, r) => s + r.vat, 0))}</td><td className="n">{money(rows.reduce((s, r) => s + r.novat, 0))}</td><td className="n">{money(grand)}</td><td /></tr>
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function VatReport({ data, month }: { data: MonthData; month: string }) {
  const { customers, suppliers, settings } = useApp();
  const cust = byId(customers);
  const sup = byId(suppliers);
  const out = data.sales.filter(s => s.has_vat).sort((a, b) => a.doc_no.localeCompare(b.doc_no));
  const inp = data.purchases.filter(p => p.has_vat).sort((a, b) => a.doc_date.localeCompare(b.doc_date));
  const outVat = out.reduce((s, x) => s + num(x.vat), 0);
  const inVat = inp.reduce((s, p) => s + r2((num(p.amount) * settings.vat_rate) / 100), 0);
  return (
    <div className="stack">
      <div className="kpis">
        <Kpi label="ภาษีขาย" value={money(outVat)} />
        <Kpi label="ภาษีซื้อ" value={money(inVat)} />
        <Kpi label={outVat - inVat >= 0 ? 'ต้องชำระ (ภ.พ.30)' : 'เครดิตภาษียกไป'} value={money(Math.abs(outVat - inVat))} foot={`ยื่นภายใน 15 ${thMonth(shiftMonth(month, 1))}`} />
      </div>
      <Card title="รายงานภาษีขาย" actions={<button className="btn" onClick={() => downloadCsv(`ภาษีขาย-${month}.csv`,
        ['วันที่', 'เลขที่', 'ลูกค้า', 'เลขผู้เสียภาษี', 'สาขา', 'มูลค่า', 'VAT'],
        out.map(s => [s.doc_date, s.doc_no, cust.get(s.customer_id)?.name, cust.get(s.customer_id)?.tax_id, cust.get(s.customer_id)?.branch, s.subtotal, s.vat]))}>ส่งออก Excel</button>}>
        {out.length === 0 ? <Empty /> : (
          <div className="tablewrap"><table>
            <thead><tr><th>เลขที่</th><th>ลูกค้า</th><th>เลขผู้เสียภาษี / สาขา</th><th className="n">มูลค่า</th><th className="n">VAT</th></tr></thead>
            <tbody>{out.map(s => {
              const c = cust.get(s.customer_id);
              return <tr key={s.id}><td className="doc">{s.doc_no}</td><td>{c?.name}</td><td>{c?.tax_id ?? <span className="pill warn">ไม่มีเลข</span>} · {c?.branch}</td><td className="n">{money(s.subtotal)}</td><td className="n">{money(s.vat)}</td></tr>;
            })}</tbody>
          </table></div>
        )}
      </Card>
      <Card title="รายงานภาษีซื้อ" actions={<button className="btn" onClick={() => downloadCsv(`ภาษีซื้อ-${month}.csv`,
        ['วันที่', 'เลขที่', 'ผู้ขาย', 'เลขผู้เสียภาษี', 'มูลค่า', 'VAT'],
        inp.map(p => [p.doc_date, p.doc_no, sup.get(p.supplier_id)?.name, sup.get(p.supplier_id)?.tax_id, p.amount, r2((num(p.amount) * settings.vat_rate) / 100)]))}>ส่งออก Excel</button>}>
        {inp.length === 0 ? <Empty /> : (
          <div className="tablewrap"><table>
            <thead><tr><th>เลขที่</th><th>ผู้ขาย</th><th className="n">มูลค่า</th><th className="n">VAT</th></tr></thead>
            <tbody>{inp.map(p => <tr key={p.id}><td className="doc">{p.doc_no}</td><td>{sup.get(p.supplier_id)?.name}</td><td className="n">{money(p.amount)}</td><td className="n">{money((num(p.amount) * settings.vat_rate) / 100)}</td></tr>)}</tbody>
          </table></div>
        )}
      </Card>
    </div>
  );
}

function CommissionReport({ data, month }: { data: MonthData; month: string }) {
  const { salespeople } = useApp();
  const rows = salespeople.map(sp => {
    const mine = data.sales.filter(s => s.salesperson_id === sp.id);
    return { name: sp.name, bills: mine.length, sales: mine.reduce((s, x) => s + num(x.subtotal), 0), commission: mine.reduce((s, x) => s + num(x.commission), 0) };
  }).filter(r => r.bills > 0).sort((a, b) => b.sales - a.sales);
  return (
    <Card title={`ค่าคอมมิชชั่น · ${thMonth(month)}`} sub="คิดจากยอดขายก่อน VAT ตามวันที่บิล ไม่หักภาษี ณ ที่จ่าย"
      actions={<button className="btn" onClick={() => downloadCsv(`ค่าคอม-${month}.csv`, ['ชื่อ', 'จำนวนบิล', 'ยอดขาย', 'ค่าคอม'], rows.map(r => [r.name, r.bills, r2(r.sales), r2(r.commission)]))}>ส่งออก Excel</button>}>
      {rows.length === 0 ? <Empty>ไม่มีค่าคอมเดือนนี้</Empty> : (
        <div className="tablewrap"><table>
          <thead><tr><th>ชื่อ</th><th className="n">บิล</th><th className="n">ยอดขาย</th><th className="n">ค่าคอม</th></tr></thead>
          <tbody>
            {rows.map(r => <tr key={r.name}><td>{r.name}</td><td className="n">{r.bills}</td><td className="n">{money(r.sales)}</td><td className="n">{money(r.commission)}</td></tr>)}
            <tr className="total"><td>รวม</td><td className="n">{rows.reduce((s, r) => s + r.bills, 0)}</td><td className="n">{money(rows.reduce((s, r) => s + r.sales, 0))}</td><td className="n">{money(rows.reduce((s, r) => s + r.commission, 0))}</td></tr>
          </tbody>
        </table></div>
      )}
    </Card>
  );
}

export function DashboardPage() {
  const { month, categories } = useApp();
  const { data, error } = useMonthData(month);
  const [ar, setAr] = useState<{ owed: number; overdue: number } | null>(null);
  useEffect(() => {
    sb.from('sale_summary').select('total,received,deducted,due_date').then(res => {
      const t = new Date().toISOString().slice(0, 10);
      let owed = 0, overdue = 0;
      for (const r of (res.data ?? []) as SaleSummary[]) {
        const bal = num(r.total) - num(r.received) - num(r.deducted);
        if (bal <= 0.004) continue;
        owed += bal;
        if (r.due_date < t) overdue += bal;
      }
      setAr({ owed, overdue });
    });
  }, []);
  if (error) return <div className="err">{error}</div>;
  if (!data) return <div className="muted">กำลังโหลด…</div>;
  const pl = profitAndLoss(data);
  const cat = byId(categories);
  const byCat = new Map<string, number>();
  for (const i of data.items) byCat.set(i.category_id, (byCat.get(i.category_id) ?? 0) + num(i.qty) * num(i.unit_price));
  const bars = [...byCat].sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...bars.map(b => b[1]));
  return (
    <div className="stack">
      <div className="kpis">
        <Kpi label={pl.rebates ? 'ยอดขายสุทธิ (หักเงินทอน)' : 'ยอดขาย (ก่อน VAT)'} value={money(pl.revenue)}
          foot={pl.rebates ? `ตามบิล ${money(pl.billed)} · เงินทอน ${money(pl.rebates)}` : `${data.sales.length} บิล`} />
        <Kpi label="กำไรขั้นต้น" value={money(pl.gross)} foot={pl.revenue ? `${((pl.gross / pl.revenue) * 100).toFixed(1)}% ของยอดขาย` : undefined} />
        <Kpi label="กำไรสุทธิ" value={money(pl.net)} tone={pl.net < 0 ? 'neg' : 'pos'} />
        <Kpi label="ลูกหนี้คงค้างทั้งหมด" value={ar ? money(ar.owed) : '…'} foot={ar && ar.overdue > 0 ? <span className="neg">เกินกำหนด {money(ar.overdue)}</span> : undefined} />
      </div>
      <Card title={`ยอดขายตามหมวด · ${thMonth(month)}`}>
        {bars.length === 0 ? <Empty>ยังไม่มียอดขายเดือนนี้</Empty> : (
          <div className="bars">
            {bars.map(([id, v]) => (
              <div className="bar" key={id}>
                <div className="row"><span>{cat.get(id)?.name}</span><span>{money(v)}</span></div>
                <div className="track"><div className="fill" style={{ width: `${(v / max) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
