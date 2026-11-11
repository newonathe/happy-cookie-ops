// Owner writes use the fixture's verified real SDK; source rebinding never replays a save.
exports.run=async({page,width,out,assert})=>{
 const initial=await page.evaluate(()=>window.connectedProductionClient.rpc('get_shop_status'));
 assert(!initial.error&&initial.data,'Could not read original local shop status');
 const set=async mode=>{const reply=await page.evaluate(mode=>window.connectedProductionClient.rpc('set_shop_override',{p_mode:mode}),mode);assert(!reply.error,'Local override setup failed');};
 const notice=()=>page.getByRole('status',{name:'Opening status change',exact:true});
 const open=async()=>{await page.getByText('Shop status',{exact:true}).click();await page.waitForFunction(()=>window.__hcOps.state.sheet?.kind==='dropState');};
 try{
  await set('open');await page.evaluate(async()=>{
   const r=window.__hcOps,source=window.connectedProductionClient;window.overrideWrites=[];window.holdOverride=true;window.holdStatus=false;
   window.overrideA={rpc:async(name,args)=>{
    if(name==='set_shop_override')window.overrideWrites.push(JSON.parse(JSON.stringify(args)));
    const reply=await source.rpc(name,args);
    if(!reply.error&&name==='set_shop_override'&&window.loseOverrideReply){window.loseOverrideReply=false;throw TypeError('Injected lost committed override acknowledgement');}
    if(name==='get_shop_status'&&window.failOverrideRead)throw TypeError('Injected unavailable owner status read');
    if(!reply.error&&name==='set_shop_override'&&window.holdOverride){window.holdOverride=false;await new Promise(resolve=>{window.releaseOverride=resolve;});}
    if(!reply.error&&name==='get_shop_status'&&window.holdStatus){window.holdStatus=false;await new Promise(resolve=>{window.releaseStatus=resolve;});}
    return reply;
   }};window.overrideB={rpc:(name,args)=>source.rpc(name,args)};
   await r.loadShopStatus(window.overrideA);r.go('drops');window.oldCloseConfirm=r.renderVals().closeDropConfirm;
  });
  await open();await page.getByRole('button',{name:/^Closed/}).click();await page.waitForFunction(()=>typeof window.releaseOverride==='function');
  assert(await page.evaluate(()=>window.__hcOps.state.shopOverride==='open'),'Unanswered close was confirmed locally');
  await notice().getByText('Changing opening status to Closed…',{exact:true}).waitFor();assert(await notice().count()===1,'Duplicate accessible owner save notices');await page.screenshot({path:`${out}/owner-save-pending-${width}.png`,fullPage:true});
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
  await set('open');await page.evaluate(async()=>{window.loseOverrideReply=true;await window.__hcOps.loadShopStatus(window.overrideA);});
  await open();await page.getByRole('button',{name:/^Closed/}).click();
  await notice().getByText('Change to Closed is not confirmed.',{exact:true}).waitFor();
  assert(await page.evaluate(()=>window.__hcOps.state.shopOverride==='open'),'Lost reply became a confirmed close');
  await page.getByRole('button',{name:'Check opening status',exact:true}).click();
  await notice().getByText('Last checked setting: Closed.',{exact:true}).waitFor();
  await notice().getByText('Change to Closed is not confirmed.',{exact:true}).waitFor();
  assert(await page.evaluate(()=>window.overrideWrites.length===3),'Status check resent an unknown save');
  await page.screenshot({path:`${out}/owner-save-unknown-checked-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:/^Open/}).click();await notice().getByText('Opening status change recorded.',{exact:true}).waitFor();
  await page.evaluate(()=>{window.failOverrideRead=true;});await page.getByRole('button',{name:'Check opening status',exact:true}).click();
  await notice().getByText('Current opening status could not be checked.',{exact:true}).waitFor();
  await notice().getByText('Opening status change recorded.',{exact:true}).waitFor();
  assert(await page.evaluate(()=>window.overrideWrites.length===4),'Failed readback resent a confirmed save');
  await page.screenshot({path:`${out}/owner-save-confirmed-unchecked-${width}.png`,fullPage:true});
  await page.evaluate(()=>{window.__hcOps.setState({online:false});});await open();await page.getByRole('button',{name:/^Closed/}).click();
  await notice().getByText('Change to Closed was not sent.',{exact:true}).waitFor();
  assert(await page.getByRole('button',{name:'Check opening status',exact:true}).isDisabled(),'Offline owner check stayed enabled');
  assert(await page.evaluate(()=>window.overrideWrites.length===4),'Offline choice attempted a write');
  await page.evaluate(()=>{const r=window.__hcOps;r.renderVals().closeSheet();r.renderVals().drop2.closeEarly();});
  await page.getByRole('dialog').getByRole('button',{name:'Stop new orders',exact:true}).waitFor();
  await page.getByRole('dialog').getByRole('button',{name:'Stop new orders',exact:true}).click();
  assert(await page.evaluate(()=>window.overrideWrites.length===4),'Offline confirmation attempted a write');
  await page.screenshot({path:`${out}/owner-save-offline-confirmation-${width}.png`,fullPage:true});
  await page.getByRole('dialog').getByRole('button',{name:'Back',exact:true}).click();
  await page.evaluate(()=>{window.failOverrideRead=false;window.__hcOps.setState({online:true});});
  console.log(JSON.stringify({width,ownerSaveFeedback:true,unknownRemainsUnconfirmed:true,checkNeverWrites:true,savedSurvivesReadFailure:true,offlineNeverWrites:true,writes:4}));

 }finally{
  await set(initial.data.override??null);
  await page.evaluate(async()=>{const r=window.__hcOps;if(['dropState','closeDrop'].includes(r.state.sheet?.kind))r.renderVals().closeSheet();await r.loadShopStatus(window.connectedProductionClient);r.go('bake');});
 }
};
