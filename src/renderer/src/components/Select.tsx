import { Icon } from './Icon';

export function Select<T extends string>(p: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; label: string }) {
  return (
    <div className="select">
      <select aria-label={p.label} value={p.value} onChange={(e) => p.onChange(e.target.value as T)}>
        {p.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <Icon name="chevrons" size={14} />
    </div>
  );
}
