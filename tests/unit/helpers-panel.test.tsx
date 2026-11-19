import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HELPER_COPY, HelpersPanel } from '@/components/live/helpers-panel';
import type { PeopleClient } from '@/lib/data/people';

/** S3: the People page's helper list: add, expiry, extend, remove, and the one-time password. */
const NOW = Date.UTC(2026, 10, 20, 8, 0, 0);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const A = 'b0950000-0000-4000-8000-0000000000a1';
const B = 'b0950000-0000-4000-8000-0000000000a2';
const W = 'b0950000-0000-4000-8000-0000000000a3';
const R = 'b0950000-0000-4000-8000-0000000000a4';
const person = (
  id: string,
  email: string,
  state: string,
  expires: number | null,
  kind = 'profile',
  role = 'helper'
) => ({
  id,
  kind,
  email,
  name: email.split('@')[0],
  role,
  state,
  expires_at: expires
});

function setup(
  opts: {
    list?: () => unknown;
    add?: (args: Record<string, unknown>) => unknown;
    invoke?: () => unknown;
    command?: (name: string, args: Record<string, unknown>) => unknown;
  } = {}
) {
  const calls: Array<[string, Record<string, unknown>]> = [];
  let people = [
    person(
      'b0950000-0000-4000-8000-000000000001',
      'cine@example.test',
      'active',
      null,
      'profile',
      'owner'
    ),
    person(A, 'amy@example.test', 'active', NOW + 2 * DAY),
    person(B, 'ben@example.test', 'expired', NOW - 3 * HOUR),
    person(W, 'wendy@example.test', 'waiting', NOW + DAY, 'invite'),
    person(R, 'rex@example.test', 'removed', null)
  ];
  const client = {
    rpc: vi.fn(async (name: string, args: Record<string, unknown> = {}) => {
      calls.push([name, args]);
      if (name === 'list_people') return opts.list ? opts.list() : { data: people, error: null };
      if (name === 'add_helper')
        return opts.add ? opts.add(args) : { data: { id: W, kind: 'invite' }, error: null };
      return opts.command ? opts.command(name, args) : { data: null, error: null };
    }),
    functions: {
      invoke: vi.fn(async () =>
        opts.invoke
          ? opts.invoke()
          : {
              data: { email: 'new@example.test', temporaryPassword: 'Kq7mT2xv9HnZwa' },
              error: null
            }
      )
    }
  };
  render(<HelpersPanel client={client as unknown as PeopleClient} now={() => NOW} />);
  return { client, calls, setPeople: (p: typeof people) => (people = p) };
}
afterEach(() => cleanup());

describe('the helpers panel (S3)', () => {
  it('lists each helper with their email and how long they have, and leaves the owner out', async () => {
    setup();
    expect(await screen.findByText('amy@example.test')).toBeInTheDocument();
    expect(screen.getByText('Ends in 2 days')).toBeInTheDocument();
    expect(screen.getByText('ben@example.test')).toBeInTheDocument();
    expect(screen.getByText('Ended 3 hours ago')).toBeInTheDocument();
    expect(screen.getByText('Waiting for a sign-in')).toBeInTheDocument();
    expect(screen.getByText('Removed')).toBeInTheDocument();
    expect(screen.queryByText('cine@example.test')).toBeNull();
  });

  it('is drawn nowhere without a live client (the demo build)', () => {
    render(<HelpersPanel />);
    expect(screen.queryByText(HELPER_COPY.title)).toBeNull();
  });

  it('adds a helper for a number of days: registers the email and expiry, makes the sign-in, and shows the password once, with a copy button', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const { calls, client } = setup();
    await screen.findByText('amy@example.test');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.test' } });
    fireEvent.change(screen.getByLabelText('Lasts'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'weeks' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add helper' }));
    const password = await screen.findByTestId('temporary-password');
    expect(password).toHaveTextContent('Kq7mT2xv9HnZwa');
    const add = calls.find(([n]) => n === 'add_helper');
    expect(add?.[1]).toEqual({
      p_email: 'new@example.test',
      p_expires_at: new Date(NOW + 21 * DAY).toISOString()
    });
    expect(client.functions.invoke).toHaveBeenCalledWith('create-helper-account', {
      body: { inviteId: W }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Copy password' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Kq7mT2xv9HnZwa'));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
    // Done forgets it: it is never shown again.
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByTestId('temporary-password')).toBeNull();
    expect(document.body.textContent).not.toContain('Kq7mT2xv9HnZwa');
  });

  it('adds a permanent helper with no expiry', async () => {
    const { calls } = setup();
    await screen.findByText('amy@example.test');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.test' } });
    fireEvent.click(screen.getByLabelText('Permanent'));
    expect(screen.queryByLabelText('Lasts')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add helper' }));
    await screen.findByTestId('temporary-password');
    expect(calls.find(([n]) => n === 'add_helper')?.[1]).toEqual({
      p_email: 'new@example.test',
      p_expires_at: null
    });
  });

  it('refuses a number that is not a whole 1 or more before anything is sent', async () => {
    const { calls } = setup();
    await screen.findByText('amy@example.test');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.test' } });
    fireEvent.change(screen.getByLabelText('Lasts'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add helper' }));
    expect(await screen.findByText(HELPER_COPY.badExpiry)).toBeInTheDocument();
    expect(calls.some(([n]) => n === 'add_helper')).toBe(false);
  });

  it('says plainly when the account function is not deployed, and keeps the helper waiting for a sign-in', async () => {
    const { client } = setup({
      invoke: () => ({
        data: null,
        error: { context: new Response(JSON.stringify({ code: 'NOT_FOUND' }), { status: 404 }) }
      })
    });
    await screen.findByText('amy@example.test');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add helper' }));
    expect(await screen.findByText(HELPER_COPY.notDeployed)).toBeInTheDocument();
    expect(screen.queryByTestId('temporary-password')).toBeNull();
    expect(client.functions.invoke).toHaveBeenCalledTimes(1);
    // The waiting helper has a button to try again once it is switched on.
    expect(screen.getByRole('button', { name: 'Create sign-in' })).toBeInTheDocument();
  });

  it('says why an email was not accepted', async () => {
    setup({ add: () => ({ data: null, error: { code: '23505' } }) });
    await screen.findByText('amy@example.test');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'cine@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add helper' }));
    expect(await screen.findByText(HELPER_COPY.taken)).toBeInTheDocument();
  });

  it('gives a helper whose email was removed access again on the spot, with no new password', async () => {
    const { client } = setup({ add: () => ({ data: { id: R, kind: 'profile' }, error: null }) });
    await screen.findByText('amy@example.test');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'rex@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add helper' }));
    expect(await screen.findByText(/has access again/)).toBeInTheDocument();
    expect(client.functions.invoke).not.toHaveBeenCalled();
    expect(screen.queryByTestId('temporary-password')).toBeNull();
  });

  it('changes a helper’s expiry, or makes it permanent', async () => {
    const { calls } = setup();
    const row = (await screen.findByText('amy@example.test')).closest(
      'div.flex.flex-col.gap-2'
    ) as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Change expiry' }));
    fireEvent.change(within(row).getByLabelText('Lasts'), { target: { value: '6' } });
    fireEvent.change(within(row).getByLabelText('Unit'), { target: { value: 'hours' } });
    fireEvent.click(within(row).getByRole('button', { name: 'Save expiry' }));
    await waitFor(() => expect(calls.find(([n]) => n === 'set_helper_expiry')).toBeTruthy());
    expect(calls.find(([n]) => n === 'set_helper_expiry')?.[1]).toEqual({
      p_id: A,
      p_expires_at: new Date(NOW + 6 * HOUR).toISOString()
    });
    fireEvent.click(within(row).getByRole('button', { name: 'Change expiry' }));
    fireEvent.click(within(row).getByLabelText('Permanent'));
    fireEvent.click(within(row).getByRole('button', { name: 'Save expiry' }));
    await waitFor(() => expect(calls.filter(([n]) => n === 'set_helper_expiry')).toHaveLength(2));
    expect(calls.filter(([n]) => n === 'set_helper_expiry')[1]?.[1]).toEqual({
      p_id: A,
      p_expires_at: null
    });
  });

  it('offers more time to an expired helper, and nothing to a removed one', async () => {
    setup();
    await screen.findByText('ben@example.test');
    expect(screen.getByRole('button', { name: 'Give more time' })).toBeInTheDocument();
    const removed = screen
      .getByText('rex@example.test')
      .closest('div.flex.flex-col.gap-2') as HTMLElement;
    expect(within(removed).queryByRole('button')).toBeNull();
  });

  it('asks before it removes a helper, and removes only on yes', async () => {
    const { calls } = setup();
    const row = (await screen.findByText('amy@example.test')).closest(
      'div.flex.flex-col.gap-2'
    ) as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Remove' }));
    expect(calls.some(([n]) => n === 'revoke_helper')).toBe(false);
    fireEvent.click(within(row).getByRole('button', { name: 'Keep' }));
    expect(calls.some(([n]) => n === 'revoke_helper')).toBe(false);
    fireEvent.click(within(row).getByRole('button', { name: 'Remove' }));
    fireEvent.click(within(row).getByRole('button', { name: 'Yes, remove' }));
    await waitFor(() =>
      expect(calls.find(([n]) => n === 'revoke_helper')?.[1]).toEqual({ p_id: A })
    );
  });

  it('says the helper update is missing on a database without the migration, with nothing to press', async () => {
    setup({ list: () => ({ data: null, error: { code: 'PGRST202' } }) });
    expect(await screen.findByText(HELPER_COPY.unavailable)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add helper' })).toBeNull();
  });

  it('says it needs signal, and can try again', async () => {
    let fail = true;
    setup({
      list: () =>
        fail ? { data: null, error: { message: 'Failed to fetch' } } : { data: [], error: null }
    });
    expect(
      await screen.findByText(new RegExp(HELPER_COPY.offline.slice(0, 20)))
    ).toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No helpers yet.')).toBeInTheDocument();
  });
});
