'use client';

import { useEffect, useState } from 'react';
import {
  CafePricesUnavailable,
  cafePesosText,
  fetchCafePrices,
  parseCafePesos,
  saveCafePrice,
  type CafePrice,
  type CafePricesClient
} from '@/lib/data/cafe-prices';
import { createClient } from '@/lib/supabase/client';
import { inputStyle, labelStyle, secondaryButton, smallLabel } from '@/components/live/form-styles';

type Phase =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'failed' }
  | { kind: 'none' }
  | { kind: 'ready'; price: CafePrice };

const peso = (cents: number) => '₱' + cafePesosText(cents);

let shared: CafePricesClient | null = null;
function defaultClient(): CafePricesClient {
  shared ??= createClient();
  return shared;
}

/**
 * The café (wholesale) price of one product, next to its price in the product form. It starts at the default (70 % of the order-form
 * price, rounded down to ₱5, decided by the database) until she types her own; "Use default" clears hers. It saves on its own and is
 * not part of the product form: the order form's price never changes here. Where the database does not have café prices yet, it says
 * so and the rest of the form works as before.
 */
export function CafePriceField({
  productId,
  getClient = defaultClient
}: {
  productId: string;
  getClient?: () => CafePricesClient;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [reads, setReads] = useState(0);

  const show = (price: CafePrice) => {
    setPhase({ kind: 'ready', price });
    setText(cafePesosText(price.effectiveCents));
  };

  useEffect(() => {
    let current = true;
    // The client is made inside the promise: where it cannot be (no sign-in configured), the read just fails.
    Promise.resolve()
      .then(() => fetchCafePrices(getClient()))
      .then(
        (all) => {
          if (!current) return;
          const mine = all.find((p) => p.productId === productId);
          // A product that is not on the list (priced at ₱0, or removed) has no café price: the field stays out of the way.
          if (!mine) setPhase({ kind: 'none' });
          else {
            setPhase({ kind: 'ready', price: mine });
            setText(cafePesosText(mine.effectiveCents));
          }
        },
        (e: unknown) => {
          if (current)
            setPhase({ kind: e instanceof CafePricesUnavailable ? 'unavailable' : 'failed' });
        }
      );
    return () => {
      current = false;
    };
  }, [getClient, productId, reads]);

  if (phase.kind === 'loading')
    return (
      <p role="status" style={smallLabel}>
        Reading the café price…
      </p>
    );
  if (phase.kind === 'none') return null;
  if (phase.kind === 'unavailable')
    return (
      <p role="note" style={{ ...smallLabel, fontWeight: 400, margin: 0 }}>
        Café prices need the next database update. Until then, café orders cannot use their own
        price. Your order form is not affected.
      </p>
    );
  if (phase.kind === 'failed')
    return (
      <p role="alert" style={{ ...smallLabel, fontWeight: 400, margin: 0 }}>
        The café price could not be read.{' '}
        <button
          type="button"
          onClick={() => {
            setPhase({ kind: 'loading' });
            setReads((n) => n + 1);
          }}
          style={{ textDecoration: 'underline' }}
        >
          Try again
        </button>
      </p>
    );

  const price = phase.price;
  const isDefault = price.ownCents === null;
  const parsed = parseCafePesos(text);
  const changed = 'cents' in parsed && parsed.cents !== price.effectiveCents;
  const run = async (cents: number | null) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      show(await saveCafePrice(getClient(), productId, cents));
      setSaved(true);
    } catch (e) {
      if (e instanceof CafePricesUnavailable) setPhase({ kind: 'unavailable' });
      else setError('The café price was not saved. Try again.');
    } finally {
      setSaving(false);
    }
  };
  const hint = isDefault
    ? `Default: 70% of the order-form price (${peso(price.retailCents)}), rounded down to the nearest ₱5.`
    : `Your price. The default would be ${peso(price.defaultCents)}.`;
  return (
    <div
      role="group"
      aria-label="Café price"
      style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}
    >
      <label style={labelStyle}>
        <span style={smallLabel}>
          Café price (₱){' '}
          <span data-testid="cafe-price-state" style={{ fontWeight: 400 }}>
            {isDefault ? '· default' : '· yours'}
          </span>
        </span>
        <input
          name="cafePrice"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={text}
          aria-invalid={'error' in parsed ? true : undefined}
          aria-describedby="cafe-price-hint"
          onChange={(event) => {
            setText(event.target.value);
            setSaved(false);
          }}
          onKeyDown={(event) => {
            // Enter here saves the café price, not the whole product form.
            if (event.key !== 'Enter') return;
            event.preventDefault();
            if (changed && 'cents' in parsed) void run(parsed.cents);
          }}
          style={inputStyle}
        />
      </label>
      <span id="cafe-price-hint" style={{ ...smallLabel, fontWeight: 400 }}>
        {hint} Cafés and events pay this. The order form keeps {peso(price.retailCents)}.
      </span>
      {'error' in parsed && text.trim() !== cafePesosText(price.effectiveCents) ? (
        <span role="alert" style={{ ...smallLabel, color: 'var(--color-danger)' }}>
          {parsed.error}
        </span>
      ) : null}
      {error ? (
        <span role="alert" style={{ ...smallLabel, color: 'var(--color-danger)' }}>
          {error}
        </span>
      ) : null}
      {saved ? (
        <span role="status" style={smallLabel}>
          Saved. Café price {peso(price.effectiveCents)}
          {isDefault ? ' (default).' : '.'}
        </span>
      ) : null}
      <span style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button
          type="button"
          disabled={!changed || saving}
          onClick={() => 'cents' in parsed && void run(parsed.cents)}
          style={{ ...secondaryButton, padding: '0 14px' }}
        >
          {saving ? 'Saving…' : 'Save café price'}
        </button>
        {isDefault ? null : (
          <button
            type="button"
            disabled={saving}
            onClick={() => void run(null)}
            style={{ ...secondaryButton, padding: '0 14px' }}
          >
            Use default
          </button>
        )}
      </span>
    </div>
  );
}
