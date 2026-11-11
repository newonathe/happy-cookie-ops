import type { OpsVals } from '@/view-models/vals';
import { Banner } from '@/components/ui/banner';
export function StockReadNotice({ read }: { read: OpsVals['liveStockRead'] }) {
  if (!read || read.state === 'ready') return null;
  if (read.state === 'idle')
    return (
      <p role="status" className="text-body text-ink-mute">
        Stock is loading.
      </p>
    );
  if (read.state === 'failed')
    return (
      <Banner
        tone="warn"
        title={read.stale ? 'Inventory could not be refreshed' : 'Inventory is unavailable'}
        body={
          read.stale
            ? 'Showing the last inventory read. Read it again before relying on these balances.'
            : 'No inventory balance has been confirmed. Try reading it again.'
        }
        action={{ label: 'Retry inventory', onPress: read.retry }}
      />
    );
  return (
    <p role="status" className="text-body text-ink-mute">
      {read.stale ? 'Refreshing inventory. Showing the last balances read.' : 'Reading inventory…'}
    </p>
  );
}
