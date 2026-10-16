export interface SkeletonProps {
  /** Text lines to draw. */
  lines?: number;
  /** Draw a photo tile (a block) above the lines. */
  tile?: boolean;
}

/** A placeholder while something loads. The shimmer stops under reduced motion. */
export function Skeleton({ lines = 3, tile = false }: SkeletonProps) {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-2">
      <span className="sr-only">Loading</span>
      {tile ? <div aria-hidden="true" className="motion-shimmer h-24 rounded-card" /> : null}
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          aria-hidden="true"
          data-line=""
          className="motion-shimmer h-3 rounded-tag"
          style={{ width: i === lines - 1 && lines > 1 ? '60%' : '100%' }}
        />
      ))}
    </div>
  );
}
