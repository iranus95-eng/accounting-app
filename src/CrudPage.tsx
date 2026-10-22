import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { sb, must } from './lib/supabase';
import { downloadCsv, monthRange, thMonth } from './lib/format';
import { useApp } from './app-context';
import { Card, DangerButton, Empty, Field, Modal } from './ui';

export interface FieldDef {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'bool' | 'select' | 'textarea';
  options?: { value: string | number; label: string }[];
  /** select values are numbers (e.g. credit days) */
  numeric?: boolean;
  required?: boolean;
  /** empty input is stored as null instead of 0 / '' */
  nullable?: boolean;
  full?: boolean;
  placeholder?: string;
}

export interface ColumnDef<T> {
  label: string;
  value: (row: T) => string | number | null | undefined;
  render?: (row: T) => ReactNode;
  num?: boolean;
}

type Row = { id: string } & Record<string, unknown>;

interface Props<T extends Row> {
  table: string;
  title: string;
  fields: FieldDef[];
  columns: ColumnDef<T>[];
  /** filter by the selected month on this date column */
  monthField?: string;
  orderBy: string;
  ascending?: boolean;
  defaults: () => Record<string, unknown>;
  /** called after a save or delete, e.g. to refresh master data */
  afterChange?: () => Promise<void> | void;
  rowActions?: (row: T, refresh: () => void) => ReactNode;
  summary?: (rows: T[]) => ReactNode;
  readOnly?: boolean;
  validate?: (values: Record<string, unknown>) => string | null;
}

export function CrudPage<T extends Row>(p: Props<T>) {
  const { month, toast } = useApp();
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    let query = sb.from(p.table).select('*').order(p.orderBy, { ascending: p.ascending ?? true });
    if (p.monthField) {
      const { from, to } = monthRange(month);
      query = query.gte(p.monthField, from).lt(p.monthField, to);
    }
    try {
      setRows(must(await query) as T[]);
    } catch (e) {
      toast((e as Error).message);
    }
    setLoading(false);
  }, [p.table, p.orderBy, p.ascending, p.monthField, month, toast]);

  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(r => p.columns.some(c => String(c.value(r) ?? '').toLowerCase().includes(needle)));
  }, [rows, q, p.columns]);

  async function save() {
    if (!editing) return;
    const values: Record<string, unknown> = {};
    for (const f of p.fields) {
      let v = editing[f.key];
      if (f.type === 'number' || f.numeric) v = v === '' || v == null ? (f.nullable ? null : 0) : Number(v);
      else if (f.type === 'bool') v = !!v;
      else if (typeof v === 'string') v = v.trim() === '' && f.nullable !== false ? null : v.trim();
      if (f.required && (v == null || v === '')) return setErr(`กรุณากรอก${f.label}`);
      values[f.key] = v;
    }
    const msg = p.validate?.(values);
    if (msg) return setErr(msg);
    const id = editing.id as string | undefined;
    const res = id ? await sb.from(p.table).update(values).eq('id', id) : await sb.from(p.table).insert(values);
    if (res.error) return setErr(res.error.message);
    setEditing(null);
    toast('บันทึกแล้ว');
    await load();
    await p.afterChange?.();
  }

  async function remove(id: string) {
    const res = await sb.from(p.table).delete().eq('id', id);
    if (res.error) {
      toast(res.error.message.includes('foreign key') ? 'ลบไม่ได้ เพราะมีรายการอื่นอ้างถึง' : res.error.message);
      return;
    }
    toast('ลบแล้ว');
    await load();
    await p.afterChange?.();
  }

  function exportCsv() {
    downloadCsv(
      `${p.title}${p.monthField ? '-' + month : ''}.csv`,
      p.columns.map(c => c.label),
      shown.map(r => p.columns.map(c => c.value(r))),
    );
  }

  return (
    <div className="stack">
      {p.summary && !loading && p.summary(rows)}
      <Card
        title={p.monthField ? `${p.title} · ${thMonth(month)}` : p.title}
        sub={loading ? 'กำลังโหลด…' : `${shown.length} รายการ`}
        actions={
          <>
            <input type="search" placeholder="ค้นหา" value={q} onChange={e => setQ(e.target.value)} />
            <button className="btn" onClick={exportCsv}>ส่งออก Excel</button>
            {!p.readOnly && (
              <button className="btn primary" onClick={() => { setErr(''); setEditing(p.defaults()); }}>+ เพิ่ม</button>
            )}
          </>
        }
      >
        {shown.length === 0 && !loading ? (
          <Empty />
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  {p.columns.map(c => <th key={c.label} className={c.num ? 'n' : ''}>{c.label}</th>)}
                  {!p.readOnly && <th />}
                </tr>
              </thead>
              <tbody>
                {shown.map(r => (
                  <tr key={r.id}>
                    {p.columns.map(c => (
                      <td key={c.label} className={c.num ? 'n' : ''}>{c.render ? c.render(r) : c.value(r)}</td>
                    ))}
                    {!p.readOnly && (
                      <td className="n">
                        <span className="toolbar" style={{ justifyContent: 'flex-end' }}>
                          {p.rowActions?.(r, load)}
                          <button className="btn sm" onClick={() => { setErr(''); setEditing({ ...r }); }}>แก้ไข</button>
                          <DangerButton onConfirm={() => remove(r.id)} />
                        </span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && (
        <Modal title={editing.id ? `แก้ไข${p.title}` : `เพิ่ม${p.title}`} onClose={() => setEditing(null)}>
          <form onSubmit={e => { e.preventDefault(); save(); }}>
            <div className="grid">
              {p.fields.map(f => (
                <Field key={f.key} label={f.label + (f.required ? ' *' : '')} full={f.full || f.type === 'textarea'}>
                  <Input def={f} value={editing[f.key]} onChange={v => setEditing({ ...editing, [f.key]: v })} />
                </Field>
              ))}
            </div>
            {err && <div className="err">{err}</div>}
            <div className="actions">
              <button type="button" className="btn" onClick={() => setEditing(null)}>ยกเลิก</button>
              <button type="submit" className="btn primary">บันทึก</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Input({ def, value, onChange }: { def: FieldDef; value: unknown; onChange: (v: unknown) => void }) {
  const v = value == null ? '' : String(value);
  switch (def.type) {
    case 'bool':
      return (
        <select value={value ? '1' : '0'} onChange={e => onChange(e.target.value === '1')}>
          <option value="1">ใช่</option>
          <option value="0">ไม่ใช่</option>
        </select>
      );
    case 'select':
      return (
        <select value={v} onChange={e => onChange(e.target.value)}>
          {!def.required && <option value="">—</option>}
          {def.required && v === '' && <option value="">เลือก…</option>}
          {def.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    case 'textarea':
      return <textarea rows={2} value={v} onChange={e => onChange(e.target.value)} />;
    case 'number':
      return <input type="number" step="any" inputMode="decimal" value={v} placeholder={def.placeholder} onChange={e => onChange(e.target.value)} />;
    case 'date':
      return <input type="date" value={v.slice(0, 10)} onChange={e => onChange(e.target.value)} />;
    default:
      return <input value={v} placeholder={def.placeholder} onChange={e => onChange(e.target.value)} />;
  }
}
