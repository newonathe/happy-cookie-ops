import type * as React from 'react';
import { inputStyle, smallLabel } from '@/components/live/form-styles';
import { STATUS_COLOUR, buttonBase, textStyle } from '@/components/live/stock/stock-shared';
import { useSave } from './use-save';

const field: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '5px',
  flex: '1 1 88px',
  minWidth: 0
};
const input: React.CSSProperties = {
  ...inputStyle,
  width: '100%',
  minWidth: 0,
  boxSizing: 'border-box'
};

/** A labelled text input. The label is a real `<label>`, so the whole row is a tap target. */
export function Field({
  label,
  value,
  mode,
  onChange
}: {
  label: string;
  value: string;
  mode: 'numeric' | 'decimal' | 'text';
  onChange: (value: string) => void;
}) {
  return (
    <label style={field}>
      <span style={smallLabel}>{label}</span>
      <input
        value={value}
        inputMode={mode}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        style={input}
      />
    </label>
  );
}

/** A labelled select over words and their values. */
export function SelectField({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; text: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label style={field}>
      <span style={smallLabel}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={input}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.text}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Words she must read first. Bold and coloured, and the words carry the meaning: never the colour alone. */
export function Notices({ notices }: { notices: string[] }) {
  return (
    <>
      {notices.map((n) => (
        <p
          key={n}
          role="status"
          style={{ ...textStyle, color: STATUS_COLOUR.Low, fontWeight: 700 }}
        >
          {n}
        </p>
      ))}
    </>
  );
}

/** The words for what went wrong with a save. */
export function ErrorText({ error, id }: { error: string | null; id?: string }) {
  if (!error) return null;
  return (
    <p id={id} role="alert" style={{ ...textStyle, color: STATUS_COLOUR.Out, fontWeight: 600 }}>
      {error}
    </p>
  );
}

/** S3.1: takes a fee or a loss back, with its own words if that is refused. `label` names what goes, for a screen reader. */
export function RemoveButton({
  label,
  remove
}: {
  label: string;
  remove: () => Promise<string | null>;
}) {
  const { error, saving, run } = useSave();
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
      <button
        type="button"
        disabled={saving}
        aria-label={'Remove ' + label}
        onClick={() => void run(remove)}
        style={{ ...buttonBase, minHeight: '44px', opacity: saving ? 0.6 : 1 }}
      >
        {saving ? 'Removing…' : 'Remove'}
      </button>
      <ErrorText error={error} />
    </span>
  );
}
