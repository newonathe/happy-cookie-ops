'use client';

import { useState } from 'react';
import type { KitchenTransferView } from '@/lib/bazaar/kitchen-transfer-desk';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Banner } from '@/components/ui/banner';
import { PageTitle, HeadedPanel } from '@/components/ui/owner-kit';

/** Known destination; one independently confirmed transfer at a time. */
export function KitchenTransferPane({
  view,
  online,
  backLabel = 'Back to event'
}: {
  view: KitchenTransferView;
  online: boolean;
  backLabel?: string;
}) {
  const [focused, setFocused] = useState<string | null>(null);
  const row = view.rows.find((item) => item.id === focused) ?? view.rows[0];
  const editable = view.phase === 'ready';
  const parsedQty = row && /^[0-9]+$/.test(row.qty.trim()) ? Number(row.qty) : 0;
  const quantity = Number.isSafeInteger(parsedQty) && parsedQty <= 9999 ? parsedQty : 0;
  const fresh = row && !row.pending && !row.confirmed;
  const shortage = fresh && row.available !== null && quantity > row.available;
  return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={view.close}>
        {backLabel}
      </Button>
      <PageTitle title="Transfer from kitchen" subtitle={`${view.name} · ${view.date}`} />
      <p className="text-body text-ink-soft">
        Move recorded baked cookies to this day. Preparing dough and baking stay in Make.
      </p>
      {!online ? (
        <Banner
          tone="warn"
          title="Connect before recording a transfer."
          body="Your entries stay on this device."
        />
      ) : null}
      {view.loading ? <p role="status">Checking this day and its stock source…</p> : null}
      {view.failed ? (
        <Banner
          tone="warn"
          title="This day’s stock source could not be checked."
          body="Your entries are kept."
          action={{ label: 'Retry day check', onPress: view.retry }}
        />
      ) : null}
      {view.availabilityFailed ? (
        <Banner
          tone="warn"
          title="Kitchen counts could not be checked."
          body="Unavailable counts stay unknown. Saved transfers can still be checked."
          action={{ label: 'Retry kitchen counts', onPress: view.retry }}
        />
      ) : null}
      {!editable && view.phase !== 'loading' ? (
        <Banner
          tone="warn"
          title={
            view.phase === 'locked'
              ? 'Another tab is editing transfers. Close it before continuing here.'
              : view.phase === 'invalid'
                ? 'Saved transfers could not be read. Keep this device’s saved data for recovery.'
                : 'Saved work is not ready on this device. Nothing new can be sent.'
          }
          action={{ label: 'Check saved work', onPress: view.retryStorage }}
        />
      ) : null}
      {view.rows.length > 1 ? (
        <HeadedPanel title="Saved transfers">
          <ul className="divide-y divide-divide">
            {view.rows.map((item) => (
              <li key={item.id}>
                <Button
                  variant="ghost"
                  className="w-full justify-between"
                  onClick={() => setFocused(item.id)}
                  aria-pressed={row?.id === item.id}
                >
                  <span>
                    {item.name} · {item.qty || 'Count not entered'}
                  </span>
                  <span>
                    {item.confirmed ? 'Recorded' : item.pending ? 'Check result' : 'Draft'}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        </HeadedPanel>
      ) : null}
      {row ? (
        <HeadedPanel title={row.name}>
          <form
            className="space-y-4 p-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (row.canSubmit && editable && online && !row.busy && !shortage && quantity > 0)
                void row.submit();
            }}
          >
            <Field
              label="Cookies to transfer"
              hint={`${row.source} → ${view.date}`}
              mode="numeric"
              value={row.qty}
              error={
                row.qty.trim() !== '' && quantity < 1
                  ? 'Enter a whole count from 1 to 9,999.'
                  : undefined
              }
              readOnly={row.pending || row.confirmed || !editable}
              onChange={(event) => row.edit(event.target.value)}
            />
            {fresh && quantity > 0 && row.available !== null && row.dayTotal !== null ? (
              <dl
                aria-label="Review transfer"
                className="space-y-2 rounded-control bg-surface p-3 text-body"
              >
                <div>
                  <dt className="font-semibold">Move to {view.name}</dt>
                  <dd>
                    {quantity} cookies · {view.date}
                  </dd>
                </div>
                <div>
                  <dt>Kitchen at last check</dt>
                  <dd>{row.available} cookies</dd>
                </div>
                {!shortage ? (
                  <>
                    <div>
                      <dt>Kitchen after transfer</dt>
                      <dd>{row.available - quantity} cookies</dd>
                    </div>
                    <div>
                      <dt>Added to this day</dt>
                      <dd>
                        {row.dayTotal} → {row.dayTotal + quantity} cookies in total
                      </dd>
                    </div>
                  </>
                ) : (
                  <div>
                    <dt>Transfer check</dt>
                    <dd role="alert">
                      There are not enough recorded baked cookies. Your count is kept.
                    </dd>
                  </div>
                )}
              </dl>
            ) : null}
            {row.pending && !row.message ? (
              <p role="status">
                This transfer may already be recorded. Check the exact same transfer before changing
                it.
              </p>
            ) : null}
            {row.confirmed && !row.message ? (
              <p role="status">Transfer recorded. Checking balances keeps the same transfer.</p>
            ) : null}
            {row.message ? <p role="status">{row.message}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                variant={row.confirmed ? 'secondary' : 'primary'}
                busy={row.busy}
                disabled={!editable || !online || !row.canSubmit || !!shortage || quantity < 1}
              >
                {row.confirmed
                  ? 'Check balances'
                  : row.pending
                    ? 'Check transfer result'
                    : 'Record transfer'}
              </Button>
              {row.discard ? (
                <Button variant="ghost" disabled={!editable || row.busy} onClick={row.discard}>
                  {row.confirmed ? 'Dismiss confirmation' : 'Discard this draft'}
                </Button>
              ) : null}
            </div>
          </form>
        </HeadedPanel>
      ) : null}
      {view.products.length ? (
        <HeadedPanel title="Cookies for this day">
          <ul className="divide-y divide-divide">
            {view.products.map((product) => (
              <li
                key={product.id}
                className="flex min-h-14 flex-wrap items-center justify-between gap-3 px-4 py-2"
              >
                <div>
                  <p className="font-semibold text-ink">{product.name}</p>
                  <p className="text-caption text-ink-mute">{product.source}</p>
                  <p className="text-caption text-ink-mute">
                    {product.available === null
                      ? 'Kitchen transfer unavailable'
                      : `${product.available} baked cookies available`}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  disabled={!editable || product.disabled}
                  aria-label={`Choose ${product.name}`}
                  onClick={() => {
                    const id = view.add(product.id);
                    if (id) setFocused(id);
                  }}
                >
                  Choose cookies
                </Button>
              </li>
            ))}
          </ul>
        </HeadedPanel>
      ) : null}
      {view.otherSaved ? (
        <p className="text-caption text-ink-mute">
          {view.otherSaved} saved transfer{view.otherSaved === 1 ? '' : 's'} for other days. Open
          the matching day to continue.
        </p>
      ) : null}
      {!row && !view.loading && !view.failed ? (
        <p className="text-body text-ink-soft">
          {view.products.some((p) => !p.disabled)
            ? 'Choose a flavour to enter how many cookies you are moving.'
            : 'No new kitchen transfer is available for this day. Saved transfers remain available for checking.'}
        </p>
      ) : null}
    </div>
  );
}
