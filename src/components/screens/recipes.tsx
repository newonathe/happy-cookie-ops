import { Fragment } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { s } from '@/lib/css';
import { Pressable } from '@/components/ui/pressable';

export function RecipesScreen({ v }: { v: OpsVals }) {
  const { ic, recipe, recipeTabs } = v;
  return (
    <>
      <div data-screen-label="Recipes" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
          {(recipeTabs ?? []).map((rt, $index) => (
            <Fragment key={$index}>
              <button onClick={rt.go} style={{ position: 'relative', minHeight: '44px', padding: '0 13px', border: '1px solid #EDE8E4', background: '#FFFFFF', borderRadius: '10px', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap', flexShrink: '0' }}>
                {rt.active ? (
                  <>
                    <span style={{ position: 'absolute', inset: '-1px', border: '1.5px solid #E75F23', background: '#FDEDE5', borderRadius: '10px', animation: 'hcFade .18s ease-out' }} />
                  </>
                ) : null}
                <span style={{ position: 'relative' }}>
                  {rt.label}
                  {rt.dirty ? (
                    <>
                      {' '}
                      ·
                    </>
                  ) : null}
                </span>
              </button>
            </Fragment>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '11px' }}>
          <span style={s(recipe.imgStyle)} />
          <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '18px', fontWeight: '600', letterSpacing: '-.3px' }}>{recipe.name}</span>
            <span style={{ fontSize: '12px', color: '#66524A' }}>
              {recipe.version} · makes {recipe.yieldText} · {recipe.costText}
            </span>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid #E7E1DC', borderRadius: '11px', background: '#FFFFFF', flexShrink: '0' }}>
            <Pressable as="button" onClick={recipe.yieldDown} aria-label="Lower yield" style={{ width: '44px', height: '44px', border: '0', background: 'transparent', display: 'grid', placeItems: 'center' }} activeStyle={{ transform: 'scale(.94)' }}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#3A1F14" strokeWidth="1.9" strokeLinecap="round">
                <path d={ic.minus} />
              </svg>
            </Pressable>
            <span style={{ minWidth: '42px', textAlign: 'center', display: 'flex', flexDirection: 'column', lineHeight: '1.1' }}>
              <span style={{ fontSize: '16px', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>{recipe.yieldNum}</span>
              <span style={{ fontSize: '9px', color: '#66524A' }}>makes</span>
            </span>
            <Pressable as="button" onClick={recipe.yieldUp} aria-label="Raise yield" style={{ width: '44px', height: '44px', border: '0', background: 'transparent', display: 'grid', placeItems: 'center' }} activeStyle={{ transform: 'scale(.94)' }}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#3A1F14" strokeWidth="1.9" strokeLinecap="round">
                <path d={ic.plus} />
              </svg>
            </Pressable>
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {(recipe.rows ?? []).map((ri, $index) => (
            <Fragment key={$index}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <input value={ri.name} onChange={ri.setName} placeholder="Ingredient" style={{ flex: '1', minWidth: '140px', height: '44px', border: '1px solid #E7E1DC', borderRadius: '11px', padding: '0 12px', fontSize: '13px', background: '#FFFFFF' }} />
                <input value={ri.qty} onChange={ri.setQty} inputMode="decimal" aria-label="Quantity" style={{ width: '78px', height: '44px', border: '1px solid #E7E1DC', borderRadius: '11px', padding: '0 10px', fontSize: '13px', fontWeight: '600', fontVariantNumeric: 'tabular-nums', background: '#FFFFFF' }} />
                <select value={ri.unit} onChange={ri.setUnit} aria-label="Unit" style={{ width: '72px', height: '44px', border: '1px solid #E7E1DC', borderRadius: '11px', padding: '0 8px', fontSize: '13px', background: '#FFFFFF' }}>
                  {(recipe.units ?? []).map((u, $index) => (
                    <Fragment key={$index}>
                      <option value={u}>{u}</option>
                    </Fragment>
                  ))}
                </select>
                <button onClick={ri.remove} aria-label="Remove" style={{ width: '44px', height: '44px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '11px', display: 'grid', placeItems: 'center' }}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#66524A" strokeWidth="1.8" strokeLinecap="round">
                    <path d={ic.close} />
                  </svg>
                </button>
                {ri.warn ? (
                  <>
                    <span style={{ width: '100%', fontSize: '11px', color: '#95600A' }}>{ri.warn}</span>
                  </>
                ) : null}
              </div>
            </Fragment>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={recipe.addRow} style={{ minHeight: '48px', padding: '0 16px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '12px', fontSize: '13px', fontWeight: '600' }}>
            Add ingredient
          </button>
          {recipe.dirty ? (
            <>
              <button onClick={recipe.save} style={{ flex: '1', minHeight: '48px', border: '0', borderRadius: '12px', background: '#1B7A4B', color: '#FFFFFF', fontSize: '14px', fontWeight: '600' }}>
                Save as new version
              </button>
            </>
          ) : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid #F2EEEB', paddingTop: '12px' }}>
          <span style={{ fontSize: '13px', fontWeight: '600', color: '#6E574B' }}>{recipe.version} · current</span>
          <span style={{ fontSize: '12px', color: '#66524A' }}>
            {recipe.currentBatches}. Editing creates a new version — anything already baked keeps its old cost.
          </span>
          {recipe.hasHistory ? (
            <>
              {(recipe.history ?? []).map((rh, $index) => (
                <Fragment key={$index}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#F8F6F4', borderRadius: '11px', padding: '10px 12px' }}>
                    <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '13px', fontWeight: '600', color: '#6E574B' }}>{rh.label}</span>
                      <span style={{ fontSize: '11px', color: '#66524A' }}>{rh.detail} · {rh.batches}</span>
                    </span>
                  </div>
                </Fragment>
              ))}
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}
