import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { sb, must } from './lib/supabase';
import { shiftMonth, thisMonth, thMonth } from './lib/format';
import type { Member, Settings } from './lib/types';
import { AppCtx, type AppState, type Lookups } from './app-context';
import { DashboardPage, ReportsPage } from './pages/reports';
import { ReceivablesPage, SalesPage } from './pages/sales';
import { PayrollPage } from './pages/payroll';
import { RebatesPage } from './pages/rebates';
import { SettingsPage } from './pages/settings';
import {
  CategoriesPage, CustomersPage, EmployeesPage, ExpensesPage, PettyCashPage, ProductsPage, PurchasesPage, SalespeoplePage, SuppliersPage,
} from './pages/masters';

interface Page { key: string; label: string; group: string; staffOnly?: boolean; ownerOnly?: boolean; monthly?: boolean; render: () => ReactNode }

const PAGES: Page[] = [
  { key: 'dash', label: 'ภาพรวม', group: 'หลัก', staffOnly: true, monthly: true, render: () => <DashboardPage /> },
  { key: 'sales', label: 'บิลขาย', group: 'หลัก', monthly: true, render: () => <SalesPage /> },
  { key: 'ar', label: 'ลูกหนี้ / รับเงิน', group: 'หลัก', staffOnly: true, render: () => <ReceivablesPage /> },
  { key: 'rebates', label: 'เงินทอนลูกค้า', group: 'หลัก', ownerOnly: true, monthly: true, render: () => <RebatesPage /> },
  { key: 'purchases', label: 'ซื้อสินค้า', group: 'บันทึก', staffOnly: true, monthly: true, render: () => <PurchasesPage /> },
  { key: 'expenses', label: 'ค่าใช้จ่าย', group: 'บันทึก', staffOnly: true, monthly: true, render: () => <ExpensesPage /> },
  { key: 'petty', label: 'เงินสดย่อย', group: 'บันทึก', staffOnly: true, monthly: true, render: () => <PettyCashPage /> },
  { key: 'payroll', label: 'เงินเดือน', group: 'บันทึก', staffOnly: true, monthly: true, render: () => <PayrollPage /> },
  { key: 'reports', label: 'รายงาน', group: 'รายงาน', staffOnly: true, monthly: true, render: () => <ReportsPage /> },
  { key: 'customers', label: 'ลูกค้า', group: 'ข้อมูลหลัก', render: () => <CustomersPage /> },
  { key: 'products', label: 'สินค้า', group: 'ข้อมูลหลัก', staffOnly: true, render: () => <ProductsPage /> },
  { key: 'categories', label: 'หมวดสินค้า', group: 'ข้อมูลหลัก', staffOnly: true, render: () => <CategoriesPage /> },
  { key: 'suppliers', label: 'ผู้ขาย', group: 'ข้อมูลหลัก', staffOnly: true, render: () => <SuppliersPage /> },
  { key: 'salespeople', label: 'พนักงานขาย', group: 'ข้อมูลหลัก', staffOnly: true, render: () => <SalespeoplePage /> },
  { key: 'employees', label: 'พนักงาน', group: 'ข้อมูลหลัก', staffOnly: true, render: () => <EmployeesPage /> },
  { key: 'settings', label: 'ตั้งค่า / ผู้ใช้', group: 'ข้อมูลหลัก', staffOnly: true, render: () => <SettingsPage /> },
];

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  if (session === undefined) return null;
  if (!session) return <Login />;
  return <Workspace session={session} />;
}

function Login() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setMsg('');
    const res = mode === 'in'
      ? await sb.auth.signInWithPassword({ email, password })
      : await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.href } });
    if (res.error) setMsg(res.error.message === 'Invalid login credentials' ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' : res.error.message);
    else if (mode === 'up' && !res.data.session) setMsg('สมัครแล้ว กรุณายืนยันอีเมลจากลิงก์ที่ส่งไป แล้วกลับมาเข้าสู่ระบบ');
    setBusy(false);
  }

  return (
    <div className="login">
      <form className="sheet" onSubmit={e => { e.preventDefault(); submit(); }}>
        <div className="loginbrand">Wonder Accounting<small>บริษัท วันเดอร์พริ้น จำกัด</small></div>
        <h3>{mode === 'in' ? 'เข้าสู่ระบบ' : 'สมัครผู้ใช้ใหม่'}</h3>
        <div className="stack" style={{ gap: 12 }}>
          <div className="field"><label>อีเมล</label><input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></div>
          <div className="field"><label>รหัสผ่าน</label><input type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} minLength={8} required value={password} onChange={e => setPassword(e.target.value)} /></div>
        </div>
        {msg && <div className="err">{msg}</div>}
        <div className="actions" style={{ justifyContent: 'space-between' }}>
          <button type="button" className="link" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg(''); }}>
            {mode === 'in' ? 'ยังไม่มีบัญชี? สมัคร' : 'มีบัญชีแล้ว? เข้าสู่ระบบ'}
          </button>
          <button type="submit" className="btn primary" disabled={busy}>{mode === 'in' ? 'เข้าสู่ระบบ' : 'สมัคร'}</button>
        </div>
      </form>
    </div>
  );
}

const EMPTY: Lookups = { categories: [], products: [], customers: [], suppliers: [], salespeople: [], employees: [] };

function Workspace({ session }: { session: Session }) {
  const [member, setMember] = useState<Member | null | undefined>(undefined);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [lookups, setLookups] = useState<Lookups>(EMPTY);
  const [error, setError] = useState('');
  const [page, setPage] = useState(() => location.hash.slice(1) || 'dash');
  const [month, setMonth] = useState(thisMonth());
  const [toastMsg, setToastMsg] = useState('');
  const toastTimer = useRef<number>();

  const toast = useCallback((m: string) => {
    setToastMsg(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(''), 3000);
  }, []);

  const reload = useCallback(async () => {
    try {
      const [c, p, cu, su, sp, em, st] = await Promise.all([
        sb.from('categories').select('*').order('name'),
        sb.from('products').select('*').order('code'),
        sb.from('customers').select('*').order('code'),
        sb.from('suppliers').select('*').order('name'),
        sb.from('salespeople').select('*').order('name'),
        sb.from('employees').select('*').order('code'),
        sb.from('settings').select('*').single(),
      ]);
      setLookups({
        categories: must(c), products: must(p), customers: must(cu), suppliers: must(su), salespeople: must(sp), employees: must(em),
      });
      setSettings(must(st));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    sb.from('members').select('*').eq('user_id', session.user.id).maybeSingle().then(res => {
      if (res.error) return setError(res.error.message);
      setMember(res.data as Member | null);
      if (res.data) reload();
    });
  }, [session.user.id, reload]);

  useEffect(() => {
    const onHash = () => setPage(location.hash.slice(1) || 'dash');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const signOut = () => sb.auth.signOut();

  if (error) {
    const schemaHint = /schema/i.test(error);
    return (
      <div className="login"><div className="sheet">
        <h3>เชื่อมต่อฐานข้อมูลไม่สำเร็จ</h3>
        <p className="err">{error}</p>
        {schemaHint && <p className="note">ต้องเปิด schema “acct” ใน Supabase: Project Settings → Data API → Exposed schemas</p>}
        <div className="actions"><button className="btn" onClick={signOut}>ออกจากระบบ</button></div>
      </div></div>
    );
  }
  if (member === undefined) return null;
  if (member === null) {
    return (
      <div className="login"><div className="sheet">
        <h3>รอเจ้าของกำหนดสิทธิ์</h3>
        <p>บัญชี {session.user.email} เข้าสู่ระบบแล้ว แต่ยังไม่ได้รับสิทธิ์ใช้งาน ให้เจ้าของเพิ่มคุณที่หน้า “ตั้งค่า / ผู้ใช้”</p>
        <div className="actions"><button className="btn" onClick={signOut}>ออกจากระบบ</button></div>
      </div></div>
    );
  }
  if (!settings) return null;

  const isStaff = member.role !== 'sales';
  const pages = PAGES.filter(p => (isStaff || !p.staffOnly) && (member.role === 'owner' || !p.ownerOnly));
  const current = pages.find(p => p.key === page) ?? pages[0];
  const groups = [...new Set(pages.map(p => p.group))];
  const state: AppState = { ...lookups, member, settings, month, reload, toast, isStaff };

  return (
    <AppCtx.Provider value={state}>
      <div className="app">
        <nav className="rail" aria-label="เมนู">
          <div className="brand">Wonder Accounting<small>{settings.company_name}</small></div>
          {groups.map(g => (
            <div key={g} style={{ display: 'contents' }}>
              <div className="navgroup">{g}</div>
              {pages.filter(p => p.group === g).map(p => (
                <button key={p.key} aria-current={p.key === current.key} onClick={() => { location.hash = p.key; }}>{p.label}</button>
              ))}
            </div>
          ))}
          <div className="who">
            {member.display_name}<br />
            <button className="link" onClick={signOut}>ออกจากระบบ</button>
          </div>
        </nav>
        <main>
          <div className="topbar">
            <h1>{current.label}</h1>
            {current.monthly && (
              <div className="monthpick">
                <button className="btn sm" aria-label="เดือนก่อน" onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
                <input type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} aria-label={thMonth(month)} />
                <button className="btn sm" aria-label="เดือนถัดไป" onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
              </div>
            )}
          </div>
          <div key={current.key}>{current.render()}</div>
        </main>
      </div>
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </AppCtx.Provider>
  );
}
