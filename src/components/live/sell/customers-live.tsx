'use client';

import type { OpsVals } from '@/view-models/vals';
import { Button } from '@/components/ui/button';
import { Panel, SectionHeading } from '@/components/ui/owner-kit';
import { SellTabs } from './sell-shared';

/**
 * Customers/Waitlist (client v4): who is ordering this drop and who is waiting for the next one.
 * The list and each waitlist action are the engine's own, as on the sheet this page replaces.
 */
export function CustomersLive({ v }: { v: OpsVals }) {
  const customers = v.customers ?? [];
  const waitlist = v.waitlist ?? [];
  return (
    <div className="w-full">
      <SellTabs v={v} active="customers" />
      <SectionHeading>Ordering now</SectionHeading>
      <Panel>
        {customers.length === 0 ? (
          <p className="text-caption text-ink-mute">Nobody has ordered this drop yet.</p>
        ) : (
          <ul className="flex flex-col">
            {customers.map((customer, i) => (
              <li
                key={i}
                className="flex min-h-12 items-center justify-between gap-3 border-b border-line py-2 last:border-b-0"
              >
                <span className="min-w-0 truncate text-[14px] font-semibold text-ink">
                  {customer.name}
                </span>
                <span className="shrink-0 text-caption text-ink-mute tabular-nums">
                  {customer.count}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <SectionHeading>Waiting for the next drop</SectionHeading>
      <Panel>
        {waitlist.length === 0 ? (
          <p className="text-caption text-ink-mute">Nobody is waiting right now.</p>
        ) : (
          <ul className="flex flex-col">
            {waitlist.map((person, i) => (
              <li
                key={i}
                className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-line py-2 last:border-b-0"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[14px] font-semibold text-ink">{person.name}</span>
                  {person.want || person.when ? (
                    <span className="text-caption text-ink-mute">
                      {[person.want, person.when].filter(Boolean).join(' · ')}
                    </span>
                  ) : null}
                </span>
                <Button
                  variant={person.contacted ? 'ghost' : 'secondary'}
                  size="sm"
                  onClick={person.go}
                >
                  {person.contacted ? 'Told · tap to clear' : 'Tell them'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
