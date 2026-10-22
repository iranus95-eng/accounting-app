import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../app-context';
import { sb, must } from '../lib/supabase';
import { thDate } from '../lib/format';
import type { Member, Role } from '../lib/types';
import { Card, DangerButton, Field } from '../ui';

const ROLE_LABEL: Record<Role, string> = { owner: 'เจ้าของ', bookkeeper: 'ผู้ทำบัญชี', sales: 'พนักงานขาย' };

export function SettingsPage() {
  const { settings, member, reload, toast } = useApp();
  const [s, setS] = useState(settings);
  const owner = member.role === 'owner';

  async function save() {
    const { id, ...values } = s;
    const res = await sb.from('settings').update({
      ...values,
      vat_rate: Number(values.vat_rate), sso_rate: Number(values.sso_rate), sso_min: Number(values.sso_min),
      sso_max: Number(values.sso_max), petty_limit: Number(values.petty_limit),
    }).eq('id', id);
    if (res.error) return toast(res.error.message);
    toast('บันทึกแล้ว');
    reload();
  }

  const num = (k: keyof typeof s, label: string) => (
    <Field label={label}><input type="number" step="any" value={String(s[k])} onChange={e => setS({ ...s, [k]: e.target.value })} /></Field>
  );

  return (
    <div className="stack">
      <Card title="ตั้งค่าบริษัท">
        <div className="grid">
          <Field label="ชื่อบริษัท" full><input value={s.company_name} onChange={e => setS({ ...s, company_name: e.target.value })} /></Field>
          {num('vat_rate', 'อัตรา VAT (%)')}
          {num('sso_rate', 'อัตราประกันสังคม (%)')}
          {num('sso_min', 'ฐานค่าจ้างขั้นต่ำ')}
          {num('sso_max', 'ฐานค่าจ้างสูงสุด')}
          {num('petty_limit', 'วงเงินสดย่อย')}
        </div>
        <div className="actions"><button className="btn primary" onClick={save}>บันทึก</button></div>
      </Card>
      {owner && <MembersCard />}
    </div>
  );
}

function MembersCard() {
  const { salespeople, member: me, toast } = useApp();
  const [members, setMembers] = useState<Member[]>([]);
  const [users, setUsers] = useState<{ user_id: string; email: string; created_at: string }[]>([]);
  const [add, setAdd] = useState({ user_id: '', display_name: '', role: 'bookkeeper' as Role, salesperson_id: '' });
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      setMembers(must(await sb.from('members').select('*').order('created_at')) as Member[]);
      setUsers(must(await sb.rpc('signed_up_users')) as typeof users);
    } catch (e) { toast((e as Error).message); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const emailOf = (id: string) => users.find(u => u.user_id === id)?.email ?? '';
  const pending = users.filter(u => !members.some(m => m.user_id === u.user_id));

  async function addMember() {
    setErr('');
    if (!add.user_id || !add.display_name.trim()) return setErr('เลือกอีเมลและใส่ชื่อที่แสดง');
    if (add.role === 'sales' && !add.salesperson_id) return setErr('พนักงานขายต้องผูกกับรายชื่อพนักงานขาย');
    const res = await sb.from('members').insert({
      user_id: add.user_id, display_name: add.display_name.trim(), role: add.role,
      salesperson_id: add.role === 'sales' ? add.salesperson_id : null,
    });
    if (res.error) return setErr(res.error.message);
    setAdd({ user_id: '', display_name: '', role: 'bookkeeper', salesperson_id: '' });
    load();
  }

  async function remove(id: string) {
    const res = await sb.from('members').delete().eq('user_id', id);
    if (res.error) return toast(res.error.message);
    load();
  }

  return (
    <Card title="ผู้ใช้งาน" sub="ให้ผู้ใช้สมัครด้วยอีเมลที่หน้าเข้าสู่ระบบก่อน แล้วกำหนดสิทธิ์ที่นี่">
      <div className="tablewrap">
        <table>
          <thead><tr><th>ชื่อ</th><th>อีเมล</th><th>สิทธิ์</th><th /></tr></thead>
          <tbody>
            {members.map(m => (
              <tr key={m.user_id}>
                <td>{m.display_name}</td>
                <td>{emailOf(m.user_id)}</td>
                <td>{ROLE_LABEL[m.role]}{m.salesperson_id ? ` · ${salespeople.find(s => s.id === m.salesperson_id)?.name ?? ''}` : ''}</td>
                <td className="n">{m.user_id !== me.user_id && <DangerButton onConfirm={() => remove(m.user_id)}>เอาออก</DangerButton>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pending.length > 0 ? (
        <>
          <div className="grid" style={{ marginTop: 14 }}>
            <Field label="อีเมลที่สมัครแล้ว">
              <select value={add.user_id} onChange={e => setAdd({ ...add, user_id: e.target.value })}>
                <option value="">เลือก…</option>
                {pending.map(u => <option key={u.user_id} value={u.user_id}>{u.email} (สมัคร {thDate(u.created_at)})</option>)}
              </select>
            </Field>
            <Field label="ชื่อที่แสดง"><input value={add.display_name} onChange={e => setAdd({ ...add, display_name: e.target.value })} /></Field>
            <Field label="สิทธิ์">
              <select value={add.role} onChange={e => setAdd({ ...add, role: e.target.value as Role })}>
                {(Object.keys(ROLE_LABEL) as Role[]).map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </Field>
            {add.role === 'sales' && (
              <Field label="ผูกกับพนักงานขาย">
                <select value={add.salesperson_id} onChange={e => setAdd({ ...add, salesperson_id: e.target.value })}>
                  <option value="">เลือก…</option>
                  {salespeople.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
            )}
          </div>
          {err && <div className="err">{err}</div>}
          <div className="actions"><button className="btn primary" onClick={addMember}>เพิ่มผู้ใช้</button></div>
        </>
      ) : <p className="note">ไม่มีผู้สมัครใหม่ที่รอกำหนดสิทธิ์</p>}
      <p className="note">เจ้าของ: ทำได้ทุกอย่างและจัดการผู้ใช้ · ผู้ทำบัญชี: ทำได้ทุกอย่างยกเว้นจัดการผู้ใช้ · พนักงานขาย: ออกบิลและดูบิลของตัวเองเท่านั้น</p>
    </Card>
  );
}
