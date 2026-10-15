import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BazaarListRow, LiveBazaarVals } from '@/lib/bazaar/live-bazaar-types';
import { EventList } from '@/components/live/bazaar/event-list';

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
  addEvent: async () => null,
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

describe('the hub', () => {
  it('pins Active with its pill and today’s figures; Upcoming and Past sit behind the chips', () => {
    render(<EventList bazaar={vals({ list: LIST })} />);
    const active = screen.getByRole('region', { name: 'Active' });
    expect(within(active).getByRole('heading', { name: 'On now' })).toBeTruthy();
    expect(within(active).getByText('Selling')).toBeTruthy();
    expect(within(active).getByText('₱880.00')).toBeTruthy();
    expect(within(active).getByText('today · 7 sold')).toBeTruthy();
    expect(within(active).getByRole('button', { name: 'Open the event → On now' })).toBeTruthy();
    // Upcoming is showing, with a pill and the dates as "Sat, 24 Oct".
    const upcoming = screen.getByRole('list', { name: 'Upcoming events' });
    expect(within(upcoming).getAllByRole('listitem')).toHaveLength(2);
    expect(within(upcoming).getAllByText('Planned')).toHaveLength(2);
    expect(within(upcoming).getByText('Sat, 24 Oct – Sun, 25 Oct')).toBeTruthy();
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
    const header = screen.getByRole('heading', { name: 'Bazaar' }).parentElement!;
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
function Host({ addEvent }: { addEvent: LiveBazaarVals['addEvent'] }) {
  const [list] = useState([row({ id: 'u1', name: 'Next fair' })]);
  return <EventList bazaar={vals({ list, addEvent })} />;
}

describe('the add-event sheet', () => {
  const open = () => fireEvent.click(screen.getByRole('button', { name: 'Add an event' }));
  const type = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });

  it('opens as a dialog with its fields, nothing pre-filled that is a decision', () => {
    render(<Host addEvent={async () => null} />);
    open();
    const dialog = screen.getByRole('dialog', { name: 'Add an event' });
    for (const label of ['Name', 'Place', 'First day', 'Last day', 'Stall rent'])
      expect((within(dialog).getByLabelText(label) as HTMLInputElement).value).toBe('');
    expect(within(dialog).getByRole('button', { name: 'Save the event' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  it('points at each bad field: a summary with links, red fields, and the words under them', async () => {
    const addEvent = vi.fn(async () => null);
    render(<Host addEvent={addEvent} />);
    open();
    type('Stall rent', 'lots');
    fireEvent.click(screen.getByRole('button', { name: 'Save the event' }));
    const summary = await screen.findByRole('alert');
    expect(within(summary).getByText('There is a problem')).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(summary));
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
    expect(name.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByLabelText('Stall rent').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText('Place').getAttribute('aria-invalid')).toBeNull();
    fireEvent.click(nameLink);
    expect(document.activeElement).toBe(name);
    expect(addEvent).not.toHaveBeenCalled();
    // Mutation: sending first and reading the refusal back leaves her with "could not be saved" and no field to fix.
  });

  it('validates a field when she leaves it', () => {
    render(<Host addEvent={async () => null} />);
    open();
    const name = screen.getByLabelText('Name');
    fireEvent.blur(name);
    expect(name.getAttribute('aria-invalid')).toBe('true');
    fireEvent.change(name, { target: { value: 'Fair' } });
    fireEvent.blur(name);
    expect(name.getAttribute('aria-invalid')).toBeNull();
    // The summary is for a submit: a blur never steals focus.
    expect(screen.queryByText('There is a problem')).toBeNull();
  });

  it('the last day follows the first until she sets it, and never lies before it', () => {
    render(<Host addEvent={async () => null} />);
    open();
    type('First day', '2026-12-12');
    expect((screen.getByLabelText('Last day') as HTMLInputElement).value).toBe('2026-12-12');
    expect(screen.getAllByText('Sat, 12 Dec').length).toBeGreaterThan(0);
    type('Last day', '2026-12-14');
    type('First day', '2026-12-13');
    expect((screen.getByLabelText('Last day') as HTMLInputElement).value).toBe('2026-12-14');
    type('First day', '2026-12-20');
    expect((screen.getByLabelText('Last day') as HTMLInputElement).value).toBe('2026-12-20');
  });

  it('saves exactly what she typed with the sheet’s own id, then closes and shows Upcoming', async () => {
    const addEvent = vi.fn(async () => null);
    render(<Host addEvent={addEvent} />);
    fireEvent.click(screen.getByRole('button', { name: 'Past 0' }));
    open();
    type('Name', ' Christmas bazaar ');
    type('Place', 'Mall');
    type('First day', '2026-12-12');
    type('Last day', '2026-12-13');
    type('Stall rent', '2,500.00');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save the event' }));
    });
    expect(addEvent).toHaveBeenCalledTimes(1);
    expect(addEvent).toHaveBeenCalledWith({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      name: ' Christmas bazaar ',
      place: 'Mall',
      startsOn: '2026-12-12',
      endsOn: '2026-12-13',
      rent: '2,500.00'
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('list', { name: 'Upcoming events' })).toBeTruthy();
    // Mutation: staying on Past after a save hides the new event behind the chip she did not pick.
  });

  it('a save that fails stays open with the words, and saving again sends the same id', async () => {
    const addEvent = vi
      .fn<LiveBazaarVals['addEvent']>()
      .mockResolvedValueOnce('Adding an event needs signal. Try again when you are back online.')
      .mockResolvedValueOnce(null);
    render(<Host addEvent={addEvent} />);
    open();
    type('Name', 'Fair');
    type('First day', '2026-12-12');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save the event' }));
    });
    expect(await screen.findByText(/needs signal\. Try again/)).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Add an event' })).toBeTruthy();
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Fair');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save the event' }));
    });
    expect(addEvent).toHaveBeenCalledTimes(2);
    expect(addEvent.mock.calls[1]![0].id).toBe(addEvent.mock.calls[0]![0].id);
    // Mutation: a new id per tap saves the same event twice when the first answer was lost.
  });

  it('opens fresh with a new id each time, and Cancel closes it without saving', async () => {
    const addEvent = vi.fn(async () => null);
    render(<Host addEvent={addEvent} />);
    open();
    type('Name', 'Half typed');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(addEvent).not.toHaveBeenCalled();
    open();
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('');
  });
});
