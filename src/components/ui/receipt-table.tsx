'use client';

import { peso } from '@/lib/money/format';
import { Button } from './button';

export interface ReceiptLine {
  label: string;
  detail?: string;
  /** Whole centavos; written with two decimals. */
  value: number;
  /** Shown as a Remove button; its name carries the line's label. */
  onRemove?: () => void;
}

export interface ReceiptTableProps {
  /** Names the table: "Fees". */
  caption: string;
  lines: ReceiptLine[];
  subtotal?: number;
  total: number;
  note?: string;
  /** What shows when there are no lines: "No fees yet". */
  emptyText?: string;
}

/** Lines, a subtotal and a total, in pesos with two decimals. */
export function ReceiptTable({
  caption,
  lines,
  subtotal,
  total,
  note,
  emptyText = 'Nothing yet'
}: ReceiptTableProps) {
  return (
    <div className="flex flex-col gap-2">
      <table className="w-full border-collapse text-body">
        <caption className="sr-only">{caption}</caption>
        <tbody>
          {lines.length === 0 ? (
            <tr>
              <td className="py-3 text-ink-mute">{emptyText}</td>
            </tr>
          ) : (
            lines.map((line, index) => (
              <tr key={`${line.label}-${index}`} className="border-b border-divide">
                <th scope="row" className="py-2.5 pr-3 text-left font-semibold text-ink">
                  {line.label}
                  {line.detail ? (
                    <span className="block text-caption font-medium text-ink-mute">
                      {line.detail}
                    </span>
                  ) : null}
                </th>
                <td className="py-2.5 text-right font-semibold text-ink tabular-nums">
                  {peso(line.value)}
                </td>
                {lines.some((l) => l.onRemove) ? (
                  <td className="w-px py-1.5 pl-2 text-right">
                    {line.onRemove ? (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={line.onRemove}
                        aria-label={`Remove ${line.label}`}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          {subtotal !== undefined ? (
            <tr>
              <th
                scope="row"
                className="pt-2.5 pr-3 text-left text-caption font-semibold text-ink-soft"
              >
                Subtotal
              </th>
              <td className="pt-2.5 text-right text-caption font-semibold text-ink-soft tabular-nums">
                {peso(subtotal)}
              </td>
            </tr>
          ) : null}
          <tr>
            <th scope="row" className="pt-2 pr-3 text-left text-body font-bold text-ink">
              Total
            </th>
            <td className="pt-2 text-right text-body font-bold text-ink tabular-nums">
              {peso(total)}
            </td>
          </tr>
        </tfoot>
      </table>
      {note ? <p className="m-0 text-caption text-ink-mute">{note}</p> : null}
    </div>
  );
}
