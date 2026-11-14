'use client';

import { useState } from 'react';
import { SIGN_OUT_SLOT_ID } from '@/components/app/sign-out-control';
import type { OpsVals } from '@/view-models/vals';
import { Button } from '@/components/ui/button';
import { cx } from '@/components/ui/cx';
import { PageTitle, Panel, SectionHeading, SwitchRow } from '@/components/ui/owner-kit';
import { OpenRow } from '@/components/ui/owner-patterns';
import { AREA_TEXT, SettingsAreaPage, groupsOf, type SettingsArea } from './settings-areas';

/** Account (client v4): one row per area, each opening that area's settings. Every engine row stays reachable. */
export function AccountLive({ v }: { v: OpsVals }) {
  const [area, setArea] = useState<SettingsArea | null>(null);
  if (area)
    return (
      <SettingsAreaPage
        v={v}
        area={area}
        backLabel="Back to Account"
        onBack={() => setArea(null)}
      />
    );
  const health = groupsOf(v, 'data')
    .flatMap((group) => group.rows ?? [])
    .find((row) => row.label === 'Backups and export');
  const areas: SettingsArea[] = ['shop', 'make', 'stock', 'money', 'data'];
  const present = (name: SettingsArea) => groupsOf(v, name).length > 0;
  return (
    <div className="w-full">
      <PageTitle
        title="Account"
        subtitle={v.roleWho === 'Owner' ? 'Owner' : `${String(v.roleWho)} · Owner`}
      />
      <Panel>
        {present('people') ? (
          <OpenRow
            title={AREA_TEXT.people.title}
            detail={AREA_TEXT.people.about}
            onOpen={() => setArea('people')}
          />
        ) : null}
        {health ? (
          <OpenRow
            title="Health & backups"
            detail="Device status, backups and exports"
            onOpen={health.go}
          />
        ) : null}
        {areas.filter(present).map((name) => (
          <OpenRow
            key={name}
            title={AREA_TEXT[name].title}
            detail={AREA_TEXT[name].about}
            onOpen={() => setArea(name)}
          />
        ))}
        {present('other') ? (
          <OpenRow
            title={AREA_TEXT.other.title}
            detail={AREA_TEXT.other.about}
            onOpen={() => setArea('other')}
          />
        ) : null}
      </Panel>
      {/* On a phone, Sign out is here instead of floating over every screen (SignOutControl fills it). */}
      <div id={SIGN_OUT_SLOT_ID} className="mt-4 min-[651px]:hidden" />
    </div>
  );
}

/** Health & backups: only what has actually been recorded; a missing result is never shown as fine. */
export function HealthLive({ v }: { v: OpsVals }) {
  return (
    <div className="w-full max-w-[860px]">
      <PageTitle
        title="Health & backups"
        subtitle="What has been checked, and when."
        actions={
          <Button
            variant="secondary"
            onClick={v.retryBackup}
            disabled={!v.healthCanRetry || !v.online}
          >
            Check results again
          </Button>
        }
      />
      <Panel tone="hero" title={String(v.healthTitle)}>
        <p className="text-caption text-ink-mute">{v.healthSub}</p>
      </Panel>
      <Panel>
        <ul className="flex flex-col">
          {(v.healthRows ?? []).map((row, i) => (
            <li
              key={i}
              className="flex flex-wrap items-start gap-3 border-b border-line py-2.5 last:border-b-0"
            >
              <span
                aria-hidden="true"
                className={cx(
                  'mt-1.5 size-2.5 shrink-0 rounded-full',
                  row.bad ? 'bg-danger' : row.good ? 'bg-ok' : 'bg-line-strong'
                )}
              />
              <span className="flex min-w-0 flex-1 basis-40 flex-col">
                <span className="text-[14px] font-semibold text-ink">{row.label}</span>
                <span className="text-caption text-ink-mute">{row.value}</span>
                {row.hint ? <span className="text-caption text-ink-mute">{row.hint}</span> : null}
              </span>
              {row.retry ? (
                <Button variant="secondary" size="sm" onClick={v.retryBackup}>
                  Retry
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </Panel>
      {v.hasRecords ? (
        <>
          <SectionHeading>What has been recorded</SectionHeading>
          {(v.recordGroups ?? []).map((group, i) => (
            <Panel key={i} title={`${String(group.title)} · ${String(group.countText)}`}>
              <ul className="flex flex-col">
                {(group.rows ?? []).map((row, j) => (
                  <li
                    key={j}
                    className="flex items-baseline justify-between gap-3 border-b border-line py-2 last:border-b-0"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="text-[14px] text-ink">{row.what}</span>
                      <span className="text-caption text-ink-mute">{row.when}</span>
                    </span>
                    <span className="text-[14px] font-semibold text-ink tabular-nums">
                      {row.value}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          ))}
          <p className="mb-4 text-caption text-ink-mute">
            Kept so your stock and your money can always be explained. Nothing here is deleted.
          </p>
        </>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={v.exportNow}>
          Export my data
        </Button>
        <Button variant="ghost" onClick={v.contactSupport}>
          Report a problem
        </Button>
      </div>
    </div>
  );
}

/** Notifications: each one points at something to act on; dismissing never hides a live problem for good. */
export function NotificationsLive({ v }: { v: OpsVals }) {
  return (
    <div className="w-full max-w-[860px]">
      <PageTitle
        title="Notifications"
        subtitle="Each one points at something you can act on. They come back if the problem is still there."
        actions={
          v.notifAny ? (
            <Button variant="secondary" onClick={v.clearNotifs}>
              Clear all
            </Button>
          ) : null
        }
      />
      {v.notifDismissed ? (
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-caption text-ink-mute">{v.notifDismissedText}</span>
            <Button variant="ghost" size="sm" onClick={v.restoreNotifs}>
              Show them again
            </Button>
          </div>
        </Panel>
      ) : null}
      {v.notifEmpty ? (
        <Panel>
          <p className="text-[15px] font-semibold text-ink">Nothing waiting</p>
          <p className="text-caption text-ink-mute">You are caught up.</p>
        </Panel>
      ) : null}
      {(v.notifications ?? []).length ? (
        <Panel>
          <ul className="flex flex-col">
            {(v.notifications ?? []).map((note, i) => (
              <li
                key={i}
                className="flex items-center gap-2 border-b border-line py-2 last:border-b-0"
              >
                <button
                  type="button"
                  onClick={note.go}
                  className="flex min-h-12 min-w-0 flex-1 flex-col justify-center text-left hover:bg-raise focus-visible:outline-2 focus-visible:outline-brand"
                >
                  <span className="text-[14px] font-semibold text-ink">{note.label}</span>
                  <span className="text-caption text-ink-mute">
                    {note.sub} · {note.urgency}
                  </span>
                </button>
                <Button variant="ghost" size="sm" onClick={note.dismiss} aria-label="Dismiss">
                  ×
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
      <SectionHeading>What you get told about</SectionHeading>
      <Panel>
        {(v.channels ?? []).map((channel, i) => (
          <SwitchRow
            key={i}
            label={String(channel.label)}
            checked={!!channel.on}
            onChange={() => channel.toggle()}
          />
        ))}
      </Panel>
    </div>
  );
}
