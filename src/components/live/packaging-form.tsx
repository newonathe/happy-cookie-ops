import { useState } from 'react';
import type * as React from 'react';
import type { LivePackagingRule, OpsVals } from '@/view-models/vals';
import { PACKAGING_COPY as C } from '@/lib/orders/staff-copy';
import {
  inputStyle,
  labelStyle,
  primaryButton,
  secondaryButton,
  smallLabel
} from '@/components/live/form-styles';

type LivePackaging = NonNullable<OpsVals['livePackaging']>;
type Container = LivePackagingRule['container'];
type Per = LivePackagingRule['per'];

interface RuleRow {
  key: number;
  container: Container;
  boxSize: number | null;
  itemId: string;
  qty: string;
  per: Per;
}
interface LineRow {
  key: number;
  itemId: string;
  qty: string;
}

const hint = { fontSize: '11px', color: '#66524A' };
const errorText = { fontSize: '12px', color: '#A8231B' };
const rowCard = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '8px',
  border: '1px solid #E7E1DC',
  borderRadius: '12px',
  padding: '11px'
};
const groupBox = { ...rowCard, margin: '0' };
const column = { display: 'flex', flexDirection: 'column' as const, gap: '12px' };

const CONTAINERS: Container[] = ['box', 'loose', 'order', 'bazaar_sale'];

/** A row's identity while it is edited: a new row has no id of its own yet. */
let lastKey = 0;
const key = (): number => (lastKey += 1);

const ruleRows = (rules: LivePackaging['rules']): RuleRow[] =>
  rules.map((r) => ({
    key: key(),
    container: r.container,
    boxSize: r.boxSize,
    itemId: r.itemId,
    qty: String(r.qty),
    per: r.per
  }));
const boxSizes = (rules: LivePackaging['rules']): number[] =>
  [
    ...new Set(
      rules.flatMap((r) => (r.container === 'box' && r.boxSize !== null ? [r.boxSize] : []))
    )
  ].sort((a, b) => a - b);
const lineRows = (lines: LivePackaging['flavours'][number]['lines']): LineRow[] =>
  lines.map((l) => ({ key: key(), itemId: l.itemId, qty: String(l.qty) }));
const stampsOf = (p: LivePackaging) => {
  const flavours = p.flavours.map((f): [string, string | null] => [f.productId, f.stamp]);
  return { rules: p.rulesStamp, flavours, byFlavour: Object.fromEntries(flavours) };
};

const parseQty = (text: string): number => (text.trim() === '' ? Number.NaN : Number(text));
const qtyOk = (n: number): boolean => Number.isFinite(n) && n > 0;
const ownedBy = (rows: ReadonlyArray<{ itemId: string; qty: string }>): boolean =>
  rows.every((r) => r.itemId !== '' && qtyOk(parseQty(r.qty)));

/**
 * The owner's packaging (B3b), on the live form host: the stock items each container takes (a box of a size, loose cookies,
 * a whole order, a bazaar sale), and each flavour's packaging per cookie. Every item, size and quantity comes from her records:
 * the form has no default of its own, so an empty shop shows only empty states. No new colour: the hint, error and border
 * colours are the ones the other live forms already use (form-styles, books-form).
 */
export function PackagingForm({ livePackaging }: { livePackaging: LivePackaging }) {
  if (!livePackaging.available) return <Unavailable livePackaging={livePackaging} />;
  return <Editor livePackaging={livePackaging} />;
}

function Unavailable({ livePackaging }: { livePackaging: LivePackaging }) {
  return (
    <div style={column}>
      <span style={hint}>{C.missing}</span>
      <button type="button" onClick={livePackaging.close} style={secondaryButton}>
        {C.close}
      </button>
    </div>
  );
}

function ItemSelect({
  value,
  label,
  names,
  items,
  onChange
}: {
  value: string;
  label: string;
  names: Map<string, string>;
  items: LivePackaging['items'];
  onChange: (id: string) => void;
}) {
  const active = items.filter((i) => i.active);
  const categories = [...new Set(active.map((i) => i.category))];
  // An item a line already uses stays on the list when it is switched off, so the line still shows what it names.
  const kept = value !== '' && !active.some((i) => i.id === value);
  return (
    <label style={labelStyle}>
      <span style={smallLabel}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
        <option value="">{C.chooseItem}</option>
        {kept ? (
          <option value={value}>
            {(names.get(value) ?? value) +
              (items.some((i) => i.id === value) ? ' ' + C.itemOff : '')}
          </option>
        ) : null}
        {categories.map((cat) => (
          <optgroup key={cat} label={cat}>
            {active
              .filter((i) => i.category === cat)
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

function Editor({ livePackaging }: { livePackaging: LivePackaging }) {
  const { items, online } = livePackaging;
  const names = new Map<string, string>();
  for (const i of items) names.set(i.id, i.name);
  for (const r of livePackaging.rules) if (!names.has(r.itemId)) names.set(r.itemId, r.itemName);
  for (const f of livePackaging.flavours)
    for (const l of f.lines) if (!names.has(l.itemId)) names.set(l.itemId, l.name);
  const unitOf = (id: string) => items.find((i) => i.id === id)?.unit ?? '';
  const canAdd = items.some((i) => i.active);

  const [rows, setRows] = useState<RuleRow[]>(() => ruleRows(livePackaging.rules));
  const [sizes, setSizes] = useState<number[]>(() => boxSizes(livePackaging.rules));
  const [sizeText, setSizeText] = useState('');
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [lines, setLines] = useState<Record<string, LineRow[]>>(() =>
    Object.fromEntries(livePackaging.flavours.map((f) => [f.productId, lineRows(f.lines)]))
  );
  const [lineErrors, setLineErrors] = useState<Record<string, string>>({});

  // A save, a conflict or another device moves a section's stamp: that section alone is re-read from what is saved, and
  // anything typed in the other sections is kept (adjusting state while rendering, React's pattern for a changed prop).
  const [seen, setSeen] = useState(() => stampsOf(livePackaging));
  const now = stampsOf(livePackaging);
  if (now.rules !== seen.rules || now.flavours.some(([pid, st]) => seen.byFlavour[pid] !== st)) {
    setSeen(now);
    if (now.rules !== seen.rules) {
      setRows(ruleRows(livePackaging.rules));
      setSizes(boxSizes(livePackaging.rules));
      setRulesError(null);
    }
    const moved = livePackaging.flavours.filter((f) => seen.byFlavour[f.productId] !== f.stamp);
    if (moved.length) {
      setLines((all) => ({
        ...all,
        ...Object.fromEntries(moved.map((f) => [f.productId, lineRows(f.lines)]))
      }));
      setLineErrors((all) =>
        Object.fromEntries(
          Object.entries(all).filter(([pid]) => !moved.some((f) => f.productId === pid))
        )
      );
    }
  }

  const update = (k: number, patch: Partial<RuleRow>) =>
    setRows((rs) => rs.map((r) => (r.key === k ? { ...r, ...patch } : r)));
  const addRule = (container: Container, boxSize: number | null) =>
    setRows((rs) => [
      ...rs,
      { key: key(), container, boxSize, itemId: '', qty: '', per: 'container' }
    ]);

  const addSize = () => {
    const n = sizeText.trim() === '' ? Number.NaN : Number(sizeText);
    if (!Number.isInteger(n) || n < 2 || n > 48) return setRulesError(C.boxSizeBad);
    setRulesError(null);
    setSizeText('');
    setSizes((s) => (s.includes(n) ? s : [...s, n].sort((a, b) => a - b)));
  };

  const submitRules = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ordered: RuleRow[] = [
      ...sizes.flatMap((size) => rows.filter((r) => r.container === 'box' && r.boxSize === size)),
      ...CONTAINERS.filter((c) => c !== 'box').flatMap((c) => rows.filter((r) => r.container === c))
    ];
    if (!ownedBy(ordered)) return setRulesError(C.incomplete);
    setRulesError(null);
    livePackaging.saveRules(
      ordered.map((r) => ({
        container: r.container,
        boxSize: r.container === 'box' ? r.boxSize : null,
        itemId: r.itemId,
        qty: parseQty(r.qty),
        per: r.per
      }))
    );
  };

  const ruleLines = (container: Container, boxSize: number | null) => {
    const mine = rows.filter((r) => r.container === container && r.boxSize === boxSize);
    return (
      <>
        {mine.length === 0 ? <span style={hint}>{C.noRules}</span> : null}
        {mine.map((r) => (
          <div key={r.key} style={rowCard}>
            <ItemSelect
              value={r.itemId}
              label={C.item}
              names={names}
              items={items}
              onChange={(id) => update(r.key, { itemId: id })}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <label style={labelStyle}>
                <span style={smallLabel}>{C.qty}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0.001}
                  max={999999}
                  step="any"
                  value={r.qty}
                  onChange={(e) => update(r.key, { qty: e.target.value })}
                  style={inputStyle}
                />
              </label>
              <label style={labelStyle}>
                <span style={smallLabel}>{C.per}</span>
                <select
                  value={r.per}
                  onChange={(e) =>
                    update(r.key, { per: e.target.value === 'cookie' ? 'cookie' : 'container' })
                  }
                  style={inputStyle}
                >
                  <option value="container">{C.perContainer}</option>
                  <option value="cookie">{C.perCookie}</option>
                </select>
              </label>
            </div>
            {unitOf(r.itemId) ? <span style={hint}>{unitOf(r.itemId)}</span> : null}
            <button
              type="button"
              onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
              style={secondaryButton}
            >
              {C.remove}
            </button>
          </div>
        ))}
        {canAdd ? (
          <button type="button" onClick={() => addRule(container, boxSize)} style={secondaryButton}>
            {C.addLine}
          </button>
        ) : null}
      </>
    );
  };

  const submitLines = (productId: string) => (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const mine = lines[productId] ?? [];
    if (!ownedBy(mine)) return setLineErrors((e) => ({ ...e, [productId]: C.incomplete }));
    setLineErrors((e) => {
      const rest = { ...e };
      delete rest[productId];
      return rest;
    });
    livePackaging.saveLines(
      productId,
      mine.map((l) => ({ itemId: l.itemId, qty: parseQty(l.qty) }))
    );
  };
  const setFlavour = (productId: string, fn: (rs: LineRow[]) => LineRow[]) =>
    setLines((all) => ({ ...all, [productId]: fn(all[productId] ?? []) }));

  return (
    <div style={column}>
      {!online ? <span style={errorText}>{C.offline}</span> : null}
      <span style={hint}>{C.intro}</span>
      {!canAdd ? <span style={hint}>{C.noItems}</span> : null}

      <form onSubmit={submitRules} noValidate style={column}>
        <span style={smallLabel}>{C.rulesHeading}</span>

        <div style={{ ...column, gap: '8px' }}>
          <span style={smallLabel}>{C.containers.box}</span>
          {sizes.length === 0 ? <span style={hint}>{C.noRules}</span> : null}
          {sizes.map((size) => (
            <fieldset key={size} style={groupBox}>
              <legend style={smallLabel}>{C.boxOf(size)}</legend>
              {ruleLines('box', size)}
            </fieldset>
          ))}
          {canAdd ? (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
              <label style={{ ...labelStyle, flex: '1' }}>
                <span style={smallLabel}>{C.boxSizeLabel}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={2}
                  max={48}
                  step={1}
                  value={sizeText}
                  onChange={(e) => setSizeText(e.target.value)}
                  style={inputStyle}
                />
              </label>
              <button type="button" onClick={addSize} style={secondaryButton}>
                {C.addBoxSize}
              </button>
            </div>
          ) : null}
        </div>

        {CONTAINERS.filter((c) => c !== 'box').map((c) => (
          <fieldset key={c} style={groupBox}>
            <legend style={smallLabel}>{C.containers[c]}</legend>
            {ruleLines(c, null)}
          </fieldset>
        ))}

        {rulesError ? (
          <span role="alert" style={errorText}>
            {rulesError}
          </span>
        ) : null}
        {canAdd || rows.length > 0 ? (
          <button type="submit" style={primaryButton}>
            {C.saveRules}
          </button>
        ) : null}
      </form>

      <div style={{ ...column, gap: '8px' }}>
        <span style={smallLabel}>{C.flavoursHeading}</span>
        <span style={hint}>{C.flavoursHelp}</span>
        {livePackaging.flavours.length === 0 ? <span style={hint}>{C.noFlavours}</span> : null}
        {livePackaging.flavours.map((f) => {
          const mine = lines[f.productId] ?? [];
          return (
            <form
              key={f.productId}
              onSubmit={submitLines(f.productId)}
              noValidate
              style={{ margin: '0' }}
            >
              <fieldset style={groupBox}>
                <legend style={smallLabel}>{f.name}</legend>
                {!f.hasRecipe ? (
                  <span style={hint}>{C.noRecipe}</span>
                ) : (
                  <>
                    {mine.length === 0 ? <span style={hint}>{C.noLines}</span> : null}
                    {mine.map((l) => (
                      <div key={l.key} style={rowCard}>
                        <ItemSelect
                          value={l.itemId}
                          label={C.item}
                          names={names}
                          items={items}
                          onChange={(id) =>
                            setFlavour(f.productId, (rs) =>
                              rs.map((x) => (x.key === l.key ? { ...x, itemId: id } : x))
                            )
                          }
                        />
                        <label style={labelStyle}>
                          <span style={smallLabel}>{C.qtyPerCookie}</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0.001}
                            max={999999}
                            step="any"
                            value={l.qty}
                            onChange={(e) =>
                              setFlavour(f.productId, (rs) =>
                                rs.map((x) => (x.key === l.key ? { ...x, qty: e.target.value } : x))
                              )
                            }
                            style={inputStyle}
                          />
                        </label>
                        {unitOf(l.itemId) ? <span style={hint}>{unitOf(l.itemId)}</span> : null}
                        <button
                          type="button"
                          onClick={() =>
                            setFlavour(f.productId, (rs) => rs.filter((x) => x.key !== l.key))
                          }
                          style={secondaryButton}
                        >
                          {C.remove}
                        </button>
                      </div>
                    ))}
                    {canAdd ? (
                      <button
                        type="button"
                        onClick={() =>
                          setFlavour(f.productId, (rs) => [
                            ...rs,
                            { key: key(), itemId: '', qty: '' }
                          ])
                        }
                        style={secondaryButton}
                      >
                        {C.addLine}
                      </button>
                    ) : null}
                    {lineErrors[f.productId] ? (
                      <span role="alert" style={errorText}>
                        {lineErrors[f.productId]}
                      </span>
                    ) : null}
                    <button type="submit" style={primaryButton}>
                      {C.saveLines(f.name)}
                    </button>
                  </>
                )}
              </fieldset>
            </form>
          );
        })}
      </div>

      <button type="button" onClick={livePackaging.close} style={secondaryButton}>
        {C.close}
      </button>
    </div>
  );
}
