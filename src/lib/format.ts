const moneyFmt = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyFmt = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 4 });
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const TH_MONTHS_LONG = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

export const money = (n: number | null | undefined) => moneyFmt.format(Number(n ?? 0));
export const qty = (n: number | null | undefined) => qtyFmt.format(Number(n ?? 0));
export const r2 = (n: number) => Math.round(n * 100) / 100;
export const num = (v: unknown) => Number(v ?? 0) || 0;

/** 2026-10-22 -> 22 ต.ค. 69 */
export function thDate(iso: string | null | undefined) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${TH_MONTHS[m - 1]} ${String(y + 543).slice(2)}`;
}

/** 2026-10 -> ตุลาคม 2569 */
export function thMonth(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return `${TH_MONTHS_LONG[m - 1]} ${y + 543}`;
}

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const thisMonth = () => today().slice(0, 7);

/** First day and first day of next month, for doc_date >= from and < to filters. */
export function monthRange(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return { from: `${ym}-01`, to: `${next}-01` };
}

export function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function daysBetween(fromIso: string, toIso: string) {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86400000);
}

/** Social security: rate on salary clamped to the wage base. */
export function ssoOf(salary: number, s: { sso_rate: number; sso_min: number; sso_max: number }) {
  const base = Math.min(Math.max(salary, s.sso_min), s.sso_max);
  return r2((base * s.sso_rate) / 100);
}

/** Download rows as a CSV that Excel opens with Thai text intact (UTF-8 BOM). */
export function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const cell = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = [header, ...rows].map(r => r.map(cell).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
