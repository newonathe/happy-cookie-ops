'use client';

import type { OpsVals } from '@/view-models/vals';
import type { LiveBazaarVals } from '@/lib/bazaar/live-bazaar-types';
import { BazaarModeScreen } from '@/components/screens/bazaar-mode';
import {
  OfflineLine,
  buttonBase,
  h1Style,
  mutedStyle,
  screenStyle,
  textStyle
} from '@/components/live/stock/stock-shared';
import { Button } from '@/components/ui/button';
import { KitchenTransferPane } from './kitchen-transfer-pane';
import { EventList } from './event-list';
import { EventPage } from './event-page';
import { DayPlan } from './day-plan';
import { DayReview } from './day-review';
import { TillBar } from './till-bar';
import { ConsolidatedTill, TillBoundary } from './till';

/** `liveBazaar` as the runtime provides it. Typed through the contract so this compiles before and after vals.ts widens. */
export function liveBazaarOf(v: OpsVals): LiveBazaarVals | null {
  return (v as OpsVals & { liveBazaar?: LiveBazaarVals | null }).liveBazaar ?? null;
}

/**
 * The live Bazaar screen (S2). While this phone holds an event (a started day, or one from before the days existed) it draws
 * the till unless the permitted owner selects Events: selling must work with no signal, for a helper, and on a phone
 * the owner's data was never read on. With no event it is the owner's event list, an event's page and a day's plan.
 */
export function BazaarLive({ v }: { v: OpsVals }) {
  const bazaar = liveBazaarOf(v);
  if (bazaar?.kitchen && !bazaar.navigation?.tillOnly)
    return (
      <section
        aria-label="Bazaar"
        data-screen-label="Bazaar"
        style={{ ...screenStyle, paddingBottom: '96px' }}
      >
        <KitchenTransferPane view={bazaar.kitchen} online={bazaar.online} />
      </section>
    );
  const ownDayVisible =
    !bazaar?.editor &&
    !bazaar?.reviewing &&
    bazaar?.event?.days.some((day) => day.action === 'resume');
  // A review ahead of the till: it is the owner's close-out of a day, and the till stays under it.
  if (
    v.event &&
    (bazaar?.navigation?.tillOnly || (!bazaar?.reviewing && !bazaar?.navigation?.directory))
  ) {
    const ported = (
      <>
        <TillBar till={v.liveTill} panel={bazaar?.tillPanel} events={bazaar?.navigation?.events} />
        <BazaarModeScreen v={v} />
      </>
    );
    // The consolidated till for any event that is selling, unless this phone chose the classic one. Everything else
    // (setting up, closed) keeps the ported screen, as does a crash.
    const till = v.liveTill;
    if (!till || !v.event.stage2 || till.classic) return ported;
    return (
      <TillBoundary fallback={ported}>
        <ConsolidatedTill
          v={v}
          till={till}
          panel={bazaar?.tillPanel}
          events={bazaar?.navigation?.events}
        />
      </TillBoundary>
    );
  }
  return (
    // The room at the bottom keeps the last control clear of the app's floating add button.
    <section
      aria-label="Bazaar"
      data-screen-label="Bazaar"
      style={{ ...screenStyle, paddingBottom: '96px' }}
    >
      {bazaar?.navigation?.directory && bazaar.navigation.resume && !ownDayVisible ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-line bg-surface p-3">
          <span className="text-body text-ink">
            {bazaar.navigation.heldName} · Selling on this device
          </span>
          <Button variant="secondary" onClick={bazaar.navigation.resume}>
            Return to selling
          </Button>
        </div>
      ) : null}
      {!bazaar ? (
        <NoDays />
      ) : bazaar.reviewing ? (
        <Reviewing bazaar={bazaar} />
      ) : (
        <Days bazaar={bazaar} />
      )}
    </section>
  );
}

function NoDays() {
  return (
    <>
      <h1 style={h1Style}>Bazaar</h1>
      <p style={textStyle}>
        A bazaar day is planned and started by the owner, with signal. Once it has started, selling
        works with no signal.
      </p>
    </>
  );
}

function Reviewing({ bazaar }: { bazaar: LiveBazaarVals }) {
  if (bazaar.review) return <DayReview review={bazaar.review} />;
  if (bazaar.state === 'loading')
    return (
      <>
        <h1 style={h1Style}>Bazaar</h1>
        <p aria-live="polite" style={mutedStyle}>
          Reading this day…
        </p>
      </>
    );
  return (
    <>
      <h1 style={h1Style}>Bazaar</h1>
      <p role="alert" style={textStyle}>
        This day could not be read. Check the signal and try again.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        <button type="button" onClick={bazaar.retry} style={buttonBase}>
          Try again
        </button>
        <button type="button" onClick={bazaar.closeReview} style={buttonBase}>
          Back
        </button>
      </div>
    </>
  );
}

function Days({ bazaar }: { bazaar: LiveBazaarVals }) {
  if (bazaar.editor && bazaar.event)
    return (
      <>
        <OfflineLine online={bazaar.online} />
        <DayPlan key={bazaar.editor.key} editor={bazaar.editor} online={bazaar.online} />
      </>
    );
  if (bazaar.event)
    return (
      <>
        <OfflineLine online={bazaar.online} />
        <EventPage event={bazaar.event} onEditEvents={bazaar.add} />
      </>
    );
  if (bazaar.state !== 'read')
    return (
      <>
        <h1 style={h1Style}>Bazaar</h1>
        {bazaar.state === 'loading' ? (
          <p aria-live="polite" style={mutedStyle}>
            Reading this event…
          </p>
        ) : (
          <>
            <p role="alert" style={textStyle}>
              This event could not be read. Check the signal and try again.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <button type="button" onClick={bazaar.retry} style={buttonBase}>
                Try again
              </button>
              <button type="button" onClick={bazaar.back} style={buttonBase}>
                Back to the events
              </button>
            </div>
          </>
        )}
      </>
    );
  return (
    <>
      <OfflineLine online={bazaar.online} />
      <EventList bazaar={bazaar} />
    </>
  );
}
