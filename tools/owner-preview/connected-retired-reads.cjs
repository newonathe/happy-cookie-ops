// A locked production workspace must not trap unrelated owner reads in loading.
exports.run=async({page,context,connect,attempts,bazaarAttempts,width,out,assert})=>{
 const other=await context.newPage(),before=[attempts.length,bazaarAttempts.length];
 try{
  await other.goto('http://127.0.0.1:4186/',{waitUntil:'domcontentloaded'});
  await connect(other,true);
  await other.evaluate(()=>{
   const r=window.__hcOps,source=window.connectedProductionClient;
   window.heldReads=new Map();window.holdOwnerReads=true;
   const client={rpc:async(name,args)=>{
    const answer=await source.rpc(name,args);
    if(window.holdOwnerReads&&['get_books','get_stock_catalogue'].includes(name))await new Promise(resolve=>window.heldReads.set(name,resolve));
    return answer;
   }};
   window.pendingOwnerReads=[r.loadBooks(client),r.loadStockCatalogue(client)];
  });
  await other.waitForFunction(()=>window.heldReads.size===2);
  await other.getByRole('button',{name:'Retry production work',exact:true}).click();
  await other.getByText('Production is open in another tab',{exact:true}).waitFor();
  const applied=await other.evaluate(async()=>{window.holdOwnerReads=false;for(const release of window.heldReads.values())release();return Promise.all(window.pendingOwnerReads);});
  assert(applied.every(value=>value===false),'A retired owner read applied its held answer');
  await other.evaluate(()=>window.__hcOps.go('inventory'));
  await other.getByText('Inventory is unavailable',{exact:true}).waitFor();
  assert(await other.evaluate(()=>window.__hcOps.renderVals().liveStock===null),'Retired inventory became confirmed empty');
  await other.screenshot({path:`${out}/retired-inventory-retry-${width}.png`,fullPage:true});
  await other.getByRole('button',{name:'Retry inventory',exact:true}).click();
  await other.waitForFunction(()=>window.__hcOps.renderVals().liveStockRead.state==='ready');
  assert(await other.evaluate(()=>window.__hcOps.renderVals().liveStock.items.find(i=>i.name==='Connected flour')?.qtyText==='1,750 g'),'A fresh inventory read lost the real balance');
  await other.evaluate(()=>window.__hcOps.go('pnl'));
  await other.getByRole('button',{name:'Retry reading books',exact:true}).click();
  await other.waitForFunction(()=>window.__hcOps.renderVals().liveMoney.read.state==='read');
  assert(await other.evaluate(()=>window.__hcOps.renderVals().liveMoney.revenue===300),'A fresh books read lost real revenue');
  await other.screenshot({path:`${out}/retired-books-recovered-${width}.png`,fullPage:true});
  await page.evaluate(()=>window.__hcOps.go('bake'));
  await page.waitForFunction(()=>window.__hcOps.renderVals().liveProduction?.recovery?.status==='ready');
  assert(attempts.length===before[0]&&bazaarAttempts.length===before[1],'Read recovery wrote a production or Bazaar transaction');
  console.log(JSON.stringify({width,retiredReadsRecover:true,nativeLockedTab:true,staleAnswersRejected:true,inventory:1750,revenue:300,noRecoveryWrites:true}));
 }finally{await other.close();}
};
