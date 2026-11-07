/** Win-probability line (home perspective) drawn as inline SVG */
export function WinProbChart({ points, homeColor, awayColor, homeAbbr, awayAbbr, height = 180 }: {
  points: { x: number; p: number }[]; homeColor: string; awayColor: string; homeAbbr: string; awayAbbr: string; height?: number;
}) {
  const W = 800;
  const H = height;
  if (points.length < 2) return <div className="text-sm text-muted">Not enough plays recorded for a chart.</div>;
  const maxX = Math.max(...points.map((p) => p.x), 1);
  const xy = points.map((pt) => [(pt.x / maxX) * W, H - pt.p * H] as const);
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Win probability chart">
      <defs>
        <clipPath id="top"><rect x="0" y="0" width={W} height={H / 2} /></clipPath>
        <clipPath id="bottom"><rect x="0" y={H / 2} width={W} height={H / 2} /></clipPath>
      </defs>
      <rect x="0" y="0" width={W} height={H} fill="rgb(var(--surface-2))" rx="8" />
      {[0.25, 0.5, 0.75].map((g) => <line key={g} x1="0" x2={W} y1={H * g} y2={H * g} stroke="rgb(var(--line))" strokeDasharray={g === 0.5 ? '0' : '4 4'} />)}
      {[1, 2, 3].map((q) => <line key={q} x1={(W * q) / 4} x2={(W * q) / 4} y1="0" y2={H} stroke="rgb(var(--line))" />)}
      <path d={`${line} L${W},${H / 2} L0,${H / 2} Z`} fill={homeColor} opacity="0.25" clipPath="url(#top)" />
      <path d={`${line} L${W},${H / 2} L0,${H / 2} Z`} fill={awayColor} opacity="0.25" clipPath="url(#bottom)" />
      <path d={line} fill="none" stroke="rgb(var(--fg))" strokeWidth="2" />
      <text x="8" y="16" fontSize="12" fontWeight="700" fill="rgb(var(--muted))">{homeAbbr} 100%</text>
      <text x="8" y={H - 8} fontSize="12" fontWeight="700" fill="rgb(var(--muted))">{awayAbbr} 100%</text>
    </svg>
  );
}
