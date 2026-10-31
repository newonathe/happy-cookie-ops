'use client';

import { useState } from 'react';
import type { OpsVals } from '@/view-models/vals';
import type { LiveStockVals } from '@/lib/stock/live-stock-types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Banner } from '@/components/ui/banner';

/** The existing real count operation, with a separate review and retained runtime entries. */
export function CountInventory({ v, stock }: { v: OpsVals; stock: LiveStockVals }) {
  const [review, setReview] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const task = v.stock;
  const count = stock.count;
  if (!count) return null;
  const invalid = count.rows.find((row) => row.error)?.error;
  const save = async () => {
    try {
      setError(await count.save());
    } catch {
      setError('The count could not be confirmed. Your entries are kept. Try again.');
    }
  };
  const recover = async () => {
    try {
      setError(await count.recover());
    } catch {
      setError('The previous save is still unconfirmed. Try checking it again when connected.');
    }
  };
  return (
    <section
      aria-label="Count inventory"
      data-screen-label="Inventory"
      className="flex min-w-0 flex-col gap-4 text-ink"
    >
      <Button className="self-start" onClick={count.back}>
        Back to {stock.page ? 'item' : 'inventory'}
      </Button>
      <h1 className="text-title font-semibold">{review ? 'Review count' : 'Count inventory'}</h1>
      {count.pending ? (
        <Banner
          tone="warn"
          title="A previous count is not confirmed."
          body="Check that save before entering or discarding another count."
          action={
            count.saving
              ? undefined
              : { label: 'Check previous save', onPress: () => void recover() }
          }
        />
      ) : null}
      {count.storageError ? <Banner tone="warn" title={count.storageError} /> : null}
      {error ? <Banner tone="warn" title={error} /> : null}
      {discard ? (
        <Card className="flex flex-col gap-3" role="alert">
          <p>Discard the entries in this count? Saved inventory will stay unchanged.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setDiscard(false)}>Keep counting</Button>
            <Button variant="danger" onClick={count.discard}>
              Discard count
            </Button>
          </div>
        </Card>
      ) : !task ? (
        <Card className="flex flex-col gap-3">
          <p>
            The current item is unavailable or has changed. Your other entries are still in this
            count.
          </p>
          <p>
            Check an unconfirmed save first, or cancel to discard the unsaved entries and count
            again.
          </p>
        </Card>
      ) : review ? (
        <Card className="flex flex-col gap-4">
          <p>Only the items listed below will be counted. Unentered items stay unchanged.</p>
          <dl className="flex flex-col gap-3">
            {count.rows.map((row) => (
              <div
                key={row.name}
                className="flex flex-wrap justify-between gap-2 border-b border-line pb-3"
              >
                <dt>{row.name}</dt>
                <dd className="font-semibold tabular-nums">{row.amountText}</dd>
              </div>
            ))}
          </dl>
          {stock.countNote ? <p className="text-caption text-ink-mute">{stock.countNote}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={count.saving}
              onClick={() => {
                setReview(false);
                setError(null);
              }}
            >
              Change counts
            </Button>
            <Button
              variant="primary"
              busy={count.saving}
              busyLabel="Saving count…"
              disabled={count.pending}
              onClick={() => void save()}
            >
              Save count
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="flex flex-col gap-4">
          <h2 className="text-subtitle font-semibold">{task.name}</h2>
          <p className="text-caption text-ink-mute">
            {task.pos} · Records say {task.expected}
          </p>
          <Field
            label={`Counted quantity (${String(task.unit)})`}
            mode="decimal"
            value={task.value}
            hint="Enter what you physically counted. Leave blank if not counted; enter 0 only if none remains."
            disabled={count.saving || count.pending}
            onChange={(event) => {
              task.onInput(event);
              setError(null);
            }}
          />
          <p className="text-caption" aria-live="polite">
            {task.varianceText}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={count.saving || count.pending} onClick={task.prev}>
              Previous item
            </Button>
            <Button disabled={count.saving || count.pending} onClick={task.next}>
              Next item
            </Button>
          </div>
          <Button
            variant="primary"
            disabled={count.saving || count.pending}
            onClick={() => {
              if (!count.rows.length || invalid)
                setError(invalid ?? 'Enter at least one physical count.');
              else {
                setError(null);
                setReview(true);
              }
            }}
          >
            Review count
          </Button>
        </Card>
      )}
      {!discard ? (
        <Button
          variant="ghost"
          disabled={count.saving || count.pending}
          className="self-start"
          onClick={() => setDiscard(true)}
        >
          Cancel count
        </Button>
      ) : null}
    </section>
  );
}
