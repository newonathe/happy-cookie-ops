import { useState } from 'react';
import type * as React from 'react';
import type { OpsVals } from '@/view-models/vals';
import { s } from '@/lib/css';
import { Pressable } from '@/components/ui/pressable';
import { ORDER_COPY } from '@/lib/orders/copy';
import {
  inputStyle,
  labelStyle,
  primaryButton,
  secondaryButton,
  smallLabel
} from '@/components/live/form-styles';

/**
 * The customer's live checkout (B2, decision D4, docs/state/protected-exception.md): the one
 * guarded slot in the ported checkout screen, after the "Your order" card. It replaces "About you",
 * "Collection", "Payment" and the submit button, because the ported ones ask for an email, an amount
 * sent and a payment screenshot that a live order neither needs nor takes. Existing tokens only: every
 * colour, radius and size below is one the ported checkout already uses.
 */
const card: React.CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid #F0E2CB',
  borderRadius: '18px',
  padding: '14px',
  display: 'flex',
  flexDirection: 'column',
  gap: '11px'
};
const cardTitle: React.CSSProperties = { fontSize: '12px', fontWeight: '700', color: '#6E574B' };
const fieldLabel: React.CSSProperties = { fontSize: '12px', fontWeight: '600' };
const field: React.CSSProperties = {
  height: '48px',
  border: '1px solid #EADCC4',
  borderRadius: '12px',
  padding: '0 13px',
  fontSize: '14px',
  background: '#FFFDF9'
};
const errorText: React.CSSProperties = { fontSize: '11px', color: '#A8231B' };
const optionCard: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  gap: '11px',
  width: '100%',
  textAlign: 'left',
  minHeight: '54px',
  border: '1px solid #EADCC4',
  background: '#FFFDF9',
  borderRadius: '12px',
  padding: '11px 13px',
  transition: 'background-color .18s ease'
};

function Radio({ on }: { on: boolean }) {
  return (
    <>
      {on ? (
        <span
          style={{
            position: 'absolute',
            inset: '-1px',
            border: '2px solid #E75F23',
            borderRadius: '12px'
          }}
        />
      ) : null}
      <span
        style={{
          position: 'relative',
          width: '20px',
          height: '20px',
          borderRadius: '999px',
          border: '2px solid #DCC9AE',
          display: 'grid',
          placeItems: 'center',
          flexShrink: '0'
        }}
      >
        {on ? (
          <span
            style={{ width: '10px', height: '10px', borderRadius: '999px', background: '#E75F23' }}
          />
        ) : null}
      </span>
    </>
  );
}

function Text({
  label,
  hint,
  value,
  onChange,
  error,
  readOnly,
  inputMode,
  placeholder,
  id
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  readOnly: boolean;
  inputMode?: 'tel' | 'text';
  placeholder?: string;
  id: string;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
      <span style={fieldLabel}>
        {label}
        {hint ? <span style={{ color: '#66524A', fontWeight: '400' }}> {hint}</span> : null}
      </span>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        inputMode={inputMode}
        placeholder={placeholder}
        style={field}
      />
      {error ? <span style={errorText}>{error}</span> : null}
    </label>
  );
}

export function LiveCheckout({ v }: { v: OpsVals }) {
  const live = v.liveCheckout;
  if (!live) return null;
  if (live.placed) return <Placed placed={live.placed} />;
  const { fields, errors, readOnly } = live;
  const methods = v.cust.methods ?? [];
  const canSubmit = !live.sending && live.rulesState === 'ready';
  return (
    <>
      <div style={card}>
        <span style={cardTitle}>About you</span>
        <Text
          id="lc-name"
          label="Name"
          value={fields.name}
          onChange={(x) => live.set('name', x)}
          error={errors.name}
          readOnly={readOnly}
          placeholder="Who is this box for?"
        />
        <Text
          id="lc-ig"
          label="Instagram handle"
          value={fields.ig}
          onChange={(x) => live.set('ig', x)}
          error={errors.ig}
          readOnly={readOnly}
          placeholder="@yourhandle"
        />
        <Text
          id="lc-mobile"
          label="Contact number"
          value={fields.mobile}
          onChange={(x) => live.set('mobile', x)}
          error={errors.mobile}
          readOnly={readOnly}
          inputMode="tel"
          placeholder="09XX XXX XXXX"
        />
      </div>
      <div style={{ ...card, gap: '9px' }}>
        <span style={cardTitle}>Pickup</span>
        {live.rulesState === 'loading' ? (
          <span style={{ fontSize: '12px', color: '#6E574B' }}>Loading the pickup days…</span>
        ) : null}
        {live.rulesState === 'failed' ? (
          <span style={errorText}>{ORDER_COPY.rulesUnavailable}</span>
        ) : null}
        {live.rulesState === 'ready' && live.dates.length === 0 ? (
          <span style={errorText}>{ORDER_COPY.noDates}</span>
        ) : null}
        {live.dates.map((d) => (
          <Pressable
            key={d.value}
            as="button"
            disabled={readOnly}
            onClick={() => live.set('pickupDate', d.value)}
            style={optionCard}
            hoverStyle={{ background: '#FFF8ED' }}
          >
            <Radio on={fields.pickupDate === d.value} />
            <span style={{ position: 'relative', fontSize: '13px', fontWeight: '700' }}>
              {d.label}
            </span>
          </Pressable>
        ))}
        {errors.date ? <span style={errorText}>{errors.date}</span> : null}
        {live.times.length ? (
          <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <span style={fieldLabel}>Pickup time</span>
            <select
              value={fields.pickupTime}
              onChange={(e) => live.set('pickupTime', e.target.value)}
              disabled={readOnly}
              style={field}
            >
              <option value="">Choose a time</option>
              {live.times.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            {errors.time ? <span style={errorText}>{errors.time}</span> : null}
          </label>
        ) : null}
      </div>
      <div style={{ ...card, gap: '9px' }}>
        <span style={cardTitle}>Payment</span>
        <span style={{ fontSize: '13px', color: '#6E574B', lineHeight: '1.5' }}>
          {ORDER_COPY.payHelp}
        </span>
        {methods.length === 0 ? <span style={errorText}>{ORDER_COPY.noMethods}</span> : null}
        {methods.map((m) => (
          <Pressable
            key={String(m.label)}
            as="button"
            disabled={readOnly}
            onClick={m.pick}
            style={optionCard}
            hoverStyle={{ background: '#FFF8ED' }}
          >
            <Radio on={!!m.on} />
            <span
              style={{
                position: 'relative',
                flex: '1',
                minWidth: '0',
                display: 'flex',
                flexDirection: 'column',
                gap: '1px'
              }}
            >
              <span style={{ fontSize: '13px', fontWeight: '700' }}>{m.label}</span>
              <span
                style={{ fontSize: '12px', color: '#6E574B', fontVariantNumeric: 'tabular-nums' }}
              >
                {[m.num, m.holder].filter(Boolean).join(' · ')}
              </span>
            </span>
          </Pressable>
        ))}
        {errors.pay ? <span style={errorText}>{errors.pay}</span> : null}
        {v.cust.qr ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '9px',
              background: '#FFFBF3',
              border: '1px solid #F0E2CB',
              borderRadius: '14px',
              padding: '14px'
            }}
          >
            <span style={{ fontSize: '12px', fontWeight: '700', color: '#6E574B' }}>
              {v.cust.qrTitle}
            </span>
            <span style={s(v.cust.qr)} />
            <span
              style={{
                maxWidth: '34ch',
                fontSize: '11px',
                color: '#8A7062',
                textAlign: 'center',
                lineHeight: '1.5',
                textWrap: 'pretty'
              }}
            >
              {ORDER_COPY.qrNote}
            </span>
          </div>
        ) : null}
        <Text
          id="lc-ref"
          label="Reference number"
          hint="(optional)"
          value={fields.ref}
          onChange={(x) => live.set('ref', x)}
          readOnly={readOnly}
          placeholder="From your receipt, if you have paid"
        />
      </div>
      {errors.items ? <span style={errorText}>{errors.items}</span> : null}
      {live.banner ? (
        <div
          role="alert"
          style={{
            ...card,
            gap: '9px',
            background: live.banner.tone === 'error' ? '#FFF6F4' : '#FFFBF3',
            border: '1px solid ' + (live.banner.tone === 'error' ? '#F1C8C2' : '#EADCC4')
          }}
        >
          <span
            style={{
              fontSize: '13px',
              lineHeight: '1.5',
              color: live.banner.tone === 'error' ? '#A8231B' : '#3A1F14'
            }}
          >
            {live.banner.text}
          </span>
          {live.banner.canWaitlist ? (
            <button type="button" onClick={live.openWaitlist} style={secondaryButton}>
              Join the waiting list
            </button>
          ) : null}
        </div>
      ) : null}
      <Pressable
        as="button"
        disabled={!canSubmit}
        onClick={live.submit}
        style={{
          minHeight: '56px',
          border: '0',
          borderRadius: '14px',
          background: '#C24A15',
          color: '#FFFFFF',
          fontSize: '16px',
          fontWeight: '700',
          boxShadow: '0 4px 16px -5px rgba(231,95,35,.6)',
          opacity: canSubmit ? 1 : 0.6,
          transition: 'transform .16s cubic-bezier(.2,.8,.2,1), background-color .2s ease'
        }}
        hoverStyle={{ background: '#A93D0F' }}
        activeStyle={{ transform: 'scale(.985)' }}
      >
        {live.sending ? 'Sending…' : readOnly ? 'Try again' : 'Place order'}
      </Pressable>
      {readOnly ? (
        <button
          type="button"
          onClick={live.changeOrder}
          style={{ ...secondaryButton, alignSelf: 'center' }}
        >
          Change the order
        </button>
      ) : null}
      {live.holdNote ? (
        <span
          style={{
            maxWidth: '40ch',
            alignSelf: 'center',
            fontSize: '11px',
            color: '#66524A',
            textAlign: 'center',
            lineHeight: '1.5',
            textWrap: 'pretty'
          }}
        >
          {live.holdNote}
        </span>
      ) : null}
    </>
  );
}

function Placed({
  placed
}: {
  placed: NonNullable<NonNullable<OpsVals['liveCheckout']>['placed']>;
}) {
  return (
    <div style={{ ...card, gap: '12px' }}>
      <span style={{ fontSize: '20px', fontWeight: '700', letterSpacing: '-.4px' }}>
        {ORDER_COPY.placedTitle}
      </span>
      <span
        style={{
          alignSelf: 'flex-start',
          fontSize: '13px',
          fontWeight: '700',
          fontVariantNumeric: 'tabular-nums',
          background: '#FFFFFF',
          border: '1px solid #F0E2CB',
          borderRadius: '999px',
          padding: '7px 15px'
        }}
      >
        Order no. {placed.orderNo}
      </span>
      <span style={{ fontSize: '13px', color: '#6E574B', lineHeight: '1.5' }}>
        {ORDER_COPY.placedBody}
      </span>
      <span style={{ fontSize: '12px', fontWeight: '600' }}>Total {placed.totalText}</span>
      <a
        href={placed.statusUrl}
        style={{ fontSize: '11px', color: '#C24A15', overflowWrap: 'anywhere', lineHeight: '1.5' }}
      >
        {placed.statusUrl}
      </a>
      <button type="button" onClick={placed.copyLink} style={secondaryButton}>
        Copy the link
      </button>
      <button type="button" onClick={placed.seeOrder} style={primaryButton}>
        See my order
      </button>
      <button type="button" onClick={placed.orderAgain} style={secondaryButton}>
        Order again
      </button>
    </div>
  );
}

/** "Find my order" as a sheet (live customer pages): order number and the phone it was placed with. */
export function LiveLookup({ v }: { v: OpsVals }) {
  const live = v.liveLookup;
  const [orderNo, setOrderNo] = useState('');
  const [mobile, setMobile] = useState('');
  if (!live) return null;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        live.run(orderNo, mobile);
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
    >
      <span style={{ fontSize: '13px', color: '#6E574B', lineHeight: '1.5' }}>
        Your order number and the mobile number you ordered with will find it.
      </span>
      <label style={labelStyle}>
        <span style={smallLabel}>Order number</span>
        <input
          value={orderNo}
          onChange={(e) => setOrderNo(e.target.value)}
          placeholder="HC-1042"
          style={inputStyle}
        />
      </label>
      <label style={labelStyle}>
        <span style={smallLabel}>Mobile number</span>
        <input
          value={mobile}
          onChange={(e) => setMobile(e.target.value)}
          inputMode="tel"
          placeholder="09XX XXX XXXX"
          style={inputStyle}
        />
      </label>
      <button type="submit" disabled={live.state === 'busy'} style={primaryButton}>
        {live.state === 'busy' ? 'Looking…' : 'Find it'}
      </button>
      {live.state === 'missed' ? (
        <span style={{ fontSize: '12px', color: '#A8231B', lineHeight: '1.45' }}>
          {ORDER_COPY.lookupMiss}
        </span>
      ) : null}
      {live.state === 'error' ? (
        <span style={{ fontSize: '12px', color: '#A8231B', lineHeight: '1.45' }}>
          {ORDER_COPY.lookupError}
        </span>
      ) : null}
    </form>
  );
}

/** The waiting list as a sheet: name, Instagram (optional), mobile and the date wanted. */
export function LiveWaitlistForm({ v }: { v: OpsVals }) {
  const live = v.liveWaitlist;
  const [name, setName] = useState('');
  const [ig, setIg] = useState('');
  const [mobile, setMobile] = useState('');
  const [wantedDate, setWantedDate] = useState('');
  if (!live) return null;
  if (live.state === 'done') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <span style={{ fontSize: '13px', lineHeight: '1.5' }}>{live.message}</span>
        <button type="button" onClick={live.close} style={primaryButton}>
          Done
        </button>
      </div>
    );
  }
  const frozen = live.state === 'unknown';
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        live.join({ name, ig, mobile, wantedDate });
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
    >
      <label style={labelStyle}>
        <span style={smallLabel}>Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          readOnly={frozen}
          style={inputStyle}
        />
        {live.errors.name ? <span style={errorText}>{live.errors.name}</span> : null}
      </label>
      <label style={labelStyle}>
        <span style={smallLabel}>Instagram handle (optional)</span>
        <input
          value={ig}
          onChange={(e) => setIg(e.target.value)}
          readOnly={frozen}
          placeholder="@yourhandle"
          style={inputStyle}
        />
        {live.errors.ig ? <span style={errorText}>{live.errors.ig}</span> : null}
      </label>
      <label style={labelStyle}>
        <span style={smallLabel}>Mobile number</span>
        <input
          value={mobile}
          onChange={(e) => setMobile(e.target.value)}
          readOnly={frozen}
          inputMode="tel"
          placeholder="09XX XXX XXXX"
          style={inputStyle}
        />
        {live.errors.mobile ? <span style={errorText}>{live.errors.mobile}</span> : null}
      </label>
      <label style={labelStyle}>
        <span style={smallLabel}>Date you want cookies</span>
        <input
          type="date"
          value={wantedDate}
          min={live.min}
          max={live.max}
          onChange={(e) => setWantedDate(e.target.value)}
          readOnly={frozen}
          style={inputStyle}
        />
        {live.errors.date ? <span style={errorText}>{live.errors.date}</span> : null}
      </label>
      <button type="submit" disabled={live.state === 'sending'} style={primaryButton}>
        {live.state === 'sending' ? 'Sending…' : frozen ? 'Try again' : 'Join the waiting list'}
      </button>
      {live.message ? (
        <span style={{ fontSize: '12px', color: '#A8231B', lineHeight: '1.45' }}>
          {live.message}
        </span>
      ) : null}
    </form>
  );
}
