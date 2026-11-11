// Invoked only inside the nonce-verified local anonymous menu fixture.
exports.run=async({customer,owner,width,out,assert})=>{
 const initial=await owner.evaluate(()=>window.connectedProductionClient.rpc('get_shop_status'));
 assert(!initial.error&&initial.data,'Could not read the original local opening override');
 const set=async mode=>{const answer=await owner.evaluate(mode=>window.connectedProductionClient.rpc('set_shop_override',{p_mode:mode}),mode);assert(!answer.error,'Local opening override was refused');};
 const shot=async name=>{assert(await customer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Opening recovery overflows');await customer.screenshot({path:`${out}/opening-${name}-${width}.png`,fullPage:true});};
 try{
  await set('open');await customer.evaluate(async()=>{window.openingFailure=true;await window.__hcOps.loadShopStatus(window.publicMenuClient);});
  await customer.getByText('Opening times are unavailable',{exact:true}).waitFor();await shot('unavailable');
  await customer.evaluate(()=>{window.openingFailure=false;});await customer.getByRole('button',{name:'Retry opening times',exact:true}).click();
  await customer.getByText('Orders are open',{exact:true}).waitFor();
  await customer.evaluate(()=>{window.holdOpening=true;window.pendingOpening=window.__hcOps.reloadShopStatus();});
  await customer.waitForFunction(()=>typeof window.releaseOpening==='function');
  await set('closed');await customer.evaluate(()=>window.__hcOps.reloadShopStatus());
  await customer.getByText('Orders are closed',{exact:true}).waitFor();
  assert(await customer.evaluate(async()=>{window.releaseOpening();return window.pendingOpening;})===false,'A held earlier opening answer applied');
  await customer.getByText('Orders are closed',{exact:true}).waitFor();
  await customer.evaluate(async()=>{window.openingFailure=true;await window.__hcOps.reloadShopStatus();window.__hcOps.setState({online:false});});
  await customer.getByText(/Opening times could not be refreshed. Showing the last successful read./).waitFor();
  assert(await customer.getByRole('button',{name:'Retry opening times',exact:true}).isDisabled(),'Offline opening Retry stayed enabled');await shot('stale-offline');
  await customer.evaluate(()=>window.__hcOps.loadShopStatus(null));
  await customer.getByText('Opening times are unavailable',{exact:true}).waitFor();
  assert(await customer.evaluate(()=>!window.__hcOps.renderVals().liveShopAvailability.stale),'Unconfigured source retained a confirmed opening status');
  console.log(JSON.stringify({width,anonymousOpeningRecovery:true,lateAnswerRejected:true,staleRetained:true,offlineDisabled:true,unconfiguredUnavailable:true}));
 }finally{await set(initial.data.override??null);}
};
