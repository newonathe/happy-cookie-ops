import type { OpsVals } from '@/view-models/vals';
import type { ShopOverrideView } from '@/store/shop-override-writes';
import { Button } from '@/components/ui/button';

export function ShopOverrideNotice({ value }: { value?: ShopOverrideView | null }) {
  if (!value) return null;
  const title =
    value.phase === 'sending'
      ? `Changing opening status to ${value.requested}…`
      : value.phase === 'saved'
        ? 'Opening status change recorded.'
        : value.phase === 'unknown'
          ? `Change to ${value.requested} is not confirmed.`
          : value.phase === 'unsent'
            ? `Change to ${value.requested} was not sent.`
            : `Change to ${value.requested} was refused.`;
  return (
    <section
      role="status"
      aria-label="Opening status change"
      className="mb-4 flex flex-col gap-3 rounded-card border border-line bg-surface p-4 text-sm text-ink"
    >
      <p className="font-semibold">{title}</p>
      {value.phase === 'unknown' || value.phase === 'unsent' ? (
        <p>Your choice is kept for this visit. Check the opening status before reloading.</p>
      ) : null}
      {value.read === 'loading' ? <p>Checking opening status…</p> : null}
      {value.read === 'ready' ? <p>Last checked setting: {value.current}.</p> : null}
      {value.read === 'failed' ? <p>Current opening status could not be checked.</p> : null}
      {!value.online ? <p>Connect to check the opening status.</p> : null}
      {value.phase !== 'sending' ? (
        <Button variant="secondary" disabled={!value.canCheck} onClick={value.check}>
          Check opening status
        </Button>
      ) : null}
    </section>
  );
}

/** Live controls avoid the frozen prototype's sample drop number. */
export function CloseOrderingControls({ v }: { v: OpsVals }) {
  return (
    <div className="flex flex-col gap-3">
      <p>Stops new orders. You can reopen ordering.</p>
      <Button variant="danger" onClick={v.closeDropConfirm}>
        Stop new orders
      </Button>
      <Button variant="secondary" onClick={v.closeSheet}>
        Back
      </Button>
    </div>
  );
}
