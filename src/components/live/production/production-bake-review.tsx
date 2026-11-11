import type { LiveBatchCounts } from '@/lib/production/live-production-types';
import { Banner } from '@/components/ui/banner';
import styles from './focus.module.css';

/** Planning figures only. The server checks recorded dough atomically when saving. */
export function ProductionBakeReview({ counts }: { counts: LiveBatchCounts }) {
  const balance = counts.doughBalance ?? null;
  const made = Number(counts.actual);
  return (
    <section className={styles.ingredients} aria-label="Dough used by baking">
      <h2>Bake from dough in the fridge</h2>
      <p>No new ingredients come off stock. They were recorded when the dough was prepared.</p>
      <p>
        {balance === null
          ? 'Recorded dough balance unavailable.'
          : `${balance.toLocaleString('en-PH')} balls recorded in the fridge.`}
      </p>
      {counts.valid ? (
        <p>
          This bake uses {made.toLocaleString('en-PH')} balls:{' '}
          {(made - Number(counts.rejects)).toLocaleString('en-PH')} good cookies and{' '}
          {counts.rejects} rejects.
        </p>
      ) : null}
      {counts.valid && balance !== null && made > balance ? (
        <Banner
          tone="warn"
          title="Prepare dough first"
          body="Your records show too little dough for this bake. Leave for now to prepare dough; your counts stay here. The saved balance is checked again when you confirm."
        />
      ) : null}
    </section>
  );
}
