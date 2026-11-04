'use client';
import type { LiveProductionVals } from '@/lib/production/live-production-types';
import { Banner } from '@/components/ui/banner';

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
