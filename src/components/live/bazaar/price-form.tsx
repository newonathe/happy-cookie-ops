'use client';

import { useState } from 'react';
import type * as React from 'react';
import type { DayPricesView } from '@/lib/bazaar/live-bazaar-types';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Field, SelectField } from '@/components/ui/field';
import { useSave } from './use-save';

/**
 * D3 (Ethan, 14 November 2026): "Change a price" on a day that is selling. One flavour, its new price, one button. The till
 * charges it from the moment the server says yes; sales already rung keep the price they were rung at.
 */
export function PriceForm({ prices }: { prices: DayPricesView }) {
  const [picked, setPicked] = useState('');
  const productId = picked || prices.flavours[0]?.id || '';
  const flavour = prices.flavours.find((f) => f.id === productId);
  const [price, setPrice] = useState('');
  const { error, saving, run } = useSave();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (prices.blocked) return;
    const saved = await run(() => prices.change({ productId, price }));
    if (saved) setPrice('');
  };
  return (
    <form
      onSubmit={(e) => void submit(e)}
      aria-label="Change a price"
      noValidate
      className="flex flex-col gap-3"
    >
      <p className="m-0 text-caption text-ink-soft">
        The till charges the new price from now. Sales already rung keep the price they were rung
        at.
      </p>
      {error ? <Banner tone="danger" title={error} /> : null}
      <SelectField
        label="Flavour"
        value={productId}
        options={prices.flavours.map((f) => ({ value: f.id, label: `${f.name} · ${f.priceText}` }))}
        onChange={(e) => {
          setPicked(e.target.value);
          setPrice('');
        }}
      />
      <Field
        label="New price"
        hint={flavour ? `Now ${flavour.priceText}` : undefined}
        mode="decimal"
        prefix="₱"
        value={price}
        autoComplete="off"
        onChange={(e) => setPrice(e.target.value)}
      />
      <Button
        type="submit"
        busy={saving}
        busyLabel="Saving…"
        disabled={prices.blocked !== null}
        reason={prices.blocked ?? undefined}
        className="self-start"
      >
        Change the price
      </Button>
    </form>
  );
}
