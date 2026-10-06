export function Toggle(p: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={p.checked} aria-label={p.label}
      className={`toggle${p.checked ? ' is-on' : ''}`} onClick={() => p.onChange(!p.checked)}>
      <span className="toggle__knob" />
    </button>
  );
}
