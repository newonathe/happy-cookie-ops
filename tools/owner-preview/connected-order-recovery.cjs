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
    if(name==='get_shop_payment_info'&&window.failNextCustomerPaymentRead){window.failNextCustomerPaymentRead=false;await answer.clone().json();throw TypeError('Lost real local payment read');}
    if(name==='order_status'&&window.failNextCustomerStatusRead){window.failNextCustomerStatusRead=false;await answer.clone().json();throw TypeError('Lost real local status read');}
    if(name==='find_order'&&window.holdCustomerLookup){window.lookupTokenMatches=answer.ok&&(await answer.clone().json())===window.expectedLookupToken;window.holdCustomerLookup=false;await new Promise(resolve=>{window.releaseCustomerLookup=resolve;});}
    if(name==='place_order'&&answer.ok&&window.loseCustomerOrderReply){await answer.clone().json();window.loseCustomerOrderReply=false;throw TypeError('Lost real committed local order reply');}
    return answer;
   }}});window.customerOrderClient=client;
   const r=window.__hcOps;await r.loadShopMenu(client);await r.loadShopPayment(client);await r.loadShopStatus(client);await r.loadShopOrders(client,origin);
  },{origin,anon,lose});
 };
 const shot=async name=>{assert(await customer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Customer order layout overflows');await customer.screenshot({path:`${out}/customer-order-${name}-${width}.png`,fullPage:true});};
 try{
  const emptyOrders=await owner.evaluate(()=>window.connectedProductionClient.rpc('get_staff_orders'));assert(!emptyOrders.error&&emptyOrders.data.length===0,'Empty owner status preview fixture required');
  await owner.evaluate(()=>window.__hcOps.go('drops'));await owner.getByRole('heading',{name:'Shop',exact:true}).waitFor();
  await owner.evaluate(async()=>{const r=window.__hcOps;window.ownerExampleOriginalCust=structuredClone(r.state.cust);await new Promise(resolve=>r.setState({cust:{...r.state.cust,name:'Retained preview draft',box:{dcf:2}}},resolve));});
  const exampleBefore=await owner.evaluate(()=>{const r=window.__hcOps,c=window.connectedProductionClient,original=c.rpc;window.ownerExampleCalls=[];c.rpc=function(...args){window.ownerExampleCalls.push(args[0]);return original.apply(this,args);};window.restoreOwnerExampleRpc=()=>{c.rpc=original;};return{cust:JSON.stringify(r.state.cust),screen:r.state.screen,hash:location.hash,token:r.orderFlow?.statusToken??null};});
  try{
   await owner.getByRole('button',{name:'Order status',exact:true}).click();await owner.getByText('Example only. No order has been placed or paid.',{exact:true}).waitFor();
   assert(await owner.getByRole('heading',{name:'Order received',exact:true}).count()===1&&await owner.getByRole('article',{name:'Payment details',exact:true}).count()===0,'Owner example used a real payment or missing order');
   assert(await owner.getByRole('button',{name:'Check order status',exact:true}).count()===0&&await owner.getByRole('button',{name:'Order this cookie again',exact:true}).count()===0,'Owner example offered private customer actions');
   for(const size of [390,768,1440]){await owner.setViewportSize({width:size,height:950});assert(await owner.getByText('Example only. No order has been placed or paid.',{exact:true}).count()===1,'Owner example was lost on resize');const note=await owner.getByRole('note').boundingBox(),back=await owner.getByRole('button',{name:'Back to Shop',exact:true}).boundingBox(),header=await owner.locator('header').first().boundingBox();assert(note&&back&&header&&note.y>=header.y+header.height&&back.y>=header.y+header.height&&back.y+back.height<=950,'Owner example label or Back is behind the header/outside the viewport');assert(await owner.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Owner status example overflow');await owner.screenshot({path:`${out}/owner-status-example-${size}-${width}.png`,fullPage:true});}
   await owner.setViewportSize({width,height:950});await owner.getByRole('button',{name:'Back to Shop',exact:true}).click();await owner.getByRole('heading',{name:'Shop',exact:true}).waitFor();
   const exampleAfter=await owner.evaluate(()=>{const r=window.__hcOps;return{cust:JSON.stringify(r.state.cust),screen:r.state.screen,hash:location.hash,token:r.orderFlow?.statusToken??null};});assert(JSON.stringify(exampleBefore)===JSON.stringify(exampleAfter)&&await owner.evaluate(()=>window.ownerExampleCalls.length===0),'Owner example changed customer context or made an RPC');
  }finally{await owner.evaluate(async()=>{window.restoreOwnerExampleRpc();const r=window.__hcOps;await new Promise(resolve=>r.setState({cust:window.ownerExampleOriginalCust},resolve));});}
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
  assert(!status.error&&status.data.order_no===receipt.orderNo&&status.data.pay_state==='unpaid'&&Object.hasOwn(status.data,'paid_cents')&&status.data.paid_cents===null,'Receipt/replay invented payment or changed identity');
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
  await customer.evaluate(()=>{window.failNextCustomerStatusRead=true;});
  await customer.getByRole('button',{name:'Find my order',exact:true}).click();
  await customer.getByLabel('Order number',{exact:true}).fill(receipt.orderNo);
  await customer.getByLabel('Mobile number',{exact:true}).fill('09123450123');
  await customer.getByRole('button',{name:'Find it',exact:true}).click();
  await customer.getByRole('button',{name:'Retry order status',exact:true}).waitFor();
  assert(await customer.evaluate(()=>window.__hcOps.state.screen==='status'&&!window.__hcOps.renderVals().liveStatusRead.stale),'Initial status failure claimed retained data');
  await shot('status-failed');
  await customer.getByRole('button',{name:'Retry order status',exact:true}).click();
  await customer.waitForFunction(()=>window.__hcOps.renderVals().liveStatusRead?.state==='loaded');
  assert(await customer.evaluate(orderNo=>window.__hcOps.renderVals().cust.orderNo===orderNo,receipt.orderNo),'Status Retry changed the private order');
  const paymentPanel=customer.getByRole('article',{name:'Payment details',exact:true}),amount='₱'+(status.data.total_cents/100).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2});
  assert(await paymentPanel.getByText(amount,{exact:true}).count()===2&&await paymentPanel.getByText('Account number: 000',{exact:true}).count()===1,'Payment panel changed server amount or selected account');
  await customer.evaluate(()=>{window.failNextCustomerPaymentRead=true;});
  await customer.getByRole('button',{name:'Refresh payment details',exact:true}).click();
  await customer.getByRole('button',{name:'Retry payment details',exact:true}).waitFor();
  assert(await paymentPanel.getByText('Account number: 000',{exact:true}).count()===0,'Failed metadata read retained bank instructions');
  await customer.getByRole('button',{name:'Retry payment details',exact:true}).click();
  await customer.getByRole('button',{name:'Refresh payment details',exact:true}).waitFor();
  await customer.evaluate(()=>{window.failNextCustomerStatusRead=true;});
  await customer.getByRole('button',{name:'Check order status',exact:true}).click();
  await customer.getByRole('button',{name:'Retry order status',exact:true}).waitFor();
  assert(await customer.evaluate(orderNo=>{const v=window.__hcOps.renderVals();return v.cust.orderNo===orderNo&&v.liveStatusRead.stale;},receipt.orderNo),'Failed refresh lost or mislabeled last-good status');
  assert(await customer.getByRole('status').filter({hasText:'Showing the last successful read'}).count()===1,'Retained status has no freshness warning');
  assert(await paymentPanel.getByText('Account number: 000',{exact:true}).count()===0,'Stale order status retained payment instructions');
  assert(!await customer.getByRole('heading',{level:1}).evaluate(node=>node.parentElement.textContent.includes('Send payment')),'Unchecked status summary asked for payment');
  await shot('status-stale');
  await customer.getByRole('button',{name:'Retry order status',exact:true}).click();
  await customer.waitForFunction(()=>window.__hcOps.renderVals().liveStatusRead?.state==='loaded');
  assert(requests.length===2,'A status Retry wrote an order');
  await shot('status-recovered');
  for(const size of [320,390,768,1024,1440,1920,2560]){
   await customer.setViewportSize({width:size,height:950});
   const bounds=await customer.getByRole('region',{name:'Customer order status',exact:true}).boundingBox();assert(bounds&&Math.abs(bounds.x)<1&&Math.abs(bounds.width-size)<1,'Status kept a narrow frame at '+size);
   const small=await customer.locator('button:visible').evaluateAll(nodes=>nodes.filter(node=>{const box=node.getBoundingClientRect();return box.width<44||box.height<44;}).map(node=>node.textContent));assert(small.length===0,'Status touch controls too small at '+size+': '+small.join(', '));
   assert(await customer.getByRole('heading',{level:1}).evaluate(node=>!!(node.compareDocumentPosition(document.querySelector('[aria-label="Payment details"]'))&Node.DOCUMENT_POSITION_FOLLOWING)),'Payment instructions precede the order heading');
   assert(await customer.getByText('Order '+receipt.orderNo,{exact:true}).count()===1,'Fluid status lost its real order');await shot('status-'+size);
  }
  await customer.setViewportSize({width,height:950});
  const bookArgs={p_from:new Date(Date.now()-7*86400000).toISOString(),p_to:new Date(Date.now()+86400000).toISOString()},readBooks=()=>owner.evaluate(args=>window.connectedProductionClient.rpc('get_books',args),bookArgs);
  const beforePaid=await readBooks();assert(!beforePaid.error&&!beforePaid.data.lines.some(line=>line.id==='o:'+receipt.orderNo),'Unpaid order already became book revenue');
  const saved=rows.data.find(row=>row.id===receipt.orderNo),confirmArgs={p_order_id:receipt.orderNo,p_expected_updated_at:saved.updated_at,p_force:false};assert(typeof confirmArgs.p_expected_updated_at==='string','Owner order timestamp missing');
  const confirmed=await owner.evaluate(args=>window.connectedProductionClient.rpc('staff_confirm_payment',args),confirmArgs);
  assert(!confirmed.error&&confirmed.data?.[0]?.pay_state==='confirmed'&&confirmed.data[0].paid_cents===status.data.total_cents,'Actual owner confirmation did not record the server total');
  const replay=await owner.evaluate(args=>window.connectedProductionClient.rpc('staff_confirm_payment',args),confirmArgs);assert(!replay.error&&replay.data?.[0]?.replayed===true,'Owner confirmation replay did not settle idempotently');
  assert(await customer.evaluate(()=>window.__hcOps.renderVals().liveCustomerPayment.order.payState==='unpaid'),'Customer invented confirmation before a fresh read');
  await customer.getByRole('button',{name:'Check order status',exact:true}).click();
  await customer.getByRole('heading',{level:1,name:'Payment confirmed',exact:true}).waitFor();
  assert(await paymentPanel.getByText('Payment confirmed by the shop.',{exact:true}).count()===1&&await paymentPanel.getByText(amount,{exact:true}).count()===2,'Fresh customer status lost confirmed payment facts');
  assert(await paymentPanel.getByText('Account number: 000',{exact:true}).count()===0&&await paymentPanel.getByText('Amount to pay',{exact:true}).count()===0,'Fully paid order invited another payment');
  const afterPaid=await readBooks(),orderLines=afterPaid.data?.lines?.filter(line=>line.id==='o:'+receipt.orderNo);assert(!afterPaid.error&&orderLines?.length===1&&orderLines[0].amount_cents===status.data.total_cents&&orderLines[0].kind==='revenue','Owner confirmation/replay duplicated or changed order revenue');
  const revenue=reply=>reply.data.lines.filter(line=>line.kind==='revenue').reduce((sum,line)=>sum+line.amount_cents,0);assert(revenue(afterPaid)-revenue(beforePaid)===status.data.total_cents,'Owner confirmation/replay changed revenue more than once');
  assert(requests.length===2,'Payment check placed another order');await shot('owner-payment-confirmed');
  console.log(JSON.stringify({width,actualOrderRecovery:true,ownerStatusExample:true,exampleNoRpc:true,lostCommittedAck:true,reloadNeverSends:true,exactRetry:true,lookupRetirement:true,statusReadRecovery:true,orders:1,initialPayState:'unpaid',ownerVerifiedPayment:true,finalPayState:'confirmed',oneOrderRevenue:true,responsiveWidths:[320,390,768,1024,1440,1920,2560]}));
 }finally{await customer.close();if(stamp)await payment(false);await set(initial.data.override??null);}
};
