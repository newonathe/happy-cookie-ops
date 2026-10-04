import type * as React from 'react';
import type { OpsVals } from '@/view-models/vals';
import { inputStyle, labelStyle, primaryButton, secondaryButton, smallLabel } from '@/components/live/form-styles';

type DraftForm = NonNullable<OpsVals['liveRecipeDrafts']>;
const value = (form: HTMLFormElement, name: string): string =>
  (form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? '';

export function RecipeDraftsForm({ liveDrafts }: { liveDrafts: DraftForm }) {
  const { editing } = liveDrafts;
  const error = liveDrafts.error ? <span role="alert" style={{ fontSize: '12px', color: 'var(--color-danger)' }}>{liveDrafts.error}</span> : null;
  if (liveDrafts.loading && !liveDrafts.loaded)
    return <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <span style={{ fontSize: '12px', color: 'var(--color-ink-mute)' }}>Loading saved recipe drafts…</span>
      <button type="button" onClick={liveDrafts.close} style={secondaryButton}>Close</button>
    </div>;
  if (!liveDrafts.loaded)
    return <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {error ?? <span role="alert" style={{ fontSize: '12px', color: 'var(--color-danger)' }}>Recipe drafts could not be read.</span>}
      <button type="button" onClick={liveDrafts.reload} style={primaryButton}>Retry</button>
      <button type="button" onClick={liveDrafts.close} style={secondaryButton}>Close</button>
    </div>;
  if (!editing) return <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
    {error}
    {liveDrafts.rows.map((row) => <button key={row.productId} type="button" onClick={() => liveDrafts.open(row.productId)}
      style={{ ...secondaryButton, minHeight: '48px', textAlign: 'left' }}>
      {row.name} · {row.saved ? 'Draft saved' : 'No draft yet'}
    </button>)}
    <button type="button" onClick={liveDrafts.reload} style={secondaryButton}>Reload saved drafts</button>
    <button type="button" onClick={liveDrafts.close} style={secondaryButton}>Close</button>
  </div>;
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    liveDrafts.save({ ...editing, yield: value(event.currentTarget, 'draftYield').trim() === '' ? NaN : Number(value(event.currentTarget, 'draftYield')),
      sourceText: value(event.currentTarget, 'draftSource') });
  };
  return <form key={editing.productId + ':' + (editing.expectedUpdatedAt ?? 'new')} onSubmit={submit}
    style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
    {error}
    <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-ink)' }}>{liveDrafts.selectedName}</span>
    <span style={{ fontSize: '12px', color: 'var(--color-ink-mute)' }}>
      This draft keeps the original recipe quantities and notes. Costs and stock deductions use the production recipe separately.
    </span>
    <label style={labelStyle}><span style={smallLabel}>Cookies per batch</span>
      <input name="draftYield" type="number" min="1" max="10000" step="1" required defaultValue={editing.yield} style={inputStyle} />
    </label>
    <label style={labelStyle}><span style={smallLabel}>Original recipe</span>
      <textarea name="draftSource" required maxLength={16000} defaultValue={editing.sourceText}
        style={{ ...inputStyle, height: '260px', minHeight: '260px', resize: 'vertical', fontFamily: 'inherit' }} />
    </label>
    <button type="submit" disabled={liveDrafts.busy} style={primaryButton}>{liveDrafts.busy ? 'Saving…' : 'Save draft'}</button>
    <button type="button" disabled={liveDrafts.busy} onClick={liveDrafts.back} style={secondaryButton}>Back to recipes</button>
  </form>;
}
