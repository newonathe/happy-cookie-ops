// Disposable fixture only: real anonymous order, lost committed reply, reload and exact replay.
exports.run=async({page:owner,context,origin,anon,nonce,width,out,assert})=>{
 const claims=JSON.parse(Buffer.from(anon.split('.')[1],'base64url'));
 assert(claims.role==='anon'&&claims.iss==='hco-local-fixture'&&claims.fixture_nonce===nonce&&claims.exp>Date.now()/1000,'Current fixture-owned anon required');
 const initial=await owner.evaluate(()=>window.connectedProductionClient.rpc('get_shop_status'));
 assert(!initial.error&&initial.data,'Read original fixture opening status');
 const id='qa-recovery-'+nonce.slice(0,8),label='Local recovery account',requests=[];let stamp=null;
 const set=async mode=>{const reply=await owner.evaluate(mode=>window.connectedProductionClient.rpc('set_shop_override',{p_mode:mode}),mode);assert(!reply.error,'Fixture opening setup refused');};
 const payment=async active=>{const reply=await owner.evaluate(({id,label,active,stamp})=>window.connectedProductionClient.rpc('save_payment_method',{p_id:id,p_method:{label,account_number:'000',account_name:'Synthetic owner',qr_path:'',active,sort_order:0},p_expected_updated_at:stamp}),{id,label,active,stamp});assert(!reply.error&&reply.data?.[0]?.updated_at,'Fixture payment setup refused');stamp=reply.data[0].updated_at;};
 await context.exposeFunction('noteCustomerOrderAttempt',body=>requests.push(body));
 const customer=await context.newPage();
 const connect=async lose=>{
  await customer.waitForFunction(()=>window.__hcOps?.state.screen==='shop');
  await customer.evaluate(async({origin,anon,lose})=>{
   const {createClient}=await import('/connected-client.ts'),nativeFetch=window.fetch.bind(window);window.loseCustomerOrderReply=lose;window.customerStatusReads=0;
   const reads=new Set(['get_shop_order_rules','get_shop_extras','get_shop_status','get_shop_payment_info','order_status','find_order']);
   const client=createClient(origin,anon,{accessToken:async()=>anon,auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(input,init)=>{
    const url=new URL(typeof input==='string'?input:input.url);url.pathname=url.pathname.replace(/^\/rest\/v1/,'');const name=url.pathname.split('/').at(-1),method=init?.method??'GET';
    if(url.origin!==origin||!(url.pathname==='/shop_products'&&method==='GET'||url.pathname==='/rpc/'+name&&method==='POST'&&(reads.has(name)||name==='place_order')))throw Error('Unexpected customer recovery request');
    if(name==='place_order'){
     const body=JSON.parse(init.body).p_order,key='hc-order-recovery-v1:'+encodeURIComponent(origin),saved=JSON.parse(sessionStorage.getItem(key));
     if(JSON.stringify(saved?.value?.attempt?.body)!==JSON.stringify(body))throw Error('Order was not retained before its send');
     await window.noteCustomerOrderAttempt(body);
    }
    if(name==='order_status')window.customerStatusReads++;
    const answer=await nativeFetch(url,init);
    if(name==='find_order'&&window.holdCustomerLookup){window.lookupTokenMatches=answer.ok&&(await answer.clone().json())===window.expectedLookupToken;window.holdCustomerLookup=false;await new Promise(resolve=>{window.releaseCustomerLookup=resolve;});}
    if(name==='place_order'&&answer.ok&&window.loseCustomerOrderReply){await answer.clone().json();window.loseCustomerOrderReply=false;throw TypeError('Lost real committed local order reply');}
    return answer;
   }}});window.customerOrderClient=client;
   const r=window.__hcOps;await r.loadShopMenu(client);await r.loadShopPayment(client);await r.loadShopStatus(client);await r.loadShopOrders(client,origin);
  },{origin,anon,lose});
 };
 const shot=async name=>{assert(await customer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Customer order layout overflows');await customer.screenshot({path:`${out}/customer-order-${name}-${width}.png`,fullPage:true});};
 try{
  await payment(true);await set('open');await customer.goto('http://127.0.0.1:4186/?public-shop=1',{waitUntil:'domcontentloaded'});await connect(true);
  await customer.waitForFunction(()=>[...document.querySelectorAll('img[alt="The Happy Cookie"]')].some(img=>img.complete&&img.naturalWidth>0));
  for(const size of [320,390,768,1024,1440,1920,2560]){
   await customer.setViewportSize({width:size,height:950});
   const bounds=await customer.getByRole('region',{name:'The Happy Cookie shop',exact:true}).boundingBox();assert(bounds&&Math.abs(bounds.x)<1&&Math.abs(bounds.width-size)<1,'Client Shop kept a narrow page frame at '+size);
   const small=await customer.locator('button:visible').evaluateAll(nodes=>nodes.filter(node=>{const box=node.getBoundingClientRect();return box.width<44||box.height<44;}).map(node=>node.textContent));assert(small.length===0,'Shop touch controls too small at '+size+': '+small.join(', '));
   const add=customer.getByRole('button',{name:'Add one',exact:true}).first();await add.click();
   const target=await add.boundingBox();assert(target&&target.width>=44&&target.height>=44,'Shop touch control too small');
   await shot('shop-'+size);await customer.getByRole('button',{name:'Remove one',exact:true}).first().click();
   assert(await customer.evaluate(()=>Object.values(window.__hcOps.state.cust.box).every(q=>q===0)),'Shop cart did not decrement at '+size);assert(await customer.getByRole('button',{name:'Remove one',exact:true}).first().isDisabled(),'Empty product quantity stayed decrementable at '+size);
  }
  await customer.setViewportSize({width,height:950});await customer.getByRole('button',{name:'Add one',exact:true}).first().click();
  await customer.getByRole('button',{name:/^Continue/}).click();await customer.waitForFunction(()=>window.__hcOps.renderVals().liveCheckout?.rulesState==='ready');assert(await customer.getByRole('textbox',{name:/Reference number/}).count()===0,'Checkout asked for a payment reference before the order');
  await customer.evaluate(label=>{const r=window.__hcOps,v=r.renderVals().liveCheckout,date=v.dates.find(d=>!d.sameDay);if(!date||!v.times.length)throw Error('Real fixture pickup choices required');for(const [k,value] of Object.entries({name:'Local recovery customer',ig:'@local.recovery',mobile:'09123450123',pickupDate:date.value,pickupTime:v.times[0].value,pay:label}))r.custSet(k,value);},label);
  for(const size of [320,390,768,1024,1440,1920,2560]){await customer.setViewportSize({width:size,height:950});const bounds=await customer.getByRole('region',{name:'Customer checkout',exact:true}).boundingBox();assert(bounds&&Math.abs(bounds.x)<1&&Math.abs(bounds.width-size)<1,'Checkout kept a narrow page frame at '+size);const small=await customer.locator('button:visible').evaluateAll(nodes=>nodes.filter(node=>{const box=node.getBoundingClientRect();return box.width<44||box.height<44;}).map(node=>node.textContent));assert(small.length===0,'Checkout touch controls too small at '+size+': '+small.join(', '));await shot('checkout-'+size);}
  await customer.setViewportSize({width,height:950});await customer.getByRole('button',{name:'Place order',exact:true}).click();
  await customer.waitForFunction(()=>window.__hcOps.renderVals().liveCheckout?.frozen&&!window.__hcOps.renderVals().liveCheckout.sending);
  assert(requests.length===1&&!Object.hasOwn(requests[0],'pay_ref'),'Initial order was duplicated or asked for a reference before payment');await shot('lost-ack');
  await customer.reload({waitUntil:'domcontentloaded'});await connect(false);
  assert(requests.length===1,'Reload automatically submitted an order');await customer.evaluate(()=>window.__hcOps.go('checkout'));
  await customer.getByRole('button',{name:'Try again',exact:true}).waitFor();
  assert(await customer.evaluate(()=>window.__hcOps.renderVals().liveCheckout.fields.name==='Local recovery customer'),'Reload lost order fields');await shot('restored');
  await customer.getByRole('button',{name:'Try again',exact:true}).click();await customer.waitForFunction(()=>!!window.__hcOps.renderVals().liveCheckout?.placed);
  assert(requests.length===2&&JSON.stringify(requests[0])===JSON.stringify(requests[1]),'Retry changed ID/body or duplicated a send');
  const receipt=await customer.evaluate(()=>{const p=window.__hcOps.renderVals().liveCheckout.placed;return{orderNo:p.orderNo,url:p.statusUrl};});await shot('received');
  const rows=await owner.evaluate(()=>window.connectedProductionClient.rpc('get_staff_orders'));
  assert(!rows.error&&rows.data.filter(row=>row.name==='Local recovery customer').length===1&&rows.data.some(row=>row.id===receipt.orderNo&&row.name==='Local recovery customer'&&row.pay_state==='unpaid'),'Actual owner read did not confirm exactly one order');
  const token=new URL(receipt.url).hash.slice(3),status=await customer.evaluate(token=>window.customerOrderClient.rpc('order_status',{p_token:token}),token);
  assert(!status.error&&status.data.order_no===receipt.orderNo&&status.data.pay_state==='unpaid','Receipt/replay invented payment or changed identity');
  await customer.getByRole('button',{name:'Back to cookies',exact:true}).click();
  await customer.evaluate(token=>{
   window.expectedLookupToken=token;window.holdCustomerLookup=true;
   const r=window.__hcOps,read=r.runLiveLookup.bind(r);
   // Observe completion of the original method; the real UI and SDK still do all the work.
   r.runLiveLookup=(...args)=>{window.customerLookupTask=read(...args);return window.customerLookupTask;};
  },token);
  await customer.getByRole('button',{name:'Find my order',exact:true}).click();
  await customer.getByLabel('Order number',{exact:true}).fill(receipt.orderNo);
  await customer.getByLabel('Mobile number',{exact:true}).fill('09123450123');
  await customer.getByRole('button',{name:'Find it',exact:true}).click();
  await customer.waitForFunction(()=>typeof window.releaseCustomerLookup==='function');
  assert(await customer.evaluate(()=>window.lookupTokenMatches),'Real anonymous lookup did not match its saved receipt');
  await customer.getByRole('button',{name:'Close',exact:true}).click();
  const retired=await customer.evaluate(async origin=>{
   const r=window.__hcOps,a=window.customerOrderClient;
   await r.loadShopOrders({rpc:(...args)=>a.rpc(...args)},origin);await r.loadShopOrders(a,origin);
   const before={reads:window.customerStatusReads,token:r.orderFlow.statusToken};
   window.releaseCustomerLookup();await window.customerLookupTask;
   return{before,reads:window.customerStatusReads,token:r.orderFlow.statusToken,screen:r.state.screen};
  },origin);
  assert(retired.screen==='shop'&&retired.reads===retired.before.reads&&retired.token===retired.before.token&&requests.length===2,'Retired lookup published data, navigated, forwarded a private read or wrote');
  await shot('lookup-retired');
  console.log(JSON.stringify({width,actualOrderRecovery:true,lostCommittedAck:true,reloadNeverSends:true,exactRetry:true,lookupRetirement:true,orders:1,payState:'unpaid',responsiveWidths:[320,390,768,1024,1440,1920,2560]}));
 }finally{await customer.close();if(stamp)await payment(false);await set(initial.data.override??null);}
};
