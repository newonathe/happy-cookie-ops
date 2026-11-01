import type { OpsVals } from '@/view-models/vals';
import { SubTabs } from '@/components/ui/sub-tabs';
import { SectionTools } from './section-tools';

/** A page can place its existing section links below its own title without duplicating them. */
export function SectionNavigation({ v, refined = true }: { v: OpsVals; refined?: boolean }) {
  const tabs = v.liveScreen?.tabs;
  if (!tabs) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <SubTabs label={tabs.label} tabs={tabs.places} refined={refined} />
      <SectionTools
        key={`${tabs.placeLabel}:${tabs.places.find((item) => item.active)?.id}`}
        label={`${tabs.placeLabel} settings & tools`}
        items={tabs.entries.filter((item) => !item.primary && item.id !== 'Stock items')}
      />
    </div>
  );
}
