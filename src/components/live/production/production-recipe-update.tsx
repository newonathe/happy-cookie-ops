'use client';
import type { LiveProductionRecipeUpdate } from '@/lib/production/live-production-types';
import { Button } from '@/components/ui/button';

/** Compare source facts without treating updated quantities as measured production. */
export function ProductionRecipeUpdate({ update, dough = false }: { update: LiveProductionRecipeUpdate; dough?: boolean }) {
  return <section aria-label="Updated recipe" className="flex min-w-0 flex-col gap-3 rounded-control border border-line bg-surface p-4">
    <h3 className="m-0 text-body font-semibold">Recipe v{update.previousVersion ?? 'unavailable'} → v{update.version}</h3>
    <p className="m-0 text-caption text-ink-mute">Per full recipe · {update.previousYield ?? 'Unknown'} → {update.yield} cookies</p>
    <details>
      <summary className="cursor-pointer text-body font-semibold">Compare recipe amounts</summary>
      <dl className="m-0 mt-3 flex flex-col gap-3">{update.rows.map(row => <div key={row.name} className="min-w-0 border-b border-line pb-2">
        <dt className="text-body font-semibold">{row.name}</dt>
        <dd className="m-0 flex flex-wrap gap-x-4 gap-y-1 text-caption"><span>Previous: {row.previous}</span><span>Updated: {row.current}</span></dd>
      </div>)}</dl>
    </details>
    <p className="m-0 text-caption text-ink-mute">{dough
      ? 'Your amount stays. If it no longer matches a full or half recipe, choose the amount again.'
      : 'Counts and notes stay. Ingredient adjustments reset so you can review them against the updated recipe.'} Nothing is recorded yet.</p>
    <Button onClick={update.use}>Use updated recipe</Button>
  </section>;
}
