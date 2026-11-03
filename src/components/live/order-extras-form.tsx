import { useState } from 'react';
import type * as React from 'react';
import type { OpsVals, LiveOrderExtrasFields } from '@/view-models/vals';
import { EXTRAS_COPY as C } from '@/lib/orders/staff-copy';
import { Button } from '@/components/ui/button';
import {
  ChoiceRows,
  FooterActions,
  OwnerField,
  Panel,
  SectionHeading,
  SwitchRow
} from '@/components/ui/owner-kit';

type LiveOrderExtras = NonNullable<OpsVals['liveOrderExtras']>;
type AddOn = LiveOrderExtrasFields['addOns'][number];

const field = (form: HTMLFormElement, name: string) =>
  form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
const fieldValue = (form: HTMLFormElement, name: string): string => field(form, name)?.value ?? '';
const isChecked = (form: HTMLFormElement, name: string): boolean =>
  (field(form, name) as HTMLInputElement | null)?.checked === true;

/** Choices typed into the rows; blank rows and repeats are left out. */
function readChoices(form: HTMLFormElement, i: number): string[] {
  const out: string[] = [];
  for (let j = 0; field(form, `aoChoice${i}_${j}`); j += 1) {
    const choice = fieldValue(form, `aoChoice${i}_${j}`).trim();
    if (choice && !out.includes(choice)) out.push(choice);
  }
  return out;
}

/**
 * What the form reads back. Settings the owner no longer edits here (the sampler limit, the most
 * of one add-on per order and the message length) keep their saved values, so the database's own
 * bounds and existing orders are unchanged. Box sizes are the supported saved sizes only.
 */
export function readExtrasForm(
  form: HTMLFormElement,
  before: LiveOrderExtrasFields
): LiveOrderExtrasFields {
  const num = (name: string) => Number(fieldValue(form, name));
  const boxSizes = before.boxSizes.map((b, i) => ({
    size: b.size,
    chargePesos: fieldValue(form, 'boxCharge' + i).trim() === '' ? 0 : num('boxCharge' + i),
    active: isChecked(form, 'boxOn' + i)
  }));
  const addOns: LiveOrderExtrasFields['addOns'] = [];
  for (let i = 0; field(form, 'aoName' + i); i += 1) {
    const saved = before.addOns.find((a) => a.id && a.id === fieldValue(form, 'aoId' + i));
    const name = fieldValue(form, 'aoName' + i).trim();
    if (!saved && name === '') continue;
    const message = isChecked(form, 'aoMessage' + i);
    addOns.push({
      id: saved?.id ?? '',
      name,
      pricePesos: fieldValue(form, 'aoPrice' + i).trim() === '' ? Number.NaN : num('aoPrice' + i),
      active: isChecked(form, 'aoOn' + i),
      variants: isChecked(form, 'aoChoices' + i) ? readChoices(form, i) : [],
      textLabel: message ? fieldValue(form, 'aoLabel' + i).trim() || 'Message' : '',
      textMax: saved?.textMax ?? 150,
      maxQty: saved?.maxQty ?? 10
    });
  }
  const offerSampler = isChecked(form, 'samplerOn');
  // The ticked cookies in the order shown; with no toggles on the page the saved list stands.
  const flavourInputs = Array.from(form.elements).filter(
    (el): el is HTMLInputElement => el instanceof HTMLInputElement && el.name.startsWith('sf_')
  );
  const samplerFlavours = flavourInputs.length
    ? flavourInputs.filter((el) => el.checked).map((el) => el.name.slice(3))
    : (before.samplerFlavours ?? null);
  return {
    sameDayEnabled: isChecked(form, 'sameDayEnabled'),
    sameDayPercent: num('sameDayPercent'),
    sameDayOnExtras: isChecked(form, 'sameDayOnExtras'),
    samplerProductId: offerSampler ? fieldValue(form, 'samplerProductId') : '',
    samplerMaxQty: before.samplerMaxQty,
    samplerFlavours,
    boxSizes,
    addOns
  };
}

interface Row {
  key: string;
  saved: AddOn | null;
  choices: boolean;
  options: string[];
  message: boolean;
}

/**
 * The owner's boxes and add-ons (B4) as a page of the Shop settings. The same fields the database
 * enforces. Nothing saved is deleted: a saved add-on is switched off, so an old order keeps the
 * name and price it was placed at; only a row added in this visit can be removed.
 */
export function OrderExtrasForm({ liveOrderExtras }: { liveOrderExtras: LiveOrderExtras }) {
  const { extras, sets } = liveOrderExtras;
  const [sampler, setSampler] = useState(extras.samplerProductId !== '');
  const [sameDay, setSameDay] = useState(extras.sameDayEnabled);
  const cookies = liveOrderExtras.cookies ?? [];
  const [chosen, setChosen] = useState<string[]>(() => extras.samplerFlavours ?? []);
  const [rows, setRows] = useState<Row[]>(() =>
    extras.addOns.map((a) => ({
      key: a.id,
      saved: a,
      choices: a.variants.length > 0,
      options: a.variants.length ? [...a.variants] : [''],
      message: a.textLabel !== ''
    }))
  );
  const [nextKey, setNextKey] = useState(0);
  const update = (key: string, patch: Partial<Row>) =>
    setRows((all) => all.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    liveOrderExtras.save(readExtrasForm(event.currentTarget, extras));
  };
  const samplerSet = sets.find((s) => s.id === extras.samplerProductId) ?? sets[0];
  return (
    <form onSubmit={onSubmit} className="flex flex-col">
      {!liveOrderExtras.online ? (
        <p role="status" className="mb-4 rounded-control bg-warm-high p-3 text-caption text-danger">
          Offline. Changes here will not save until this device is back online.
        </p>
      ) : null}

      <Panel title={C.sampler}>
        {sampler && sets.length > 1 ? null : (
          <input type="hidden" name="samplerProductId" value={samplerSet?.id ?? ''} />
        )}
        <SwitchRow
          label="Offer sampler box"
          name="samplerOn"
          checked={sampler}
          onChange={setSampler}
          info="Customers can order a box with one of each chosen flavour. Turn this off to hide it from the shop."
        />
        {sampler && sets.length > 1 ? (
          <label className="flex flex-col gap-1.5 pt-3">
            <span className="text-caption font-semibold text-ink-soft">Sampler item</span>
            <select
              name="samplerProductId"
              defaultValue={samplerSet?.id}
              className="h-12 rounded-control border border-line-strong bg-surface px-3 text-[14px] font-semibold"
            >
              {sets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {sampler && !samplerSet ? (
          <p className="pt-3 text-caption text-danger">
            Add a sampler box item under Products first, then switch this on.
          </p>
        ) : null}
        {sampler && extras.samplerFlavours ? (
          <fieldset className="m-0 border-0 p-0 pt-3">
            <legend className="pb-2 text-caption font-semibold text-ink-soft">
              Flavours in the sampler box ({chosen.length} chosen)
            </legend>
            {cookies.length === 0 ? (
              <p className="text-caption text-ink-mute">No cookies on the menu yet.</p>
            ) : (
              <div className="grid gap-x-6 sm:grid-cols-2">
                {cookies.map((c) => (
                  <label
                    key={c.id}
                    className="flex min-h-12 cursor-pointer items-center gap-3 border-b border-line text-[14px] font-semibold text-ink"
                  >
                    <input
                      type="checkbox"
                      name={'sf_' + c.id}
                      checked={chosen.includes(c.id)}
                      onChange={(event) => {
                        const on = event.currentTarget.checked;
                        setChosen((all) =>
                          on
                            ? cookies.map((x) => x.id).filter((id) => id === c.id || all.includes(id))
                            : all.filter((id) => id !== c.id)
                        );
                      }}
                      className="size-5 accent-[var(--color-brand)]"
                    />
                    <span>
                      {c.name}
                      {c.active ? null : (
                        <span className="ml-2 text-caption font-normal text-ink-mute">
                          not on the order form
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        ) : null}
        {sampler && extras.samplerFlavours === null ? (
          <p className="pt-3 text-caption text-ink-mute">
            Choosing the flavours inside becomes available after the next update of your shop.
          </p>
        ) : null}
      </Panel>

      <SectionHeading>Box sizes</SectionHeading>
      <Panel>
        {extras.boxSizes.length === 0 ? (
          <p className="text-caption text-ink-mute">No box sizes are saved.</p>
        ) : null}
        {extras.boxSizes.map((b, i) => (
          <div
            key={b.size}
            className="grid items-center gap-x-6 border-b border-line py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_200px] [&>div:first-child]:border-b-0 [&>div:first-child]:py-0"
          >
            <SwitchRow
              label={`Box of ${b.size}`}
              name={'boxOn' + i}
              defaultChecked={b.active}
              info="When on, customers can put their cookies in this box. Cookies that don't fill a box go in bags."
            />
            <OwnerField
              label="Box price (₱)"
              name={'boxCharge' + i}
              type="number"
              inputMode="decimal"
              min={0}
              max={1000}
              step="any"
              defaultValue={b.chargePesos}
            />
          </div>
        ))}
        {extras.boxSizes.length ? (
          <p className="pt-2 text-caption text-ink-mute">A box price of 0 means the box is free.</p>
        ) : null}
      </Panel>

      <SectionHeading
        action={
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setRows((all) => [
                ...all,
                {
                  key: `new:${nextKey}`,
                  saved: null,
                  choices: false,
                  options: [''],
                  message: false
                }
              ]);
              setNextKey((n) => n + 1);
            }}
          >
            Add add-on
          </Button>
        }
      >
        {C.addOns}
      </SectionHeading>
      {rows.length === 0 ? (
        <Panel>
          <p className="text-caption text-ink-mute">No add-ons yet.</p>
        </Panel>
      ) : null}
      {rows.map((row, i) => (
        <Panel
          key={row.key}
          title={row.saved?.name || 'New add-on'}
          action={
            row.saved ? null : (
              <button
                type="button"
                onClick={() => setRows((all) => all.filter((r) => r.key !== row.key))}
                className="min-h-11 rounded-control px-3 text-caption font-semibold text-brand-deep hover:bg-chip"
              >
                Remove
              </button>
            )
          }
        >
          <input type="hidden" name={'aoId' + i} value={row.saved?.id ?? ''} />
          <div className="grid gap-3 pb-2 sm:grid-cols-2">
            <OwnerField
              label="Add-on name"
              name={'aoName' + i}
              required
              maxLength={40}
              defaultValue={row.saved?.name ?? ''}
            />
            <OwnerField
              label="Price (₱)"
              name={'aoPrice' + i}
              type="number"
              inputMode="decimal"
              min={0}
              max={10000}
              step="any"
              required
              defaultValue={row.saved?.pricePesos ?? ''}
            />
          </div>
          <SwitchRow
            label="Offer this add-on"
            name={'aoOn' + i}
            defaultChecked={row.saved?.active ?? true}
            info="Switch off to hide it from new orders. Past orders keep it."
          />
          <SwitchRow
            label="Customer chooses an option"
            name={'aoChoices' + i}
            checked={row.choices}
            onChange={(on) => update(row.key, { choices: on })}
            info="For add-ons that come in versions, like ribbon colours. Leave off when there is nothing to choose."
          />
          {row.choices ? (
            <ChoiceRows
              name={'aoChoice' + i}
              values={row.options}
              onChange={(options) => update(row.key, { options })}
            />
          ) : null}
          <SwitchRow
            label="Customer writes a message"
            name={'aoMessage' + i}
            checked={row.message}
            onChange={(on) => update(row.key, { message: on })}
            info="Adds a short text box, like the words for a note card."
          />
          {row.message ? (
            <OwnerField
              className="pt-2"
              label="Message box label"
              name={'aoLabel' + i}
              maxLength={30}
              defaultValue={row.saved?.textLabel || 'Message'}
            />
          ) : null}
        </Panel>
      ))}

      <SectionHeading>{C.sameDay}</SectionHeading>
      <Panel>
        <SwitchRow
          label={C.sameDayOn}
          name="sameDayEnabled"
          checked={sameDay}
          onChange={setSameDay}
          info="Customers can pick up on the day they order. The extra below is added to their total."
        />
        <OwnerField
          className="py-3"
          label="Same-day extra (% of the order)"
          name="sameDayPercent"
          type="number"
          inputMode="decimal"
          min={0}
          max={100}
          required
          defaultValue={extras.sameDayPercent}
        />
        <SwitchRow
          label="Add the extra to boxes and add-ons too"
          name="sameDayOnExtras"
          defaultChecked={extras.sameDayOnExtras}
          info="When off, the same-day extra is worked out on the cookies only."
        />
      </Panel>

      <FooterActions
        back={
          <Button type="button" variant="secondary" onClick={liveOrderExtras.close}>
            Cancel
          </Button>
        }
        forward={
          <Button type="submit" variant="primary">
            {C.save}
          </Button>
        }
      />
    </form>
  );
}
