export function Segmented<T extends string | number>(p: {
  value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; label: string; disabled?: boolean;
}) {
  return (
    <div className={`segmented${p.disabled ? ' is-disabled' : ''}`} role="radiogroup" aria-label={p.label}>
      {p.options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={o.value === p.value} disabled={p.disabled}
          className={`segmented__item${o.value === p.value ? ' is-on' : ''}`} onClick={() => p.onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
