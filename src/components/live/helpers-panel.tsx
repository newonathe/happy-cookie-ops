'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { hasSupabaseConfig } from '@/lib/supabase/config';
import { isLiveMode } from '@/lib/config/app-mode';
import {
  EXPIRY_UNITS,
  addHelper,
  createHelperAccount,
  expiryFrom,
  expiryText,
  listPeople,
  revokeHelper,
  setHelperExpiry,
  type ExpiryUnit,
  type Person,
  type PeopleClient
} from '@/lib/data/people';
import { Button } from '@/components/ui/button';
import { cx } from '@/components/ui/cx';
import { OwnerField, Panel, SectionHeading, TaskRow } from '@/components/ui/owner-kit';

/**
 * Helpers (S3): Cine adds a helper by email with an expiry (a number of hours, days or weeks, or none), sees each helper's expiry,
 * extends it or removes the helper. The one-time password of a new account is shown once, with a copy button, and is held only
 * in this component's state: leaving the page forgets it.
 */

export const HELPER_COPY = {
  title: 'Helpers',
  intro:
    'A helper signs in with their own email and password, and sees only the bazaar day that is open now: they can sell, take back their own sales, add a stall expense and close the day. Everything else stays yours.',
  unavailable:
    'Helpers are not set up on this database yet. Ask KETH AI support to apply the helper update.',
  offline: 'This needs signal. Try again when you are connected.',
  refused: 'Only the owner can manage helpers.',
  notDeployed:
    'The helper has been registered, but the sign-in could not be created because the account service is not set up yet. Ask KETH AI support to switch it on, then press "Create sign-in" again.',
  exists: 'That email already has a sign-in. Ask KETH AI support to reset it.',
  gone: 'That helper is no longer waiting. Reload the page.',
  badEmail: 'That is not an email address.',
  taken: 'That email already belongs to someone who is not a helper.',
  badExpiry: 'Enter a whole number of 1 or more.',
  passwordTitle: 'Temporary password',
  passwordBody:
    'Give this to the helper now. It is shown only once. They will be asked to choose their own password when they first sign in.'
} as const;

type Notice = { tone: 'ok' | 'warn'; text: string } | null;

/** The pieces are separate from the data so a test can draw them with a fake client. */
export function HelpersPanel({
  client: given,
  now = () => Date.now()
}: {
  client?: PeopleClient;
  now?: () => number;
}) {
  const client = useMemo<PeopleClient | null>(() => {
    if (given) return given;
    if (!isLiveMode() || !hasSupabaseConfig()) return null;
    return createClient();
  }, [given]);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [problem, setProblem] = useState<'unavailable' | 'refused' | 'offline' | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [password, setPassword] = useState<{ email: string; value: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    if (!client) return;
    const result = await listPeople(client);
    if (!mounted.current) return;
    if (result.ok) {
      setPeople(result.people);
      setProblem(null);
    } else setProblem(result.reason);
  }, [client]);
  // The first read, and again if the client changes. The state is set after the answer arrives, never inside the effect itself.
  useEffect(() => {
    if (!client) return;
    let current = true;
    void listPeople(client).then((result) => {
      if (!current || !mounted.current) return;
      if (result.ok) {
        setPeople(result.people);
        setProblem(null);
      } else setProblem(result.reason);
    });
    return () => {
      current = false;
    };
  }, [client]);

  if (!client) return null;
  if (problem === 'unavailable')
    return (
      <Panel>
        <SectionHeading>{HELPER_COPY.title}</SectionHeading>
        <p role="alert" className="text-caption text-ink-mute">
          {HELPER_COPY.unavailable}
        </p>
      </Panel>
    );

  const helpers = (people ?? []).filter((p) => p.role === 'helper');

  /** Makes the sign-in for a registered email and shows its password once. */
  async function makeAccount(inviteId: string) {
    if (!client) return;
    setBusy(inviteId);
    const result = await createHelperAccount(client, inviteId);
    if (!mounted.current) return;
    setBusy(null);
    if (result.ok) {
      setPassword({ email: result.email, value: result.temporaryPassword });
      setNotice(null);
    } else {
      const text =
        result.reason === 'not-deployed'
          ? HELPER_COPY.notDeployed
          : result.reason === 'exists'
            ? HELPER_COPY.exists
            : result.reason === 'gone'
              ? HELPER_COPY.gone
              : result.reason === 'refused'
                ? HELPER_COPY.refused
                : HELPER_COPY.offline;
      setNotice({ tone: 'warn', text });
    }
    await reload();
  }

  async function change(
    id: string,
    run: () => Promise<'saved' | 'refused' | 'unavailable' | 'offline'>
  ) {
    setBusy(id);
    const outcome = await run();
    if (!mounted.current) return;
    setBusy(null);
    setNotice(
      outcome === 'saved'
        ? null
        : {
            tone: 'warn',
            text:
              outcome === 'unavailable'
                ? HELPER_COPY.unavailable
                : outcome === 'refused'
                  ? HELPER_COPY.refused
                  : HELPER_COPY.offline
          }
    );
    await reload();
  }

  return (
    <Panel>
      <SectionHeading>{HELPER_COPY.title}</SectionHeading>
      <p className="mb-3 text-caption text-ink-mute">{HELPER_COPY.intro}</p>
      {notice ? (
        <p
          role="alert"
          className={cx('mb-3 text-caption', notice.tone === 'warn' ? 'text-danger' : 'text-ink')}
        >
          {notice.text}
        </p>
      ) : null}
      {password ? (
        <PasswordCard
          email={password.email}
          value={password.value}
          onDone={() => setPassword(null)}
        />
      ) : null}
      {people === null && !problem ? (
        <p aria-live="polite" className="text-caption text-ink-mute">
          Reading the helpers…
        </p>
      ) : null}
      {problem === 'refused' || problem === 'offline' ? (
        <p role="alert" className="text-caption text-danger">
          {problem === 'refused' ? HELPER_COPY.refused : HELPER_COPY.offline}{' '}
          <button type="button" className="underline" onClick={() => void reload()}>
            Try again
          </button>
        </p>
      ) : null}
      <div className="flex flex-col">
        {helpers.map((person) => (
          <HelperRow
            key={person.id}
            person={person}
            now={now}
            busy={busy === person.id}
            onCreate={() => void makeAccount(person.id)}
            onExpiry={(at) => change(person.id, () => setHelperExpiry(client, person.id, at))}
            onRevoke={() => change(person.id, () => revokeHelper(client, person.id))}
          />
        ))}
        {people && helpers.length === 0 ? (
          <p className="text-caption text-ink-mute">No helpers yet.</p>
        ) : null}
      </div>
      <AddHelper
        now={now}
        onAdd={async (email, at) => {
          const result = await addHelper(client, email, at);
          if (!mounted.current) return 'Try again.';
          if (!result.ok) {
            const text =
              result.reason === 'bad-email'
                ? HELPER_COPY.badEmail
                : result.reason === 'taken'
                  ? HELPER_COPY.taken
                  : result.reason === 'unavailable'
                    ? HELPER_COPY.unavailable
                    : result.reason === 'refused'
                      ? HELPER_COPY.refused
                      : HELPER_COPY.offline;
            return text;
          }
          if (result.kind === 'invite') await makeAccount(result.id);
          else {
            setNotice({
              tone: 'ok',
              text: 'That helper has access again, with the password they already have.'
            });
            await reload();
          }
          return null;
        }}
      />
    </Panel>
  );
}

function PasswordCard({
  email,
  value,
  onDone
}: {
  email: string;
  value: string;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied('yes');
    } catch {
      setCopied('no');
    }
  }
  return (
    <div
      role="status"
      aria-label={HELPER_COPY.passwordTitle}
      className="mb-3 flex flex-col gap-2 rounded-card border border-line-strong bg-raise p-3"
    >
      <span className="text-label font-semibold text-ink">
        {HELPER_COPY.passwordTitle} for {email}
      </span>
      <code
        data-testid="temporary-password"
        className="select-all rounded-control bg-surface px-3 py-2 text-heading tracking-wider text-ink"
      >
        {value}
      </code>
      <p className="m-0 text-caption text-ink-mute">{HELPER_COPY.passwordBody}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => void copy()}>
          {copied === 'yes' ? 'Copied' : 'Copy password'}
        </Button>
        <Button variant="dark" onClick={onDone}>
          Done
        </Button>
      </div>
      {copied === 'no' ? (
        <span role="alert" className="text-caption text-danger">
          Copying did not work. Select the password and copy it by hand.
        </span>
      ) : null}
    </div>
  );
}

const unitSelect =
  'min-h-11 rounded-control border border-line-strong bg-surface px-3 text-body text-ink focus-visible:outline-2 focus-visible:outline-brand';

/** The expiry a helper is given: none, or a number and a unit. */
function ExpiryFields({
  permanent,
  amount,
  unit,
  onPermanent,
  onAmount,
  onUnit,
  idPrefix
}: {
  permanent: boolean;
  amount: string;
  unit: ExpiryUnit;
  onPermanent: (v: boolean) => void;
  onAmount: (v: string) => void;
  onUnit: (v: ExpiryUnit) => void;
  idPrefix: string;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex min-h-11 items-center gap-2 text-body text-ink">
        <input
          type="checkbox"
          checked={permanent}
          onChange={(event) => onPermanent(event.target.checked)}
          className="size-6"
        />
        Permanent
      </label>
      {permanent ? null : (
        <>
          <OwnerField
            className="w-24"
            label="Lasts"
            inputMode="numeric"
            value={amount}
            onChange={(event) => onAmount(event.target.value)}
          />
          <label htmlFor={`${idPrefix}-unit`} className="flex flex-col gap-1.5">
            <span className="text-label font-semibold text-ink-soft">Unit</span>
            <select
              id={`${idPrefix}-unit`}
              className={unitSelect}
              value={unit}
              onChange={(event) => onUnit(event.target.value as ExpiryUnit)}
            >
              {EXPIRY_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
    </div>
  );
}

function AddHelper({
  now,
  onAdd
}: {
  now: () => number;
  onAdd: (email: string, expiresAt: number | null) => Promise<string | null>;
}) {
  const [email, setEmail] = useState('');
  const [permanent, setPermanent] = useState(false);
  const [amount, setAmount] = useState('1');
  const [unit, setUnit] = useState<ExpiryUnit>('days');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const at = permanent ? null : expiryFrom(amount, unit, now());
    if (!permanent && at === null) {
      setError(HELPER_COPY.badExpiry);
      return;
    }
    setBusy(true);
    const problem = await onAdd(email, at);
    setBusy(false);
    if (problem) setError(problem);
    else setEmail('');
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
      <span className="text-label font-semibold text-ink">Add a helper</span>
      <OwnerField
        label="Email"
        type="email"
        required
        autoComplete="off"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <ExpiryFields
        idPrefix="add-helper"
        permanent={permanent}
        amount={amount}
        unit={unit}
        onPermanent={setPermanent}
        onAmount={setAmount}
        onUnit={setUnit}
      />
      {error ? (
        <span role="alert" className="text-caption text-danger">
          {error}
        </span>
      ) : null}
      <div>
        <Button type="submit" variant="primary" busy={busy} busyLabel="Adding…">
          Add helper
        </Button>
      </div>
    </form>
  );
}

function HelperRow({
  person,
  now,
  busy,
  onCreate,
  onExpiry,
  onRevoke
}: {
  person: Person;
  now: () => number;
  busy: boolean;
  onCreate: () => void;
  onExpiry: (at: number | null) => void;
  onRevoke: () => void;
}) {
  const [extending, setExtending] = useState(false);
  const [permanent, setPermanent] = useState(false);
  const [amount, setAmount] = useState('1');
  const [unit, setUnit] = useState<ExpiryUnit>('days');
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const label =
    person.state === 'waiting'
      ? 'Waiting for a sign-in'
      : person.state === 'removed'
        ? 'Removed'
        : person.state === 'expired'
          ? expiryText(person.expiresAt, now())
          : expiryText(person.expiresAt, now());

  function save() {
    const at = permanent ? null : expiryFrom(amount, unit, now());
    if (!permanent && at === null) {
      setError(HELPER_COPY.badExpiry);
      return;
    }
    setError(null);
    setExtending(false);
    onExpiry(at);
  }

  return (
    <div className="flex flex-col gap-2 border-b border-line py-2 last:border-b-0">
      <TaskRow
        title={person.email ?? person.name}
        detail={label}
        action={
          <div className="flex flex-wrap gap-2">
            {person.state === 'waiting' ? (
              <Button variant="primary" busy={busy} busyLabel="Creating…" onClick={onCreate}>
                Create sign-in
              </Button>
            ) : null}
            {person.state !== 'removed' ? (
              <Button variant="secondary" onClick={() => setExtending((now) => !now)}>
                {person.state === 'expired' ? 'Give more time' : 'Change expiry'}
              </Button>
            ) : null}
            {confirmRemove ? (
              <>
                <Button variant="danger" busy={busy} onClick={onRevoke}>
                  Yes, remove
                </Button>
                <Button variant="secondary" onClick={() => setConfirmRemove(false)}>
                  Keep
                </Button>
              </>
            ) : person.state !== 'removed' ? (
              <Button variant="danger" onClick={() => setConfirmRemove(true)}>
                Remove
              </Button>
            ) : null}
          </div>
        }
      />
      {extending ? (
        <div className="flex flex-col gap-2 rounded-card border border-line p-3">
          <ExpiryFields
            idPrefix={`expiry-${person.id}`}
            permanent={permanent}
            amount={amount}
            unit={unit}
            onPermanent={setPermanent}
            onAmount={setAmount}
            onUnit={setUnit}
          />
          {error ? (
            <span role="alert" className="text-caption text-danger">
              {error}
            </span>
          ) : null}
          <div className="flex gap-2">
            <Button variant="primary" onClick={save}>
              Save expiry
            </Button>
            <Button variant="secondary" onClick={() => setExtending(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
