import type { Meta, StoryObj } from '@storybook/nextjs';

/**
 * The palette, as a page. Useful when someone asks whether a new state should be warn
 * or danger — the answer is visible rather than argued.
 */
const GROUPS: Array<{ name: string; tokens: Array<[string, string]> }> = [
  {
    name: 'Ink',
    tokens: [
      ['ink', '#3A1F14'],
      ['ink-soft', '#6E574B'],
      ['ink-mute', '#66524A'],
      ['ink-faint', '#8A7062'],
      ['ink-hint', '#A98A5F']
    ]
  },
  {
    name: 'Surface',
    tokens: [
      ['surface', '#FFFFFF'],
      ['raise', '#FBFAF9'],
      ['inset', '#F8F6F4'],
      ['app', '#F1EFEE'],
      ['chip', '#F4F1EE'],
      ['warm-card', '#FFFDF9']
    ]
  },
  {
    name: 'Brand',
    tokens: [
      ['brand', '#C24A15'],
      ['brand-deep', '#A93D0F'],
      ['accent', '#E75F23'],
      ['cust-bg', '#FFF5E5'],
      ['cust-line', '#F0E2CB']
    ]
  },
  {
    name: 'Semantic',
    tokens: [
      ['ok', '#1B7A4B'],
      ['ok-fill', '#E8F5EE'],
      ['warn', '#95600A'],
      ['warn-dot', '#C98A12'],
      ['danger', '#A8231B'],
      ['danger-line', '#F2CFCB']
    ]
  }
];

function Palette() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '26px', padding: '8px' }}>
      {GROUPS.map((group) => (
        <section key={group.name} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <span
            style={{
              fontSize: '12px',
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: '#8A7062'
            }}
          >
            {group.name}
          </span>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))',
              gap: '10px'
            }}
          >
            {group.tokens.map(([name, hex]) => (
              <div key={name} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div
                  style={{
                    height: '56px',
                    borderRadius: '12px',
                    background: hex,
                    border: '1px solid rgba(58,31,20,0.08)'
                  }}
                />
                <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#3A1F14' }}>
                  {name}
                </span>
                <span
                  style={{
                    fontSize: '11.5px',
                    color: '#8A7062',
                    fontVariantNumeric: 'tabular-nums'
                  }}
                >
                  {hex}
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

const meta = {
  title: 'Foundations/Colour',
  component: Palette,
  parameters: { layout: 'padded' }
} satisfies Meta<typeof Palette>;
export default meta;
export const Colour: StoryObj<typeof meta> = {};
