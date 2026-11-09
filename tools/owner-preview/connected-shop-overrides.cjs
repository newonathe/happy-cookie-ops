// Owner writes use the fixture's verified real SDK; source rebinding never replays a save.
exports.run=async({page,width,out,assert})=>{
 const initial=await page.evaluate(()=>window.connectedProductionClient.rpc('get_shop_status'));
 assert(!initial.error&&initial.data,'Could not read original local shop status');
 const set=async mode=>{const reply=await page.evaluate(mode=>window.connectedProductionClient.rpc('set_shop_override',{p_mode:mode}),mode);assert(!reply.error,'Local override setup failed');};
 const open=async()=>{await page.getByText('Shop status',{exact:true}).click();await page.waitForFunction(()=>window.__hcOps.state.sheet?.kind==='dropState');};
 try{
  await set('open');await page.evaluate(async()=>{
   const r=window.__hcOps,source=window.connectedProductionClient;window.overrideWrites=[];window.holdOverride=true;window.holdStatus=false;
   window.overrideA={rpc:async(name,args)=>{
    if(name==='set_shop_override')window.overrideWrites.push(JSON.parse(JSON.stringify(args)));
    const reply=await source.rpc(name,args);
    if(!reply.error&&name==='set_shop_override'&&window.holdOverride){window.holdOverride=false;await new Promise(resolve=>{window.releaseOverride=resolve;});}
    if(!reply.error&&name==='get_shop_status'&&window.holdStatus){window.holdStatus=false;await new Promise(resolve=>{window.releaseStatus=resolve;});}
    return reply;
   }};window.overrideB={rpc:(name,args)=>source.rpc(name,args)};
   await r.loadShopStatus(window.overrideA);r.go('drops');window.oldCloseConfirm=r.renderVals().closeDropConfirm;
  });
  await open();await page.getByRole('button',{name:/^Closed/}).click();await page.waitForFunction(()=>typeof window.releaseOverride==='function');
  assert(await page.evaluate(()=>window.__hcOps.state.shopOverride==='open'),'Unanswered close was confirmed locally');
  await page.evaluate(async()=>{const r=window.__hcOps;r.renderVals().closeSheet();await r.loadShopStatus(window.overrideB);await r.loadShopStatus(window.overrideA);});
  await open();await page.evaluate(async()=>{window.oldCloseConfirm();window.releaseOverride();await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);});
  assert(await page.evaluate(()=>window.__hcOps.state.sheet?.kind==='dropState'&&window.overrideWrites.length===1),'Retired save or cached confirmation changed the new sheet');
  await page.screenshot({path:`${out}/owner-override-retained-sheet-${width}.png`,fullPage:true});
  await page.evaluate(()=>window.__hcOps.renderVals().closeSheet());await set('open');
  await page.evaluate(async()=>{const r=window.__hcOps;await r.loadShopStatus(window.overrideA);window.holdStatus=true;window.pendingOwnerRead=r.reloadShopStatus();});
  await page.waitForFunction(()=>typeof window.releaseStatus==='function');await open();await page.getByRole('button',{name:/^Closed/}).click();
  await page.waitForFunction(()=>window.__hcOps.state.shopOverride==='closed'&&!window.__hcOps.state.sheet);
  assert(await page.evaluate(async()=>{window.releaseStatus();return window.pendingOwnerRead;})===false,'Earlier read overwrote the confirmed close');
  const facts=await page.evaluate(async()=>({local:window.__hcOps.state.shopOverride,server:(await window.connectedProductionClient.rpc('get_shop_status')).data.override,writes:window.overrideWrites.length}));
  assert(facts.local==='closed'&&facts.server==='closed'&&facts.writes===2,'Owner close and server status differ');
  await page.screenshot({path:`${out}/owner-override-confirmed-${width}.png`,fullPage:true});
  console.log(JSON.stringify({width,realOwnerOverride:true,unansweredNotConfirmed:true,retiredAckIgnored:true,cachedConfirmIgnored:true,newSheetRetained:true,earlierReadRejected:true,...facts}));
 }finally{
  await set(initial.data.override??null);
  await page.evaluate(async()=>{const r=window.__hcOps;if(r.state.sheet?.kind==='dropState')r.renderVals().closeSheet();await r.loadShopStatus(window.connectedProductionClient);r.go('bake');});
 }
};
