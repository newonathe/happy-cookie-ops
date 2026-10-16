export interface ProgressBarProps {
  value: number;
  max: number;
  /** A second, lighter part of the same total (cookies given away next to cookies sold). */
  secondary?: number;
  /** What the bar measures, in words: "144 of 200 sold". Also its accessible name. */
  label: string;
  /** How far over, already written ("₱210.00"), for a bar that measures money. Default: the plain number. */
  overBy?: string;
}

const clamp = (n: number) => Math.min(1, Math.max(0, n));

/** Value against a total. Past the total the fill stays at 100 % and the label says by how much. */
export function ProgressBar({ value, max, secondary, label, overBy }: ProgressBarProps) {
  const ratio = max > 0 ? clamp(value / max) : 0;
  const secondaryRatio = max > 0 && secondary !== undefined ? clamp((value + secondary) / max) : 0;
  const over = max > 0 && value > max;
  const words = over
    ? `${label} · over by ${overBy ?? (value - max).toLocaleString('en-PH')}`
    : label;
  const state = over ? 'over' : max > 0 && value >= max ? 'full' : value > 0 ? 'part' : 'empty';
  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.min(value, max)}
        aria-valuetext={words}
        data-state={state}
        className="relative h-2 overflow-hidden rounded-full bg-chip"
      >
        {secondaryRatio > 0 ? (
          <div
            data-part="secondary"
            style={{ transform: `scaleX(${secondaryRatio})` }}
            className="absolute inset-0 origin-left bg-warm-accent transition-transform duration-(--dur-slow) ease-(--ease-standard)"
          />
        ) : null}
        <div
          data-part="fill"
          style={{ transform: `scaleX(${ratio})` }}
          className="absolute inset-0 origin-left bg-brand transition-transform duration-(--dur-slow) ease-(--ease-standard)"
        />
      </div>
      <span className="text-caption text-ink-soft">{words}</span>
    </div>
  );
}
