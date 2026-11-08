// Real anonymous menu reads on the already verified disposable fixture.
exports.run=async({page,context,origin,anon,nonce,width,out,assert})=>{
 const claims=JSON.parse(Buffer.from(anon.split('.')[1],'base64url'));
 assert(claims.role==='anon'&&claims.iss==='hco-local-fixture'&&claims.fixture_nonce===nonce&&claims.exp>Date.now()/1000,'A current fixture-owned anonymous token is required');
 const publish=async ids=>{const answer=await page.evaluate(ids=>window.connectedProductionClient.rpc('publish_flavours',{p_ids:ids}),ids);assert(!answer.error,'Local menu publish was refused');};
 const customer=await context.newPage(),errors=[];customer.on('pageerror',e=>errors.push(e.message));
 const shot=async name=>{assert(await customer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Customer recovery overflows');await customer.screenshot({path:`${out}/shop-menu-${name}-${width}.png`,fullPage:true});};
 try{
  await publish(['dcf']);await customer.goto('http://127.0.0.1:4186/?public-shop=1',{waitUntil:'domcontentloaded'});
  await customer.waitForFunction(()=>window.__hcOps?.state.screen==='shop');
  await customer.evaluate(async({origin,anon})=>{
   const {createClient}=await import('/connected-client.ts'),nativeFetch=window.fetch.bind(window);
   window.menuFailure=true;window.publicMenuRequests=0;
   const client=createClient(origin,anon,{accessToken:async()=>anon,auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(input,init)=>{
    const url=new URL(typeof input==='string'?input:input.url);url.pathname=url.pathname.replace(/^\/rest\/v1/,'');
    if(url.origin!==origin||url.pathname!=='/shop_products'||(init?.method??'GET')!=='GET')throw Error('Unexpected customer request');
    window.publicMenuRequests++;if(window.menuFailure)throw TypeError('Injected unavailable local menu');return nativeFetch(url,init);
   }}});window.publicMenuClient=client;await window.__hcOps.loadShopMenu(client);
  },{origin,anon});
  await customer.getByText('Menu is unavailable. Try reading it again.',{exact:true}).waitFor();await shot('unavailable');
  await customer.evaluate(()=>{window.menuFailure=false;});await customer.getByRole('button',{name:'Retry menu',exact:true}).click();
  await customer.waitForFunction(()=>window.__hcOps.renderVals().liveShopMenuRead.state==='ready');
  assert(await customer.evaluate(()=>window.__hcOps.renderVals().shopFlavours.length===1),'Anonymous Retry did not restore the published menu');
  await customer.evaluate(async()=>{window.menuFailure=true;await window.__hcOps.loadShopMenu(window.publicMenuClient);window.__hcOps.setState({online:false});});
  await customer.getByText(/Menu could not be refreshed. Showing the last successful read./).waitFor();
  assert(await customer.getByRole('button',{name:'Retry menu',exact:true}).isDisabled(),'Offline menu Retry stayed enabled');
  assert(await customer.evaluate(()=>window.__hcOps.renderVals().shopFlavours.length===1),'Failed refresh lost the last-good menu');await shot('stale-offline');
  await publish([]);await customer.evaluate(async()=>{window.menuFailure=false;window.__hcOps.setState({online:true});await window.__hcOps.loadShopMenu(window.publicMenuClient);});
  await customer.getByText('There are no flavours on the menu right now.',{exact:true}).waitFor();await shot('empty');
  assert(await customer.evaluate(()=>window.__hcOps.renderVals().shopFlavours.length===0),'An empty public projection showed demo flavours');
  assert(!errors.length,'Customer menu browser errors: '+errors.join('; '));console.log(JSON.stringify({width,anonymousMenuRecovery:true,staleRetained:true,offlineDisabled:true,realEmpty:true,errors}));
 }finally{await customer.close();await publish(['dcf']);}
};
