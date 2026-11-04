import { useEffect, useReducer, useState } from 'react';
import type * as React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BazaarListRow, LiveBazaarVals } from '@/lib/bazaar/live-bazaar-types';
import { EventList } from '@/components/live/bazaar/event-list';
import { EventEntry } from '@/store/event-entry';
import {
  readEventEntry,
  writeEventEntry,
  type FrozenEventRequest
} from '@/lib/bazaar/event-entry-recovery';

/**
 * U3: the events hub and the add-event sheet, drawn from a view model made by hand. They hold no rules: the tests look
 * at the words, the groups, the fields and what the actions receive. Each `Mutation:` line names a change one must catch.
 */
afterEach(cleanup);

const noop = () => undefined;
const row = (over: Partial<BazaarListRow> = {}): BazaarListRow => ({
  id: 'e1',
  name: 'Fixture fair',
  datesText: 'Sat, 24 Oct – Sun, 25 Oct',
  placeText: 'Hall',
  open: noop,
  group: 'upcoming',
  status: 'planned',
  reading: false,
  whenText: 'In 9 days',
  figures: null,
  note: null,
  ...over
});
const vals = (over: Partial<LiveBazaarVals> = {}): LiveBazaarVals => ({
  online: true,
  eventsRead: true,
  state: 'read',
  list: [],
  event: null,
  editor: null,
  reviewing: false,
  tillPanel: null,
  review: null,
  closeReview: noop,
  add: noop,
  readHub: noop,
  justAdded: null,
  retry: noop,
  back: noop,
  ...over
});

const LIST = [
  row({
    id: 'a',
    name: 'On now',
    group: 'active',
    status: 'selling',
    whenText: 'Today',
    figures: { revenueText: '₱880.00', soldText: '7 sold' }
  }),
  row({ id: 'u1', name: 'Next fair' }),
  row({
    id: 'u2',
    name: 'Fair after',
    datesText: 'Sat, 12 Dec – Sun, 13 Dec',
    whenText: 'In 58 days'
  }),
  row({ id: 'p1', name: 'Old fair', group: 'past', status: 'closed', whenText: null })
];

describe('returning from an event', () => {
  afterEach(() => vi.restoreAllMocks());

  it('remembers the clicked event and returns focus and scroll to it', () => {
    const remember = vi.fn();
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    const top = window.scrollY;
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 480 });
    try {
      const first = render(
        <EventList bazaar={vals({ list: LIST, rememberListPosition: remember })} />
      );
      fireEvent.click(screen.getByRole('button', { name: /Next fair/ }));
      expect(remember).toHaveBeenCalledWith('u1', 480);
      first.unmount();
      render(<EventList bazaar={vals({ list: LIST, listPosition: { id: 'u1', top: 480 } })} />);
      expect(document.activeElement).toBe(screen.getByRole('button', { name: /Next fair/ }));
      expect(scroll).toHaveBeenCalledWith({ top: 480, behavior: 'instant' });
    } finally {
      Object.defineProperty(window, 'scrollY', { configurable: true, value: top });
    }
  });

  it('waits for the selected active row, without claiming a loading placeholder is focusable', () => {
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    const selected = row({ id: 'selected', group: 'active', name: 'Selected market' });
    const base = { listPosition: { id: 'selected', top: 200 } };
    const view = render(
      <EventList bazaar={vals({ ...base, list: [{ ...selected, reading: true }] })} />
    );
    expect(scroll).not.toHaveBeenCalled();
    view.rerender(<EventList bazaar={vals({ ...base, list: [selected] })} />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Selected market/ }));
    expect(scroll).toHaveBeenCalledWith({ top: 200, behavior: 'instant' });
  });

  it('does not steal focus if the owner starts another action while rows load', () => {
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    const selected = row({ id: 'selected', group: 'active', name: 'Selected market' });
    const base = { listPosition: { id: 'selected', top: 200 } };
    const view = render(
      <EventList bazaar={vals({ ...base, list: [{ ...selected, reading: true }] })} />
    );
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Add an event' }));
    view.rerender(<EventList bazaar={vals({ ...base, list: [selected] })} />);
    expect(scroll).not.toHaveBeenCalled();
  });

  it('returns to the heading if the original event is no longer available', () => {
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    render(<EventList bazaar={vals({ list: LIST, listPosition: { id: 'removed', top: 480 } })} />);
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Bazaar events' }));
    expect(scroll).toHaveBeenCalledWith({ top: 0, behavior: 'instant' });
  });
});

describe('the hub', () => {
  it('pins Active with its pill and today’s figures; Upcoming and Past sit behind the chips', () => {
    render(<EventList bazaar={vals({ list: LIST })} />);
    const active = screen.getByRole('region', { name: 'Active' });
    expect(within(active).getByRole('heading', { name: 'On now' })).toBeTruthy();
    expect(within(active).getByText('Selling')).toBeTruthy();
    expect(within(active).getByText('₱880.00')).toBeTruthy();
    expect(within(active).getByText('today · 7 sold')).toBeTruthy();
    expect(within(active).getByRole('button', { name: 'Open event On now' })).toBeTruthy();
    // Upcoming is showing, with a pill and the dates as "Sat, 24 Oct".
    const upcoming = screen.getByRole('list', { name: 'Upcoming events' });
    expect(within(upcoming).getAllByRole('listitem')).toHaveLength(2);
    expect(within(upcoming).getAllByText('Planned')).toHaveLength(2);
    expect(within(upcoming).getByText('Sat, 24 Oct – Sun, 25 Oct · Hall · In 9 days')).toBeTruthy();
    expect(screen.queryByText('Old fair')).toBeNull();
    expect(screen.getByRole('button', { name: 'Upcoming 2' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Past 1' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Past 1' }));
    const past = screen.getByRole('list', { name: 'Past events' });
    expect(within(past).getByText('Old fair')).toBeTruthy();
    expect(within(past).getByText('Closed')).toBeTruthy();
    expect(screen.queryByText('Next fair')).toBeNull();
    // Mutation: dropping the chips draws every past event in the list she works from (finding B3).
  });

  it('Add an event is at the top, before the list; a row opens its event', () => {
    const open = vi.fn();
    render(<EventList bazaar={vals({ list: [row({ open })] })} />);
    // The header row holds the title (with its signal line) and the actions.
    const header = screen.getByRole('heading', { name: 'Bazaar events' }).parentElement!
      .parentElement!;
    expect(within(header).getByRole('button', { name: 'Add an event' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Fixture fair/ }));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('reads the events under way once the bookings are in, and not before', () => {
    const readHub = vi.fn();
    const { rerender } = render(<EventList bazaar={vals({ eventsRead: false, readHub })} />);
    expect(readHub).not.toHaveBeenCalled();
    rerender(<EventList bazaar={vals({ readHub })} />);
    rerender(<EventList bazaar={vals({ readHub })} />);
    expect(readHub).toHaveBeenCalledTimes(1);
  });

  it('a started event still being read is a placeholder, not a card with a status it may not have', () => {
    render(
      <EventList
        bazaar={vals({
          list: [row({ id: 'r', name: 'Being read', group: 'active', reading: true })]
        })}
      />
    );
    const active = screen.getByRole('region', { name: 'Active' });
    expect(within(active).getByText('Being read')).toBeTruthy();
    expect(within(active).queryByText('Today')).toBeNull();
    expect(within(active).queryByRole('button')).toBeNull();
  });

  it('an upcoming row still being read shows a placeholder, not a status', () => {
    render(
      <EventList bazaar={vals({ list: [row({ id: 'r', name: 'Being read', reading: true })] })} />
    );
    const item = screen.getByRole('button', { name: /Being read/ });
    expect(within(item).queryByText('Planned')).toBeNull();
    expect(within(item).getByText('Checking')).toBeTruthy();
    // Mutation: a "Planned" pill that flips to "Closed" a moment later is a claim that was wrong.
  });

  it('does not say "Today" twice on an event that is on today', () => {
    render(
      <EventList
        bazaar={vals({
          list: [
            row({ id: 't', name: 'On today', group: 'active', status: 'today', whenText: 'Today' })
          ]
        })}
      />
    );
    expect(screen.getAllByText('Today')).toHaveLength(1);
  });

  it('says what needs signal and why, and never hides the button', () => {
    const { rerender } = render(<EventList bazaar={vals({ online: false, list: LIST })} />);
    const add = screen.getByRole('button', { name: 'Add an event' });
    expect(add.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Adding an event needs signal.')).toBeTruthy();
    rerender(<EventList bazaar={vals({ eventsRead: false })} />);
    expect(screen.getByRole('button', { name: 'Add an event' }).hasAttribute('disabled')).toBe(
      true
    );
    expect(screen.getByText(/once your events are read/)).toBeTruthy();
  });

  it('says so when there is nothing yet, and in each chip', () => {
    const { rerender } = render(<EventList bazaar={vals()} />);
    expect(screen.getByText('No events yet')).toBeTruthy();
    rerender(<EventList bazaar={vals({ list: [LIST[3]!] })} />);
    expect(screen.getByText('No upcoming events')).toBeTruthy();
  });

  it('keeps the multi-row form reachable until the event page edits an event', () => {
    const add = vi.fn();
    render(<EventList bazaar={vals({ list: LIST, add })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit or switch off events' }));
    expect(add).toHaveBeenCalledTimes(1);
    // Mutation: dropping this link leaves no way to switch a booking off before the rehearsal.
  });

  it('a row just added carries the ring', () => {
    render(<EventList bazaar={vals({ list: LIST, justAdded: 'u2' })} />);
    const ringed = screen.getByRole('button', { name: /Fair after/ });
    expect(ringed.className).toContain('motion-ring');
    expect(screen.getByRole('button', { name: /Next fair/ }).className).not.toContain(
      'motion-ring'
    );
  });
});

/** The hub, with the bookings it holds kept in state so a save can be seen to land in the list. */
function Host({
  send = async () => true
}: {
  send?: (body: FrozenEventRequest) => Promise<boolean>;
}) {
  const [list] = useState([row({ id: 'u1', name: 'Next fair' })]);
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const [entry] = useState(() => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value)
    };
    return new EventEntry({
      lock: async () => () => undefined,
      read: (scope) => readEventEntry(scope, storage),
      write: (scope, value, resolvedId) => writeEventEntry(scope, value, { storage, resolvedId }),
      send,
      online: () => true,
      uuid: () => '22222222-2222-4222-8222-222222222222',
      changed: redraw
    });
  });
  useEffect(() => {
    void entry.bind({
      userId: '11111111-1111-4111-8111-111111111111',
      business: 'https://one.example'
    });
  }, [entry]);
  return <EventList bazaar={vals({ list, entry: entry.vals() })} />;
}
const bound = async (ui: React.ReactElement) => {
  await act(async () => {
    render(ui);
  });
};

describe('the ring on a row just added, under reduced motion', () => {
  const reduced = (on: boolean) =>
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: on && query.includes('reduce'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined
    }));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('is shown still for a second, then dropped, with no fade to rely on', () => {
    vi.useFakeTimers();
    reduced(true);
    render(<EventList bazaar={vals({ list: LIST, justAdded: 'u2' })} />);
    const item = screen.getByRole('button', { name: /Fair after/ });
    expect(item.className).toContain('ring-[3px]');
    expect(item.className).not.toContain('motion-ring');
    act(() => void vi.advanceTimersByTime(1100));
    expect(screen.getByRole('button', { name: /Fair after/ }).className).not.toContain(
      'ring-[3px]'
    );
    // Mutation: leaving it to the global rule shows no ring at all (it cuts the fade to nothing).
  });

  it('is the 600 ms fade otherwise', () => {
    reduced(false);
    render(<EventList bazaar={vals({ list: LIST, justAdded: 'u2' })} />);
    expect(screen.getByRole('button', { name: /Fair after/ }).className).toContain('motion-ring');
  });
});

describe('the add-event page', () => {
  const type = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  const fill = () => {
    type('Name', ' Christmas bazaar ');
    type('Place', 'Mall');
    type('First day', '2026-12-12');
    type('Last day', '2026-12-13');
    type('Stall rent', '2,500.00');
  };

  it('opens as a page with its fields, nothing pre-filled that is a decision', async () => {
    await bound(<Host />);
    fireEvent.click(screen.getByRole('button', { name: 'Add an event' }));
    expect(screen.getByRole('heading', { name: 'Add event' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    for (const label of ['Name', 'Place', 'First day', 'Last day', 'Stall rent'])
      expect((screen.getByLabelText(label) as HTMLInputElement).value).toBe('');
    expect(screen.getByRole('button', { name: 'Back to events' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Review event' })).toBeTruthy();
  });

  it('points at each bad field: a summary with links, red fields, and the words under them', async () => {
    const send = vi.fn(async () => true);
    await bound(<Host send={send} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add an event' }));
    type('Stall rent', 'lots');
    fireEvent.click(screen.getByRole('button', { name: 'Review event' }));
    const summary = await screen.findByRole('alert');
    const nameLink = within(summary).getByRole('link', {
      name: 'Enter the name of the event, like "Katipunan market".'
    });
    expect(
      within(summary).getByRole('link', { name: 'Pick the first day of the event.' })
    ).toBeTruthy();
    expect(
      within(summary).getByRole('link', {
        name: 'Enter the stall rent in pesos, like 2,500.00, or leave it blank.'
      })
    ).toBeTruthy();
    const name = screen.getByLabelText('Name');
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText('Place').getAttribute('aria-invalid')).toBeNull();
    fireEvent.click(nameLink);
    expect(document.activeElement).toBe(name);
    expect(send).not.toHaveBeenCalled();
  });

  it('validates a field when she leaves it, without a summary', async () => {
    await bound(<Host />);
    fireEvent.click(screen.getByRole('button', { name: 'Add an event' }));
    const name = screen.getByLabelText('Name');
    fireEvent.blur(name);
    expect(name.getAttribute('aria-invalid')).toBe('true');
    fireEvent.change(name, { target: { value: 'Fair' } });
    fireEvent.blur(name);
    expect(name.getAttribute('aria-invalid')).toBeNull();
    expect(screen.queryByText('There is a problem')).toBeNull();
  });

  it('the last day follows the first until she sets it, and never lies before it', async () => {
    await bound(<Host />);
    fireEvent.click(screen.getByRole('button', { name: 'Add an event' }));
    type('First day', '2026-12-12');
    expect((screen.getByLabelText('Last day') as HTMLInputElement).value).toBe('2026-12-12');
    type('Last day', '2026-12-14');
    type('First day', '2026-12-13');
    expect((screen.getByLabelText('Last day') as HTMLInputElement).value).toBe('2026-12-14');
    type('First day', '2026-12-20');
    expect((screen.getByLabelText('Last day') as HTMLInputElement).value).toBe('2026-12-20');
  });

  it('reviews, then sends what she typed once, and shows Upcoming', async () => {
    const send = vi.fn(async () => true);
    await bound(<Host send={send} />);
    fireEvent.click(screen.getByRole('button', { name: 'Past 0' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add an event' }));
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Review event' }));
    expect(send).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Review event' })).toBeTruthy();
    expect(screen.getByText('Christmas bazaar')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save event' }));
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        p_event: expect.objectContaining({ name: 'Christmas bazaar', rent_cents: 250000 })
      })
    );
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Review event' })).toBeNull());
    expect(screen.getByRole('list', { name: 'Upcoming events' })).toBeTruthy();
  });

  it('an unconfirmed save stays on Review and sending again is the same request', async () => {
    const send = vi.fn<(body: FrozenEventRequest) => Promise<boolean>>();
    send.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await bound(<Host send={send} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add an event' }));
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Review event' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save event' }));
    });
    expect(await screen.findByText(/no answer came back/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send again' }));
    });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]![0]).toEqual(send.mock.calls[0]![0]);
  });

  it('leaving keeps what was typed, and keyboard focus returns to the button', async () => {
    const send = vi.fn(async () => true);
    await bound(<Host send={send} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add an event' }));
    type('Name', 'Half typed');
    fireEvent.click(screen.getByRole('button', { name: 'Back to events' }));
    const again = await screen.findByRole('button', { name: 'Continue adding event' });
    await waitFor(() => expect(again).toHaveFocus());
    expect(send).not.toHaveBeenCalled();
    fireEvent.click(again);
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Half typed');
  });

  it('Clear throws the draft away, so the next one starts empty', async () => {
    await bound(<Host />);
    fireEvent.click(screen.getByRole('button', { name: 'Add an event' }));
    type('Name', 'Half typed');
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add an event' }));
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('');
  });
});
