'use client';
import { useState } from 'react';
import type { LiveProductionVals } from '@/lib/production/live-production-types';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';

/** Two steps on purpose: unsent entries inside the copy can no longer be opened here afterwards. */
function SetAside({ onConfirm }: { onConfirm: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <div>
        <Button variant="secondary" size="sm" onClick={() => setAsking(true)}>
          Set this copy aside
        </Button>
      </div>
    );
  return (
    <div role="group" aria-label="Set this copy aside" className="flex flex-wrap items-center gap-2">
      <p className="w-full text-caption text-ink-mute">
        Production starts fresh on this device. Entries in the unreadable copy cannot be opened here,
        so check your recent batches before making them again.
      </p>
      <Button variant="danger" size="sm" onClick={onConfirm}>
        Set aside and start fresh
      </Button>
      <Button variant="secondary" size="sm" onClick={() => setAsking(false)}>
        Keep it
      </Button>
    </div>
  );
}

export function ProductionRecoveryNotice({ data }: { data: LiveProductionVals['recovery'] }) {
  if (!data) return null;
  if (data.status === 'ready')
    return data.setupPeriod ? (
      <Banner
        tone="info"
        title="Unfinished production setup"
        body={`Your product and quantities are kept for ${data.setupPeriod}.`}
        action={{ label: 'Continue setup', onPress: data.resumeSetup }}
      />
    ) : null;
  const copy = {
    closed: [
      'Production needs an owner sign-in',
      'Sign in as the owner to restore unfinished work.'
    ],
    loading: ['Opening unfinished work…', 'Your saved batches and mixes will appear here.'],
    locked: [
      'Production is open in another tab',
      'Close that tab, then retry here. Your saved work is available to view.'
    ],
    unsupported: [
      'Production is read-only in this browser',
      'This browser cannot protect work across tabs. Your saved work remains available.'
    ],
    invalid: [
      'Saved work could not be read',
      'The saved copy is kept untouched. No new production will be submitted from it.'
    ],
    unavailable: [
      'This device could not keep the work',
      'Your open entries are kept here. Retry the device copy before recording new production.'
    ]
  }[data.status];
  return (
    <>
      <Banner
        tone={data.status === 'loading' ? 'info' : 'warn'}
        title={copy[0]}
        body={copy[1]}
        action={
          ['locked', 'invalid', 'unavailable'].includes(data.status)
            ? { label: 'Retry production work', onPress: data.retry }
            : undefined
        }
      />
      {data.status === 'invalid' && data.setAside ? <SetAside onConfirm={data.setAside} /> : null}
    </>
  );
}

export function ProductionDeviceNotice({
  readOnly,
  copyReady,
  connected,
  retry
}: {
  readOnly?: boolean;
  copyReady?: boolean;
  connected?: boolean;
  retry?: () => void;
}) {
  if (readOnly)
    return (
      <Banner
        tone="info"
        title="This work is read-only here"
        body="Leave for now to see the recovery options in Make."
        action={retry ? { label: 'Retry production work', onPress: retry } : undefined}
      />
    );
  if (copyReady === false)
    return (
      <Banner
        tone="warn"
        title="This device could not keep the work"
        body="Your entries stay open. Retry the device copy before recording new production."
        action={retry ? { label: 'Retry device copy', onPress: retry } : undefined}
      />
    );
  if (connected === false)
    return (
      <Banner
        tone="info"
        title="Connect to record production"
        body="Your draft is kept on this device. Nothing new is submitted while offline."
      />
    );
  return null;
}
