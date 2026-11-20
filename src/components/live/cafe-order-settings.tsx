'use client';

import { useEffect, useState } from 'react';
import { InfoTip, Panel, SwitchRow } from '@/components/ui/owner-kit';
import { CafePricesUnavailable } from '@/lib/data/cafe-prices';
import {
  fetchCafeOrderSettings,
  saveCafeOrderSettings,
  type CafeOrdersClient
} from '@/lib/data/cafe-orders';
import { createClient } from '@/lib/supabase/client';

type Phase = 'loading' | 'unavailable' | 'failed' | 'ready';

let shared: CafeOrdersClient | null = null;
const defaultClient = (): CafeOrdersClient => (shared ??= createClient());

/**
 * "Café orders count toward the weekly limit" on the Café page (owner only; it moved there from the order rules). On (the default): a
 * café sale takes slots in the week of its date like a public order and is refused when that week is full. Off: it takes none, so it
 * never takes room from the order form. The switch saves on its own. Where the hosted database does not have it yet it says so.
 */
export function CafeOrderSettings({
  getClient = defaultClient
}: {
  getClient?: () => CafeOrdersClient;
}) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [on, setOn] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    Promise.resolve()
      .then(() => fetchCafeOrderSettings(getClient()))
      .then(
        (s) => {
          if (!current) return;
          setOn(s.countTowardLimit);
          setPhase('ready');
        },
        (e: unknown) => {
          if (current) setPhase(e instanceof CafePricesUnavailable ? 'unavailable' : 'failed');
        }
      );
    return () => {
      current = false;
    };
  }, [getClient]);

  const change = async (next: boolean) => {
    if (saving) return;
    setSaving(true);
    setMessage(null);
    const before = on;
    setOn(next);
    try {
      const saved = await saveCafeOrderSettings(getClient(), next);
      setOn(saved.countTowardLimit);
      setMessage(
        saved.countTowardLimit
          ? 'Saved. New café orders count toward the weekly limit.'
          : 'Saved. New café orders do not count toward the weekly limit.'
      );
    } catch (e) {
      setOn(before);
      if (e instanceof CafePricesUnavailable) setPhase('unavailable');
      else setMessage('That was not saved. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel
      title="Weekly limit"
      action={
        <InfoTip label="café orders and the weekly limit">
          On: a café sale takes cookie slots in the week of its date like any order, and is refused
          when that week is full. Off: it takes none, so it never uses up room the order form needs.
          Sales already logged keep what they took.
        </InfoTip>
      }
    >
      {phase === 'loading' ? (
        <p role="status" className="m-0 text-caption text-ink-mute">
          Reading the café order setting…
        </p>
      ) : phase === 'unavailable' ? (
        <p role="note" className="m-0 text-caption text-ink-mute">
          Café orders need the next database update. Until then this setting is not available.
        </p>
      ) : phase === 'failed' ? (
        <p role="alert" className="m-0 text-caption text-danger">
          The café order setting could not be read.
        </p>
      ) : (
        <>
          <SwitchRow
            label="Café orders count toward the weekly limit"
            checked={on}
            onChange={(next) => void change(next)}
            detail={
              on
                ? 'A café sale uses the same oven time, so it takes slots in the week of its date like any order.'
                : 'A café sale takes no slots and never blocks the order form.'
            }
          />
          {message ? (
            <p role="status" className="m-0 text-caption text-ink-mute">
              {message}
            </p>
          ) : null}
        </>
      )}
    </Panel>
  );
}
