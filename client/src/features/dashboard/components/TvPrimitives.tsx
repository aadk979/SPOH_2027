import type { ReactNode } from 'react';
import { cx } from '@/shared/ui';
import { formatCount } from '@/shared/lib/format';
export function TvStat({
  label,
  value,
  unit,
}: {
  label: string;
  value: number;
  unit: string;
}): ReactNode {
  return (
    <div className="rounded-lg bg-tile-dark p-[1.5vw]">
      <p className="text-tv-label tracking-[0.06em] text-on-dark-muted uppercase">{label}</p>
      <p className="font-display text-tv-stat font-semibold tabular-nums">{formatCount(value)}</p>
      {/* The unit is as load-bearing here as on the phone dashboard: this is
          the screen most likely to be photographed and quoted. */}
      <p className="text-tv-label text-on-dark-muted">{unit}</p>
    </div>
  );
}

export function TvPanel({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <section className="flex min-h-0 flex-col">
      <h2 className="mb-[1vw] text-tv-label tracking-[0.06em] text-on-dark-muted uppercase">
        {title}
      </h2>
      <ul className="flex min-h-0 flex-1 flex-col gap-[0.6vw] overflow-hidden">{children}</ul>
    </section>
  );
}

export function TvRow({
  label,
  value,
  suffix = '',
  muted = false,
}: {
  label: string;
  value: number;
  suffix?: string;
  muted?: boolean;
}): ReactNode {
  return (
    <li className="flex items-baseline justify-between gap-sm text-tv-row">
      <span className={cx('min-w-0 truncate', muted && 'text-warn')}>
        {label}
        {suffix}
      </span>
      <span className="shrink-0 font-semibold tabular-nums">{formatCount(value)}</span>
    </li>
  );
}
