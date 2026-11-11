// Real browser ownership and stale-action checks. Every attempted write here is a failure.
exports.run=async({page,context,connect,attempts,width,out,assert})=>{
 const before=attempts.length;
 await page.evaluate(async()=>{window.forbidProductionWrites=true;const r=window.__hcOps;r.go('bake');await r.loadProduction(window.connectedProductionClient);});
 await page.getByRole('region',{name:'Production plan entry',exact:true}).waitFor();
 await page.evaluate(()=>window.__hcOps.renderVals().liveProduction.start.multi.setKind('dcf','batch'));
 await page.getByRole('button',{name:'Review 1 product',exact:true}).click();
 await page.getByRole('button',{name:'Start 1 production item',exact:true}).click();
 await page.waitForFunction(()=>window.__hcOps.renderVals().liveProduction?.inProgress?.some(w=>w.productId==='dcf'&&w.kind==='batch'));
 const workId=await page.evaluate(()=>window.__hcOps.renderVals().liveProduction.inProgress.find(w=>w.productId==='dcf'&&w.kind==='batch').id);
 const open=async target=>{
  await target.bringToFront();
  await target.evaluate(()=>window.__hcOps.go('bake'));
  await target.waitForFunction(id=>window.__hcOps.renderVals().liveProduction?.inProgress?.some(w=>w.id===id),workId);
  await target.evaluate(id=>window.__hcOps.renderVals().liveProduction.inProgress.find(w=>w.id===id).open(),workId);
  await target.getByLabel('Cookies made, including rejects',{exact:true}).waitFor();
 };
 const capture=async target=>target.evaluate(()=>{window.ownershipConfirm=window.__hcOps.renderVals().liveBatchCounts.confirm;});
 const stale=async target=>{
  await target.bringToFront();
  await target.evaluate(async()=>{window.ownershipConfirm();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
  await target.waitForFunction(()=>window.__hcOps.savingProduction.size===0);
  assert(attempts.length===before,'A retired production action attempted a write');
 };
 const period=async drop=>page.evaluate(async drop=>{const r=window.__hcOps;await new Promise(resolve=>r.setState({dropNo:drop},resolve));await r.loadProduction(window.connectedProductionClient);},drop);
 await open(page);
 await page.getByLabel('Cookies made, including rejects',{exact:true}).fill('4');
 await page.getByLabel('Rejects',{exact:true}).fill('0');
 assert(await page.evaluate(()=>window.__hcOps.state.dough.dcf===5&&window.__hcOps.state.baked.dcf===3),'An unsubmitted draft changed local stock');
 await capture(page);
 await period(6);await stale(page);
 await period(5);await open(page);await stale(page); // A→B→A must not revive an earlier Confirm.
 await capture(page);
 await page.evaluate(async()=>{const r=window.__hcOps,client=window.connectedProductionClient;await r.loadProduction({rpc:(...args)=>client.rpc(...args)});await r.loadProduction(client);});
 await open(page); // Reopening is separate from permission to reuse the previous closure.
 await stale(page);
 await capture(page);
 await page.evaluate(async()=>{const r=window.__hcOps;await new Promise(resolve=>r.setState({role:'helper'},resolve));});
 await stale(page);
 await page.evaluate(()=>{const r=window.__hcOps;r.setRole('owner');r.go('inventory');});
 await connect(page,false,true);await open(page);await stale(page);
 await capture(page);
 const other=await context.newPage();
 try{
  await other.addInitScript(()=>{window.forbidProductionWrites=true;});
  await other.goto('http://127.0.0.1:4186/',{waitUntil:'domcontentloaded',timeout:90000});
  await connect(other,true);
  await other.getByText('Production is open in another tab',{exact:true}).waitFor();
  assert(await page.evaluate(()=>window.__hcOps.productionRecovery.editable),'The original tab lost its writer lease');
  await other.getByRole('button',{name:'Retry production work',exact:true}).click();
  await other.waitForFunction(()=>window.__hcOps.renderVals().liveProduction.recovery.status==='locked');
  assert(!await other.evaluate(()=>window.__hcOps.productionRecovery.editable),'A second tab stole the writer lease');
  await other.screenshot({path:`${out}/production-tab-locked-${width}.png`,fullPage:true});
  await page.evaluate(async()=>window.__hcOps.setProductionIdentity(null));
  await other.getByRole('button',{name:'Retry production work',exact:true}).click();
  await other.waitForFunction(()=>window.__hcOps.productionRecovery.editable);
  await open(other);
  assert(await other.getByLabel('Cookies made, including rejects',{exact:true}).inputValue()==='4'&&await other.getByLabel('Rejects',{exact:true}).inputValue()==='0','Tab ownership transfer lost raw draft counts');
  assert(!await other.evaluate(()=>window.__hcOps.renderVals().liveBatchCounts.uncertain),'An unsent draft became an uncertain request');
  await capture(other);
  await other.evaluate(async()=>window.__hcOps.setProductionIdentity(null));
  await stale(other);
 }finally{await other.close();}
 await page.evaluate(()=>window.__hcOps.go('inventory'));
 await connect(page,false,true);await open(page);await stale(page);
 assert(await page.getByLabel('Cookies made, including rejects',{exact:true}).inputValue()==='4','Reacquiring ownership lost the draft');
 const facts=await page.evaluate(async()=>{const {data,error}=await window.connectedProductionClient.rpc('get_production',{p_drop:5});if(error)throw Error(error.code);return{dough:data.dough.find(r=>r.product_id==='dcf')?.balls,baked:data.baked.find(r=>r.product_id==='dcf')?.qty,batches:data.batches.filter(r=>r.product_id==='dcf').length};});
 assert(facts.dough===5&&facts.baked===3&&facts.batches===1&&attempts.length===before,'Unconfirmed or stale work changed stock');
 await page.screenshot({path:`${out}/production-ownership-restored-${width}.png`,fullPage:true});
 console.log(JSON.stringify({width,realWebLocks:true,retainedDraft:true,stalePeriodABA:true,staleClientABA:true,staleRoleABA:true,noNewProductionWrites:true,...facts}));
};
