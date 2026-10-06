import type { ReactNode } from 'react';
import { Button, IconButton } from './Button';

export interface PanelProps {
  title: string;
  onBack?: () => void;
  onClose?: () => void;
  onReset?: () => void;
  onApply?: () => void;
  applyLabel?: string;
  applyDisabled?: boolean;
  footerExtra?: ReactNode;
  children: ReactNode;
}

export function Panel(p: PanelProps) {
  return (
    <section className="panel" role="dialog" aria-label={p.title}>
      <header className="panel__header">
        {p.onBack ? <IconButton label="Back" icon="back" onClick={p.onBack} /> : <span className="icon-btn-spacer" />}
        <h2 className="panel__title">{p.title}</h2>
        {p.onClose ? <IconButton label="Close" icon="close" onClick={p.onClose} /> : <span className="icon-btn-spacer" />}
      </header>
      <div className="panel__body">{p.children}</div>
      {(p.onApply || p.onReset || p.footerExtra) && (
        <footer className="panel__footer">
          {p.onReset ? <Button variant="soft" onClick={p.onReset}>Reset</Button> : <span />}
          <div className="panel__footer-right">
            {p.footerExtra}
            {p.onApply && <Button variant="primary" onClick={p.onApply} disabled={p.applyDisabled}>{p.applyLabel ?? 'Apply'}</Button>}
          </div>
        </footer>
      )}
    </section>
  );
}

export function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="row">
      <div className="row__label">{label}{hint && <span className="row__hint">{hint}</span>}</div>
      <div className="row__control">{children}</div>
    </div>
  );
}
