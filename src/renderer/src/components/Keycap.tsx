export function Keycap({ glyph, label }: { glyph?: string; label: string }) {
  return (
    <div className="keycap" aria-hidden="true">
      {glyph && <span className="keycap__glyph">{glyph}</span>}
      <span className="keycap__label">{label}</span>
    </div>
  );
}
