import { useEffect, useState } from 'react';
import { CrudPage, type FieldDef } from '../CrudPage';
import { useApp, byId } from '../app-context';
import { sb, must } from '../lib/supabase';
import { money, num, qty, r2, thDate } from '../lib/format';
import {
  CREDIT_OPTIONS, EXPENSE_CATEGORIES, PETTY_CATEGORIES,
  type Customer, type Employee, type Expense, type PettyCash, type Product, type Purchase, type SaleSummary, type Salesperson, type Supplier,
} from '../lib/types';
import { DueBadge, Empty, Kpi, Modal } from '../ui';

const creditField = (label = 'เครดิต (วัน)'): FieldDef => ({
  key: 'credit_days', label, type: 'select', numeric: true, nullable: true,
  options: CREDIT_OPTIONS.map(d => ({ value: d, label: d === 0 ? 'เงินสด' : `${d} วัน` })),
});

export function ProductsPage() {
  const { categories, reload } = useApp();
  const cat = byId(categories);
  return (
    <CrudPage<Product & Record<string, unknown>>
      table="products" title="สินค้า" orderBy="code"
      defaults={() => ({ code: '', name: '', category_id: '', price: '', cost: '', commission_per_unit: '', active: true })}
      afterChange={reload}
      fields={[
        { key: 'code', label: 'รหัส' },
        { key: 'name', label: 'ชื่อสินค้า', required: true, full: true },
        { key: 'category_id', label: 'หมวด', type: 'select', required: true, options: categories.map(c => ({ value: c.id, label: c.name })) },
        { key: 'price', label: 'ราคาขาย (ก่อน VAT)', type: 'number' },
        { key: 'cost', label: 'ต้นทุน', type: 'number', nullable: true },
        { key: 'commission_per_unit', label: 'ค่าคอมตั้งต้น (บาท/หน่วย)', type: 'number', nullable: true, placeholder: 'ว่าง = กรอกเองทุกบิล' },
        { key: 'active', label: 'ใช้งาน', type: 'bool' },
      ]}
      columns={[
        { label: 'รหัส', value: r => r.code },
        { label: 'ชื่อสินค้า', value: r => r.name },
        { label: 'หมวด', value: r => cat.get(r.category_id)?.name },
        { label: 'ราคาขาย', value: r => r.price, render: r => qty(r.price), num: true },
        { label: 'ต้นทุน', value: r => r.cost, render: r => (r.cost == null ? '' : qty(r.cost)), num: true },
        { label: 'ค่าคอม/หน่วย', value: r => r.commission_per_unit, render: r => (r.commission_per_unit == null ? '' : qty(r.commission_per_unit)), num: true },
        { label: 'สถานะ', value: r => (r.active ? 'ใช้งาน' : 'เลิกขาย'), render: r => (r.active ? '' : <span className="pill mute">เลิกขาย</span>) },
      ]}
    />
  );
}

export function CategoriesPage() {
  const { reload } = useApp();
  return (
    <CrudPage
      table="categories" title="หมวดสินค้า" orderBy="name" afterChange={reload}
      defaults={() => ({ name: '' })}
      fields={[{ key: 'name', label: 'ชื่อหมวด', required: true, full: true }]}
      columns={[{ label: 'ชื่อหมวด', value: r => r.name as string }]}
    />
  );
}

export function CustomersPage() {
  const { reload, isStaff } = useApp();
  const [history, setHistory] = useState<Customer | null>(null);
  return (
    <>
      <CrudPage<Customer & Record<string, unknown>>
        table="customers" title="ลูกค้า" orderBy="code" readOnly={!isStaff}
        defaults={() => ({ code: '', name: '', tax_id: '', branch: 'สำนักงานใหญ่', credit_days: '', pay_day: '', address: '', phone: '', note: '', active: true })}
        afterChange={reload}
        validate={v => (v.tax_id && !/^\d{13}$/.test(String(v.tax_id)) ? 'เลขผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก' : null)}
        fields={[
          { key: 'code', label: 'รหัส' },
          { key: 'name', label: 'ชื่อลูกค้า', required: true, full: true },
          { key: 'tax_id', label: 'เลขผู้เสียภาษี', placeholder: '13 หลัก' },
          { key: 'branch', label: 'สาขา', required: true, placeholder: 'สำนักงานใหญ่ หรือ 00001' },
          creditField('เครดิตปกติ (ว่าง = เลือกตอนออกบิล)'),
          { key: 'pay_day', label: 'วันรับเงินประจำเดือน', type: 'number', nullable: true, placeholder: '1-31' },
          { key: 'phone', label: 'โทร' },
          { key: 'active', label: 'ใช้งาน', type: 'bool' },
          { key: 'address', label: 'ที่อยู่', type: 'textarea' },
          { key: 'note', label: 'หมายเหตุ', type: 'textarea' },
        ]}
        columns={[
          { label: 'รหัส', value: r => r.code },
          { label: 'ชื่อลูกค้า', value: r => r.name },
          { label: 'สาขา', value: r => r.branch },
          { label: 'เลขผู้เสียภาษี', value: r => r.tax_id },
          { label: 'เครดิต', value: r => (r.credit_days == null ? '' : r.credit_days), num: true },
          { label: 'วันรับเงิน', value: r => r.pay_day, num: true },
          { label: 'โทร', value: r => r.phone },
        ]}
        rowActions={r => <button className="btn sm" onClick={() => setHistory(r)}>ประวัติ</button>}
      />
      {history && (
        <SalesHistory title={`ประวัติลูกค้า: ${history.name}`} filter={{ customer_id: history.id }} onClose={() => setHistory(null)} />
      )}
    </>
  );
}

export function SuppliersPage() {
  const { reload } = useApp();
  return (
    <CrudPage<Supplier & Record<string, unknown>>
      table="suppliers" title="ผู้ขาย" orderBy="name" afterChange={reload}
      defaults={() => ({ name: '', tax_id: '', credit_days: '', phone: '' })}
      validate={v => (v.tax_id && !/^\d{13}$/.test(String(v.tax_id)) ? 'เลขผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก' : null)}
      fields={[
        { key: 'name', label: 'ชื่อผู้ขาย', required: true, full: true },
        { key: 'tax_id', label: 'เลขผู้เสียภาษี' },
        creditField(),
        { key: 'phone', label: 'โทร' },
      ]}
      columns={[
        { label: 'ชื่อผู้ขาย', value: r => r.name },
        { label: 'เลขผู้เสียภาษี', value: r => r.tax_id },
        { label: 'เครดิต', value: r => r.credit_days, num: true },
        { label: 'โทร', value: r => r.phone },
      ]}
    />
  );
}

export function SalespeoplePage() {
  const { reload } = useApp();
  const [history, setHistory] = useState<Salesperson | null>(null);
  return (
    <>
      <CrudPage<Salesperson & Record<string, unknown>>
        table="salespeople" title="พนักงานขาย / ผู้รับค่าคอม" orderBy="name" afterChange={reload}
        defaults={() => ({ name: '', phone: '', is_employee: false, active: true })}
        fields={[
          { key: 'name', label: 'ชื่อ', required: true, full: true },
          { key: 'phone', label: 'โทร' },
          { key: 'is_employee', label: 'เป็นพนักงานบริษัท', type: 'bool' },
          { key: 'active', label: 'ใช้งาน', type: 'bool' },
        ]}
        columns={[
          { label: 'ชื่อ', value: r => r.name },
          { label: 'โทร', value: r => r.phone },
          { label: 'ประเภท', value: r => (r.is_employee ? 'พนักงาน' : 'ตัวแทนภายนอก') },
        ]}
        rowActions={r => <button className="btn sm" onClick={() => setHistory(r)}>ประวัติ</button>}
      />
      {history && (
        <SalesHistory title={`ประวัติการขาย: ${history.name}`} filter={{ salesperson_id: history.id }} onClose={() => setHistory(null)} />
      )}
    </>
  );
}

export function EmployeesPage() {
  const { reload } = useApp();
  return (
    <CrudPage<Employee & Record<string, unknown>>
      table="employees" title="พนักงาน" orderBy="code" afterChange={reload}
      defaults={() => ({ code: '', first_name: '', last_name: '', position: '', start_date: '', end_date: '', tax_id: '', phone: '', address: '', salary: '', in_sso: true, bank: '', bank_account: '' })}
      fields={[
        { key: 'code', label: 'รหัส' },
        { key: 'first_name', label: 'ชื่อ', required: true },
        { key: 'last_name', label: 'นามสกุล', required: true },
        { key: 'position', label: 'ตำแหน่ง' },
        { key: 'salary', label: 'เงินเดือน', type: 'number' },
        { key: 'in_sso', label: 'เข้าประกันสังคม', type: 'bool' },
        { key: 'start_date', label: 'วันเริ่มงาน', type: 'date' },
        { key: 'end_date', label: 'วันลาออก', type: 'date' },
        { key: 'tax_id', label: 'เลขบัตรประชาชน' },
        { key: 'phone', label: 'โทร' },
        { key: 'bank', label: 'ธนาคาร' },
        { key: 'bank_account', label: 'เลขบัญชี' },
        { key: 'address', label: 'ที่อยู่', type: 'textarea' },
      ]}
      columns={[
        { label: 'รหัส', value: r => r.code },
        { label: 'ชื่อ-สกุล', value: r => `${r.first_name} ${r.last_name}` },
        { label: 'ตำแหน่ง', value: r => r.position },
        { label: 'เงินเดือน', value: r => r.salary, render: r => money(r.salary), num: true },
        { label: 'ประกันสังคม', value: r => (r.in_sso ? 'เข้า' : 'ไม่เข้า') },
        { label: 'บัญชี', value: r => [r.bank, r.bank_account].filter(Boolean).join(' ') },
        { label: 'สถานะ', value: r => (r.end_date ? `ลาออก ${thDate(r.end_date)}` : 'ทำงาน') },
      ]}
    />
  );
}

export function PurchasesPage() {
  const { suppliers, categories, toast, settings } = useApp();
  const sup = byId(suppliers);
  const cat = byId(categories);
  const vatOf = (p: Purchase) => (p.has_vat ? r2((num(p.amount) * settings.vat_rate) / 100) : 0);
  return (
    <CrudPage<Purchase & Record<string, unknown>>
      table="purchases" title="ซื้อสินค้า" orderBy="doc_date" ascending={false} monthField="doc_date"
      defaults={() => ({ doc_date: new Date().toISOString().slice(0, 10), doc_no: '', supplier_id: '', category_id: '', description: '', amount: '', has_vat: true, credit_days: 0, paid_date: '' })}
      fields={[
        { key: 'doc_date', label: 'วันที่', type: 'date', required: true },
        { key: 'doc_no', label: 'เลขที่บิล/ใบกำกับ' },
        { key: 'supplier_id', label: 'ผู้ขาย', type: 'select', required: true, options: suppliers.map(s => ({ value: s.id, label: s.name })) },
        { key: 'category_id', label: 'หมวดสินค้า', type: 'select', options: categories.map(c => ({ value: c.id, label: c.name })) },
        { key: 'amount', label: 'ยอดก่อน VAT', type: 'number', required: true },
        { key: 'has_vat', label: 'มี VAT', type: 'bool' },
        { ...creditField(), nullable: false, required: true },
        { key: 'paid_date', label: 'วันที่จ่ายเงิน (ว่าง = ยังไม่จ่าย)', type: 'date' },
        { key: 'description', label: 'รายละเอียด', type: 'textarea' },
      ]}
      columns={[
        { label: 'วันที่', value: r => r.doc_date, render: r => thDate(r.doc_date) },
        { label: 'เลขที่', value: r => r.doc_no, render: r => <span className="doc">{r.doc_no}</span> },
        { label: 'ผู้ขาย', value: r => sup.get(r.supplier_id)?.name },
        { label: 'หมวด', value: r => (r.category_id ? cat.get(r.category_id)?.name : '') },
        { label: 'ก่อน VAT', value: r => r.amount, render: r => money(r.amount), num: true },
        { label: 'VAT', value: r => vatOf(r), render: r => money(vatOf(r)), num: true },
        { label: 'ครบกำหนด', value: r => r.due_date, render: r => thDate(r.due_date) },
        {
          label: 'สถานะ', value: r => (r.paid_date ? `จ่ายแล้ว ${r.paid_date}` : 'ค้างจ่าย'),
          render: r => (r.paid_date ? <span className="pill ok">จ่าย {thDate(r.paid_date)}</span> : <DueBadge due={r.due_date} balance={1} />),
        },
      ]}
      rowActions={(r, refresh) =>
        !r.paid_date && (
          <button className="btn sm" onClick={async () => {
            const res = await sb.from('purchases').update({ paid_date: new Date().toISOString().slice(0, 10) }).eq('id', r.id);
            if (res.error) toast(res.error.message); else refresh();
          }}>จ่ายแล้ว</button>
        )
      }
      summary={rows => {
        const amt = rows.reduce((s, r) => s + num(r.amount), 0);
        const unpaid = rows.filter(r => !r.paid_date).reduce((s, r) => s + num(r.amount) + vatOf(r), 0);
        return (
          <div className="kpis">
            <Kpi label="ซื้อเดือนนี้ (ก่อน VAT)" value={money(amt)} />
            <Kpi label="ภาษีซื้อ" value={money(rows.reduce((s, r) => s + vatOf(r), 0))} />
            <Kpi label="ยังไม่จ่าย (ของเดือนนี้)" value={money(unpaid)} />
          </div>
        );
      }}
    />
  );
}

export function ExpensesPage() {
  return (
    <CrudPage<Expense & Record<string, unknown>>
      table="expenses" title="ค่าใช้จ่าย" orderBy="doc_date" ascending={false} monthField="doc_date"
      defaults={() => ({ doc_date: new Date().toISOString().slice(0, 10), category: EXPENSE_CATEGORIES[0], description: '', amount: '' })}
      fields={[
        { key: 'doc_date', label: 'วันที่', type: 'date', required: true },
        { key: 'category', label: 'ประเภท', type: 'select', required: true, options: EXPENSE_CATEGORIES.map(c => ({ value: c, label: c })) },
        { key: 'amount', label: 'จำนวนเงิน', type: 'number', required: true },
        { key: 'description', label: 'รายละเอียด', type: 'textarea' },
      ]}
      columns={[
        { label: 'วันที่', value: r => r.doc_date, render: r => thDate(r.doc_date) },
        { label: 'ประเภท', value: r => r.category },
        { label: 'รายละเอียด', value: r => r.description },
        { label: 'จำนวนเงิน', value: r => r.amount, render: r => money(r.amount), num: true },
      ]}
      summary={rows => (
        <div className="kpis"><Kpi label="ค่าใช้จ่ายเดือนนี้" value={money(rows.reduce((s, r) => s + num(r.amount), 0))} /></div>
      )}
    />
  );
}

export function PettyCashPage() {
  const { settings, month } = useApp();
  const [balance, setBalance] = useState<number | null>(null);
  return (
    <CrudPage<PettyCash & Record<string, unknown>>
      table="petty_cash" title="เงินสดย่อย" orderBy="doc_date" ascending={false} monthField="doc_date"
      defaults={() => ({ doc_date: new Date().toISOString().slice(0, 10), kind: 'out', category: PETTY_CATEGORIES[0], description: '', amount: '' })}
      afterChange={() => setBalance(null)}
      fields={[
        { key: 'doc_date', label: 'วันที่', type: 'date', required: true },
        { key: 'kind', label: 'รายการ', type: 'select', required: true, options: [{ value: 'out', label: 'จ่ายออก' }, { value: 'in', label: 'เบิกเติมเงินสดย่อย' }] },
        { key: 'category', label: 'ประเภท', type: 'select', required: true, options: [...PETTY_CATEGORIES, 'เติมเงิน'].map(c => ({ value: c, label: c })) },
        { key: 'amount', label: 'จำนวนเงิน', type: 'number', required: true },
        { key: 'description', label: 'รายละเอียด', type: 'textarea' },
      ]}
      columns={[
        { label: 'วันที่', value: r => r.doc_date, render: r => thDate(r.doc_date) },
        { label: 'รายการ', value: r => (r.kind === 'in' ? 'เติมเงิน' : 'จ่าย') },
        { label: 'ประเภท', value: r => r.category },
        { label: 'รายละเอียด', value: r => r.description },
        { label: 'รับ', value: r => (r.kind === 'in' ? r.amount : ''), render: r => (r.kind === 'in' ? money(r.amount) : ''), num: true },
        { label: 'จ่าย', value: r => (r.kind === 'out' ? r.amount : ''), render: r => (r.kind === 'out' ? money(r.amount) : ''), num: true },
      ]}
      summary={rows => <PettyBalance rows={rows} month={month} limit={settings.petty_limit} balance={balance} setBalance={setBalance} />}
    />
  );
}

function PettyBalance({ rows, month, limit, balance, setBalance }: {
  rows: PettyCash[]; month: string; limit: number; balance: number | null; setBalance: (n: number) => void;
}) {
  // Running balance up to the end of the selected month, across all earlier months.
  useEffect(() => {
    const [y, m] = month.split('-').map(Number);
    const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
    sb.from('petty_cash').select('kind,amount').lt('doc_date', end).then(res => {
      const all = (res.data ?? []) as { kind: string; amount: number }[];
      setBalance(all.reduce((s, r) => s + (r.kind === 'in' ? 1 : -1) * num(r.amount), 0));
    });
  }, [month, rows, setBalance]);
  const spent = rows.filter(r => r.kind === 'out').reduce((s, r) => s + num(r.amount), 0);
  return (
    <div className="kpis">
      <Kpi label="คงเหลือ ณ สิ้นเดือน" value={balance == null ? '…' : money(balance)} tone={balance != null && balance < 0 ? 'neg' : undefined} foot={`วงเงิน ${money(limit)}`} />
      <Kpi label="จ่ายเดือนนี้" value={money(spent)} />
      <Kpi label="ต้องเบิกเติม" value={balance == null ? '…' : money(Math.max(0, limit - balance))} />
    </div>
  );
}

/** Bills of one customer or salesperson, newest first. */
export function SalesHistory({ title, filter, onClose }: { title: string; filter: Record<string, string>; onClose: () => void }) {
  const { customers, salespeople } = useApp();
  const cust = byId(customers);
  const sp = byId(salespeople);
  const [rows, setRows] = useState<SaleSummary[] | null>(null);
  const key = JSON.stringify(filter);
  useEffect(() => {
    sb.from('sale_summary').select('*').match(JSON.parse(key)).order('doc_date', { ascending: false }).limit(500)
      .then(res => setRows(must(res) as SaleSummary[]));
  }, [key]);
  const total = (rows ?? []).reduce((s, r) => s + num(r.subtotal), 0);
  const owed = (rows ?? []).reduce((s, r) => s + num(r.total) - num(r.received) - num(r.deducted), 0);
  return (
    <Modal title={title} onClose={onClose}>
      {!rows ? <div className="muted">กำลังโหลด…</div> : rows.length === 0 ? <Empty /> : (
        <>
          <div className="detail-meta">
            <div><b>จำนวนบิล</b>{rows.length}</div>
            <div><b>ยอดขายรวม (ก่อน VAT)</b>{money(total)}</div>
            <div><b>ค้างชำระ</b>{money(owed)}</div>
            {'salesperson_id' in filter && <div><b>ค่าคอมรวม</b>{money(rows.reduce((s, r) => s + num(r.commission), 0))}</div>}
          </div>
          <div className="tablewrap">
            <table>
              <thead><tr><th>วันที่</th><th>เลขที่</th><th>{'customer_id' in filter ? 'พนักงานขาย' : 'ลูกค้า'}</th><th className="n">ยอดรวม</th><th>สถานะ</th></tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td>{thDate(r.doc_date)}</td>
                    <td className="doc">{r.doc_no}</td>
                    <td>{'customer_id' in filter ? sp.get(r.salesperson_id ?? '')?.name : cust.get(r.customer_id)?.name}</td>
                    <td className="n">{money(r.total)}</td>
                    <td><DueBadge due={r.due_date} balance={num(r.total) - num(r.received) - num(r.deducted)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="actions"><button className="btn" onClick={onClose}>ปิด</button></div>
    </Modal>
  );
}
