// Real RPCs on the disposable local SQL fixture. Never accepts a hosted origin or token.
const { chromium } = require('@playwright/test');
const fs = require('node:fs');
const assert = (ok, message) => { if (!ok) throw Error(message); };
const origin = process.env.HCO_LOCAL_RPC_ORIGIN;
const token = process.env.HCO_LOCAL_OWNER_JWT;
const anon = process.env.HCO_LOCAL_ANON_JWT;
const nonce = process.env.HCO_FIXTURE_NONCE;
const claims = JSON.parse(Buffer.from((token ?? '').split('.')[1] ?? '', 'base64url'));
assert(/^http:\/\/127\.0\.0\.1:4[5-8][0-9]{3}$/.test(origin ?? ''), 'A disposable loopback API origin is required');
assert(/^[a-f0-9]{32}$/.test(nonce ?? '') && claims.fixture_nonce === nonce && claims.iss === 'hco-local-fixture' && claims.role === 'authenticated' && claims.exp > Date.now()/1000, 'A current synthetic local owner token is required');
const width = Number(process.env.BAKE_WIDTH ?? 390);
const out = process.argv[2];
assert(out && [390,1440].includes(width), 'An output directory and supported viewport are required');
fs.mkdirSync(out, { recursive: true });
(async () => {
 const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
 const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: 'reduce' });
 const page = await context.newPage(), errors = [], attempts = [], bazaarAttempts = [];
 page.on('pageerror', e => errors.push(e.message));
 context.on('page',target=>target.on('pageerror',e=>errors.push(e.message)));
 await context.route('**/*', route => {
  const url = new URL(route.request().url());
  return url.origin === origin || url.origin === 'http://127.0.0.1:4186' ? route.continue() : route.abort();
 });
 await context.exposeFunction('noteProductionAttempt', (name, body) => attempts.push({ name, body }));
 await context.exposeFunction('noteBazaarAttempt', (name, body) => bazaarAttempts.push({name,body}));
 const connect = async (target=page,blocked=false,reuse=false) => {
  await target.waitForFunction(() => window.__hcOps?.state.screen === 'inventory', null, { timeout: 90000 });
  await target.evaluate(async ({ origin, token, anon, userId, reuse }) => {
   const { createClient } = await import('/connected-client.ts');
   const nativeFetch = window.fetch.bind(window);
   window.dropBakeReply = false; window.loseTransferAck=false; window.failCountReads=false;
   const client = reuse ? window.connectedProductionClient : createClient(origin, anon, { accessToken: async () => token, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    url.pathname = url.pathname.replace(/^\/rest\/v1/, '');
    const name = url.pathname.split('/').at(-1);
    if (name === 'get_production' && window.failCountReads) throw TypeError('Injected unavailable local count read');
    if (['add_bazaar_day_stock','save_bazaar_day','transfer_bazaar_stock','start_bazaar_day','record_event_sale','close_bazaar_day','finalise_bazaar'].includes(name)) await window.noteBazaarAttempt(name,JSON.parse(init.body));
    if (name === 'record_production') {await window.noteProductionAttempt(name,null);throw Error('A new production action attempted the retired writer');}
    if (name === 'record_bake' || name === 'record_dough_preparation') {await window.noteProductionAttempt(name, JSON.parse(init.body).p_rec);if(window.forbidProductionWrites)throw Error('Stale production write attempted');}
    const answer = await nativeFetch(url, init);
    if (name === 'record_bake' && answer.ok && window.dropBakeReply) {
     await answer.clone().json(); // The real transaction committed before losing its acknowledgement.
     window.dropBakeReply = false; window.loseTransferAck=false; window.failCountReads=false;
     throw TypeError('Injected lost local acknowledgement');
    }
    if (name === 'transfer_bazaar_stock' && answer.ok && window.loseTransferAck) {await answer.clone().json(); window.loseTransferAck=false; throw TypeError('Injected lost committed local transfer acknowledgement');}
    return answer;
   } } });
   window.connectedProductionClient = client;
   const r = window.__hcOps;
   await r.setProductionIdentity({ userId, business: origin });
   r.setState({ dropNo: 5 });
   await r.loadFlavours(client); await r.loadStockCatalogue(client); await r.loadRecipes(client, undefined, undefined, { userId, business: origin });
   await r.loadOrders(client); await r.loadProduction(client); r.go('bake');
  }, { origin, token, anon, userId: claims.sub, reuse });
  await target.waitForFunction(blocked => blocked ? window.__hcOps.renderVals().liveProduction?.recovery?.status==='locked' : !!window.__hcOps.renderVals().liveProduction?.start, blocked);
 };
 try {
  await page.goto('http://127.0.0.1:4186/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await connect();
  await page.evaluate(() => { window.__hcOps.go('recipes'); window.__hcOps.setState({ liveRecipeTarget: 'dcf' }); });
  await page.getByRole('button', { name: 'Create recipe', exact: true }).click();
  const lines = page.getByRole('list', { name: 'Recipe lines' });
  while (await lines.getByRole('button', { name: /^Remove / }).count())
   await lines.getByRole('button', { name: /^Remove / }).first().click();
  await page.getByRole('button', { name: 'Add ingredient', exact: true }).click();
  await page.getByLabel('Ingredient', { exact: true }).fill('Connected flour');
  await page.getByLabel('Quantity', { exact: true }).fill('250');
  await lines.getByRole('combobox', { name: /^Type/ }).selectOption('ingredient');
  await lines.getByRole('combobox', { name: /^Unit/ }).selectOption('g');
  for (let step = 0; step < 12; step++) {
   const yieldCount = await page.evaluate(() => window.__hcOps.renderVals().recipe.yieldNum);
   if (yieldCount === 12) break;
   await page.getByRole('button', { name: yieldCount < 12 ? 'Raise yield' : 'Lower yield', exact: true }).click();
  }
  assert(await page.evaluate(() => window.__hcOps.renderVals().recipe.yieldNum) === 12, 'First recipe did not retain the reviewed yield');
  await page.getByRole('button', { name: 'Review recipe', exact: true }).click();
  await page.getByRole('heading', { name: 'Review new recipe', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Create recipe', exact: true }).click();
  await page.waitForFunction(() => !window.__hcOps.renderVals().recipe.dirty);
  await page.getByRole('button', { name: 'Back to recipe', exact: true }).click();
  await page.getByText('Version 1 · Makes 12 cookies', { exact: true }).waitFor();
  await page.screenshot({ path: `${out}/first-recipe-${width}.png`, fullPage: true });
  await page.getByRole('button',{name:'Cost, history & edit',exact:true}).click();
  await page.getByRole('button', { name: 'Edit recipe', exact: true }).click();
  for(let step=0;step<2;step++)await page.getByRole('button',{name:'Raise yield',exact:true}).click();
  assert(await page.evaluate(()=>window.__hcOps.renderVals().recipe.yieldNum)===14,'Recipe edit lost the reviewed yield');
  await page.getByRole('button',{name:'Review recipe',exact:true}).click();
  await page.getByRole('heading',{name:'Review recipe changes',exact:true}).waitFor();
  await page.getByRole('button',{name:'Save new version',exact:true}).click();
  await page.waitForFunction(()=>!window.__hcOps.renderVals().recipe.dirty);
  await page.getByRole('button',{name:'Back to costs',exact:true}).click();
  await page.getByRole('button',{name:'Back to recipe',exact:true}).click();
  await page.getByText('Version 2 · Makes 14 cookies',{exact:true}).waitFor();
  await page.screenshot({path:`${out}/recipe-edited-${width}.png`,fullPage:true});

  await page.getByLabel('Cookies to make').fill('8');
  await page.getByRole('button', { name: 'Start production', exact: true }).click();
  await page.getByRole('region', { name: 'Production plan entry' }).waitFor();
  const choice = await page.evaluate(() => window.__hcOps.renderVals().liveProduction.start.multi.choices[0]);
  assert(choice.productId === 'dcf' && choice.quantity === '8' && choice.version === 2 && choice.kind === 'choose', 'Recipe handoff lost its quantity, version or explicit operation');
  await page.evaluate(() => window.__hcOps.renderVals().liveProduction.start.multi.setKind('dcf', 'batch'));
  await page.getByRole('button', { name: 'Review 1 product', exact: true }).click();
  await page.getByRole('button', { name: 'Start 1 production item', exact: true }).click();
  await page.evaluate(() => window.__hcOps.renderVals().liveProduction.inProgress.find(w => w.productId === 'dcf').open());
  await page.getByLabel('Cookies made, including rejects', { exact: true }).fill('8');
  await page.getByLabel('Rejects', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Review production', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm production', exact: true }).click();
  await page.getByText('Not enough recorded dough.', { exact: false }).waitFor();
  assert(!await page.getByRole('button', { name: 'Check saved result', exact: true }).count(), 'ZD001 became uncertain');
  await page.getByRole('button', { name: 'Leave for now', exact: true }).click();
  await page.evaluate(() => { const s = window.__hcOps.renderVals().liveProduction.start; s.open(); });
  await page.evaluate(() => window.__hcOps.renderVals().liveProduction.start.choose('dcf'));
  await page.evaluate(() => window.__hcOps.renderVals().liveProduction.start.chooseKind('dough'));
  await page.evaluate(() => window.__hcOps.renderVals().liveProduction.start.begin());
  await page.getByRole('spinbutton', { name: 'Actual dough balls made' }).fill('13');
  await page.getByRole('button', { name: 'Full recipe', exact: true }).click();
  await page.getByRole('button', { name: 'Review dough', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm dough', exact: true }).click();
  await page.waitForFunction(() => window.__hcOps.renderVals().liveProduction?.completed?.some(w => w.kind === 'dough'));
  await page.evaluate(() => window.__hcOps.renderVals().liveProduction.inProgress.find(w => w.productId === 'dcf').open());
  await page.evaluate(() => { window.actualNow = Date.now; Date.now = () => window.actualNow() - 3600000; });
  await page.getByRole('button', { name: 'Confirm production', exact: true }).click();
  await page.getByText('Recorded dough cannot support this bake date.', { exact: false }).waitFor();
  await page.evaluate(() => { Date.now = window.actualNow; window.dropBakeReply = true; });
  const retained = await page.evaluate(() => { const c = window.__hcOps.renderVals().liveBatchCounts; return { actual: c.actual, rejects: c.rejects, uncertain: c.uncertain }; });
  assert(retained.actual === '8' && retained.rejects === '2' && !retained.uncertain, 'ZD002 did not retain definite draft counts');
  await page.getByRole('region', { name: 'Dough used by baking' }).getByText('This bake uses 8 balls:', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Confirm production', exact: true }).click();
  await page.getByText('Save result not confirmed', { exact: true }).waitFor();
  await page.screenshot({ path: `${out}/unknown-${width}.png`, fullPage: true });
  const writes = attempts.length;
  await page.reload({ waitUntil: 'domcontentloaded' }); await connect();
  assert(attempts.length === writes, 'Reload automatically resubmitted production');
  await page.evaluate(() => window.__hcOps.renderVals().liveProduction.inProgress.find(w => w.productId === 'dcf').open());
  await page.getByRole('button', { name: 'Check saved result', exact: true }).click();
  await page.waitForFunction(() => window.__hcOps.renderVals().liveProduction?.inProgress?.length === 0);
  const facts = await page.evaluate(() => ({ dough: window.__hcOps.state.dough.dcf, baked: window.__hcOps.state.baked.dcf, overflow: document.documentElement.scrollWidth > innerWidth }));
  const bakes = attempts.filter(a => a.name === 'record_bake');
  assert(bakes.length === 4 && JSON.stringify(bakes[2].body) === JSON.stringify(bakes[3].body), 'Unknown bake did not replay its exact frozen body');
  assert(attempts.filter(a => a.name === 'record_dough_preparation').length === 1 && facts.dough === 5 && facts.baked === 6 && !facts.overflow && !errors.length, 'Connected production readback differs: ' + JSON.stringify({ facts, errors }));
  const authoritative = await page.evaluate(async () => {
   const production = await window.connectedProductionClient.rpc('get_production', { p_drop: 5 });
   const inventory = await window.connectedProductionClient.rpc('get_stock_catalogue');
   if (production.error || inventory.error) throw Error('Authoritative production/cost readback failed');
   const batches = production.data.batches.filter(b => b.product_id === 'dcf');
   return { batches: batches.length, cost: batches[0]?.cost_cents, complete: batches[0]?.cost_complete, flour: inventory.data.items.find(i => i.id === 'd074-flour')?.on_hand };
  });
  assert(authoritative.batches === 1 && authoritative.flour === 1750 && authoritative.complete && Math.abs(authoritative.cost - 500 * 8 / 13) < 0.001, 'Connected ingredient/cost effects differ: ' + JSON.stringify(authoritative));
  const writesBeforeShopping=attempts.length;
  await page.evaluate(()=>window.__hcOps.go('grocery'));
  await page.getByRole('button',{name:'Plan a bake',exact:true}).click();
  await page.getByRole('heading',{name:'Planned bake',exact:true}).waitFor();
  await page.getByRole('combobox',{name:'Product',exact:true}).selectOption('dcf');
  await page.getByRole('spinbutton',{name:'Cookies planned',exact:true}).fill('10001');
  await page.getByRole('button',{name:'Use this plan',exact:true}).click();
  await page.getByRole('button',{name:'Start production',exact:true}).click();
  await page.getByText('Shopping plan kept. Make accepts at most 10,000 cookies per product in one production entry.',{exact:true}).waitFor();
  assert(await page.evaluate(()=>window.__hcOps.renderVals().liveStock.bakePlan.cookies)===10001&&attempts.length===writesBeforeShopping,'Large plan was discarded or recorded');
  await page.screenshot({path:`${out}/shopping-limit-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'Edit planned bake',exact:true}).click();
  await page.getByRole('spinbutton',{name:'Cookies planned',exact:true}).fill('4');
  await page.getByRole('button',{name:'Use this plan',exact:true}).click();

  await page.getByRole('button',{name:'Start production',exact:true}).waitFor();
  await page.screenshot({path:`${out}/shopping-plan-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'Start production',exact:true}).click();
  await page.getByRole('region',{name:'Production plan entry',exact:true}).waitFor();
  const shoppingChoice=await page.evaluate(()=>window.__hcOps.renderVals().liveProduction.start.multi.choices[0]);
  assert(shoppingChoice.productId==='dcf'&&shoppingChoice.quantity==='4'&&shoppingChoice.version===2&&shoppingChoice.kind==='choose'&&attempts.length===writesBeforeShopping,'Shopping lost its quantity/version or started production implicitly');
  assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'Shopping handoff overflow');
  await page.screenshot({path:`${out}/shopping-handoff-${width}.png`,fullPage:true});
  await require('./connected-bazaar-journey.cjs').run({page,connect,bazaarAttempts,width,out,assert});
  await require('./connected-production-ownership.cjs').run({page,context,connect,attempts,width,out,assert});
  const stockWritesBefore=[attempts.length,bazaarAttempts.length];
  await page.evaluate(async()=>{
   const r=window.__hcOps,source=window.connectedProductionClient;
   window.failStockRead=true;
   window.stockReadClient={rpc:(name,args)=>name==='get_stock_catalogue'&&window.failStockRead?Promise.reject(TypeError('Injected inventory network failure')):source.rpc(name,args)};
   r.go('inventory');await r.loadStockCatalogue(window.stockReadClient);
  });
  await page.getByText('Inventory is unavailable',{exact:true}).waitFor();
  assert(await page.evaluate(()=>window.__hcOps.renderVals().liveStock===null),'A first inventory failure became an empty catalogue');
  await page.screenshot({path:`${out}/stock-read-unavailable-${width}.png`,fullPage:true});
  await page.evaluate(()=>{window.failStockRead=false;});
  await page.getByRole('button',{name:'Retry inventory',exact:true}).click();
  await page.waitForFunction(()=>window.__hcOps.renderVals().liveStockRead?.state==='ready');
  assert(await page.evaluate(()=>window.__hcOps.renderVals().liveStock.items.find(i=>i.name==='Connected flour')?.qtyText==='1,750 g'),'Inventory Retry did not read the real stock balance');
  await page.evaluate(async()=>{window.failStockRead=true;await window.__hcOps.loadStockCatalogue(window.stockReadClient);});
  await page.getByText('Inventory could not be refreshed',{exact:true}).waitFor();
  await page.screenshot({path:`${out}/stock-read-stale-${width}.png`,fullPage:true});
  await page.evaluate(()=>window.__hcOps.go('grocery'));
  await page.getByText('Inventory could not be refreshed',{exact:true}).waitFor();
  await page.screenshot({path:`${out}/shopping-read-stale-${width}.png`,fullPage:true});
  await page.evaluate(()=>window.__hcOps.go('suppliers'));
  await page.getByText('Inventory could not be refreshed',{exact:true}).waitFor();
  await page.screenshot({path:`${out}/suppliers-read-stale-${width}.png`,fullPage:true});
  await page.evaluate(()=>{window.failStockRead=false;});
  await page.getByRole('button',{name:'Retry inventory',exact:true}).click();
  await page.waitForFunction(()=>window.__hcOps.renderVals().liveStockRead?.state==='ready');
  assert(attempts.length===stockWritesBefore[0]&&bazaarAttempts.length===stockWritesBefore[1],'Inventory read recovery wrote a transaction');
  assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'Inventory recovery overflow');
  console.log(JSON.stringify({width,stockReadRecovery:true,realBalance:1750,staleWarnings:['inventory','shopping','suppliers'],noRecoveryWrites:true}));
  assert(!attempts.some(a=>a.name==='record_production'),'A new action attempted the retired production writer');
  await page.screenshot({ path: `${out}/saved-${width}.png`, fullPage: true });
  console.log(JSON.stringify({ width, realRpc: true, firstRecipe: true, recipeEdited: true, shoppingHandoff: true, recipeHandoff: true, definiteRefusals: ['ZD001','ZD002'], exactReloadRetry: true, dough: facts.dough, good: facts.baked, rejects: 2, errors }));
 } catch(error) { const debug=await page.evaluate(async()=>{
 const r=window.__hcOps,book='d079b000-0000-4000-8000-000000000001';
 const trim=(data)=>data?{booking:data.summary?.booking?.id,sold:data.summary?.days?.[0]?.lines?.[0]?.sold,revenue:data.summary?.days?.[0]?.revenue_cents}:null;
 const reads={};for(const [name,client] of [['connected',window.connectedProductionClient],['scheduled',r.scheduledClient],['sale',r.saleClient]]){try{const reply=await client.rpc('get_bazaar',{p_booking:book});reads[name]={...trim(reply.data),error:reply.error?.code??null};}catch(e){reads[name]={error:e.message};}}
 return {reads,scheduledSame:r.scheduledClient===window.connectedProductionClient,saleSame:r.saleClient===window.connectedProductionClient,cached:r.bazaarDays.data?.days?.map(d=>({id:d.id,sold:d.lines[0]?.sold,revenue:d.revenueCents})),reading:r.bazaarDays.reading,sales:r.state.sales?.map(s=>({id:s.id,total:s.total,synced:s.synced})),unsynced:r.state.unsynced,queue:r.dayQueue?{blocking:r.dayQueue.blocking,refused:[...r.dayQueue.refused]}:null};});fs.writeFileSync(`${out}/failure-${width}.json`,JSON.stringify({debug,bazaarAttempts},null,2)); fs.writeFileSync(`${out}/failure-${width}.txt`,await page.locator('body').innerText()); await page.screenshot({path:`${out}/failure-${width}.png`,fullPage:true}); throw error; } finally { await context.close(); await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
