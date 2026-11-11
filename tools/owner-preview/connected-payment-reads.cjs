// Public payment reads use only the nonce-verified disposable fixture; no customer order/payment is written.
exports.run=async({page:owner,context,origin,anon,nonce,width,out,assert})=>{
 const claims=JSON.parse(Buffer.from(anon.split('.')[1],'base64url'));
 assert(claims.role==='anon'&&claims.iss==='hco-local-fixture'&&claims.fixture_nonce===nonce&&claims.exp>Date.now()/1000,'A current fixture-owned anonymous token is required');
 const id='qa-read-'+nonce.slice(0,8);let stamp=null;const customer=await context.newPage(),errors=[];
 customer.on('pageerror',error=>errors.push(error.message));
 const save=async(number,active=true)=>{
  const answer=await owner.evaluate(({id,number,active,stamp})=>window.connectedProductionClient.rpc('save_payment_method',{p_id:id,p_method:{label:'Local test account',account_number:number,account_name:'Synthetic owner',qr_path:'',active,sort_order:0},p_expected_updated_at:stamp}),{id,number,active,stamp});
  assert(!answer.error&&answer.data?.[0]?.updated_at,'Local synthetic payment setup was refused');stamp=answer.data[0].updated_at;
 };
 const shot=async name=>{assert(await customer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Payment recovery overflows');await customer.screenshot({path:`${out}/payment-read-${name}-${width}.png`,fullPage:true});};
 try{
  await save('111');
  await customer.goto('http://127.0.0.1:4186/?public-shop=1',{waitUntil:'domcontentloaded'});await customer.waitForFunction(()=>window.__hcOps?.state.screen==='shop');
  await customer.evaluate(async({origin,anon})=>{
   const {createClient}=await import('/connected-client.ts'),nativeFetch=window.fetch.bind(window);
   window.paymentFailure=true;window.paymentReads=0;window.paymentWrites=0;
   window.newPaymentClient=()=>createClient(origin,anon,{accessToken:async()=>anon,auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(input,init)=>{
    const url=new URL(typeof input==='string'?input:input.url);url.pathname=url.pathname.replace(/^\/rest\/v1/,'');
    if(url.origin!==origin||url.pathname!=='/rpc/get_shop_payment_info'||init?.method!=='POST'){window.paymentWrites++;throw Error('Unexpected public payment request');}
    window.paymentReads++;if(window.paymentFailure)throw TypeError('Injected local public payment read failure');
    const answer=await nativeFetch(url,init);if(window.holdPayment){window.holdPayment=false;await answer.clone().json();await new Promise(resolve=>{window.releasePayment=resolve;});}return answer;
   }}});
   window.publicPaymentClient=window.newPaymentClient();window.__hcOps.setState({screen:'checkout'});
   await window.__hcOps.loadShopPayment(window.publicPaymentClient);
  },{origin,anon});
  await customer.waitForFunction(()=>window.__hcOps?.state.screen==='checkout');
  await customer.evaluate(()=>window.__hcOps.renderVals().liveCheckout.set('name','Keep my checkout name'));
  await customer.getByText('Payment methods could not be read.',{exact:true}).waitFor();assert(!await customer.getByText('No payment method is set up yet.',{exact:true}).count(),'An unread payment source claimed a genuinely empty setup');assert(await customer.evaluate(()=>!window.__hcOps.renderVals().cust.priceNote.includes('no extra packaging charge')),'Unread payment state restored the old packaging-price claim');await shot('failed');
  await customer.evaluate(()=>{window.paymentFailure=false;});await customer.getByRole('button',{name:'Retry payment methods',exact:true}).click();
  await customer.waitForFunction(()=>window.__hcOps.renderVals().livePaymentRead.state==='ready');
  assert(await customer.evaluate(()=>window.__hcOps.renderVals().cust.methods.some(method=>method.num==='111')),'Read-only Retry did not restore the actual local account');
  await customer.evaluate(()=>{window.holdPayment=true;window.pendingPayment=window.__hcOps.loadShopPayment(window.publicPaymentClient);});
  await customer.waitForFunction(()=>typeof window.releasePayment==='function');await customer.getByText('Loading payment methods…',{exact:true}).waitFor();
  assert(await customer.evaluate(()=>window.__hcOps.renderVals().cust.methods.length===0),'Loading exposed unchecked payment instructions');await shot('pending');
  await save('222');
  await customer.evaluate(async()=>{window.currentPaymentClient=window.newPaymentClient();await window.__hcOps.loadShopPayment(window.currentPaymentClient);window.releasePayment();await window.pendingPayment;});
  assert(await customer.evaluate(()=>window.__hcOps.renderVals().cust.methods.some(method=>method.num==='222')&&!window.__hcOps.renderVals().cust.methods.some(method=>method.num==='111')),'Retired public response restored an old account');await shot('current');
  await customer.evaluate(async()=>{window.paymentFailure=true;await window.__hcOps.loadShopPayment(window.currentPaymentClient);window.__hcOps.setState({online:false});});
  await customer.waitForFunction(()=>window.__hcOps.state.online===false);
  await customer.evaluate(()=>{window.paymentReadsBeforeOffline=window.paymentReads;window.__hcOps.renderVals().livePaymentRead.retry();});
  assert(await customer.getByRole('button',{name:'Retry payment methods',exact:true}).isDisabled(),'Offline payment Retry remained enabled');
  assert(await customer.evaluate(()=>window.paymentReads===window.paymentReadsBeforeOffline&&window.paymentWrites===0&&window.__hcOps.renderVals().liveCheckout.fields.name==='Keep my checkout name'),'Payment recovery wrote, read offline, or lost checkout fields');await shot('offline');
  await customer.evaluate(()=>window.__hcOps.loadShopPayment(null));
  assert(await customer.evaluate(()=>window.__hcOps.renderVals().cust.methods.length===0&&!window.__hcOps.renderVals().cust.qr),'Removed source retained payment instructions');
  await customer.evaluate(async({origin,anon})=>{
   const {createClient}=await import('/connected-client.ts'),nativeFetch=window.fetch.bind(window);window.checkoutReadWrites=0;window.pickupFailure=false;window.optionsFailure=false;window.holdPickup=false;
   const make=()=>createClient(origin,anon,{accessToken:async()=>anon,auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(input,init)=>{
    const url=new URL(typeof input==='string'?input:input.url);url.pathname=url.pathname.replace(/^\/rest\/v1/,'');
    const menu=url.pathname==='/shop_products';
    if(url.origin!==origin||(!menu&&!['/rpc/get_shop_order_rules','/rpc/get_shop_extras'].includes(url.pathname))||(init?.method??'GET')!==(menu?'GET':'POST')){window.checkoutReadWrites++;throw Error('Unexpected checkout read request');}
    if((window.pickupFailure&&url.pathname==='/rpc/get_shop_order_rules')||(window.optionsFailure&&url.pathname==='/rpc/get_shop_extras'))throw TypeError('Injected unavailable checkout read');
    const answer=await nativeFetch(url,init);if(window.holdPickup&&url.pathname==='/rpc/get_shop_order_rules'){window.holdPickup=false;await answer.clone().json();await new Promise(resolve=>{window.releasePickup=resolve;});throw TypeError('Injected lost earlier pickup read');}return answer;
   }}});
   window.checkoutA=make();window.checkoutB=make();window.__hcOps.setState({online:true});await window.__hcOps.loadShopOrders(window.checkoutA);
   window.oldCheckoutView=window.__hcOps.renderVals().liveCheckout;window.oldCheckoutSubmit=window.__hcOps.renderVals().cust.submit;await window.__hcOps.loadShopOrders(window.checkoutB);
  },{origin,anon});
  await customer.waitForFunction(()=>window.__hcOps.renderVals().liveCheckout.fields.name==='');await shot('checkout-source-empty');
  await customer.evaluate(()=>window.__hcOps.loadShopOrders(window.checkoutA));
  await customer.waitForFunction(()=>window.__hcOps.renderVals().liveCheckout.fields.name==='Keep my checkout name');
  await customer.evaluate(()=>{window.oldCheckoutView.set('name','Retired checkout edit');window.oldCheckoutView.submit();window.oldCheckoutSubmit();});
  assert(await customer.evaluate(()=>window.__hcOps.renderVals().liveCheckout.fields.name==='Keep my checkout name'&&window.checkoutReadWrites===0),'Retired checkout callbacks changed fields or attempted a write');await shot('checkout-source-restored');
  await customer.evaluate(async()=>{await window.__hcOps.loadShopMenu(window.checkoutA);window.__hcOps.setState({cust:{...window.__hcOps.state.cust,box:{dcf:6}}});});
  await customer.waitForFunction(()=>window.__hcOps.state.cust.box.dcf===6);
  await customer.evaluate(()=>{const value=window.__hcOps.renderVals().liveCheckout,option=value.extras.addOns.find(item=>item.rows.some(row=>row.max>0)),row=option?.rows.find(row=>row.max>0);if(!row)throw Error('Fixture requires a real selectable order option');window.keptOption={id:option.id,key:row.key,label:row.label};row.setQty(1);if(option.textLabel!==null)row.setText('Kept note'.slice(0,option.textMax));});
  await customer.evaluate(async()=>{window.pickupFailure=true;window.optionsFailure=true;await window.__hcOps.loadShopOrders(window.checkoutA);});
  await customer.waitForFunction(()=>window.__hcOps.renderVals().liveCheckout.rulesState==='failed'&&window.__hcOps.renderVals().liveCheckout.extrasState==='failed');
  await customer.getByRole('button',{name:'Retry pickup days',exact:true}).scrollIntoViewIfNeeded();await shot('pickup-failed');
  await customer.getByRole('button',{name:'Retry order options',exact:true}).scrollIntoViewIfNeeded();await shot('options-kept');
  assert(await customer.evaluate(()=>window.__hcOps.renderVals().liveCheckout.extras.addOns.find(item=>item.id===window.keptOption.id).rows.find(row=>row.key===window.keptOption.key).qty===1),'An unread options response erased a selection');
  await customer.evaluate(()=>{window.pickupFailure=false;});await customer.getByRole('button',{name:'Retry pickup days',exact:true}).click();await customer.waitForFunction(()=>window.__hcOps.renderVals().liveCheckout.rulesState==='ready');
  assert(await customer.getByRole('button',{name:'Place order',exact:true}).isDisabled(),'Unchecked selected options enabled a new order');
  await customer.evaluate(()=>{window.optionsFailure=false;});await customer.getByRole('button',{name:'Retry order options',exact:true}).click();await customer.waitForFunction(()=>window.__hcOps.renderVals().liveCheckout.extrasState==='ready');
  await customer.evaluate(()=>{window.holdPickup=true;window.earlierPickup=window.__hcOps.loadShopOrders(window.checkoutA);});await customer.waitForFunction(()=>typeof window.releasePickup==='function');
  await customer.evaluate(async()=>{await window.__hcOps.loadShopOrders(window.checkoutA);window.releasePickup();await window.earlierPickup;});
  assert(await customer.evaluate(()=>window.__hcOps.renderVals().liveCheckout.rulesState==='ready'&&window.__hcOps.renderVals().liveCheckout.fields.name==='Keep my checkout name'&&window.checkoutReadWrites===0),'Late pickup failure replaced a fresh read, lost fields, or wrote');await shot('pickup-options-recovered');console.log(JSON.stringify({width,checkoutReadRecovery:true,selectedOptionsRetained:true,latePickupIgnored:true,noOrderWrites:true}));
  await customer.evaluate(()=>window.__hcOps.loadShopOrders(null));await customer.waitForFunction(()=>window.__hcOps.renderVals().liveCheckout.rulesState==='failed');
  assert(await customer.evaluate(()=>window.__hcOps.renderVals().liveCheckout.dates.length===0&&window.checkoutReadWrites===0),'Retired checkout source retained dates or wrote');console.log(JSON.stringify({width,checkoutSources:true,fieldsRestored:true,retiredCallbacksBlocked:true,noOrderWrites:true}));
  assert(!errors.length,'Public payment browser errors: '+errors.join('; '));console.log(JSON.stringify({width,anonymousPaymentRecovery:true,lateAnswerRejected:true,noRecoveryWrites:true,offlineDisabled:true,fieldsRetained:true,removedSourceCleared:true}));
 }finally{await customer.close();if(stamp)await save('222',false);}
};
