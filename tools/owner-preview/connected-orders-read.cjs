// Actual Orders reads on the caller's disposable fixture; this check never invokes a writer.
exports.run=async({page,userId,origin,width,out,assert})=>{
 const module='/@fs'+require('node:path').resolve(__dirname,'../../src/lib/orders/orders-read-state.ts');
 await page.evaluate(async({module,userId,origin})=>{
  const {ordersRead}=await import(module),r=window.__hcOps,native=window.connectedProductionClient;
  const probe={reads:0,fail:true},scope={userId,business:origin};
  r.bindStaffIdentity(scope);
  const client={rpc:async(name,...args)=>{
   if(name!=='get_staff_orders')throw Error('Orders read check attempted a writer');
   probe.reads++;if(probe.fail){probe.fail=false;throw TypeError('Injected unavailable Orders read');}
   return native.rpc(name,...args);
  }};
  if(await r.loadOrders(client))throw Error('Failed Orders read was accepted');
  window.ordersIntegrationProbe={probe,scope,client,ordersRead};r.go('orders');
 },{module,userId,origin});
 await page.getByRole('heading',{name:'Orders',exact:true}).waitFor();
 await page.getByText('Your orders could not be read.',{exact:false}).waitFor();
 assert(await page.evaluate(()=>window.__hcOps.state.orders.length===0),'Failed first Orders read exposed cached orders');
 await page.screenshot({path:`${out}/orders-first-read-failed-${width}.png`,fullPage:true});
 await page.getByRole('button',{name:'Try again',exact:true}).click();
 await page.waitForFunction(()=>window.ordersIntegrationProbe.ordersRead.get().phase==='read');
 const facts=await page.evaluate(async()=>{
  const {probe,scope,client,ordersRead}=window.ordersIntegrationProbe,r=window.__hcOps;
  if(probe.reads!==2)throw Error('Orders UI Retry did not make exactly one read');
  const rows=r.state.orders;if(!rows.length)throw Error('Connected Orders fixture has no customer order');
  const oldRetry=ordersRead.get().retry;
  let finish,started;const held=new Promise(resolve=>{started=resolve;});
  const delayed={rpc:async(...args)=>{const answer=await client.rpc(...args);await new Promise(resolve=>{finish=resolve;started();});return answer;}};
  const pending=r.loadOrders(delayed);await held;
  r.bindStaffIdentity({...scope,userId:'retired-orders-test-account'});r.bindStaffIdentity(scope);
  finish();if(await pending)throw Error('Retired Orders answer was accepted');
  if(ordersRead.get().phase!=='idle'||ordersRead.get().retry||r.state.orders.length)throw Error('Retired Orders state survived');
  const before=probe.reads;oldRetry();if(probe.reads!==before)throw Error('Old Orders Retry issued a request after account ABA');
  if(!await r.loadOrders(client))throw Error('Current Orders regrant failed');
  if(r.state.orders.length!==rows.length)throw Error('Regrant changed connected order count');
  r.go('orders');return {realOrders:rows.length,retiredRealReply:true,oldRetryBlocked:true,readsOnly:true};
 });
 for(const size of [...new Set([320,width,1440])]){
  await page.setViewportSize({width:size,height:950});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Orders overflows at '+size);
 }
 await page.setViewportSize({width,height:950});await page.evaluate(()=>window.scrollTo(0,0));
 await page.screenshot({path:`${out}/orders-read-recovered-${width}.png`,fullPage:true});
 console.log(JSON.stringify({width,connectedOrdersRetry:true,...facts}));
};
