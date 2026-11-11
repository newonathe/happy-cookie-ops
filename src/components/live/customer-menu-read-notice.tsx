import type { ShopMenuReadView } from '@/store/shop-menu-read';

/** Failure, stale data and a genuinely empty public menu remain distinct. */
export function CustomerMenuReadNotice({ read }: { read?: ShopMenuReadView | null }) {
  if (!read || (read.state === 'ready' && !read.empty)) return null;
  const message =
    read.state === 'failed'
      ? read.stale
        ? 'Menu could not be refreshed. Showing the last successful read.'
        : 'Menu is unavailable. Try reading it again.'
      : read.state === 'loading'
        ? read.stale
          ? 'Refreshing menu. Showing the last successful read.'
          : 'Loading menu…'
        : 'There are no flavours on the menu right now.';
  return (
    <div
      role="status"
      className="mx-auto my-4 flex w-[calc(100%_-_2rem)] max-w-3xl flex-wrap items-center justify-between gap-3 rounded-control border border-line bg-surface p-4 text-sm text-ink"
    >
      <span>
        {message}
        {!read.online && read.state === 'failed' ? ' Connect to retry the menu.' : ''}
      </span>
      {read.state === 'failed' && read.retry ? (
        <button
          type="button"
          className="min-h-11 rounded-control border border-line-strong bg-raise px-4 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          onClick={read.retry}
          disabled={!read.online}
        >
          Retry menu
        </button>
      ) : null}
    </div>
  );
}
