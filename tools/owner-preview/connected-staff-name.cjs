// Current fixture JWT supplies the controlled session; profile reads use the real SDK/RLS.
exports.run = async ({page,userId,origin,width,out,assert}) => {
 const authModule='/@fs'+require('node:path').resolve(__dirname,'../../src/lib/auth/offline-trust.ts');
 const facts=await page.evaluate(async({userId,origin,authModule})=>{
  const r=window.__hcOps,client=window.connectedProductionClient;
  const originalCheck=localStorage.getItem('hc-live-check'),originalName=localStorage.getItem('hc-live-staff-name');
  const {rememberCheck}=await import(authModule);
  const session={data:{session:{user:{id:userId}}}};
  const fresh={auth:{getSession:async()=>session},from:(...args)=>client.from(...args)};
  const snapshot=()=>JSON.stringify({clerk:r.renderVals().clerkName,remembered:localStorage.getItem('hc-live-staff-name')});
  const answers=[];
  try {
   rememberCheck('owner');
   const scope={userId,business:origin};r.bindStaffIdentity(scope);
   for(const phase of ['profile','session','removed']){
    let release,started;
    const held=new Promise(resolve=>{started=resolve;});let profileReads=0;
    const old={auth:{getSession:async()=>{
     if(phase==='session')await new Promise(resolve=>{release=resolve;started();});return session;
    }},from:(...args)=>({select:async(...fields)=>{
     profileReads++;const answer=await client.from(...args).select(...fields);
     await new Promise(resolve=>{release=resolve;started();});return answer;
    }})};
    const pending=r.loadStaffName(old,'owner');await held;
    if(phase==='removed')await r.loadStaffName(null,'owner');
    else if(!await r.loadStaffName(fresh,'owner'))throw Error('Current real profile read failed');
    const current=snapshot();release();const accepted=await pending;
    if(accepted||snapshot()!==current||phase==='session'&&profileReads!==0)throw Error('Retired staff reply published or forwarded a profile read');
    answers.push({phase,retired:true,profileReads});
   }
   const currentName=r.renderVals().clerkName;
   r.bindStaffIdentity({userId:'other-fixture-account',business:origin});
   if(r.renderVals().clerkName!=='Owner'||localStorage.getItem('hc-live-staff-name')!==null||await r.loadStaffName(fresh,'owner'))throw Error('Same-role switch retained another account name or accepted a mismatched session');
   r.bindStaffIdentity(scope);
   if(r.renderVals().clerkName!=='Owner'||!await r.loadStaffName(fresh,'owner')||r.renderVals().clerkName!==currentName)throw Error('Account round trip revived a cached name or lost fresh profile');
   const cache=localStorage.getItem('hc-live-staff-name');
   r.bindStaffIdentity({userId,business:origin+'/other-backend'});
   if(r.renderVals().clerkName!=='Owner'||localStorage.getItem('hc-live-staff-name')!==null)throw Error('Backend change kept prior account attribution');
   if(cache)localStorage.setItem('hc-live-staff-name',cache);
   r.restoreStaffName('owner',scope);
   if(r.renderVals().clerkName!==currentName)throw Error('Matching offline account lost its recorded name');
   answers.push({phase:'account-backend-round-trip',retired:true});
   r.go('today');return answers;
  } finally {
   for(const [key,value] of [['hc-live-check',originalCheck],['hc-live-staff-name',originalName]]){
    if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);
   }
  }
 },{userId,origin,authModule});
 assert(facts.length===4&&facts.every(row=>row.retired),'Staff reply isolation proof incomplete');
 await page.getByRole('button',{name:'Open Money',exact:true}).waitFor();
 await page.screenshot({path:`${out}/staff-name-current-${width}.png`,fullPage:true});
 console.log(JSON.stringify({width,staffNameReadIsolation:true,realProfileReads:true,controlledFixtureSession:true,phases:facts}));
};
