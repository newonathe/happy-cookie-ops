'use client';

import { peso } from '@/lib/money/format';
import { Button } from './button';
import { useLeavingRows } from './motion';

export interface ReceiptLine {
  label: string;
  detail?: string;
  /** Whole centavos; written with two decimals. */
  value: number;
  /** The value already written, for an amount `peso` cannot write: a cost per cookie to four decimals ("₱12.005"). */
  valueText?: string;
  /** Shown as a Remove button; its name carries the line's label. */
  onRemove?: () => void;
}

export interface ReceiptTableProps {
  /** Names the table: "Fees". */
  caption: string;
  lines: ReceiptLine[];
  subtotal?: number;
  total: number;
  /** The total already written, as `valueText` is for a line. */
  totalText?: string;
  /** Names the last row; "Total" unless it is something else ("Expected"). */
  totalLabel?: string;
  note?: string;
  /** What shows when there are no lines: "No fees yet". */
  emptyText?: string;
}

/** A stable key for a line: its text and amount, numbered when the same line appears twice. */
function lineKeys(lines: ReceiptLine[]): string[] {
  const seen = new Map<string, number>();
  return lines.map((line) => {
    const base = `${line.label}|${line.detail ?? ''}|${line.valueText ?? line.value}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return `${base}#${n}`;
  });
}

/** Lines, a subtotal and a total, in pesos with two decimals. A new line rises in; a removed one fades out. */
export function ReceiptTable({
  caption,
  lines,
  subtotal,
  total,
  totalText,
  totalLabel = 'Total',
  note,
  emptyText = 'Nothing yet'
}: ReceiptTableProps) {
  const keys = lineKeys(lines);
  const rows = useLeavingRows(
    lines.map((line, index) => ({ line, key: keys[index] })),
    (row) => row.key
  );
  const removable = lines.some((l) => l.onRemove);
  return (
    <div className="flex flex-col gap-2">
      <table className="w-full border-collapse text-body">
        <caption className="sr-only">{caption}</caption>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="py-3 text-ink-mute">{emptyText}</td>
            </tr>
          ) : (
            rows.map(({ item: { line }, key, leaving }) => (
              <tr
                key={key}
                data-leaving={leaving}
                aria-hidden={leaving || undefined}
                className="motion-enter motion-leave border-b border-divide"
              >
                <th scope="row" className="py-2.5 pr-3 text-left font-semibold text-ink">
                  {line.label}
                  {line.detail ? (
                    <span className="block text-caption font-medium text-ink-mute">
                      {line.detail}
                    </span>
                  ) : null}
                </th>
                <td className="py-2.5 text-right font-semibold text-ink tabular-nums">
                  {line.valueText ?? peso(line.value)}
                </td>
                {removable ? (
                  <td className="w-px py-1.5 pl-2 text-right">
                    {line.onRemove && !leaving ? (
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
              {totalLabel}
            </th>
            <td className="pt-2 text-right text-body font-bold text-ink tabular-nums">
              {totalText ?? peso(total)}
            </td>
          </tr>
        </tfoot>
      </table>
      {note ? <p className="m-0 text-caption text-ink-mute">{note}</p> : null}
    </div>
  );
}
