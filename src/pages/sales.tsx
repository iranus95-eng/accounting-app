import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp, byId } from '../app-context';
import { sb, must } from '../lib/supabase';
import { downloadCsv, money, monthRange, num, qty, r2, thDate, thMonth, today } from '../lib/format';
import { CREDIT_OPTIONS, type Receipt, type SaleItem, type SaleSummary } from '../lib/types';
import { Card, DangerButton, DueBadge, Empty, Field, Kpi, Modal } from '../ui';

const balanceOf = (s: SaleSummary) => r2(num(s.total) - num(s.received) - num(s.deducted));

export function SalesPage() {
  const { month, customers, salespeople, toast } = useApp();
  const cust = byId(customers);
  const sp = byId(salespeople);
  const [rows, setRows] = useState<SaleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { from, to } = monthRange(month);
    try {
      setRows(must(await sb.from('sale_summary').select('*').gte('doc_date', from).lt('doc_date', to).order('doc_no', { ascending: false })) as SaleSummary[]);
    } catch (e) { toast((e as Error).message); }
    setLoading(false);
  }, [month, toast]);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? rows.filter(r => `${r.doc_no} ${cust.get(r.customer_id)?.name ?? ''}`.toLowerCase().includes(n)) : rows;
  }, [rows, q, cust]);

  const sum = (f: (r: SaleSummary) => number) => rows.reduce((s, r) => s + f(r), 0);

  function exportCsv() {
    downloadCsv(`ขาย-${month}.csv`,
      ['วันที่', 'เลขที่', 'ลูกค้า', 'เลขผู้เสียภาษี', 'สาขา', 'พนักงานขาย', 'VAT', 'ก่อน VAT', 'VAT', 'รวม', 'รับแล้ว', 'ส่วนหัก', 'คงค้าง', 'ครบกำหนด', 'ค่าคอม'],
      shown.map(r => {
        const c = cust.get(r.customer_id);
        return [r.doc_date, r.doc_no, c?.name, c?.tax_id, c?.branch, sp.get(r.salesperson_id ?? '')?.name, r.has_vat ? 'มี' : 'ไม่มี',
          r.subtotal, r.vat, r.total, r.received, r.deducted, balanceOf(r), r.due_date, r.commission];
      }));
  }

  return (
    <div className="stack">
      <div className="kpis">
        <Kpi label="ยอดขายก่อน VAT" value={money(sum(r => num(r.subtotal)))} foot={`${rows.length} บิล`} />
        <Kpi label="ขายมี VAT" value={money(sum(r => (r.has_vat ? num(r.subtotal) : 0)))} foot={`ภาษีขาย ${money(sum(r => num(r.vat)))}`} />
        <Kpi label="ขายไม่มี VAT" value={money(sum(r => (r.has_vat ? 0 : num(r.subtotal))))} />
        <Kpi label="ค้างรับของเดือนนี้" value={money(sum(balanceOf))} />
      </div>
      <Card
        title={`บิลขาย · ${thMonth(month)}`}
        sub={loading ? 'กำลังโหลด…' : `${shown.length} รายการ`}
        actions={<>
          <input type="search" placeholder="ค้นหาเลขที่ / ลูกค้า" value={q} onChange={e => setQ(e.target.value)} />
          <button className="btn" onClick={exportCsv}>ส่งออก Excel</button>
          <button className="btn primary" onClick={() => setCreating(true)}>+ ออกบิลขาย</button>
        </>}
      >
        {shown.length === 0 && !loading ? <Empty /> : (
          <div className="tablewrap">
            <table>
              <thead><tr><th>วันที่</th><th>เลขที่</th><th>ลูกค้า</th><th>พนักงานขาย</th><th className="n">ก่อน VAT</th><th className="n">VAT</th><th className="n">รวม</th><th>สถานะ</th></tr></thead>
              <tbody>
                {shown.map(r => (
                  <tr key={r.id} className="click" onClick={() => setOpen(r.id)}>
                    <td>{thDate(r.doc_date)}</td>
                    <td className="doc">{r.doc_no}</td>
                    <td>{cust.get(r.customer_id)?.name}</td>
                    <td>{sp.get(r.salesperson_id ?? '')?.name ?? <span className="muted">—</span>}</td>
                    <td className="n">{money(r.subtotal)}</td>
                    <td className="n">{r.has_vat ? money(r.vat) : <span className="muted">ไม่มี VAT</span>}</td>
                    <td className="n">{money(r.total)}</td>
                    <td><DueBadge due={r.due_date} balance={balanceOf(r)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {creating && <NewSale onClose={() => setCreating(false)} onSaved={id => { setCreating(false); load(); setOpen(id); }} />}
      {open && <SaleDetail id={open} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  );
}

interface Line { product_id: string; description: string; category_id: string; qty: string; unit_price: string }
const blankLine = (): Line => ({ product_id: '', description: '', category_id: '', qty: '1', unit_price: '' });

function NewSale({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const { customers, salespeople, products, categories, settings, member, toast } = useApp();
  const isSales = member.role === 'sales';
  const [docDate, setDocDate] = useState(today());
  const [customerId, setCustomerId] = useState('');
  const [custQ, setCustQ] = useState('');
  const [salespersonId, setSalespersonId] = useState(isSales ? member.salesperson_id ?? '' : '');
  const [hasVat, setHasVat] = useState(true);
  const [credit, setCredit] = useState<string>('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const activeCustomers = customers.filter(c => c.active);
  const matches = custQ.trim()
    ? activeCustomers.filter(c => `${c.code ?? ''} ${c.name}`.toLowerCase().includes(custQ.trim().toLowerCase())).slice(0, 50)
    : activeCustomers.slice(0, 50);

  function pickCustomer(id: string) {
    setCustomerId(id);
    const c = customers.find(x => x.id === id);
    if (c?.credit_days != null) setCredit(String(c.credit_days));
  }

  function setLine(i: number, patch: Partial<Line>) {
    setLines(ls => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }
  function pickProduct(i: number, id: string) {
    const p = products.find(x => x.id === id);
    setLine(i, p ? { product_id: id, description: p.name, category_id: p.category_id, unit_price: String(num(p.price)) } : { product_id: '' });
  }

  const subtotal = r2(lines.reduce((s, l) => s + num(l.qty) * num(l.unit_price), 0));
  const vat = hasVat ? r2((subtotal * settings.vat_rate) / 100) : 0;
  const rate = salespeople.find(s => s.id === salespersonId)?.commission_rate ?? 0;

  async function save() {
    setErr('');
    if (!customerId) return setErr('กรุณาเลือกลูกค้า');
    if (credit === '') return setErr('กรุณาเลือกเครดิต');
    const items = lines.filter(l => l.description.trim() && num(l.qty) > 0);
    if (!items.length) return setErr('กรุณาใส่รายการสินค้าอย่างน้อย 1 รายการ');
    if (items.some(l => !l.category_id)) return setErr('ทุกรายการต้องมีหมวดสินค้า');
    setBusy(true);
    try {
      // Retry once if two people took the same running number at the same moment.
      let sale: { id: string } | null = null;
      for (let attempt = 0; attempt < 3 && !sale; attempt++) {
        const docNo = must(await sb.rpc('next_sale_no', { d: docDate })) as string;
        const res = await sb.from('sales').insert({
          doc_no: docNo, doc_date: docDate, customer_id: customerId, salesperson_id: salespersonId || null,
          commission_rate: rate, has_vat: hasVat, credit_days: Number(credit), note: note.trim() || null,
        }).select('id').single();
        if (res.error && res.error.code !== '23505') throw new Error(res.error.message);
        sale = res.data;
      }
      if (!sale) throw new Error('ออกเลขที่บิลไม่สำเร็จ ลองใหม่อีกครั้ง');
      must(await sb.from('sale_items').insert(items.map(l => ({
        sale_id: sale!.id, product_id: l.product_id || null, description: l.description.trim(), category_id: l.category_id,
        qty: num(l.qty), unit_price: num(l.unit_price),
      }))));
      toast('บันทึกบิลแล้ว');
      onSaved(sale.id);
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <Modal title="ออกบิลขาย" onClose={onClose}>
      <div className="grid">
        <Field label="วันที่"><input type="date" value={docDate} onChange={e => setDocDate(e.target.value)} /></Field>
        <Field label="ค้นหาลูกค้า"><input type="search" placeholder="ชื่อหรือรหัส" value={custQ} onChange={e => setCustQ(e.target.value)} /></Field>
        <Field label="ลูกค้า *" full>
          <select value={customerId} onChange={e => pickCustomer(e.target.value)}>
            <option value="">เลือก…</option>
            {customerId && !matches.some(c => c.id === customerId) && (
              <option value={customerId}>{customers.find(c => c.id === customerId)?.name}</option>
            )}
            {matches.map(c => <option key={c.id} value={c.id}>{c.code ? `${c.code} · ` : ''}{c.name}{c.branch !== 'สำนักงานใหญ่' ? ` (${c.branch})` : ''}</option>)}
          </select>
        </Field>
        <Field label="พนักงานขาย">
          <select value={salespersonId} disabled={isSales} onChange={e => setSalespersonId(e.target.value)}>
            <option value="">— ไม่มีค่าคอม —</option>
            {salespeople.filter(s => s.active || s.id === salespersonId).map(s => <option key={s.id} value={s.id}>{s.name} ({s.commission_rate}%)</option>)}
          </select>
        </Field>
        <Field label="ภาษี">
          <select value={hasVat ? '1' : '0'} onChange={e => setHasVat(e.target.value === '1')}>
            <option value="1">มี VAT {settings.vat_rate}%</option>
            <option value="0">ไม่มี VAT</option>
          </select>
        </Field>
        <Field label="เครดิต *">
          <select value={credit} onChange={e => setCredit(e.target.value)}>
            <option value="">เลือก…</option>
            {CREDIT_OPTIONS.map(d => <option key={d} value={d}>{d === 0 ? 'เงินสด' : `${d} วัน`}</option>)}
          </select>
        </Field>
      </div>

      <div className="tablewrap" style={{ marginTop: 14 }}>
        <table className="items">
          <thead><tr><th>สินค้า</th><th>รายละเอียด</th><th>หมวด</th><th className="n">จำนวน</th><th className="n">ราคา/หน่วย</th><th className="n">รวม</th><th /></tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td style={{ minWidth: 140 }}>
                  <select value={l.product_id} onChange={e => pickProduct(i, e.target.value)}>
                    <option value="">— อื่น ๆ —</option>
                    {products.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}
                  </select>
                </td>
                <td style={{ minWidth: 160 }}><input value={l.description} onChange={e => setLine(i, { description: e.target.value })} /></td>
                <td style={{ minWidth: 120 }}>
                  <select value={l.category_id} onChange={e => setLine(i, { category_id: e.target.value })}>
                    <option value="">เลือก…</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </td>
                <td style={{ width: 90 }}><input type="number" step="any" inputMode="decimal" value={l.qty} onChange={e => setLine(i, { qty: e.target.value })} /></td>
                <td style={{ width: 110 }}><input type="number" step="any" inputMode="decimal" value={l.unit_price} onChange={e => setLine(i, { unit_price: e.target.value })} /></td>
                <td className="n">{money(num(l.qty) * num(l.unit_price))}</td>
                <td>{lines.length > 1 && <button className="btn sm" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}>×</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn sm" onClick={() => setLines(ls => [...ls, blankLine()])}>+ เพิ่มรายการ</button>

      <div className="sumbox">
        <span>รวมก่อน VAT</span><span>{money(subtotal)}</span>
        <span>VAT</span><span>{money(vat)}</span>
        <span className="t">รวมทั้งสิ้น</span><span className="t">{money(subtotal + vat)}</span>
        {rate > 0 && <><span className="muted">ค่าคอม {rate}%</span><span className="muted">{money((subtotal * rate) / 100)}</span></>}
      </div>
      <Field label="หมายเหตุ" full><textarea rows={2} value={note} onChange={e => setNote(e.target.value)} /></Field>
      {err && <div className="err">{err}</div>}
      <div className="actions">
        <button className="btn" onClick={onClose}>ยกเลิก</button>
        <button className="btn primary" disabled={busy} onClick={save}>{busy ? 'กำลังบันทึก…' : 'บันทึกบิล'}</button>
      </div>
    </Modal>
  );
}

function SaleDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { customers, salespeople, categories, isStaff, toast } = useApp();
  const [sale, setSale] = useState<SaleSummary | null>(null);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [rc, setRc] = useState({ receipt_date: today(), amount: '', deduction: '', note: '' });
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const [s, i, r] = await Promise.all([
      sb.from('sale_summary').select('*').eq('id', id).single(),
      sb.from('sale_items').select('*').eq('sale_id', id),
      sb.from('receipts').select('*').eq('sale_id', id).order('receipt_date'),
    ]);
    setSale(s.data as SaleSummary);
    setItems((i.data ?? []) as SaleItem[]);
    setReceipts((r.data ?? []) as Receipt[]);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (!sale) return <Modal title="บิลขาย" onClose={onClose}><div className="muted">กำลังโหลด…</div></Modal>;
  const c = customers.find(x => x.id === sale.customer_id);
  const balance = balanceOf(sale);

  async function addReceipt() {
    setErr('');
    const amount = num(rc.amount), deduction = num(rc.deduction);
    if (amount <= 0 && deduction <= 0) return setErr('กรุณากรอกจำนวนเงิน');
    const res = await sb.from('receipts').insert({ sale_id: id, receipt_date: rc.receipt_date, amount, deduction, note: rc.note.trim() || null });
    if (res.error) return setErr(res.error.message);
    setRc({ receipt_date: today(), amount: '', deduction: '', note: '' });
    toast('บันทึกรับเงินแล้ว');
    await load();
    onChanged();
  }

  async function removeReceipt(rid: string) {
    const res = await sb.from('receipts').delete().eq('id', rid);
    if (res.error) return toast(res.error.message);
    await load();
    onChanged();
  }

  async function removeSale() {
    const res = await sb.from('sales').delete().eq('id', id);
    if (res.error) return toast(res.error.message);
    toast('ลบบิลแล้ว');
    onChanged();
    onClose();
  }

  return (
    <Modal title={`บิลขาย ${sale.doc_no}`} onClose={onClose}>
      <div className="detail-meta">
        <div><b>ลูกค้า</b>{c?.name}</div>
        <div><b>เลขผู้เสียภาษี / สาขา</b>{c?.tax_id ?? '—'} · {c?.branch}</div>
        <div><b>วันที่</b>{thDate(sale.doc_date)}</div>
        <div><b>ครบกำหนด</b>{thDate(sale.due_date)} ({sale.credit_days === 0 ? 'เงินสด' : `${sale.credit_days} วัน`})</div>
        <div><b>พนักงานขาย</b>{salespeople.find(s => s.id === sale.salesperson_id)?.name ?? '—'}</div>
        <div><b>ค่าคอม</b>{money(sale.commission)} ({sale.commission_rate}%)</div>
        {c?.pay_day && <div><b>วันรับเงินประจำ</b>ทุกวันที่ {c.pay_day}</div>}
      </div>
      <div className="tablewrap">
        <table>
          <thead><tr><th>รายการ</th><th>หมวด</th><th className="n">จำนวน</th><th className="n">ราคา/หน่วย</th><th className="n">รวม</th></tr></thead>
          <tbody>
            {items.map(i => (
              <tr key={i.id}>
                <td>{i.description}</td>
                <td>{categories.find(x => x.id === i.category_id)?.name}</td>
                <td className="n">{qty(i.qty)}</td>
                <td className="n">{qty(i.unit_price)}</td>
                <td className="n">{money(num(i.qty) * num(i.unit_price))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sumbox">
        <span>รวมก่อน VAT</span><span>{money(sale.subtotal)}</span>
        <span>VAT</span><span>{sale.has_vat ? money(sale.vat) : 'ไม่มี VAT'}</span>
        <span className="t">รวมทั้งสิ้น</span><span className="t">{money(sale.total)}</span>
        <span>รับแล้ว</span><span>{money(sale.received)}</span>
        {num(sale.deducted) > 0 && <><span>ส่วนที่ลูกค้าหัก</span><span>{money(sale.deducted)}</span></>}
        <span className="t">คงค้าง</span><span className={`t ${balance > 0 ? 'neg' : 'pos'}`}>{money(balance)}</span>
      </div>
      {sale.note && <p className="note">หมายเหตุ: {sale.note}</p>}

      <h3 style={{ marginTop: 20 }}>การรับเงิน</h3>
      {receipts.length === 0 ? <div className="muted">ยังไม่มีการรับเงิน</div> : (
        <table>
          <tbody>
            {receipts.map(r => (
              <tr key={r.id}>
                <td>{thDate(r.receipt_date)}</td>
                <td className="n">{money(r.amount)}</td>
                <td className="muted">{num(r.deduction) > 0 ? `หัก ${money(r.deduction)}` : ''} {r.note}</td>
                <td className="n">{isStaff && <DangerButton onConfirm={() => removeReceipt(r.id)} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {isStaff && balance > 0 && (
        <div className="grid" style={{ marginTop: 12 }}>
          <Field label="วันที่รับ"><input type="date" value={rc.receipt_date} onChange={e => setRc({ ...rc, receipt_date: e.target.value })} /></Field>
          <Field label={`จำนวนเงินที่รับ (คงค้าง ${money(balance)})`}>
            <input type="number" step="any" inputMode="decimal" value={rc.amount} onChange={e => setRc({ ...rc, amount: e.target.value })} />
          </Field>
          <Field label="ส่วนที่ลูกค้าหัก (ถ้ามี)">
            <input type="number" step="any" inputMode="decimal" value={rc.deduction} onChange={e => setRc({ ...rc, deduction: e.target.value })} />
          </Field>
          <Field label="หมายเหตุ"><input value={rc.note} onChange={e => setRc({ ...rc, note: e.target.value })} /></Field>
        </div>
      )}
      {err && <div className="err">{err}</div>}
      <div className="actions">
        {isStaff && <DangerButton onConfirm={removeSale}>ลบบิลนี้</DangerButton>}
        {isStaff && balance > 0 && <button className="btn" onClick={() => setRc({ ...rc, amount: String(balance - num(rc.deduction)) })}>รับเต็มจำนวน</button>}
        {isStaff && balance > 0 && <button className="btn primary" onClick={addReceipt}>บันทึกรับเงิน</button>}
        <button className="btn" onClick={onClose}>ปิด</button>
      </div>
    </Modal>
  );
}

/** Outstanding receivables across all months, grouped by due status. */
export function ReceivablesPage() {
  const { customers, toast } = useApp();
  const cust = byId(customers);
  const [rows, setRows] = useState<SaleSummary[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const all = must(await sb.from('sale_summary').select('*').order('due_date')) as SaleSummary[];
      setRows(all.filter(r => balanceOf(r) > 0.004));
    } catch (e) { toast((e as Error).message); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const t = today();
  const buckets = useMemo(() => {
    const b = { current: 0, d30: 0, d60: 0, over: 0 };
    for (const r of rows ?? []) {
      const late = Math.round((Date.parse(t) - Date.parse(r.due_date)) / 86400000);
      const bal = balanceOf(r);
      if (late <= 0) b.current += bal; else if (late <= 30) b.d30 += bal; else if (late <= 60) b.d60 += bal; else b.over += bal;
    }
    return b;
  }, [rows, t]);

  return (
    <div className="stack">
      <div className="kpis">
        <Kpi label="ยังไม่ถึงกำหนด" value={money(buckets.current)} />
        <Kpi label="เกินกำหนด 1-30 วัน" value={money(buckets.d30)} />
        <Kpi label="เกินกำหนด 31-60 วัน" value={money(buckets.d60)} />
        <Kpi label="เกินกำหนดเกิน 60 วัน" value={money(buckets.over)} tone={buckets.over > 0 ? 'neg' : undefined} />
      </div>
      <Card title="ลูกหนี้คงค้าง" sub={rows ? `${rows.length} บิล` : 'กำลังโหลด…'}
        actions={<button className="btn" onClick={() => rows && downloadCsv('ลูกหนี้คงค้าง.csv',
          ['เลขที่', 'วันที่', 'ครบกำหนด', 'ลูกค้า', 'วันรับเงิน', 'รวม', 'รับแล้ว', 'คงค้าง'],
          rows.map(r => [r.doc_no, r.doc_date, r.due_date, cust.get(r.customer_id)?.name, cust.get(r.customer_id)?.pay_day, r.total, num(r.received) + num(r.deducted), balanceOf(r)]))}>ส่งออก Excel</button>}>
        {rows && rows.length === 0 ? <Empty>ไม่มีลูกหนี้คงค้าง</Empty> : (
          <div className="tablewrap">
            <table>
              <thead><tr><th>ลูกค้า</th><th>เลขที่</th><th>วันที่</th><th>ครบกำหนด</th><th className="n">วันรับเงิน</th><th className="n">คงค้าง</th><th>สถานะ</th></tr></thead>
              <tbody>
                {(rows ?? []).map(r => (
                  <tr key={r.id} className="click" onClick={() => setOpen(r.id)}>
                    <td>{cust.get(r.customer_id)?.name}</td>
                    <td className="doc">{r.doc_no}</td>
                    <td>{thDate(r.doc_date)}</td>
                    <td>{thDate(r.due_date)}</td>
                    <td className="n">{cust.get(r.customer_id)?.pay_day ?? ''}</td>
                    <td className="n">{money(balanceOf(r))}</td>
                    <td><DueBadge due={r.due_date} balance={balanceOf(r)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {open && <SaleDetail id={open} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  );
}
