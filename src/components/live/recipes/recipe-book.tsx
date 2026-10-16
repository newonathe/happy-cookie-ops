'use client';

import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import type { OpsVals } from '@/view-models/vals';
import type { LiveRecipesVals, RecipeBookItem } from '@/lib/recipes/live-recipes-types';
import { MARGIN_FLOOR_PERCENT, bookCounts, filterBook, type BookFilter } from '@/lib/recipes/book';
import { RecipesScreen } from '@/components/screens/recipes';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { FilterChips } from '@/components/ui/filter-chips';
import { FlavourTile } from '@/components/ui/flavour-tile';
import { supportsViewTransition, useViewTransition } from '@/components/ui/motion';
import { cx } from '@/components/ui/cx';
import { FlavourPage, PHOTO_TRANSITION } from './flavour-page';

/** `liveRecipes` as the runtime provides it. */
export function liveRecipesOf(v: OpsVals): LiveRecipesVals | null {
  return (v as OpsVals & { liveRecipes?: LiveRecipesVals | null }).liveRecipes ?? null;
}

const TONE = {
  ok: 'bg-ok-fill border-ok-line text-ok',
  warn: 'bg-warm-high border-warm-line text-warn',
  none: 'bg-chip border-line text-ink-mute'
} as const;

/** The margin on a tile: colour and a mark and (for a low one) a word, so colour is never the only signal. */
function MarginBadge({ item }: { item: RecipeBookItem }) {
  return (
    <span
      data-tone={item.tone}
      className={cx(
        'inline-flex items-center gap-1 rounded-tag border px-1.5 py-0.5 text-caption font-semibold tabular-nums',
        TONE[item.tone]
      )}
    >
      {item.tone === 'ok' ? <span aria-hidden="true">✓</span> : null}
      {item.tone === 'warn' ? <span aria-hidden="true">!</span> : null}
      {item.tone === 'none' ? 'No margin yet' : `${item.marginText} margin`}
      {item.tone === 'warn' ? (
        <span className="sr-only"> (below the {MARGIN_FLOOR_PERCENT}% floor)</span>
      ) : null}
    </span>
  );
}

type View = { kind: 'book' } | { kind: 'flavour'; id: string } | { kind: 'editor'; id: string };

/**
 * The live recipe book (U7), in the slot of the ported Recipes screen. A grid of flavours with search and the On the menu
 * and All filters; a tap opens the flavour's page (the photo morphs through a view transition, and the page fades in where
 * the browser has none). Recipe editing is the ported screen, drawn here under a way back, until its save is fixed (B6).
 */
export function RecipeBookLive({ v }: { v: OpsVals }) {
  const book = liveRecipesOf(v);
  const run = useViewTransition();
  const [view, setView] = useState<View>({ kind: 'book' });
  const [filter, setFilter] = useState<BookFilter>('menu');
  const [query, setQuery] = useState('');
  // The flavour whose photo carries the transition name: only one element may hold a name at a time.
  const [named, setNamed] = useState<string | null>(null);
  const [fade, setFade] = useState(false);
  const refresh = book?.refresh;
  useEffect(() => {
    refresh?.();
  }, [refresh]);

  // Anyone but the owner has no recipe book (`liveRecipes` is null): they keep the ported Recipes screen as it was.
  if (!book) return <RecipesScreen v={v} />;

  const go = (next: View, name: string | null) => {
    // The old picture is taken before the update, so the tile holds its name first.
    flushSync(() => {
      setNamed(name);
      setFade(!supportsViewTransition());
    });
    run(() => flushSync(() => setView(next)));
  };

  if (view.kind === 'editor') {
    const item = book.items.find((i) => i.id === view.id);
    return (
      <section
        aria-label="Recipes"
        data-screen-label="Recipes"
        className="flex flex-col gap-3 pb-24"
      >
        <Button
          variant="ghost"
          onClick={() => go(item ? { kind: 'flavour', id: view.id } : { kind: 'book' }, view.id)}
          className="self-start"
        >
          <span aria-hidden="true">← </span>Back to the recipe book
        </Button>
        <RecipesScreen v={v} />
      </section>
    );
  }

  if (view.kind === 'flavour') {
    const item = book.items.find((i) => i.id === view.id);
    if (item)
      return (
        <section aria-label="Recipe book" data-screen-label="Recipes" className="pb-24">
          <FlavourPage
            item={item}
            fade={fade}
            note={book.note}
            onBack={() => go({ kind: 'book' }, item.id)}
            onEditRecipe={() => {
              item.editRecipe();
              go({ kind: 'editor', id: item.id }, null);
            }}
          />
        </section>
      );
  }

  const counts = bookCounts(book.items);
  const shown = filterBook(book.items, filter, query);
  return (
    <section
      aria-label="Recipe book"
      data-screen-label="Recipes"
      className={cx('flex flex-col gap-3 pb-24', fade && 'motion-enter')}
    >
      <h1 className="m-0 text-title text-ink">Recipe book</h1>
      {!book.online ? (
        <Banner tone="info" title="No signal. You can look, but a cost cannot be saved." />
      ) : null}
      {book.note ? (
        <Banner
          tone="warn"
          title={book.note}
          action={{ label: 'Try again', onPress: book.refresh }}
        />
      ) : null}
      <div className="flex flex-col gap-3 md:max-w-xl">
        <Field
          id="recipe-search"
          label="Search flavours"
          type="search"
          value={query}
          autoComplete="off"
          placeholder="Search by name"
          onChange={(e) => setQuery(e.target.value)}
        />
        <FilterChips
          label="Show flavours"
          options={[
            { id: 'menu', label: 'On the menu', count: counts.menu },
            { id: 'all', label: 'All', count: counts.all }
          ]}
          value={filter}
          onChange={(id) => setFilter(id === 'all' ? 'all' : 'menu')}
        />
      </div>
      {book.state === 'loading' ? (
        <p aria-live="polite" className="m-0 text-body text-ink-mute">
          Reading the costs…
        </p>
      ) : shown.length === 0 ? (
        <EmptyState
          title={
            query.trim() ? `No flavour matches “${query.trim()}”` : 'No flavours on the menu yet'
          }
          body={
            query.trim()
              ? 'Check the spelling, or look under All.'
              : 'Switch to All to see every flavour.'
          }
          action={
            query.trim()
              ? { label: 'Clear the search', onPress: () => setQuery('') }
              : filter === 'menu'
                ? { label: 'Show all', onPress: () => setFilter('all') }
                : undefined
          }
        />
      ) : (
        <ul
          aria-label="Flavours"
          className="m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-3 lg:grid-cols-4"
        >
          {shown.map((item) => (
            <li key={item.id}>
              <FlavourTile
                name={item.name}
                photo={item.photo}
                price={item.priceText}
                state={item.onMenu ? 'idle' : 'offMenu'}
                photoName={named === item.id ? PHOTO_TRANSITION : undefined}
                meta={
                  <>
                    <span className="text-caption font-semibold text-ink-soft tabular-nums">
                      {item.costSource === 'pending' ? item.costText : `Cost ${item.costText}`}
                    </span>
                    <MarginBadge item={item} />
                  </>
                }
                onPress={() => go({ kind: 'flavour', id: item.id }, item.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
