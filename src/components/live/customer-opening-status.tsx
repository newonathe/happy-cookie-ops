import type { OpsVals } from '@/view-models/vals';
import type { ShopAvailabilityView } from '@/store/shop-availability-read';

function OpeningStatus({
  read,
  previous
}: {
  read: ShopAvailabilityView;
  previous: OpsVals['dropBannerSub'];
}) {
  return (
    <span className="flex flex-wrap items-center gap-3">
      <span>
        {read.stale ? (
          <>{previous} · Opening times could not be refreshed. Showing the last successful read.</>
        ) : (
          'Availability is checked when you place an order.'
        )}
        {!read.online ? ' Connect to retry opening times.' : ''}
      </span>
      {read.retry ? (
        <button
          type="button"
          className="min-h-11 rounded-control border border-line-strong bg-surface px-4 font-semibold disabled:opacity-50"
          disabled={!read.online}
          onClick={read.retry}
        >
          Retry opening times
        </button>
      ) : null}
    </span>
  );
}

/** Fill the existing live banner slot; the protected customer screen remains unchanged. */
export function openingTimesBanner(v: OpsVals, read: ShopAvailabilityView): Partial<OpsVals> {
  if (read.state === 'ready') return {};
  const unknown = !read.stale;
  return {
    ...(unknown
      ? {
          dropBannerTitle:
            read.state === 'failed' ? 'Opening times are unavailable' : 'Checking opening times…',
          dropBannerBg: 'var(--color-raise)',
          dropBannerBr: 'var(--color-line)',
          dropBannerFg: 'var(--color-ink-soft)'
        }
      : {}),
    dropBannerSub:
      read.state === 'loading' ? (
        read.stale ? (
          <>{v.dropBannerSub} · Refreshing opening times.</>
        ) : (
          'Reading the shop’s opening times.'
        )
      ) : (
        <OpeningStatus read={read} previous={v.dropBannerSub} />
      )
  };
}
