// Run after preview:owner. Synthetic fault injection; separate from real SQL/API acceptance.
const { chromium } = require('@playwright/test');
const fs = require('node:fs');
const out = process.argv[2] ?? 'build/owner-preview-bake';
fs.mkdirSync(out, { recursive: true });
(async () => {
 const browser = await chromium.launch({ headless: true });
 try { for (const width of (process.env.BAKE_WIDTHS?.split(",").map(Number) ?? [320,390,768,1440])) for (const reducedMotion of ['no-preference','reduce']) {
  const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion });
  const page = await context.newPage(), errors = [], requests = [], records = new Map();
  let effects = 0, failRead = false;
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.exposeFunction('bakeRpc', async (name,args) => {
   if (name === 'get_production') return failRead ? {data:null,error:{code:'08006'}} : {data:{batches:[],dough:[{product_id:'dcf',balls:13,at:1793836800000}],baked:[],shortfalls:[]},error:null};
   if (name !== 'record_bake') throw Error('Unexpected request '+name);
   const body = structuredClone(args.p_rec); requests.push(body);
   if(requests.length < 3) return {data:null,error:{code:requests.length===1?'ZD001':'ZD002'}};
   if(!records.has(body.id)){records.set(body.id,body);effects++;return {data:null,error:{code:'08006'}};}
   if(JSON.stringify(records.get(body.id))!==JSON.stringify(body)) throw Error('Changed frozen bake');
   failRead=true;
   return {data:[{record_id:body.id,duplicate:true,used_dough:body.qty,shortfall:[]}],error:null};
  });
  const inject = async () => page.evaluate(async()=>{
    const r=window.__hcOps; await r.loadProduction({rpc:window.bakeRpc}); r.go('bake');
  });
  await page.goto('http://127.0.0.1:4186/',{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>window.__hcOps?.state.screen==='inventory',undefined,{timeout:90000});
  await inject();
  await page.waitForFunction(()=>window.__hcOps?.renderVals().liveProduction?.start?.products?.length>0);
  await page.evaluate(()=>window.__hcOps.renderVals().liveProduction.start.open());
  await page.evaluate(()=>window.__hcOps.renderVals().liveProduction.start.choose('dcf'));
  await page.evaluate(()=>window.__hcOps.renderVals().liveProduction.start.chooseKind('batch'));
  await page.evaluate(()=>window.__hcOps.renderVals().liveProduction.start.setQuantity('8'));
  await page.evaluate(()=>window.__hcOps.renderVals().liveProduction.start.begin());
  await page.getByLabel('Cookies made, including rejects',{exact:true}).fill('8');
  await page.getByLabel('Rejects',{exact:true}).fill('2');
  await page.getByRole('button',{name:'Review production',exact:true}).click();
  await page.getByRole('region',{name:'Dough used by baking'}).waitFor();
  if(await page.getByRole('region',{name:'Ingredients used',exact:true}).count()) throw Error('New bake shows ingredient writer');
  await page.screenshot({path:`${out}/review-${width}-${reducedMotion}.png`,fullPage:true});
  for(const expected of ['Not enough recorded dough.','Recorded dough cannot support this bake date.']) {
   await page.getByRole('button',{name:'Confirm production',exact:true}).click();
   await page.getByText(expected,{exact:false}).waitFor();
   if(await page.getByRole('button',{name:'Check saved result',exact:true}).count()) throw Error('Definite refusal became uncertain');
  }
  await page.getByRole('button',{name:'Confirm production',exact:true}).click();
  await page.getByText('Save result not confirmed',{exact:true}).waitFor();
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__hcOps?.state.screen==='inventory',undefined,{timeout:90000});
  await inject();
  await page.waitForFunction(()=>window.__hcOps?.renderVals().liveProduction?.inProgress?.length===1,undefined,{timeout:90000});
  await page.waitForFunction(()=>window.__hcOps?.renderVals().liveProduction?.start?.products?.length>0);
  await page.evaluate(()=>window.__hcOps.renderVals().liveProduction.inProgress[0].open());
  await page.evaluate(()=>{ window.__hcOps.loadStockCatalogue=async()=>false; });
  await page.getByRole('button',{name:'Check saved result',exact:true}).click();
  await page.getByText('Saved. Stock could not be refreshed.',{exact:true}).waitFor();
  const facts=await page.evaluate(()=>({remaining:window.__hcOps.renderVals().liveProduction.inProgress.length,overflow:document.documentElement.scrollWidth>innerWidth,receipt:window.__hcOps.renderVals().liveProduction.completed[0]}));
  if(requests.length!==4||JSON.stringify(requests[2])!==JSON.stringify(requests[3])||requests[0].id===requests[1].id||requests[1].id===requests[2].id||effects!==1||facts.remaining!==0||facts.overflow||errors.length||facts.receipt.quantity!==8||facts.receipt.rejects!==2||facts.receipt.usedDough!==8) throw Error(JSON.stringify({requests,effects,facts,errors}));
  await page.screenshot({path:`${out}/saved-${width}-${reducedMotion}.png`,fullPage:true});
  console.log(JSON.stringify({width,reducedMotion,definiteRefusals:2,reloadExactRetry:true,effects,good:6,rejects:2,usedDough:8,overflow:facts.overflow,errors}));
  await context.close();
 }} finally { await browser.close(); }
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
