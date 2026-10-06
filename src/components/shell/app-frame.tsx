'use client';

import { Fragment } from 'react';
import type { OpsVals } from '@/view-models/vals';
import { s } from '@/lib/css';
import { Pressable } from '@/components/ui/pressable';
import { HomeScreen } from '@/components/screens/home';
import { SalesLogScreen } from '@/components/screens/sales-log';
import { OrdersScreen } from '@/components/screens/orders';
import { OrderDetailScreen } from '@/components/screens/order-detail';
import { BakePlanScreen } from '@/components/screens/bake-plan';
import { ProductionFocusScreen } from '@/components/screens/production-focus';
import { InventoryScreen } from '@/components/screens/inventory';
import { PaymentsScreen } from '@/components/screens/payments';
import { AllToolsScreen } from '@/components/screens/all-tools';
import { GroceryListScreen } from '@/components/screens/grocery-list';
import { ProfitAndLossScreen } from '@/components/screens/profit-and-loss';
import { BazaarModeScreen } from '@/components/screens/bazaar-mode';
import { FormQueueScreen } from '@/components/screens/form-queue';
import { SystemHealthScreen } from '@/components/screens/system-health';
import { ProductsScreen } from '@/components/screens/products';
import { DropsScreen } from '@/components/screens/drops';
import { SuppliersScreen } from '@/components/screens/suppliers';
import { SettingsScreen } from '@/components/screens/settings';
import { RecipesScreen } from '@/components/screens/recipes';
import { NotificationsScreen } from '@/components/screens/notifications';
import { FindMyOrderScreen } from '@/components/screens/find-my-order';
import { ShopScreen } from '@/components/screens/shop';
import { CheckoutScreen } from '@/components/screens/checkout';
import { OrderStatusScreen } from '@/components/screens/order-status';
import { WhySheet } from '@/components/sheets/why';
import { InvEditSheet } from '@/components/sheets/inv-edit';
import { AddInvSheet } from '@/components/sheets/add-inv';
import { SupplierSheet } from '@/components/sheets/supplier';
import { PaySheet } from '@/components/sheets/pay';
import { ExpenseSheet } from '@/components/sheets/expense';
import { CategoriesSheet } from '@/components/sheets/categories';
import { CloseoutSheet } from '@/components/sheets/closeout';
import { EvExpSheet } from '@/components/sheets/ev-exp';
import { ProofSheet } from '@/components/sheets/proof';
import { UsersSheet } from '@/components/sheets/users';
import { CustomersSheet } from '@/components/sheets/customers';
import { PayRulesSheet } from '@/components/sheets/pay-rules';
import { StatusesSheet } from '@/components/sheets/statuses';
import { SwapSheet } from '@/components/sheets/swap';
import { RulesSheet } from '@/components/sheets/rules';
import { StorageSheet } from '@/components/sheets/storage';
import { ResetSheet } from '@/components/sheets/reset';
import { RetentionSheet } from '@/components/sheets/retention';
import { CloseDropSheet } from '@/components/sheets/close-drop';
import { OverageSheet } from '@/components/sheets/overage';
import { ReceiveSheet } from '@/components/sheets/receive';
import { RefundSheet } from '@/components/sheets/refund';
import { NoShowSheet } from '@/components/sheets/no-show';
import { SpoilSheet } from '@/components/sheets/spoil';
import { DrawSheet } from '@/components/sheets/draw';
import { DropStateSheet } from '@/components/sheets/drop-state';
import { PricingSheet } from '@/components/sheets/pricing';
import { EditPriceSheet } from '@/components/sheets/edit-price';
import { LiveFormHost } from '@/components/live/live-form-host';
import { LiveScreenHost } from '@/components/live/live-screen-host';

/**
 * The application frame, ported 1:1 from the prototype template.
 * Mechanically translated from that template — see docs/PORTING.md for the rules.
 * The 24 screens and 29 sheets it used to hold inline are now their own files; this
 * frame keeps only the chrome: the device harness, the header, the dock and the toast.
 */
export function AppFrame({ v }: { v: OpsVals }) {
  const {
      appSub, bakeFlavours, bareFrame, bakedSheet, clearFlow, closeQuick, closeSheet, denied, deniedHome,
      deniedText, deniedTitle, devices, dockNav, dockPillStyle, doughSheet, drill, flow, flowChips,
      frameOuterStyle, frameStyle, goBack, hasAlerts, ic, mix, offline, online, onlineLabel,
      openNotifications, openQuick, pageMax, pagePad, pageSub, pageTitle, phoneWidths, quickActions,
      quickOpen, railNav, railPillStyle, railW, roleInitial, roleWho, roles, runUndo, screenAnim,
      screens, sheet, sheetStyle, showBack, showDock, showFlowStrip, showPhoneWidths, showRail,
      showTopBar, stopClick, toast, toastOk, toastStyle, toastWarn, toggleOnline
  } = v;
  return (
    <>
    <div style={bareFrame ? { minHeight: '100dvh', display: 'flex', flexDirection: 'column' } : { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 16px 44px', gap: '12px' }}>
      {bareFrame ? null : (
      <div style={{ width: '100%', maxWidth: '1180px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <img src="/assets/mark-solid.png" alt="The Happy Cookie" style={{ height: '34px', width: 'auto' }} />
        <div style={{ display: 'flex', flexDirection: 'column', marginRight: 'auto' }}>
          <span style={{ fontSize: '14px', fontWeight: '600', letterSpacing: '-.1px' }}>The Happy Cookie Ops</span>
          <span style={{ fontSize: '11px', color: '#66524A' }}>{appSub}</span>
        </div>
        <div style={{ display: 'flex', background: '#E7E3E0', borderRadius: '10px', padding: '3px', gap: '2px' }}>
          {(devices ?? []).map((d, $index) => (
            <Fragment key={$index}>
              <button onClick={d.go} style={{ position: 'relative', border: '0', background: 'transparent', borderRadius: '8px', padding: '7px 13px', fontSize: '12px', fontWeight: '600', color: '#4A342A', transition: 'color .18s ease' }}>
                {d.active ? (
                  <>
                    <span style={{ position: 'absolute', inset: '0', background: '#FFFFFF', borderRadius: '8px', boxShadow: '0 1px 2px rgba(58,31,20,.16)', animation: 'hcFade .18s ease-out' }} />
                  </>
                ) : null}
                <span style={{ position: 'relative' }}>{d.label}</span>
              </button>
            </Fragment>
          ))}
        </div>
        <div style={{ display: 'flex', background: '#E7E3E0', borderRadius: '10px', padding: '3px', gap: '2px' }}>
          {(roles ?? []).map((rl, $index) => (
            <Fragment key={$index}>
              <button onClick={rl.go} style={{ position: 'relative', border: '0', background: 'transparent', borderRadius: '8px', padding: '7px 13px', fontSize: '12px', fontWeight: '600', color: '#4A342A' }}>
                {rl.active ? (
                  <>
                    <span style={{ position: 'absolute', inset: '0', background: '#FFFFFF', borderRadius: '8px', boxShadow: '0 1px 2px rgba(58,31,20,.16)', animation: 'hcFade .18s ease-out' }} />
                  </>
                ) : null}
                <span style={{ position: 'relative' }}>{rl.label}</span>
              </button>
            </Fragment>
          ))}
        </div>
        {showPhoneWidths ? (
          <>
            <div style={{ display: 'flex', background: '#E7E3E0', borderRadius: '10px', padding: '3px', gap: '2px' }}>
              {(phoneWidths ?? []).map((pw, $index) => (
                <Fragment key={$index}>
                  <button onClick={pw.go} style={{ position: 'relative', border: '0', background: 'transparent', borderRadius: '8px', padding: '7px 11px', fontSize: '12px', fontWeight: '600', color: '#4A342A', fontVariantNumeric: 'tabular-nums' }}>
                    {pw.active ? (
                      <>
                        <span style={{ position: 'absolute', inset: '0', background: '#FFFFFF', borderRadius: '8px', boxShadow: '0 1px 2px rgba(58,31,20,.16)', animation: 'hcFade .18s ease-out' }} />
                      </>
                    ) : null}
                    <span style={{ position: 'relative' }}>{pw.label}</span>
                  </button>
                </Fragment>
              ))}
            </div>
          </>
        ) : null}
        <Pressable as="button" onClick={toggleOnline} style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', border: '1px solid #DFD8D3', background: '#FFFFFF', borderRadius: '10px', padding: '8px 13px', fontSize: '12px', fontWeight: '600', transition: 'transform .16s cubic-bezier(.2,.8,.2,1)' }} activeStyle={{ transform: 'scale(.98)' }}>
          {online ? (
            <>
              <span style={{ width: '7px', height: '7px', borderRadius: '999px', background: '#22945B' }} />
            </>
          ) : null}
          {offline ? (
            <>
              <span style={{ width: '7px', height: '7px', borderRadius: '999px', background: '#66524A', animation: 'hcBreathe 1.8s infinite' }} />
            </>
          ) : null}
          {onlineLabel}
          {' '}
        </Pressable>
      </div>
      )}
      {showFlowStrip ? (
        <>
          <div style={{ width: '100%', maxWidth: '1180px', display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
            {(flowChips ?? []).map((fc, $index) => (
              <Fragment key={$index}>
                <Pressable as="button" onClick={fc.go} style={{ position: 'relative', border: '0', background: 'transparent', borderRadius: '8px', padding: '6px 10px', fontSize: '12px', fontWeight: '500', color: '#6E574B', transition: 'color .18s ease' }} hoverStyle={{ color: '#3A1F14' }}>
                  {fc.active ? (
                    <>
                      <span style={{ position: 'absolute', inset: '0', background: '#FFFFFF', border: '1px solid #E75F23', borderRadius: '8px', animation: 'hcFade .18s ease-out' }} />
                    </>
                  ) : null}
                  <span style={{ position: 'relative' }}>{fc.label}</span>
                </Pressable>
              </Fragment>
            ))}
          </div>
        </>
      ) : null}
      {flow ? (
        <>
          <div style={{ width: '100%', maxWidth: '1180px', background: '#3A1F14', color: '#FFF5E5', borderRadius: '12px', padding: '11px 14px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', animation: 'hcRise .22s ease-out' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '.04em', background: '#C24A15', color: '#FFFFFF', padding: '3px 8px', borderRadius: '6px' }}>
              {flow.tag}
            </span>
            <span style={{ fontSize: '13px', fontWeight: '600' }}>{flow.title}</span>
            <span style={{ fontSize: '12px', color: '#C6AC9B', fontVariantNumeric: 'tabular-nums' }}>{flow.progress}</span>
            <span style={{ fontSize: '13px', color: '#F1E2D3', marginRight: 'auto', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Next: {flow.next}
            </span>
            {flow.away ? (
              <>
                <button onClick={flow.goToStep} style={{ background: '#C24A15', border: '0', color: '#FFFFFF', borderRadius: '8px', padding: '6px 11px', fontSize: '12px', fontWeight: '600' }}>
                  {flow.awayLabel}
                </button>
              </>
            ) : null}
            <button onClick={clearFlow} style={{ background: 'rgba(255,245,229,.12)', border: '1px solid rgba(255,245,229,.25)', color: '#FFF5E5', borderRadius: '8px', padding: '6px 11px', fontSize: '12px', fontWeight: '600' }}>
              Exit
            </button>
          </div>
        </>
      ) : null}
      <div style={bareFrame ? { width: '100%', display: 'flex' } : { width: '100%', overflow: 'auto', display: 'flex', justifyContent: 'center', padding: '4px 0 8px' }}>
        <div style={s(frameOuterStyle)}>
          <div style={s(frameStyle)}>
            {showRail ? (
              <>
                <div style={s(`width: ${railW}; flex-shrink: 0; background: #FCFBFA; border-right: 1px solid #EDE8E4; display: flex; flex-direction: column; padding: 16px 12px 14px`)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '0 6px 14px' }}>
                    <img src="/assets/mark-solid.png" alt="" style={{ height: '28px', width: 'auto' }} />
                    <span style={{ fontSize: '13px', fontWeight: '600', letterSpacing: '-.1px' }}>Happy Cookie Ops</span>
                  </div>
                  <Pressable as="button" onClick={openQuick} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', height: '44px', border: '0', borderRadius: '12px', background: '#C24A15', color: '#FFFFFF', fontSize: '13px', fontWeight: '600', marginBottom: '14px', boxShadow: '0 2px 8px -2px rgba(231,95,35,.5)', transition: 'transform .16s cubic-bezier(.2,.8,.2,1), background-color .2s ease' }} hoverStyle={{ background: '#A93D0F' }} activeStyle={{ transform: 'scale(.98)' }}>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
                      <path d={ic.plus} />
                    </svg>
                    Quick add
                    {' '}
                  </Pressable>
                  <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={s(railPillStyle)} />
                    {(railNav ?? []).map((n, $index) => (
                      <Fragment key={$index}>
                        <button onClick={n.go} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '10px', width: '100%', minHeight: '42px', border: '0', background: 'transparent', borderRadius: '10px', padding: '0 10px', fontSize: '13px', fontWeight: '500', color: '#3A1F14', textAlign: 'left', transition: 'color .2s ease' }}>
                          <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'relative', flexShrink: '0' }}>
                            <path d={n.icon} />
                          </svg>
                          <span style={{ position: 'relative', flex: '1' }}>{n.label}</span>
                          {n.badge ? (
                            <>
                              <span style={{ position: 'relative', minWidth: '20px', height: '20px', padding: '0 6px', borderRadius: '999px', background: '#C24A15', color: '#FFFFFF', fontSize: '11px', fontWeight: '700', display: 'grid', placeItems: 'center', fontVariantNumeric: 'tabular-nums' }}>
                                {n.badge}
                              </span>
                            </>
                          ) : null}
                        </button>
                      </Fragment>
                    ))}
                  </div>
                  <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: '9px', padding: '12px 6px 0', borderTop: '1px solid #EDE8E4' }}>
                    <span style={{ width: '28px', height: '28px', borderRadius: '999px', background: '#3A1F14', color: '#FFF5E5', display: 'grid', placeItems: 'center', fontSize: '12px', fontWeight: '600' }}>
                      {roleInitial}
                    </span>
                    <span style={{ fontSize: '12px', color: '#6E574B' }}>{roleWho}</span>
                  </div>
                </div>
              </>
            ) : null}
            <div style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', background: '#FFFFFF', position: 'relative', overflow: 'hidden' }}>
              {showTopBar ? (
                <>
                  <div style={{ flexShrink: '0', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'rgba(255,255,255,.82)', backdropFilter: 'blur(20px) saturate(1.4)', WebkitBackdropFilter: 'blur(20px) saturate(1.4)', borderBottom: '1px solid #EDE8E4', zIndex: '20' }}>
                    {showBack ? (
                      <>
                        <Pressable as="button" onClick={goBack} aria-label="Back" style={{ width: '42px', height: '42px', flexShrink: '0', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '10px', display: 'grid', placeItems: 'center', transition: 'transform .16s cubic-bezier(.2,.8,.2,1)' }} activeStyle={{ transform: 'scale(.96)' }}>
                          <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="#3A1F14" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                            <path d={ic.back} />
                          </svg>
                        </Pressable>
                      </>
                    ) : null}
                    <div style={s(`display: flex; flex-direction: column; min-width: 0; margin-right: auto; animation: ${screenAnim}`)}>
                      <span style={{ fontSize: '17px', fontWeight: '600', letterSpacing: '-.2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {pageTitle}
                      </span>
                      {pageSub ? (
                        <>
                          <span style={{ fontSize: '11px', color: '#66524A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {pageSub}
                          </span>
                        </>
                      ) : null}
                    </div>
                    {offline ? (
                      <>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#F4F1EE', border: '1px solid #E4DDD8', color: '#5D4B41', borderRadius: '999px', padding: '5px 10px', fontSize: '11px', fontWeight: '600', flexShrink: '0' }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '999px', background: '#66524A', animation: 'hcBreathe 1.8s infinite' }} />
                          Offline
                          {' '}
                        </span>
                      </>
                    ) : null}
                    <Pressable as="button" onClick={openNotifications} aria-label="Notifications" style={{ position: 'relative', width: '42px', height: '42px', flexShrink: '0', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '10px', display: 'grid', placeItems: 'center', transition: 'transform .16s cubic-bezier(.2,.8,.2,1)' }} activeStyle={{ transform: 'scale(.96)' }}>
                      <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="#3A1F14" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d={ic.bell} />
                      </svg>
                      {hasAlerts ? (
                        <>
                          <span style={{ position: 'absolute', top: '6px', right: '6px', width: '8px', height: '8px', borderRadius: '999px', background: '#E75F23', border: '1.5px solid #FFFFFF' }} />
                        </>
                      ) : null}
                    </Pressable>
                    <span style={{ width: '32px', height: '32px', flexShrink: '0', borderRadius: '999px', background: '#3A1F14', color: '#FFF5E5', display: 'grid', placeItems: 'center', fontSize: '12px', fontWeight: '600' }}>
                      {roleInitial}
                    </span>
                  </div>
                </>
              ) : null}
              <div style={{ flex: '1', minHeight: '0', overflowY: 'auto', overflowX: 'hidden' }}>
                <div style={s(`padding: ${pagePad}; max-width: ${pageMax}; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; animation: ${screenAnim}`)}>
                  {denied ? (
                    <>
                      <div style={{ padding: '40px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', textAlign: 'center' }}>
                        <span style={{ width: '46px', height: '46px', borderRadius: '14px', background: '#F4F1EE', display: 'grid', placeItems: 'center' }}>
                          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#6E574B" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                            <path d={ic.alert} />
                          </svg>
                        </span>
                        <span style={{ fontSize: '20px', fontWeight: '600' }}>{deniedTitle}</span>
                        <p style={{ margin: '0', maxWidth: '320px', fontSize: '14px', lineHeight: '1.55', color: '#6E574B' }}>
                          {deniedText}
                        </p>
                        <button onClick={deniedHome} style={{ marginTop: '4px', height: '44px', padding: '0 18px', border: '0', borderRadius: '12px', background: '#3A1F14', color: '#FFF5E5', fontSize: '13px', fontWeight: '600' }}>
                          Back to what you can do
                        </button>
                      </div>
                    </>
                  ) : null}
                  {bareFrame && v.liveScreen ? <LiveScreenHost v={v} /> : null}
                  {screens.today ? <HomeScreen v={v} /> : null}
                  {screens.sales ? <SalesLogScreen v={v} /> : null}
                  {screens.orders ? <OrdersScreen v={v} /> : null}
                  {screens.order ? <OrderDetailScreen v={v} /> : null}
                  {screens.bake ? <BakePlanScreen v={v} /> : null}
                  {screens.batch ? <ProductionFocusScreen v={v} /> : null}
                  {screens.inventory ? <InventoryScreen v={v} /> : null}
                  {screens.reconcile ? <PaymentsScreen v={v} /> : null}
                  {screens.more ? <AllToolsScreen v={v} /> : null}
                  {screens.grocery ? <GroceryListScreen v={v} /> : null}
                  {screens.pnl ? <ProfitAndLossScreen v={v} /> : null}
                  {screens.bazaar ? <BazaarModeScreen v={v} /> : null}
                  {screens.formqueue ? <FormQueueScreen v={v} /> : null}
                  {screens.health ? <SystemHealthScreen v={v} /> : null}
                  {screens.products ? <ProductsScreen v={v} /> : null}
                  {screens.drops ? <DropsScreen v={v} /> : null}
                  {screens.suppliers ? <SuppliersScreen v={v} /> : null}
                  {screens.settings ? <SettingsScreen v={v} /> : null}
                  {screens.recipes ? <RecipesScreen v={v} /> : null}
                  {screens.notifications ? <NotificationsScreen v={v} /> : null}
                  {screens.lookup ? <FindMyOrderScreen v={v} /> : null}
                  {screens.shop ? <ShopScreen v={v} /> : null}
                  {screens.checkout ? <CheckoutScreen v={v} /> : null}
                  {screens.status ? <OrderStatusScreen v={v} /> : null}
                </div>
              </div>
              {sheet ? (
                <>
                  <div onClick={closeSheet} style={{ position: 'absolute', inset: '0', zIndex: '65', background: 'rgba(58,31,20,.32)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', animation: 'hcFade .18s ease-out' }}>
                    <div onClick={stopClick} style={s(`${sheetStyle}; background: rgba(255,255,255,.9); backdrop-filter: blur(32px) saturate(1.5); -webkit-backdrop-filter: blur(32px) saturate(1.5); border: 1px solid rgba(255,255,255,.55); box-shadow: 0 -10px 44px -14px rgba(58,31,20,.3); animation: hcSheet .26s cubic-bezier(.2,.8,.2,1)`)}>
                      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ flex: '1', minWidth: '0', fontSize: '17px', fontWeight: '600', letterSpacing: '-.2px' }}>
                            {sheet.title}
                          </span>
                          <button onClick={closeSheet} aria-label="Close" style={{ width: '38px', height: '38px', border: '0', background: 'rgba(58,31,20,.06)', borderRadius: '999px', display: 'grid', placeItems: 'center', flexShrink: '0' }}>
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#3A1F14" strokeWidth="1.8" strokeLinecap="round">
                              <path d={ic.close} />
                            </svg>
                          </button>
                        </div>
                        {sheet.isWhy ? <WhySheet v={v} /> : null}
                        {sheet.isInvEdit ? <InvEditSheet v={v} /> : null}
                        {sheet.isAddInv ? <AddInvSheet v={v} /> : null}
                        {sheet.isSupplier ? <SupplierSheet v={v} /> : null}
                        {sheet.isPay ? <PaySheet v={v} /> : null}
                        {sheet.isExpense ? <ExpenseSheet v={v} /> : null}
                        {sheet.isCategories ? <CategoriesSheet v={v} /> : null}
                        {sheet.isCloseout ? <CloseoutSheet v={v} /> : null}
                        {sheet.isEvExp ? <EvExpSheet v={v} /> : null}
                        {sheet.isProof ? <ProofSheet v={v} /> : null}
                        {sheet.isUsers ? <UsersSheet v={v} /> : null}
                        {sheet.isCustomers ? <CustomersSheet v={v} /> : null}
                        {sheet.isPayRules ? <PayRulesSheet v={v} /> : null}
                        {sheet.isStatuses ? <StatusesSheet v={v} /> : null}
                        {bakedSheet ? (
                          <>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '11px' }}>
                                <span style={s(bakedSheet.imgStyle)} />
                                <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                  <span style={{ fontSize: '15px', fontWeight: '600' }}>{bakedSheet.name}</span>
                                  <span style={{ fontSize: '13px', color: '#6E574B' }}>{bakedSheet.count}</span>
                                </span>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', background: '#F8F6F4', borderRadius: '12px', padding: '11px 12px' }}>
                                <span style={{ fontSize: '12px', color: '#6E574B' }}>{bakedSheet.committed}</span>
                                <span style={{ fontSize: '12px', color: '#6E574B' }}>{bakedSheet.free}</span>
                                <span style={{ fontSize: '12px', color: '#66524A' }}>{bakedSheet.lastBatch}</span>
                              </div>
                              {bakedSheet.shortfall ? (
                                <>
                                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', background: '#FDF3E2', border: '1px solid #EFDCB5', borderRadius: '12px', padding: '11px' }}>
                                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#95600A" strokeWidth="1.8" strokeLinecap="round" style={{ flexShrink: '0', marginTop: '1px' }}>
                                      <path d={ic.alert} />
                                    </svg>
                                    <span style={{ fontSize: '12px', color: '#7A4E08', lineHeight: '1.45' }}>
                                      {bakedSheet.shortfall} more are still needed for this drop.
                                    </span>
                                  </div>
                                </>
                              ) : null}
                              <button onClick={bakedSheet.toBake} style={{ minHeight: '48px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '12px', fontSize: '14px', fontWeight: '600' }}>
                                Open the bake plan
                              </button>
                              <button onClick={bakedSheet.toBazaar} style={{ minHeight: '44px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '11px', fontSize: '13px', fontWeight: '600' }}>
                                Load onto an event table
                              </button>
                              <button onClick={bakedSheet.writeOff} style={{ minHeight: '44px', border: '1px solid #F2CFCB', background: '#FFFFFF', borderRadius: '11px', fontSize: '13px', fontWeight: '600', color: '#A8231B' }}>
                                Write off broken or stale ones
                              </button>
                              <span style={{ fontSize: '11px', color: '#66524A' }}>
                                Baked stock only changes when you confirm a batch, pack an order or record a sale.
                              </span>
                            </div>
                          </>
                        ) : null}
                        {doughSheet ? (
                          <>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                              <span style={{ fontSize: '15px', fontWeight: '600' }}>{doughSheet.name} · {doughSheet.qty}</span>
                              <span style={{ fontSize: '13px', color: '#6E574B' }}>{doughSheet.stored}</span>
                              {doughSheet.aged ? (
                                <>
                                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', background: '#FDF3E2', border: '1px solid #EFDCB5', borderRadius: '12px', padding: '11px' }}>
                                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#95600A" strokeWidth="1.8" strokeLinecap="round" style={{ flexShrink: '0', marginTop: '1px' }}>
                                      <path d={ic.clock} />
                                    </svg>
                                    <span style={{ fontSize: '12px', color: '#7A4E08', lineHeight: '1.45' }}>
                                      Check this batch before you bake it. Nothing is marked unusable automatically — you decide.
                                    </span>
                                  </div>
                                </>
                              ) : null}
                              <button onClick={doughSheet.keep} style={{ minHeight: '48px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '12px', fontSize: '14px', fontWeight: '600' }}>
                                Still usable
                              </button>
                              <button onClick={doughSheet.discard} style={{ minHeight: '44px', border: '1px solid #F2CFCB', background: '#FFFFFF', borderRadius: '11px', fontSize: '13px', fontWeight: '600', color: '#A8231B' }}>
                                Discard as spoilage
                              </button>
                            </div>
                          </>
                        ) : null}
                        {sheet.isSwap ? <SwapSheet v={v} /> : null}
                        {sheet.isRules ? <RulesSheet v={v} /> : null}
                        {sheet.isStorage ? <StorageSheet v={v} /> : null}
                        {sheet.isReset ? <ResetSheet v={v} /> : null}
                        {sheet.isRetention ? <RetentionSheet v={v} /> : null}
                        {sheet.isCloseDrop ? <CloseDropSheet v={v} /> : null}
                        {sheet.isOverage ? <OverageSheet v={v} /> : null}
                        {sheet.isReceive ? <ReceiveSheet v={v} /> : null}
                        {sheet.isRefund ? <RefundSheet v={v} /> : null}
                        {sheet.isNoShow ? <NoShowSheet v={v} /> : null}
                        {sheet.isSpoil ? <SpoilSheet v={v} /> : null}
                        {sheet.isDraw ? <DrawSheet v={v} /> : null}
                        {drill ? (
                          <>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              <span style={{ fontSize: '12px', color: '#66524A' }}>{drill.sub}</span>
                              {drill.empty ? (
                                <>
                                  <span style={{ fontSize: '13px', color: '#6E574B', lineHeight: '1.5' }}>
                                    No records behind this one in the last 30 days.
                                  </span>
                                </>
                              ) : null}
                              {(drill.rows ?? []).map((dr, $index) => (
                                <Fragment key={$index}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 0', borderBottom: '1px solid #F2EEEB' }}>
                                    <span style={{ fontSize: '11px', color: '#66524A', width: '58px', flexShrink: '0' }}>
                                      {dr.when}
                                    </span>
                                    <span style={{ flex: '1', minWidth: '0', fontSize: '13px' }}>{dr.what}</span>
                                    <span style={{ fontSize: '13px', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>
                                      {dr.amountText}
                                    </span>
                                  </div>
                                </Fragment>
                              ))}
                              {drill.hasRows ? (
                                <>
                                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', paddingTop: '2px' }}>
                                    <span style={{ fontSize: '13px', color: '#6E574B' }}>Total</span>
                                    <span style={{ marginLeft: 'auto', fontSize: '20px', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>
                                      {drill.totalText}
                                    </span>
                                  </div>
                                </>
                              ) : null}
                            </div>
                          </>
                        ) : null}
                        {sheet.isDropState ? <DropStateSheet v={v} /> : null}
                        {mix ? (
                          <>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                              <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                <span style={{ fontSize: '11px', fontWeight: '600', color: '#6E574B' }}>Flavour</span>
                                <select value={mix.pid} onChange={mix.setFlavour} style={{ height: '48px', border: '1px solid #E7E1DC', borderRadius: '12px', padding: '0 11px', fontSize: '15px', fontWeight: '600', background: '#FFFFFF', color: '#3A1F14' }}>
                                  {(bakeFlavours ?? []).map((mf, $index) => (
                                    <Fragment key={$index}>
                                      <option value={mf.id}>{mf.label}</option>
                                    </Fragment>
                                  ))}
                                </select>
                              </label>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                <button onClick={mix.pickFull} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px', minHeight: '66px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '13px', padding: '11px 13px', textAlign: 'left' }}>
                                  {mix.isFull ? (
                                    <>
                                      <span style={{ position: 'absolute', inset: '-1px', border: '2px solid #E75F23', borderRadius: '13px', animation: 'hcFade .18s ease-out' }} />
                                    </>
                                  ) : null}
                                  <span style={{ position: 'relative', fontSize: '13px', fontWeight: '600' }}>Full recipe</span>
                                  <span style={{ position: 'relative', fontSize: '20px', fontWeight: '600', fontVariantNumeric: 'tabular-nums', letterSpacing: '-.4px' }}>
                                    {mix.fullBalls}
                                  </span>
                                </button>
                                <button onClick={mix.pickHalf} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px', minHeight: '66px', border: '1px solid #E7E1DC', background: '#FFFFFF', borderRadius: '13px', padding: '11px 13px', textAlign: 'left' }}>
                                  {mix.isHalf ? (
                                    <>
                                      <span style={{ position: 'absolute', inset: '-1px', border: '2px solid #E75F23', borderRadius: '13px', animation: 'hcFade .18s ease-out' }} />
                                    </>
                                  ) : null}
                                  <span style={{ position: 'relative', fontSize: '13px', fontWeight: '600' }}>Half recipe</span>
                                  <span style={{ position: 'relative', fontSize: '20px', fontWeight: '600', fontVariantNumeric: 'tabular-nums', letterSpacing: '-.4px' }}>
                                    {mix.halfBalls}
                                  </span>
                                </button>
                              </div>
                              <span style={{ fontSize: '12px', color: '#66524A', textAlign: 'center' }}>
                                {mix.ballsText} · {mix.gramText} · 80 g each
                              </span>
                              {(mix.rows ?? []).map((mr, $index) => (
                                <Fragment key={$index}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0', borderBottom: '1px solid #F2EEEB' }}>
                                    <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column' }}>
                                      <span style={{ fontSize: '13px' }}>{mr.name}</span>
                                      <span style={{ fontSize: '11px', color: '#66524A' }}>{mr.onHandText}</span>
                                    </span>
                                    {mr.short ? (
                                      <>
                                        <span style={{ fontSize: '13px', fontWeight: '600', fontVariantNumeric: 'tabular-nums', color: '#A8231B' }}>
                                          {mr.amountText}
                                        </span>
                                      </>
                                    ) : null}
                                    {mr.amountText ? (
                                      <>
                                        <span style={{ fontSize: '13px', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>
                                          {mr.amountText}
                                        </span>
                                      </>
                                    ) : null}
                                  </div>
                                </Fragment>
                              ))}
                              <button onClick={mix.confirm} style={{ minHeight: '50px', border: '0', borderRadius: '12px', background: '#1B7A4B', color: '#FFFFFF', fontSize: '14px', fontWeight: '600' }}>
                                Record dough and deduct
                              </button>
                            </div>
                          </>
                        ) : null}
                        {sheet.isPricing ? <PricingSheet v={v} /> : null}
                        {sheet.isEditPrice ? <EditPriceSheet v={v} /> : null}
                        {bareFrame && sheet.liveForm ? <LiveFormHost v={v} /> : null}
                      </div>
                    </div>
                  </div>
                </>
              ) : null}
              {showDock ? (
                <>
                  <Pressable as="button" onClick={openQuick} aria-label="Quick add" style={{ position: 'absolute', right: '14px', bottom: '84px', zIndex: '31', width: '58px', height: '58px', border: '0', borderRadius: '20px', background: '#C24A15', color: '#FFFFFF', display: 'grid', placeItems: 'center', boxShadow: '0 8px 20px -8px rgba(231,95,35,.5), inset 0 1px 0 rgba(255,255,255,.28)', transition: 'transform .18s cubic-bezier(.32,1.3,.4,1), background-color .2s ease' }} hoverStyle={{ background: '#A93D0F' }} activeStyle={{ transform: 'scale(.92)' }}>
                    <svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d={ic.plus} />
                    </svg>
                  </Pressable>
                  <div style={{ position: 'absolute', left: '12px', right: '12px', bottom: '12px', zIndex: '30', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ position: 'relative', flex: '1', minWidth: '0', display: 'flex', alignItems: 'stretch', gap: '0', padding: '6px', borderRadius: '22px', background: 'rgba(255,255,255,.8)', backdropFilter: 'blur(22px) saturate(1.6)', WebkitBackdropFilter: 'blur(22px) saturate(1.6)', border: '1px solid rgba(58,31,20,.09)', boxShadow: '0 10px 28px -10px rgba(58,31,20,.30), inset 0 1px 0 rgba(255,255,255,.9)' }}>
                      <span style={s(dockPillStyle)} />
                      {(dockNav ?? []).map((d, $index) => (
                        <Fragment key={$index}>
                          <Pressable as="button" onClick={d.go} aria-label={d.label} title={d.label} style={{ position: 'relative', flex: '1', minWidth: '0', minHeight: '50px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px', border: '0', background: 'transparent', borderRadius: '16px', color: '#3A1F14', transition: 'transform .16s cubic-bezier(.2,.8,.2,1)' }} activeStyle={{ transform: 'scale(.92)' }}>
                            <span style={{ position: 'relative', display: 'block' }}>
                              <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                                <path d={d.icon} />
                              </svg>
                              {d.badge ? (
                                <>
                                  <span style={{ position: 'absolute', top: '-4px', right: '-7px', minWidth: '16px', height: '16px', padding: '0 4px', borderRadius: '999px', background: '#C24A15', color: '#FFFFFF', fontSize: '10px', fontWeight: '700', display: 'grid', placeItems: 'center' }}>
                                    {d.badge}
                                  </span>
                                </>
                              ) : null}
                            </span>
                            {bareFrame ? (
                              <>
                                <span style={{ position: 'relative', fontSize: '10px', fontWeight: '600', lineHeight: '1', whiteSpace: 'nowrap' }}>{d.label}</span>
                              </>
                            ) : null}
                            {d.active ? (
                              <>
                                <span style={{ position: 'relative', width: '14px', height: '3px', borderRadius: '999px', background: '#E75F23', animation: 'hcFade .3s ease-out' }} />
                              </>
                            ) : null}
                          </Pressable>
                        </Fragment>
                      ))}
                    </div>
                  </div>
                </>
              ) : null}
              {quickOpen ? (
                <>
                  <div onClick={closeQuick} style={{ position: 'absolute', inset: '0', zIndex: '70', background: 'rgba(58,31,20,.28)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '14px', animation: 'hcFade .18s ease-out' }}>
                    <div onClick={stopClick} style={{ width: '100%', maxWidth: '460px', borderRadius: '26px', padding: '8px', background: 'rgba(255,255,255,.86)', backdropFilter: 'blur(28px) saturate(1.6)', WebkitBackdropFilter: 'blur(28px) saturate(1.6)', border: '1px solid rgba(58,31,20,.09)', boxShadow: '0 24px 50px -16px rgba(58,31,20,.36), inset 0 1px 0 rgba(255,255,255,.9)', animation: 'hcSheet .26s cubic-bezier(.2,.8,.2,1)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px 10px' }}>
                        <span style={{ fontSize: '13px', fontWeight: '600' }}>Quick add</span>
                        <button onClick={closeQuick} aria-label="Close" style={{ width: '32px', height: '32px', border: '0', background: 'rgba(58,31,20,.06)', borderRadius: '999px', display: 'grid', placeItems: 'center' }}>
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#3A1F14" strokeWidth="1.8" strokeLinecap="round">
                            <path d={ic.close} />
                          </svg>
                        </button>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {(quickActions ?? []).map((q, $index) => (
                          <Fragment key={$index}>
                            <Pressable as="button" onClick={q.go} style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', textAlign: 'left', minHeight: '58px', border: '0', background: 'transparent', borderRadius: '18px', padding: '10px 12px', transition: 'background-color .2s ease, transform .16s cubic-bezier(.2,.8,.2,1)' }} hoverStyle={{ background: 'rgba(58,31,20,.05)' }} activeStyle={{ transform: 'scale(.99)' }}>
                              <span style={{ width: '38px', height: '38px', borderRadius: '12px', background: '#FFFFFF', border: '1px solid #EDE8E4', display: 'grid', placeItems: 'center', flexShrink: '0' }}>
                                <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="#C24A15" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                                  <path d={q.icon} />
                                </svg>
                              </span>
                              <span style={{ flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ fontSize: '14px', fontWeight: '600' }}>{q.label}</span>
                                  {q.suggested ? (
                                    <>
                                      <span style={{ background: '#FDEDE5', color: '#A63C0E', borderRadius: '5px', padding: '2px 6px', fontSize: '10px', fontWeight: '600' }}>
                                        Suggested here
                                      </span>
                                    </>
                                  ) : null}
                                </span>
                                <span style={{ fontSize: '12px', color: '#6E574B' }}>{q.sub}</span>
                              </span>
                            </Pressable>
                          </Fragment>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              ) : null}
              {toast ? (
                <>
                  <div style={s(toastStyle)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#3A1F14', color: '#FFF5E5', borderRadius: '14px', padding: '12px 14px', boxShadow: '0 14px 30px -10px rgba(58,31,20,.5)', animation: 'hcRise .22s cubic-bezier(.2,.8,.2,1)' }}>
                      {toastWarn ? (
                        <>
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#FFC9A6" strokeWidth="1.8" strokeLinecap="round" style={{ flexShrink: '0' }}>
                            <path d={ic.alert} />
                          </svg>
                        </>
                      ) : null}
                      {toastOk ? (
                        <>
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#8FD9B0" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: '0' }}>
                            <path d={ic.check} />
                          </svg>
                        </>
                      ) : null}
                      <span style={{ flex: '1', fontSize: '13px', lineHeight: '1.4' }}>{toast.msg}</span>
                      {toast.undo ? (
                        <>
                          <button onClick={runUndo} style={{ flexShrink: '0', minHeight: '40px', padding: '0 12px', border: '1px solid rgba(255,245,229,.3)', background: 'rgba(255,245,229,.14)', color: '#FFF5E5', borderRadius: '9px', fontSize: '12px', fontWeight: '600' }}>
                            Undo
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
