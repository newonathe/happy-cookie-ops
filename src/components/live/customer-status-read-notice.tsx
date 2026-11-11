import type { OpsVals } from '@/view-models/vals';

/** Local read recovery never resubmits an order or confirms payment. */
export function CustomerStatusReadNotice({ read }: { read?: OpsVals['liveStatusRead'] }) {
  if (!read || (read.state !== 'error' && !(read.state === 'loading' && read.stale))) return null;
  return (
    <div
      role="status"
      className="m-4 flex flex-wrap items-center justify-between gap-3 rounded-control border border-line bg-surface p-4 text-sm text-ink"
    >
      <span>
        {read.state === 'loading' ? 'Refreshing your order.' : 'Your order could not be refreshed.'}
        {read.stale ? ' Showing the last successful read; the status may have changed.' : ''}
        {!read.online ? ' Connect to retry.' : ''}
      </span>
      {read.state === 'error' ? (
        <button
          type="button"
          className="min-h-11 rounded-control border border-line-strong bg-raise px-4 font-semibold disabled:opacity-50"
          disabled={!read.online}
          onClick={read.retry}
        >
          Retry order status
        </button>
      ) : null}
    </div>
  );
}
