// Business time must agree on devices using a different clock zone.
exports.run=async({page,width,out,assert})=>{
 const previous=await page.evaluate(()=>window.__hcOps.state.now);
 try{
  await page.evaluate(()=>{const r=window.__hcOps;r.go('today');r.setState({now:Date.parse('2026-11-08T16:00:00Z')});});
  await page.getByText('Good morning, Owner.',{exact:true}).waitFor();
  await page.getByText('Monday, 9 Nov',{exact:true}).waitFor();
  const clock=await page.evaluate(()=>({zone:Intl.DateTimeFormat().resolvedOptions().timeZone,day:window.__hcOps.renderVals().liveHome.dateText,greeting:window.__hcOps.renderVals().liveHome.greeting}));
  assert(clock.zone==='UTC','The business-clock check did not run on a UTC device');
  assert(clock.day==='Monday, 9 Nov'&&clock.greeting==='Good morning, Owner.','Home used the device day or salutation');
  await page.screenshot({path:`${out}/home-business-clock-${width}.png`,fullPage:true});
  console.log(JSON.stringify({width,homeBusinessClock:true,...clock}));
 }finally{await page.evaluate(now=>{const r=window.__hcOps;r.setState({now});r.go('bake');},previous);}
};
