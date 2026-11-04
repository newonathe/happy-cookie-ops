'use client';

import { useState, type ReactNode } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { Button } from '@/components/ui/button';
import { PageTitle, Panel, SectionHeading } from '@/components/ui/owner-kit';
import { OpenRow } from '@/components/ui/owner-patterns';

export type SettingsArea = 'people' | 'shop' | 'make' | 'stock' | 'money' | 'data' | 'other';

/** Which of the engine's settings groups each area holds. A group not listed here lands in `other`, so none can vanish. */
const AREA_OF: Readonly<Record<string, SettingsArea>> = {
  People: 'people',
  'Orders & payments': 'shop',
  'Drops & capacity': 'shop',
  'Customer experience': 'shop',
  'Products & recipes': 'make',
  'Kitchen rules': 'make',
  'Inventory & grocery': 'stock',
  'Money rules': 'money',
  'Notifications & data': 'data'
};

export const AREA_TEXT: Readonly<Record<SettingsArea, { title: string; about: string }>> = {
  people: { title: 'People & access', about: 'Owners and helpers' },
  shop: { title: 'Shop settings', about: 'Status, order rules, payments and shop details' },
  make: { title: 'Make settings', about: 'Products, recipes and kitchen rules' },
  stock: { title: 'Stock settings', about: 'Items, counts, shopping and suppliers' },
  money: { title: 'Money settings', about: 'Tax set-aside, float and quick discounts' },
  data: { title: 'Notifications & data', about: 'Alerts, customer details and exports' },
  other: { title: 'Other settings', about: 'Everything else' }
};

type Group = OpsVals['settingsGroups'][number];

export function areaOf(group: Group): SettingsArea {
  return AREA_OF[String(group.title)] ?? 'other';
}

export function groupsOf(v: OpsVals, area: SettingsArea): Group[] {
  return (v.settingsGroups ?? []).filter((group) => areaOf(group) === area);
}

/** One area's settings, as a page: the engine's rows and where they lead, unchanged. */
export function SettingsAreaPage({
  v,
  area,
  backLabel,
  onBack,
  children,
  showTools = false
}: {
  v: OpsVals;
  area: SettingsArea;
  backLabel: string;
  onBack: () => void;
  showTools?: boolean;
  /** Controls this section owns itself, above the shared rows. */
  children?: ReactNode;
}) {
  const text = AREA_TEXT[area];
  // The tools of the place this page was opened from: every one stays reachable from its Settings.
  const tools = showTools
    ? (v.liveScreen?.tabs?.entries ?? []).filter(
        (entry) => !entry.primary && entry.id !== 'Stock items'
      )
    : [];
  return (
    <div className="w-full">
      <PageTitle title={text.title} subtitle={text.about} />
      {children}
      {tools.length ? (
        <Panel>
          {tools.map((tool) => (
            <OpenRow key={String(tool.id)} title={tool.label} onOpen={tool.go} />
          ))}
        </Panel>
      ) : null}
      {groupsOf(v, area).map((group, i) => (
        <div key={i}>
          <SectionHeading>{group.title}</SectionHeading>
          <Panel>
            {(group.rows ?? []).map((row, j) => (
              <OpenRow key={j} title={row.label} detail={row.value} onOpen={row.go} />
            ))}
          </Panel>
        </div>
      ))}
      <Button variant="secondary" onClick={onBack}>
        {backLabel}
      </Button>
    </div>
  );
}

/** A section's Settings button and page. The page returns to wherever it was opened from. */
export function useAreaSettings(
  v: OpsVals,
  area: SettingsArea,
  backLabel: string,
  children?: ReactNode
): { open: () => void; page: ReactNode } {
  const [open, setOpen] = useState(false);
  return {
    open: () => setOpen(true),
    page: open ? (
      <SettingsAreaPage
        v={v}
        area={area}
        backLabel={backLabel}
        onBack={() => setOpen(false)}
        showTools
      >
        {children}
      </SettingsAreaPage>
    ) : null
  };
}
