import { useEffect, useState, type ReactNode } from 'react';

export function Card({ title, sub, actions, children }: { title?: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      {(title || actions) && (
        <div className="cardhead">
          <div>
            {title && <h2>{title}</h2>}
            {sub && <div className="sub">{sub}</div>}
          </div>
          {actions && <div className="toolbar">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, foot, tone }: { label: string; value: ReactNode; foot?: ReactNode; tone?: 'pos' | 'neg' }) {
  return (
    <div className="kpi">
      <div className="lbl">{label}</div>
      <div className={`val ${tone ?? ''}`}>{value}</div>
      {foot && <div className="foot">{foot}</div>}
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-label={title}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, full, children }: { label: string; full?: boolean; children: ReactNode }) {
  return (
    <div className={`field ${full ? 'full' : ''}`}>
      <label>{label}</label>
      {children}
    </div>
  );
}

/** Delete button that needs a second tap, instead of a browser confirm dialog. */
export function DangerButton({ onConfirm, children = 'ลบ' }: { onConfirm: () => void; children?: ReactNode }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button type="button" className={`btn sm danger ${armed ? 'armed' : ''}`} onClick={() => (armed ? onConfirm() : setArmed(true))}>
      {armed ? 'กดอีกครั้งเพื่อยืนยัน' : children}
    </button>
  );
}

export function Empty({ children = 'ยังไม่มีรายการ' }: { children?: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function DueBadge({ due, balance }: { due: string; balance: number }) {
  if (balance <= 0.004) return <span className="pill ok">ชำระแล้ว</span>;
  const days = Math.round((Date.parse(due) - Date.now()) / 86400000);
  if (days < 0) return <span className="pill bad">เกินกำหนด {-days} วัน</span>;
  if (days <= 7) return <span className="pill warn">อีก {days} วัน</span>;
  return <span className="pill mute">อีก {days} วัน</span>;
}
