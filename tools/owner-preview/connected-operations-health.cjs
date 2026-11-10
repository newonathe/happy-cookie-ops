// Read-only health checks against the caller's validated disposable SQL fixture.
exports.run=async({page,userId,origin,width,out,assert})=>{
 const facts=await page.evaluate(async({userId,origin})=>{
  const r=window.__hcOps,native=window.connectedProductionClient,probe={reads:0,failed:false};
  const scope={userId,business:origin};r.bindStaffIdentity(scope);
  const fresh={rpc:async(...args)=>{
   if(args[0]!=='get_operations_health')throw Error('Health recovery attempted a non-health RPC');
   probe.reads++;if(probe.failed){probe.failed=false;throw TypeError('Injected lost local health read');}
   return native.rpc(...args);
  }};
  if(!await r.loadOperationsHealth(fresh))throw Error('Initial real health read failed');
  const old=r.renderVals().retryBackup;
  let release,started;const held=new Promise(resolve=>{started=resolve;});
  const delayed={rpc:async(...args)=>{const answer=await fresh.rpc(...args);await new Promise(resolve=>{release=resolve;started();});return answer;}};
  const pending=r.loadOperationsHealth(delayed);await held;
  if(r.renderVals().healthRows[0].value!=='Checking'||r.renderVals().healthOk)throw Error('Old health survived source replacement');
  const before=probe.reads;old();if(probe.reads!==before)throw Error('Retired Retry queried its replacement');
  const retired=r.renderVals().retryBackup;
  r.bindStaffIdentity(null);release();if(await pending)throw Error('Retired account accepted a real health reply');
  r.bindStaffIdentity(scope);if(!await r.loadOperationsHealth(fresh))throw Error('Fresh real health read failed');
  const restored=probe.reads;retired();old();if(probe.reads!==restored)throw Error('A/B/A revived an old health Retry');
  probe.failed=true;if(await r.loadOperationsHealth(fresh))throw Error('Lost read became a successful check');
  window.healthReadProbe=probe;r.go('health');return{retiredRealReply:true,oldRetryBlocked:true,accountRoundTrip:true};
 },{userId,origin});
 await page.getByRole('heading',{name:'Health & backups',exact:true}).waitFor();
 await page.getByRole('button',{name:'Check results again',exact:true}).first().waitFor();
 for(const size of [...new Set([320,width,1440])]){
  await page.setViewportSize({width:size,height:950});await page.evaluate(()=>window.scrollTo(0,0));
  const box=await page.getByRole('button',{name:'Check results again',exact:true}).boundingBox();
  assert(box&&box.width>=44&&box.height>=44,'Health check touch target is too small at '+size);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Health page overflows at '+size);
 }
 await page.setViewportSize({width,height:950});await page.evaluate(()=>window.scrollTo(0,0));
 await page.screenshot({path:`${out}/health-read-failed-${width}.png`,fullPage:true});
 const before=await page.evaluate(()=>window.healthReadProbe.reads);
 await page.getByRole('button',{name:'Check results again',exact:true}).first().click();
 await page.waitForFunction(()=>window.__hcOps.renderVals().healthRows[0]?.good===true);
 assert(await page.evaluate(before=>window.healthReadProbe.reads===before+1,before),'Health UI Retry did not make exactly one current read');
 await page.screenshot({path:`${out}/health-read-recovered-${width}.png`,fullPage:true});
 assert(facts.retiredRealReply&&facts.oldRetryBlocked&&facts.accountRoundTrip,'Health source retirement proof incomplete');
 console.log(JSON.stringify({width,realHealthReadRecovery:true,uiRetry:true,readsOnly:true,...facts}));
 await page.evaluate(()=>window.__hcOps.go('today'));
};
