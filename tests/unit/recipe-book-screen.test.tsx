import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OpsVals } from '@/view-models/vals';
import type { LiveRecipesVals, RecipeBookItem } from '@/lib/recipes/live-recipes-types';
import { RecipeBookLive } from '@/components/live/recipes/recipe-book';

// The ported screen reads the whole engine's vals; the book only has to draw it under a way back.
vi.mock('@/components/screens/recipes', () => ({
  RecipesScreen: () => <div data-testid="old-recipes">The older Recipes screen</div>
}));

/**
 * U7: the recipe book and the flavour page, drawn from a view model made by hand. They hold no rules: the tests look at
 * the words, the filters, what the cost field sends and the way into and out of the older Recipes screen.
 */
afterEach(() => {
  cleanup();
  delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
});

const item = (over: Partial<RecipeBookItem> = {}): RecipeBookItem => ({
  id: 'classic',
  name: 'Classic',
  photo: '',
  onMenu: true,
  priceText: '₱125.00',
  costText: '₱31.25',
  costSource: 'recipe',
  sourceText: 'From the recipe',
  marginText: '75%',
  keptText: '₱93.75',
  tone: 'ok',
  receipt: {
    lines: [
      { label: 'Ingredients', valueText: '₱24.50' },
      { label: 'Packaging', valueText: '₱6.75' }
    ],
    totalText: '₱31.25',
    missing: [],
    batchText: 'One batch makes 24 cookies; its ingredients cost ₱588.00.'
  },
  receiptNote: null,
  startingCost: '31.25',
  typed: false,
  save: async () => null,
  saveBlocked: null,
  editRecipe: () => undefined,
  ...over
});

const ITEMS = [
  item(),
  item({
    id: 'velvet',
    name: 'Red Velvet',
    onMenu: false,
    costText: '₱50.00',
    marginText: '60%',
    keptText: '₱75.00',
    tone: 'warn'
  }),
  item({
    id: 'salted',
    name: 'Salted Caramel',
    costText: 'Cost pending',
    costSource: 'pending',
    sourceText: 'No cost per cookie yet',
    marginText: '—',
    keptText: null,
    tone: 'none',
    receipt: null,
    startingCost: ''
  })
];

const book = (over: Partial<LiveRecipesVals> = {}): LiveRecipesVals => ({
  online: true,
  state: 'read',
  note: null,
  items: ITEMS,
  refresh: () => undefined,
  ...over
});
const draw = (b: LiveRecipesVals) =>
  render(<RecipeBookLive v={{ liveRecipes: b } as unknown as OpsVals} />);
const tiles = () => within(screen.getByRole('list', { name: 'Flavours' })).getAllByRole('listitem');

describe('anyone but the owner', () => {
  it('keeps the ported Recipes screen, not a blank one: the book has nothing for them', () => {
    // Mutation: returning nothing for a null book would blank the screen for a role that may open it.
    render(<RecipeBookLive v={{ liveRecipes: null } as unknown as OpsVals} />);
    expect(screen.getByTestId('old-recipes')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Recipe book' })).toBeNull();
  });
});

describe('the book', () => {
  it('opens on the menu with its count, and each tile shows price, cost and margin', () => {
    draw(book());
    expect(screen.getByRole('heading', { name: 'Recipe book' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /On the menu\s*2/ }).getAttribute('aria-pressed')
    ).toBe('true');
    expect(screen.getByRole('button', { name: /All\s*3/ })).toBeTruthy();
    expect(tiles().map((t) => t.textContent)).toEqual([
      expect.stringContaining('Classic'),
      expect.stringContaining('Salted Caramel')
    ]);
    const classic = tiles()[0]!;
    expect(classic.textContent).toContain('₱125.00');
    expect(classic.textContent).toContain('Cost ₱31.25');
    expect(classic.textContent).toContain('75% margin');
    // Mutation: "Cost Cost pending" (the label written twice).
    expect(tiles()[1]!.textContent).toContain('Cost pending');
    expect(tiles()[1]!.textContent).not.toContain('Cost Cost');
    expect(tiles()[1]!.textContent).toContain('No margin yet');
  });

  it('All adds the flavours off the menu, marked, and a low margin says so in words as well as colour', () => {
    draw(book());
    fireEvent.click(screen.getByRole('button', { name: /All\s*3/ }));
    expect(tiles()).toHaveLength(3);
    const velvet = tiles()[1]!;
    expect(velvet.textContent).toContain('Not on the menu');
    // Mutation: a low margin shown by colour alone.
    expect(velvet.textContent).toContain('60% margin');
    expect(velvet.textContent).toContain('below the 65% floor');
    expect(velvet.querySelector('[data-tone="warn"]')).toBeTruthy();
    expect(tiles()[0]!.querySelector('[data-tone="ok"]')).toBeTruthy();
  });

  it('searches by name inside the filter, and says so when nothing matches', () => {
    draw(book());
    fireEvent.change(screen.getByLabelText('Search flavours'), { target: { value: ' SALTED ' } });
    expect(tiles()).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Search flavours'), { target: { value: 'velvet' } });
    // Red Velvet is off the menu, so "On the menu" has none of it.
    expect(screen.getByText('No flavour matches “velvet”')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /All\s*3/ }));
    expect(tiles()).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Search flavours'), { target: { value: 'zzz' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clear the search' }));
    expect(tiles()).toHaveLength(3);
  });

  it('reads the costs when it opens, shows them while they load, and offers Try again when they failed', () => {
    const refresh = vi.fn();
    const { unmount } = draw(book({ state: 'loading', items: [], refresh }));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Reading the costs…')).toBeTruthy();
    unmount();
    const again = vi.fn();
    draw(book({ state: 'failed', note: 'Your typed costs could not be read.', refresh: again }));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(again).toHaveBeenCalledTimes(2);
  });

  it('says there is no signal, once', () => {
    draw(book({ online: false }));
    expect(screen.getByText(/No signal/)).toBeTruthy();
  });
});

describe('the flavour page', () => {
  const open = (b = book()) => {
    draw(b);
    fireEvent.click(within(tiles()[0]!).getByRole('button'));
  };

  it('opens from a tile with the photo hero, price, cost, margin against the floor, and the receipt', () => {
    open();
    const heading = screen.getByRole('heading', { name: 'Classic' });
    expect(document.activeElement).toBe(heading);
    expect(screen.getByText('On the menu', { selector: 'span' })).toBeTruthy();
    expect(screen.getByText('₱125.00')).toBeTruthy();
    expect(screen.getByText('75%')).toBeTruthy();
    expect(screen.getByText('Keeps ₱93.75 a cookie · floor 65%')).toBeTruthy();
    const receipt = screen.getByRole('table', { name: 'Recipe cost per cookie for Classic' });
    expect(within(receipt).getByText('Ingredients')).toBeTruthy();
    expect(within(receipt).getByText('₱24.50')).toBeTruthy();
    expect(within(receipt).getByText('Packaging')).toBeTruthy();
    expect(within(receipt).getByText('Recipe cost per cookie')).toBeTruthy();
    expect(
      screen.getByText('One batch makes 24 cookies; its ingredients cost ₱588.00.')
    ).toBeTruthy();
  });

  it('the hero photo and the tile carry the one transition name, and the page fades in where there is no transition', () => {
    const names: Array<string | undefined> = [];
    draw(book());
    const photo = () => document.querySelector<HTMLElement>('[data-photo]');
    expect(photo()?.style.viewTransitionName).toBeFalsy();
    (document as unknown as { startViewTransition: (cb: () => void) => void }).startViewTransition =
      (cb) => {
        // The old picture is taken now: the pressed tile must already hold the name.
        names.push(photo()?.style.viewTransitionName);
        cb();
      };
    fireEvent.click(within(tiles()[0]!).getByRole('button'));
    expect(names).toEqual(['flavour-photo']);
    expect(photo()?.style.viewTransitionName).toBe('flavour-photo');
    // With a transition the page does not also fade.
    // (Receipt rows rise in by themselves; the page wrapper is the one that must not.)
    expect(document.querySelector('div.motion-enter')).toBeNull();
  });

  it('fades the page in when the browser has no view transition', () => {
    open();
    expect(document.querySelector('.motion-enter')).toBeTruthy();
  });

  it('shows a flavour with no cost as pending, and a recipe with nothing read says so', () => {
    draw(book());
    fireEvent.click(within(tiles()[1]!).getByRole('button'));
    expect(screen.getByRole('heading', { name: 'Salted Caramel' })).toBeTruthy();
    expect(screen.getByText('Needs a cost')).toBeTruthy();
    expect(screen.getByText('No cost is known for this flavour yet.')).toBeTruthy();
    expect(screen.getByText(/has not been read, or the flavour has no recipe/)).toBeTruthy();
  });

  it('names what an incomplete recipe is missing', () => {
    open(
      book({
        items: [
          item({
            costText: 'Cost pending',
            costSource: 'pending',
            tone: 'none',
            marginText: '—',
            keptText: null,
            receipt: {
              lines: [{ label: 'Ingredients', valueText: '₱20.00' }],
              totalText: null,
              missing: ['Flour', 'Box'],
              batchText: null
            }
          })
        ]
      })
    );
    expect(screen.getByText('The recipe has no cost for Flour, Box.')).toBeTruthy();
    expect(screen.getByText('Cost pending', { selector: 'td' })).toBeTruthy();
  });

  it('the cost field starts at the recipe’s cost and Save waits until it is changed', () => {
    open();
    const field = screen.getByLabelText('Cost per cookie') as HTMLInputElement;
    expect(field.value).toBe('31.25');
    const save = screen.getByRole('button', { name: 'Save the cost' }) as HTMLButtonElement;
    // Mutation: an enabled Save here would freeze the recipe’s cost as hers with one tap.
    expect(save.disabled).toBe(true);
    fireEvent.change(field, { target: { value: '30' } });
    expect(save.disabled).toBe(false);
    fireEvent.change(field, { target: { value: '31.250' } });
    expect(save.disabled).toBe(true);
  });

  it('sends what she typed, once, and shows the words if it is not saved', async () => {
    const save = vi.fn(async () => 'That could not be saved. Check the cost, then try again.');
    open(book({ items: [item({ save })] }));
    fireEvent.change(screen.getByLabelText('Cost per cookie'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save the cost' }));
    await waitFor(() => expect(screen.getByText(/That could not be saved/)).toBeTruthy());
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('30');
  });

  it('a bad cost turns the field red with a summary, and sends nothing', async () => {
    const save = vi.fn(async () => null);
    open(book({ items: [item({ save })] }));
    const field = screen.getByLabelText('Cost per cookie') as HTMLInputElement;
    fireEvent.change(field, { target: { value: '12.50001' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save the cost' }));
    await waitFor(() => expect(field.getAttribute('aria-invalid')).toBe('true'));
    expect(
      screen.getAllByText(/Enter the cost per cookie like 12 or 12.50/).length
    ).toBeGreaterThan(1);
    expect(save).not.toHaveBeenCalled();
    // The red goes as she types.
    fireEvent.change(field, { target: { value: '12.5' } });
    expect(field.getAttribute('aria-invalid')).toBeNull();
  });

  it('a typed cost says when, shows the recipe’s receipt beside it, and can be taken away', async () => {
    const save = vi.fn(async () => null);
    open(
      book({
        items: [
          item({
            costText: '₱40.00',
            costSource: 'typed',
            sourceText: 'Typed by you on 15 Oct',
            startingCost: '40',
            typed: true,
            receiptNote: "For comparison: the recipe's cost today.",
            save
          })
        ]
      })
    );
    expect(screen.getByText('Typed by you on 15 Oct: ₱40.00 a cookie.')).toBeTruthy();
    expect(screen.getByText("For comparison: the recipe's cost today.")).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Use the recipe’s cost' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(''));
  });

  it('a cost that cannot be saved now says why, once, and the field is off', () => {
    open(book({ items: [item({ saveBlocked: 'This database cannot keep a typed cost yet.' })] }));
    expect((screen.getByLabelText('Cost per cookie') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getAllByText('This database cannot keep a typed cost yet.')).toHaveLength(1);
  });

  it('goes back to the book with its filter and search kept', () => {
    draw(book());
    fireEvent.click(screen.getByRole('button', { name: /All\s*3/ }));
    fireEvent.change(screen.getByLabelText('Search flavours'), { target: { value: 'velvet' } });
    fireEvent.click(within(tiles()[0]!).getByRole('button'));
    fireEvent.click(screen.getByRole('button', { name: /Back to the recipe book/ }));
    expect((screen.getByLabelText('Search flavours') as HTMLInputElement).value).toBe('velvet');
    expect(tiles()).toHaveLength(1);
  });
});

describe('editing the recipe', () => {
  it('the button says it is the older screen, opens it on this flavour, and the way back lands on the page', () => {
    const editRecipe = vi.fn();
    draw(book({ items: [item({ editRecipe })] }));
    fireEvent.click(within(tiles()[0]!).getByRole('button'));
    expect(screen.getByText(/Recipes are still edited in the older Recipes screen/)).toBeTruthy();
    expect(screen.getByText(/do not save yet/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open the older Recipes screen' }));
    expect(editRecipe).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('old-recipes')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Back to the recipe book/ }));
    expect(screen.getByRole('heading', { name: 'Classic' })).toBeTruthy();
    expect(screen.queryByTestId('old-recipes')).toBeNull();
  });
});
