import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { OpsRuntime } from '@/store/ops-runtime';
import { RouteSync } from '@/components/app/route-sync';
import bazaarAnswer from '@/../tests/fixtures/bazaar-example.json';
import { OwnerWorkspace } from '@/components/live/owner-workspace';
import { useOpsVals, useOpsEngine } from '@/store/use-ops';
import { registerLiveStockScreens } from '@/components/live/stock/register';
import { registerLiveRecipeScreens } from '@/components/live/recipes/register';
import { registerLiveBazaarScreens } from '@/components/live/bazaar/register';
import { registerLiveMoneyScreens } from '@/components/live/money/register';
import { registerLiveHomeScreens } from '@/components/live/home/register';
import { registerLiveSellScreens } from '@/components/live/sell/register';
import { registerLiveAccountScreens } from '@/components/live/account/register';
import { PRODUCTS } from '@/store/engine/ops-engine';
import { demoRecipes, demoStock, demoSuppliers } from './demo-records';
import '@/app/globals.css';
import '@/app/fonts/onest.css';
import latinFont from '@/app/fonts/onest-latin.woff2?url';

const font = document.createElement('style');
font.textContent = `@font-face { font-family: QAOnest; src: url(${JSON.stringify(latinFont)}) format('woff2'); font-weight: 400 700; }`;
document.head.appendChild(font);
document.documentElement.style.setProperty('--font-onest-latin', 'QAOnest');

registerLiveStockScreens();
registerLiveRecipeScreens();
registerLiveBazaarScreens();
registerLiveMoneyScreens();
registerLiveHomeScreens();
registerLiveSellScreens();
registerLiveAccountScreens();
const shopRules = {campus_from:'14:00',campus_to:'15:30',lead_max_days:14,lead_min_days:2,max_unpaid_per_phone:2,pickup_cutoff_hour:18,pickup_days:[3,6],pickup_from_hour:10,unpaid_hold_hours:24,updated_at:'2026-10-20T02:00:00.000Z'};
const shopExtras = {same_day_enabled:false,same_day_percent:20,same_day_on_extras:false,sampler_product_id:'sampler',sampler_max_qty:3,sampler_flavours:['dcf','hc','wcb'],box_sizes:[{size:6,charge_cents:2000,active:true},{size:8,charge_cents:2500,active:true},{size:12,charge_cents:3500,active:false}],add_ons:[{id:'note-card',name:'Note card',price_cents:1000,active:true,variants:[],text_label:'Message',text_max:150,max_qty:1},{id:'cream-ribbon',name:'Ribbon',price_cents:1500,active:true,variants:['Cream','Red','Gold'],text_label:null,text_max:150,max_qty:10}],updated_at:'2026-10-20T02:00:00.000Z'};
(window as unknown as {qaShopWrites:unknown[]}).qaShopWrites = [];
const flavours = PRODUCTS.map((p,i)=>({id:p.id,name:p.name,short_name:p.short,price_cents:Math.round(p.price*100),kind:p.kind,item_type:'cookie',capacity_weight:1,tag:p.tag,description:p.desc,image_path:p.img,allergens:'milk, eggs, wheat',active:p.id!=='nch',published:true,sort_order:i,updated_at:'2026-10-01T00:00:00.000Z'}));
flavours.push({...flavours[0],id:'sampler',name:'Sampler box',short_name:'Sampler',item_type:'set',kind:'set',price_cents:42000,sort_order:99});
const source = {
  id: 'qa-flour', name: 'All-purpose flour', category: 'Ingredients', unit: 'g', on_hand: 800,
  par_level: 100, pack_size: 1000, pack_label: '1 kg', supplier_id: null, use_by_days: null,
  last_counted: '2026-10-01T00:00:00.000Z', active: true, updated_at: '2026-10-01T00:00:00.000Z'
};
const suppliers = [
  {id:'qa-baking',name:'Baking Supply Co.',place:'Quezon City',phone:'',notes:'Morning delivery',active:true,updated_at:source.updated_at},
  {id:'qa-retired-supplier',name:'Previous supplier',place:'',phone:'',notes:'',active:false,updated_at:source.updated_at}
];
const fullDemo = !new URLSearchParams(window.location.search).has('baseline');
const prices = [{id:'a3a00000-0000-4000-8000-000000000001',supplier_id:'qa-baking',item_name:'All-purpose flour',pack_label:'1 kg bag',price_cents:8050,previous_cents:[7900,8000],last_bought:'2 Oct',preferred:true,active:true,updated_at:source.updated_at}];
const movements: unknown[] = [];
const production = {batches:[
  {product_id:'dcf',qty:24,target:24,rejects:2,version:3,at:Date.parse('2026-11-02T07:00:00Z')},
  {product_id:'hc',qty:9,target:12,rejects:1,version:2,at:Date.parse('2026-11-02T08:00:00Z')},
  {product_id:'wcb',qty:4,target:null,rejects:0,version:1,at:Date.parse('2026-11-02T08:30:00Z')}
],dough:[],baked:[{product_id:'dcf',qty:24},{product_id:'hc',qty:9},{product_id:'wcb',qty:4}],shortfalls:[]};
// The /bazaar fixture adds the real browser-history adapter; the ordinary fixture is unchanged.
const historyPreview = window.location.pathname === '/bazaar';
const historyAnswer = JSON.parse(JSON.stringify(bazaarAnswer));
historyAnswer.summary.booking.name = 'Katipunan market';
historyAnswer.summary.days = [historyAnswer.summary.days[0]];
Object.assign(historyAnswer.summary.days[0], {state:'open',closed_at:null,count:null,counted_cents:null,over_cents:null,short_cents:null});
Object.assign(historyAnswer,{finalised_at:null,final_hash:null,final_summary:null});
const client = { rpc: async (name: string, args?: Record<string, unknown>) => {
  (window as unknown as {qaCalls:string[]}).qaCalls.push(name);
  if(name==='get_scheduled_events') return {data:[{...historyAnswer.summary.booking,started:true,updated_at:'2026-10-20T02:00:00Z'}],error:null};
  if(name==='get_bazaar') return {data:historyAnswer,error:null};
  if(name==='get_shop_status') return {data:{open_dow:1,open_h:9,open_m:0,close_dow:4,close_h:21,close_m:0,extend_h:0,override:null},error:null};
  if(name==='get_order_rules') return {data:[shopRules],error:null};
  if(name==='get_order_extras') return {data:shopExtras,error:null};
  if(name==='save_order_rules'||name==='save_order_extras'){(window as unknown as {qaShopWrites:unknown[]}).qaShopWrites.push({name,args});const t=new Date().toISOString();if(name==='save_order_rules')Object.assign(shopRules,(args as {p_rules:object}).p_rules,{updated_at:t});else Object.assign(shopExtras,(args as {p_extras:object}).p_extras,{updated_at:t});return {data:null,error:null};}
  if(name==='get_books'){const d=86400000,t=Date.now(),L=(id:string,kind:string,cat:string,label:string,pesos:number,days:number)=>({id,kind,cat,label,amount_cents:pesos*100,at:t-days*d});
    return {data:{basis:'used',lines:[L('b1','revenue','Orders','Drop 31 · 14 orders paid',8400,26),L('b2','expense','Ingredients','Flour, butter and chocolate',5100,24),L('b3','revenue','Bazaar','Katipunan market · day 1',6250,19),L('b4','expense','Stall rent','Katipunan market stall',2000,19),L('b5','expense','Packaging','Cookie pouches',700,12),L('b6','revenue','Orders','Drop 32 · 9 orders paid',3600,5),L('b7','refund','Orders','Refund · order 1042',260,4),L('b8','expense','Ingredients','Biscoff spread and cream cheese',1480,3),L('b9','draw','Owner drawings','Owner draw',1500,2)],uncosted:[{id:'u1',kind:'use',item:'Cream cheese',qty:225,unit:'g',at:t-3*d}],receipts:[],held:[]},error:null};}
  if(name==='get_staff_orders'){const day=(n:number)=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);const O=(id:string,nm:string,state:string,pay:string,items:Array<[string,number]>,pickup:number,placed:number)=>({id,name:nm,phone:'09170000000',ig:'',state,pay_state:pay,pay_method:'GCash',pay_ref:pay==='unpaid'?null:'REF-'+id.slice(3),total_cents:items.reduce((t,[p,q])=>t+q*(PRODUCTS.find(x=>x.id===p)?.price??120)*100,0),paid_cents:pay==='confirmed'?items.reduce((t,[p,q])=>t+q*(PRODUCTS.find(x=>x.id===p)?.price??120)*100,0):null,refund_ref:null,pickup_date:day(pickup),pickup_window:'10:00',placed_at:new Date(Date.now()-placed*3600000).toISOString(),updated_at:'2026-11-01T02:00:00.000Z',status_token:'b'.repeat(64),holds:true,items:items.map(([p,q])=>({product_id:p,qty:q,unit_price_cents:(PRODUCTS.find(x=>x.id===p)?.price??120)*100,unavailable:false})),swaps:[]});
    return {data:[O('HC-1101','Bea Villanueva','Payment review','unpaid',[['dcf',3],['hc',3]],2,5),O('HC-1102','Miguel Santos','Confirmed','confirmed',[['wcb',4],['dcf',2]],2,20),O('HC-1103','Joanna Reyes','Preparing','confirmed',[['hc',6]],1,30),O('HC-1104','Karla Mendoza','Ready','confirmed',[['dcf',6]],0,40),O('HC-1105','Paolo Cruz','Confirmed','confirmed',[['wcb',3],['hc',3]],3,8)],error:null};}
  if(name==='get_production')return (window as unknown as {qaProductionFail?:boolean}).qaProductionFail ? {data:null,error:{code:'08006'}} : {data:(window as unknown as {qaProductionEmpty?:boolean}).qaProductionEmpty ? {batches:[],dough:[],baked:[],shortfalls:[]} : production,error:null};
  if(name==='get_flavours') return {data:flavours,error:null};
  if(name==='get_recipes') return (window as unknown as {qaRecipeFail?:boolean}).qaRecipeFail ? {data:null,error:{code:'08006'}} : {data:fullDemo?demoRecipes:[{product_id:'dcf',yield:12,version:3,updated_at:source.updated_at,lines:[{name:'Unsalted butter',qty:320,unit:'g'},{name:'Eggs',qty:2,unit:'pcs'}],history:[]}],error:null};
  if (name === 'get_stock_catalogue') return { data: { items: fullDemo ? [{...source,par_level:1000},...demoStock] : [source, { ...source, id: 'qa-butter', name: 'Unsalted butter', on_hand: 300, pack_size: 250, pack_label: '250 g' }, { ...source, id: 'qa-pouch', name: 'Cookie pouch', category: 'Packaging', unit: 'pcs', on_hand: 7, par_level: 10, pack_size: 25, pack_label: '25 pouches' }, { ...source, id: 'qa-old', name: 'Old packaging jar', active: false, category: 'Ingredients' }], suppliers:fullDemo?[...suppliers,...demoSuppliers]:suppliers, prices }, error: null };
  if (name === 'save_supplier') {
    const row = args!.p_supplier as typeof suppliers[number];
    const existing = suppliers.find(s=>s.id===row.id);
    if(existing)Object.assign(existing,row,{updated_at:new Date().toISOString()});
    else suppliers.push({...row,updated_at:new Date().toISOString()});
    (window as unknown as {qaSupplierWrites: unknown[]}).qaSupplierWrites.push(row);
    return {data:[{id:row.id,updated_at:new Date().toISOString()}],error:null};
  }
  if (name === 'save_supplier_price') {
    const row = args!.p_price as typeof prices[number];
    (window as unknown as {qaPriceRequests: unknown[]}).qaPriceRequests.push({...row});
    if ((window as unknown as {qaFailPrice?:boolean}).qaFailPrice) return {data:null,error:{code:'08006'}};
    const existing=prices.find(p=>p.id===row.id);
    if(existing && args!.p_expected_updated_at !== existing.updated_at) return {data:null,error:{code:'P0001',message:'CONFLICT'}};
    if(existing)Object.assign(existing,row,{previous_cents:existing.price_cents===row.price_cents?existing.previous_cents:[existing.price_cents,...existing.previous_cents],updated_at:new Date().toISOString()});
    else prices.push({...row,previous_cents:[],updated_at:new Date().toISOString()});
    (window as unknown as {qaPriceWrites: unknown[]}).qaPriceWrites.push({...row});
    return {data:[{id:row.id,updated_at:new Date().toISOString()}],error:null};
  }
  if (name === 'get_last_paid') return { data: [], error: null };
  if (name === 'get_item_movements') return (window as unknown as {qaHistoryFail?: boolean}).qaHistoryFail ? {data:null,error:{code:'08006'}} : { data: movements, error: null };
  if (name === 'record_stock_movement') {
    const fields = args!.p_movement as { id: string; item_id: string; qty: number };
    source.on_hand = fields.qty;
    source.last_counted = new Date().toISOString();
    (window as unknown as { qaWrites: unknown[] }).qaWrites.push(fields);
    return { data: [{ item_id: fields.item_id, on_hand: source.on_hand, duplicate: false }], error: null };
  }
  return { data: null, error: { code: 'PGRST202' }, status: 404 };
} };

function Frame({ navigationReady = false }: {navigationReady?: boolean}) {
  const v=useOpsVals(); const engine=useOpsEngine();
  return <>{historyPreview && navigationReady ? <RouteSync initialScreen="bazaar" /> : null}<OwnerWorkspace v={v} screen={engine.state.screen} role={engine.state.role} onAccount={()=>engine.go('settings')} /></>;
}
function App() {
  const ref = useRef<OpsRuntime | null>(null);
  const [navigationReady,setNavigationReady] = useState(false);
  useEffect(() => { const runtime = ref.current!; runtime.setRole('owner');
    const scope = {userId:'11111111-1111-4111-8111-111111111111',business:'https://preview.happy-cookie.test'};
    void runtime.setProductionIdentity(scope).then(()=>runtime.loadShopStatus(client as never)).then(() => runtime.loadFlavours(client as never)).then(() => runtime.loadStockCatalogue(client as never)).then(() => runtime.loadRecipes(client as never,undefined,undefined,scope)).then(() => runtime.loadOrders(client as never)).then(() => runtime.loadProduction(client as never)).then(() => runtime.loadBooks(client as never)).then(() => runtime.loadScheduledEvents(client as never)).then(() => {runtime.go(historyPreview ? 'bazaar' : 'inventory');setNavigationReady(true);});
  }, []);
  return <OpsRuntime ref={ref}><Frame navigationReady={navigationReady} /></OpsRuntime>;
}
(window as unknown as { qaWrites: unknown[] }).qaWrites = [];
(window as unknown as { qaSupplierWrites: unknown[] }).qaSupplierWrites = [];
(window as unknown as {qaPriceRequests:unknown[]}).qaPriceRequests = [];
(window as unknown as {qaPriceWrites:unknown[]}).qaPriceWrites = [];
(window as unknown as {qaCalls:string[]}).qaCalls = [];
(window as unknown as {qaProductIds:string[]}).qaProductIds = PRODUCTS.map(p=>p.id);
createRoot(document.getElementById('root')!).render(<App />);
