'use client';

import { useId, useState } from 'react';
import type { OpsVals } from '@/view-models/vals';
import type { CustomerRow, LiveCustomers, RemoveOutcome } from '@/store/customer-desk';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import {
  FooterActions,
  PageTitle,
  Panel,
  SectionHeading,
  TaskRow
} from '@/components/ui/owner-kit';
import { FactRow, OpenRow } from '@/components/ui/owner-patterns';
import { SellTabs } from './sell-shared';

function saveFile(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/** A message to copy into the usual app. Nothing is sent from here. */
function PrepareMessage({ customer, back }: { customer: CustomerRow; back: () => void }) {
  const fieldId = useId();
  const [text, setText] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const copy = async () => {
    if (!text.trim()) return setNote('Write the message first.');
    try {
      await navigator.clipboard.writeText(text);
      setNote('Message copied.');
    } catch {
      setNote('This browser would not copy it. Select the words and copy them yourself.');
    }
  };
  return (
    <div className="w-full">
      <PageTitle title="Prepare message" subtitle={customer.name} />
      <Panel>
        <label htmlFor={fieldId} className="flex flex-col gap-1.5">
          <span className="text-caption font-semibold text-ink-soft">Message</span>
          <textarea
            id={fieldId}
            rows={5}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setNote(null);
            }}
            className="w-full rounded-control border border-line-strong bg-surface p-3 text-[16px] text-ink focus-visible:outline-2 focus-visible:outline-brand sm:text-[14px]"
          />
        </label>
        <p role="status" className="mt-2 text-caption text-ink-mute">
          {note ?? 'Copy into your usual messaging app after checking the details.'}
        </p>
        <div className="mt-4">
          <FooterActions
            back={
              <Button variant="secondary" onClick={back}>
                Back to customer
              </Button>
            }
            forward={
              <Button variant="primary" onClick={() => void copy()}>
                Copy message
              </Button>
            }
          />
        </div>
      </Panel>
    </div>
  );
}

const REMOVE_WORDS: Record<Exclude<RemoveOutcome, 'removed'>, string> = {
  failed: 'The details were not removed. Check the signal and try again.',
  nothing: 'No order matched this number, so nothing was changed.',
  partial:
    'Some orders still show this number, because they were saved in another form. Nothing more can be removed from here.',
  unconfirmed:
    'The details were removed, but your orders could not be read back. Check this customer again when you have signal.'
};

/** Removing someone's details cannot be undone, so it says what happens and asks first. */
function RemoveContact({
  customer,
  customers,
  back
}: {
  customer: CustomerRow;
  customers: LiveCustomers;
  back: () => void;
}) {
  const [sure, setSure] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const remove = async () => {
    setSaving(true);
    setProblem(null);
    const answer = await customers.removeContact(customer);
    setSaving(false);
    if (answer === 'removed') back();
    else setProblem(REMOVE_WORDS[answer]);
  };
  return (
    <div className="w-full">
      <PageTitle title="Remove contact details" subtitle={customer.name} />
      {problem ? (
        <div className="mb-3">
          <Banner tone="warn" title={problem} />
        </div>
      ) : null}
      <Panel>
        <p className="text-caption text-ink-soft">
          This removes the saved name, number, Instagram handle, notes and waitlist entries for{' '}
          {customer.mobile}. Orders still waiting for payment review are deleted. Sales records
          stay, without their contact details. Payment proofs and references are not removed. It
          cannot be undone.
        </p>
        <label className="mt-3 flex min-h-11 items-center gap-2 text-[14px] text-ink">
          <input
            type="checkbox"
            checked={sure}
            onChange={(event) => setSure(event.target.checked)}
            className="size-[18px] accent-brand"
          />
          Remove this customer&apos;s saved contact details
        </label>
        <div className="mt-4">
          <FooterActions
            back={
              <Button variant="secondary" onClick={back} disabled={saving}>
                Keep details
              </Button>
            }
            forward={
              <Button
                variant="primary"
                onClick={() => void remove()}
                disabled={!sure || !customers.online}
                reason={customers.online ? 'Tick the box first.' : 'Removing details needs signal.'}
                busy={saving}
                busyLabel="Removing…"
              >
                Remove contact details
              </Button>
            }
          />
        </div>
      </Panel>
    </div>
  );
}

type View = { key: string; page: 'detail' | 'message' | 'remove' } | null;

function CustomerDetail({
  customer,
  customers,
  page,
  go,
  back
}: {
  customer: CustomerRow;
  customers: LiveCustomers;
  page: NonNullable<View>['page'];
  go: (page: NonNullable<View>['page']) => void;
  back: () => void;
}) {
  if (page === 'message') return <PrepareMessage customer={customer} back={() => go('detail')} />;
  if (page === 'remove')
    return <RemoveContact customer={customer} customers={customers} back={() => go('detail')} />;
  return (
    <div className="w-full">
      <PageTitle title={customer.name} subtitle={customer.orderCountText} />
      <Panel>
        <FactRow label="Mobile">{customer.mobile || 'Not given'}</FactRow>
        {customer.contactText ? <FactRow label="Other">{customer.contactText}</FactRow> : null}
        <FactRow label="Orders">{customer.orderCountText}</FactRow>
      </Panel>
      <SectionHeading>Order history</SectionHeading>
      <Panel>
        {customer.orders.map((order) => (
          <TaskRow
            key={order.id}
            title={order.id}
            detail={`${order.whenText} · ${order.statusText} · ${order.cookiesText}`}
            action={
              <Button variant="secondary" size="sm" onClick={order.open}>
                View order<span className="sr-only"> {order.id}</span>
              </Button>
            }
          />
        ))}
      </Panel>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => go('message')}>
          Prepare message
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            saveFile(`customer-${customer.orders[0]?.id ?? 'record'}.csv`, customer.recordCsv)
          }
        >
          Export customer record
        </Button>
        {customer.mobile ? (
          <Button variant="secondary" onClick={() => go('remove')}>
            Remove contact details
          </Button>
        ) : null}
        <Button variant="ghost" onClick={back}>
          Back to customers
        </Button>
      </div>
    </div>
  );
}

/**
 * Customers/Waitlist (client v4): everyone who has ordered, and who is waiting for the next drop.
 * The waitlist action is the engine's own, as on the sheet this page replaces.
 */
export function CustomersLive({ v }: { v: OpsVals }) {
  const [view, setView] = useState<View>(null);
  const customers = v.liveCustomers;
  const waitlist = v.waitlist ?? [];
  const selected = view && customers?.rows.find((row) => row.key === view.key);
  // A customer whose details were removed no longer has this key: the list is the way back.
  if (view && selected && customers)
    return (
      <CustomerDetail
        customer={selected}
        customers={customers}
        page={view.page}
        go={(page) => setView({ key: view.key, page })}
        back={() => setView(null)}
      />
    );
  return (
    <div className="w-full">
      <PageTitle
        title="Customers/Waitlist"
        subtitle="Who has ordered, and who is waiting for the next drop."
      />
      <SellTabs v={v} active="customers" />
      <SectionHeading>Customers</SectionHeading>
      <Panel>
        {!customers?.loaded ? (
          <p className="text-caption text-ink-mute">Reading your orders…</p>
        ) : customers.rows.length === 0 ? (
          <p className="text-caption text-ink-mute">Nobody has ordered yet.</p>
        ) : (
          customers.rows.map((row) => (
            <OpenRow
              key={row.key}
              title={row.name}
              detail={`${row.orderCountText} · ${row.lastOrderText}`}
              label="Open customer"
              onOpen={() => setView({ key: row.key, page: 'detail' })}
            />
          ))
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
