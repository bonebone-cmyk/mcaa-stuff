'use client';
import { useEffect, useRef, useState } from 'react';

export interface LogoTeam {
  logoUrl?: string | null;
  abbreviation?: string | null;
  school?: string | null;
  primaryColor?: string | null;
}

/** Team logo with a graceful color-badge fallback if the image fails to load */
export function TeamLogo({ team, size = 32, className = '' }: { team: LogoTeam; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  // an image that failed before hydration never fires onError — detect it on mount
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, [team.logoUrl]);
  if (!team.logoUrl || failed) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold text-white ${className}`}
        style={{ width: size, height: size, background: team.primaryColor ?? '#444', fontSize: Math.max(9, size / 3.2) }}
        aria-label={team.school ?? undefined}
      >
        {(team.abbreviation ?? '?').slice(0, 4)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={team.logoUrl}
      alt={team.school ? `${team.school} logo` : ''}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`shrink-0 object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
