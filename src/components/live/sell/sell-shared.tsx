'use client';

import type { ReactNode } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { Button } from '@/components/ui/button';
import { SubTabs } from '@/components/ui/sub-tabs';

/** The one section row of Sell. Its Shop tab doubles as the section's settings. */
export function SellTabs({ v, active }: { v: OpsVals; active?: string }) {
  const tabs = v.liveScreen?.tabs;
  if (!tabs) return null;
  const places = active
    ? tabs.places.map((place) => ({ ...place, active: place.id === active }))
    : tabs.places;
  return (
    <div className="mb-4">
      <SubTabs label={tabs.label} tabs={places} refined />
    </div>
  );
}

/** The title's Settings button: Shop holds the rules, boxes, payment methods and messages. */
export function SellSettings({ v }: { v: OpsVals }) {
  const shop = v.liveScreen?.tabs?.places.find((place) => place.id === 'shop');
  if (!shop) return null;
  return (
    <Button variant="secondary" onClick={shop.go}>
      Settings
    </Button>
  );
}

/** Tools of this place that are neither section tabs nor settings, such as Customer messages. */
export function SellTools({ v }: { v: OpsVals }) {
  const tools = (v.liveScreen?.tabs?.entries ?? []).filter((entry) => !entry.primary);
  return (
    <>
      {tools.map((tool) => (
        <Button key={tool.id} variant="secondary" onClick={tool.go}>
          {tool.label}
          {tool.badge ? <span className="ml-1 tabular-nums">{tool.badge}</span> : null}
        </Button>
      ))}
    </>
  );
}

/** An order's status in the engine's own colours; the word always shows. */
export function OrderPill({
  label,
  fg,
  bg,
  br
}: {
  label: ReactNode;
  fg: string;
  bg: string | number;
  br: string | number;
}) {
  return (
    <span
      className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-caption font-semibold whitespace-nowrap"
      style={{ color: fg, background: String(bg), borderColor: String(br) }}
    >
      {label}
    </span>
  );
}
