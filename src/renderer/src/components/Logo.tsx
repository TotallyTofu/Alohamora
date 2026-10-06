const polar = (r: number, deg: number): string => {
  const a = ((deg - 90) * Math.PI) / 180;
  return `${(12 + r * Math.cos(a)).toFixed(2)} ${(12 + r * Math.sin(a)).toFixed(2)}`;
};

/** One petal of the wheel between two angles (degrees clockwise from 12 o'clock). */
const petal = (from: number, to: number, outer: number, inner: number): string =>
  `M${polar(outer, from)} A${outer} ${outer} 0 0 1 ${polar(outer, to)} L${polar(inner, to)} A${inner} ${inner} 0 0 0 ${polar(inner, from)} Z`;

/** The Alohamora mark: a small wheel with one orange petal and a keyhole in its hub. Same drawing as the app icon. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11.6" fill="var(--wheel-base)" stroke="var(--border)" strokeWidth="0.6" />
      {[0, 1, 2, 4, 5, 6, 7].map((i) => <path key={i} d={petal(i * 45 - 20, i * 45 + 20, 10.4, 6.2)} fill="var(--slice-top)" />)}
      <path d={petal(3 * 45 - 20, 3 * 45 + 20, 10.4, 6.2)} fill="var(--accent)" />
      <circle cx="12" cy="12" r="4.9" fill="var(--hub)" stroke="var(--border)" strokeWidth="0.5" />
      <g fill="var(--keyhole)">
        <circle cx="12" cy="11.1" r="1.45" />
        <path d="M11.35 11.9 L12.65 11.9 L13.3 14.5 L10.7 14.5 Z" />
      </g>
    </svg>
  );
}
