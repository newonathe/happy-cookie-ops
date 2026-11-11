// Run after preview:owner. Synthetic RPC fault injection only; all external requests are blocked.
const { chromium } = require('@playwright/test');
const out = process.argv[2] ?? 'build/owner-preview-dough';
require('node:fs').mkdirSync(out, { recursive:true });
(async () => {
 const browser = await chromium.launch({headless:true});
 try { for (const width of [320,390,768,1440]) for (const reducedMotion of ['no-preference','reduce']) {
  const context = await browser.newContext({viewport:{width,height:950},reducedMotion});
  const page = await context.newPage(), errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto('http://127.0.0.1:4186/',{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>window.__hcOps?.state.screen==='inventory',undefined,{timeout:90000});
  await page.evaluate(async()=>{
   const r=window.__hcOps;
   window.qaDoughRequests=[];window.qaDoughEffects=0;window.qaDoughFailRead=false;
   const records=new Map();
   await r.loadProduction({rpc:async(name,args)=>{
    if(name==='get_production') return window.qaDoughFailRead?{data:null,error:{code:'08006'}}:{data:{batches:[],dough:[],baked:[],shortfalls:[]},error:null};
    if(name!=='record_dough_preparation') throw Error('Unexpected synthetic production request '+name);
    const body=structuredClone(args.p_rec);window.qaDoughRequests.push(body);
    if(!records.has(body.id)){records.set(body.id,body);window.qaDoughEffects++;return {data:null,error:{code:'08006'}};}
    if(JSON.stringify(records.get(body.id))!==JSON.stringify(body))return {data:null,error:{code:'23505'}};
    window.qaDoughFailRead=true;
    r.loadStockCatalogue=async()=>false;
    return {data:[{record_id:body.id,duplicate:true,shortfall:[]}],error:null};
   }});
   r.go('bake');
  });
  await page.waitForFunction(()=>window.__hcOps?.renderVals().liveProduction?.start);
  await page.evaluate(()=>{const s=window.__hcOps.renderVals().liveProduction.start;s.open();});
  await page.evaluate(()=>{const s=window.__hcOps.renderVals().liveProduction.start;s.choose('dcf');});
  await page.evaluate(()=>window.__hcOps.renderVals().liveProduction.start.chooseKind('dough'));
  await page.evaluate(()=>window.__hcOps.renderVals().liveProduction.start.begin());
  const input=page.getByRole('spinbutton',{name:'Actual dough balls made'});
  await input.fill('13');
  await page.getByRole('button',{name:'Half recipe',exact:true}).click();
  if(await input.inputValue()!=='13')throw Error('Changing recipe amount changed actual count');
  await page.getByRole('region',{name:'Dough ingredients'}).getByText('125 g',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Full recipe',exact:true}).click();
  await page.getByRole('region',{name:'Dough ingredients'}).getByText('250 g',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Review dough',exact:true}).click();
  await page.waitForTimeout(400);
  await page.screenshot({path:`${out}/dough-review-${width}-${reducedMotion}.png`,fullPage:true});
  await page.getByRole('button',{name:'Confirm dough',exact:true}).click();
  await page.getByText('Save result not confirmed',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Leave for now',exact:true}).click();
  await page.evaluate(()=>window.__hcOps.startDough('hc'));
  await page.getByRole('spinbutton',{name:'Actual dough balls made'}).fill('11');
  await page.getByRole('button',{name:'Leave for now',exact:true}).click();
  await page.evaluate(()=>window.__hcOps.renderVals().liveProduction.inProgress.find(row=>row.productId==='dcf').open());
  await page.getByRole('button',{name:'Check saved result',exact:true}).click();
  await page.getByText('Saved. Stock could not be refreshed.',{exact:true}).waitFor();
  const facts=await page.evaluate(()=>({requests:window.qaDoughRequests,effects:window.qaDoughEffects,
   remaining:window.__hcOps.renderVals().liveProduction.inProgress.map(row=>({id:row.productId,text:row.quantityText})),
   overflow:document.documentElement.scrollWidth>innerWidth}));
  if(facts.requests.length!==2||JSON.stringify(facts.requests[0])!==JSON.stringify(facts.requests[1])||facts.requests[0].balls!==13||facts.requests[0].recipe_amount!==1||facts.effects!==1||facts.remaining.length!==1||!facts.remaining[0].text.includes('11')||facts.overflow||errors.length)throw Error(JSON.stringify({facts,errors}));
  await page.screenshot({path:`${out}/dough-saved-${width}-${reducedMotion}.png`,fullPage:true});
  console.log(JSON.stringify({width,reducedMotion,actual:13,recipeAmount:1,exactRetry:true,effects:facts.effects,otherDraft:facts.remaining[0].text,overflow:facts.overflow,errors}));
  await context.close();
 }} finally {await browser.close();}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
