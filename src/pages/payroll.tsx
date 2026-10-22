import { useCallback, useEffect, useState } from 'react';
import { useApp, byId } from '../app-context';
import { sb, must } from '../lib/supabase';
import { downloadCsv, money, monthRange, num, r2, ssoOf, thMonth } from '../lib/format';
import type { Payroll } from '../lib/types';
import { Card, DangerButton, Empty, Kpi } from '../ui';

export function PayrollPage() {
  const { month, employees, settings, toast } = useApp();
  const emp = byId(employees);
  const [rows, setRows] = useState<Payroll[]>([]);
  const [loading, setLoading] = useState(true);
  const monthStart = `${month}-01`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(must(await sb.from('payroll').select('*').eq('month', monthStart)) as Payroll[]);
    } catch (e) { toast((e as Error).message); }
    setLoading(false);
  }, [monthStart, toast]);
  useEffect(() => { load(); }, [load]);

  // SSO is charged on wages including overtime, within the wage base.
  const ssoFor = (employeeId: string, salary: number, overtime: number) =>
    emp.get(employeeId)?.in_sso === false ? 0 : ssoOf(salary + overtime, settings);

  async function generate() {
    const { from, to } = monthRange(month);
    const have = new Set(rows.map(r => r.employee_id));
    const fresh = employees
      .filter(e => !have.has(e.id) && (!e.start_date || e.start_date < to) && (!e.end_date || e.end_date >= from))
      .map(e => {
        const sso = ssoFor(e.id, num(e.salary), 0);
        return { month: monthStart, employee_id: e.id, salary: num(e.salary), overtime: 0, sso_employee: sso, sso_employer: sso, advance_deduction: 0 };
      });
    if (!fresh.length) return toast('พนักงานทุกคนมีรายการเดือนนี้แล้ว');
    const res = await sb.from('payroll').insert(fresh);
    if (res.error) return toast(res.error.message);
    toast(`สร้างรายการเงินเดือน ${fresh.length} คน`);
    load();
  }

  async function update(r: Payroll, patch: Partial<Payroll>) {
    const next = { ...r, ...patch };
    if ('salary' in patch || 'overtime' in patch) {
      const sso = ssoFor(r.employee_id, num(next.salary), num(next.overtime));
      next.sso_employee = sso;
      next.sso_employer = sso;
    }
    setRows(rs => rs.map(x => (x.id === r.id ? next : x)));
    const { id, ...values } = next;
    const res = await sb.from('payroll').update(values).eq('id', id);
    if (res.error) toast(res.error.message);
  }

  async function remove(id: string) {
    const res = await sb.from('payroll').delete().eq('id', id);
    if (res.error) return toast(res.error.message);
    load();
  }

  const netOf = (r: Payroll) => r2(num(r.salary) + num(r.overtime) - num(r.sso_employee) - num(r.advance_deduction));
  const sorted = [...rows].sort((a, b) => (emp.get(a.employee_id)?.code ?? '').localeCompare(emp.get(b.employee_id)?.code ?? ''));
  const total = (f: (r: Payroll) => number) => rows.reduce((s, r) => s + f(r), 0);
  const nameOf = (id: string) => { const e = emp.get(id); return e ? `${e.first_name} ${e.last_name}` : ''; };

  function exportCsv() {
    downloadCsv(`เงินเดือน-${month}.csv`,
      ['รหัส', 'ชื่อ-สกุล', 'เงินเดือน', 'ค่าล่วงเวลา', 'ประกันสังคม (ลูกจ้าง)', 'ประกันสังคม (นายจ้าง)', 'หักเบิกล่วงหน้า', 'รับสุทธิ', 'ธนาคาร', 'เลขบัญชี', 'วันที่จ่าย'],
      sorted.map(r => {
        const e = emp.get(r.employee_id);
        return [e?.code, nameOf(r.employee_id), r.salary, r.overtime, r.sso_employee, r.sso_employer, r.advance_deduction, netOf(r), e?.bank, e?.bank_account, r.pay_date];
      }));
  }

  return (
    <div className="stack">
      <div className="kpis">
        <Kpi label="เงินเดือน + ค่าล่วงเวลา" value={money(total(r => num(r.salary) + num(r.overtime)))} />
        <Kpi label="ประกันสังคมนำส่ง (2 ฝ่าย)" value={money(total(r => num(r.sso_employee) + num(r.sso_employer)))} foot="ยื่น สปส.1-10 ภายในวันที่ 15 เดือนถัดไป" />
        <Kpi label="จ่ายสุทธิให้พนักงาน" value={money(total(netOf))} />
      </div>
      <Card title={`เงินเดือน · ${thMonth(month)}`} sub={loading ? 'กำลังโหลด…' : `${rows.length} คน · ประกันสังคม ${settings.sso_rate}% ฐาน ${money(settings.sso_min)}–${money(settings.sso_max)}`}
        actions={<>
          <button className="btn" onClick={exportCsv}>ส่งออก Excel</button>
          <button className="btn primary" onClick={generate}>สร้างจากรายชื่อพนักงาน</button>
        </>}>
        {rows.length === 0 && !loading ? <Empty>ยังไม่มีรายการเงินเดือนเดือนนี้ กด “สร้างจากรายชื่อพนักงาน”</Empty> : (
          <div className="tablewrap">
            <table className="items">
              <thead><tr><th>พนักงาน</th><th className="n">เงินเดือน</th><th className="n">ค่าล่วงเวลา</th><th className="n">ปกส. ลูกจ้าง</th><th className="n">หักเบิกล่วงหน้า</th><th className="n">รับสุทธิ</th><th>วันที่จ่าย</th><th /></tr></thead>
              <tbody>
                {sorted.map(r => (
                  <tr key={r.id}>
                    <td>{nameOf(r.employee_id)}</td>
                    <td style={{ width: 120 }}><NumInput value={r.salary} onCommit={v => update(r, { salary: v })} /></td>
                    <td style={{ width: 110 }}><NumInput value={r.overtime} onCommit={v => update(r, { overtime: v })} /></td>
                    <td className="n">{money(r.sso_employee)}</td>
                    <td style={{ width: 110 }}><NumInput value={r.advance_deduction} onCommit={v => update(r, { advance_deduction: v })} /></td>
                    <td className="n"><b>{money(netOf(r))}</b></td>
                    <td style={{ width: 150 }}><input type="date" value={r.pay_date ?? ''} onChange={e => update(r, { pay_date: e.target.value || null })} /></td>
                    <td><DangerButton onConfirm={() => remove(r.id)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="note">แก้ตัวเลขแล้วกดออกจากช่อง ระบบจะคำนวณประกันสังคมใหม่และบันทึกให้ทันที</p>
      </Card>
    </div>
  );
}

function NumInput({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [v, setV] = useState(String(num(value)));
  useEffect(() => setV(String(num(value))), [value]);
  return (
    <input type="number" step="any" inputMode="decimal" style={{ textAlign: 'right' }} value={v}
      onChange={e => setV(e.target.value)}
      onBlur={() => num(v) !== num(value) && onCommit(num(v))} />
  );
}
