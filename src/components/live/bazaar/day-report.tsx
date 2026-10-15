import type { DayReviewView } from '@/lib/bazaar/live-bazaar-types';
import { ReceiptTable } from '@/components/ui/receipt-table';

const TOTAL_LABEL: Record<string, string> = {
  Takings: 'Revenue',
  'How it was paid': 'Revenue',
  Fees: 'Fees',
  Drawer: 'Expected'
};

/**
 * A closed day as a Z-report (U5): takings, how it was paid, fees and the drawer as receipts, then what was sold by
 * flavour. Every total is the database's own figure (src/lib/bazaar/review.ts, `dayReportOf`); nothing is added up here.
 */
export function DayReport({ review }: { review: DayReviewView }) {
  if (!review.report) return null;
  const sold = review.stock.filter((s) => s.sold > 0 || s.given > 0 || s.lost > 0);
  return (
    <div className="flex flex-col gap-4">
      {review.report.tables.map((t) => (
        <section key={t.caption} aria-label={t.caption} className="flex flex-col gap-1">
          <h3 className="m-0 text-body font-bold text-ink">{t.caption}</h3>
          <ReceiptTable
            caption={t.caption}
            lines={t.lines.map((l) => ({ label: l.label, detail: l.detail, value: l.cents }))}
            total={t.totalCents}
            totalLabel={TOTAL_LABEL[t.caption] ?? 'Total'}
            note={t.note}
            emptyText={t.caption === 'Fees' ? 'No fees for this day' : 'Nothing yet'}
          />
        </section>
      ))}
      <section aria-label="By flavour" className="flex flex-col gap-1">
        <h3 className="m-0 text-body font-bold text-ink">By flavour</h3>
        <table className="w-full border-collapse text-body">
          <caption className="sr-only">Sold, given away and lost, by flavour</caption>
          <thead>
            <tr className="border-b border-divide text-caption text-ink-mute">
              <th scope="col" className="py-2 pr-3 text-left font-semibold">
                Flavour
              </th>
              <th scope="col" className="py-2 pl-2 text-right font-semibold">
                Sold
              </th>
              <th scope="col" className="py-2 pl-2 text-right font-semibold">
                Given
              </th>
              <th scope="col" className="py-2 pl-2 text-right font-semibold">
                Lost
              </th>
            </tr>
          </thead>
          <tbody>
            {sold.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-3 text-ink-mute">
                  Nothing sold
                </td>
              </tr>
            ) : (
              sold.map((s) => (
                <tr key={s.productId} className="border-b border-divide">
                  <th scope="row" className="py-2.5 pr-3 text-left font-semibold text-ink">
                    {s.name}
                  </th>
                  <td className="py-2.5 pl-2 text-right text-ink tabular-nums">{s.sold}</td>
                  <td className="py-2.5 pl-2 text-right text-ink tabular-nums">{s.given}</td>
                  <td className="py-2.5 pl-2 text-right text-ink tabular-nums">{s.lost}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
