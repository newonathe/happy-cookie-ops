// Real identity RPCs on the caller's disposable, nonce-owned local fixture only.
exports.run = async ({ page, width, out, assert }) => {
 const original = await page.evaluate(() => window.connectedProductionClient.rpc('get_shop_identity'));
 assert(!original.error && original.data, 'Read original local shop identity');
 const fields = row => Object.fromEntries(['shop_name','owner_name','contact_line','tagline'].map(key => [key, row[key] ?? '']));
 const save = async value => {
  const reply = await page.evaluate(async value => {
   const client = window.connectedProductionClient, current = await client.rpc('get_shop_identity');
   if (current.error) throw Error('Read fixture identity stamp');
   return client.rpc('save_shop_identity', { p_identity: value, p_expected_updated_at: current.data.updated_at });
  }, value);
  assert(!reply.error && reply.data?.[0]?.updated_at, 'Save local fixture identity');
 };
 try {
  await save({ shop_name:'Local identity A', owner_name:'Local owner A', contact_line:'Contact local A.', tagline:'Local identity line A.' });
  await page.evaluate(async () => {
   const r = window.__hcOps, client = window.connectedProductionClient;
   await r.loadShopIdentity(client); r.go('shop');
   const held = { rpc: async (...args) => {
    const answer = await client.rpc(...args);
    if (args[0] === 'get_shop_identity') await new Promise(resolve => { window.releaseIdentityRead = resolve; });
    return answer;
   }};
   window.retiredIdentityRead = r.loadShopIdentity(held);
  });
  await page.waitForFunction(() => typeof window.releaseIdentityRead === 'function');
  await save({ shop_name:'Local identity B', owner_name:'Local owner B', contact_line:'Contact local B.', tagline:'Local identity line B.' });
  await page.evaluate(async () => {
   const r = window.__hcOps, client = window.connectedProductionClient;
   window.currentIdentityClient = { rpc: (...args) => client.rpc(...args) };
   await r.loadShopIdentity(window.currentIdentityClient);
   window.releaseIdentityRead();
   if (await window.retiredIdentityRead) throw Error('Retired real identity read was accepted');
  });
  await page.getByText('Local identity line B.', { exact:true }).waitFor();
  assert(await page.getByText('Local identity line A.', { exact:true }).count() === 0, 'Retired contact source appeared');
  await page.screenshot({ path:`${out}/shop-identity-current-${width}.png`, fullPage:true });
  await page.evaluate(async () => { const r=window.__hcOps; await r.loadShopIdentity(null); r.setState({sheet:{kind:'shoptexts'}}); });
  await page.getByRole('button', {name:'Save shop details',exact:true}).waitFor();
  assert(await page.getByRole('button', {name:'Save shop details',exact:true}).isDisabled(), 'Null-source identity stayed writable');
  assert(await page.locator('input[name="shopName"]').inputValue() === '', 'Retired identity remained in form');
  await page.evaluate(async () => { await window.__hcOps.loadShopIdentity(window.currentIdentityClient); });
  await page.getByLabel('The line under the shop heading', {exact:true}).fill('Local identity line C.');
  await page.getByRole('button', {name:'Save shop details',exact:true}).click();
  await page.waitForFunction(() => window.__hcOps.renderVals().shopTagline === 'Local identity line C.');
  const saved = await page.evaluate(() => window.connectedProductionClient.rpc('get_shop_identity'));
  assert(!saved.error && saved.data.tagline === 'Local identity line C.' && saved.data.contact_line === 'Contact local B.', 'Current identity form did not save or lost other fields');
  await page.screenshot({ path:`${out}/shop-identity-saved-${width}.png`, fullPage:true });
  console.log(JSON.stringify({width,identitySourceIsolation:true,retiredRealRead:true,nullSourceDisabled:true,currentIdentitySave:true}));
 } finally {
  await save(fields(original.data));
  await page.evaluate(async () => {const r=window.__hcOps;r.closeSheet();await r.loadShopIdentity(window.connectedProductionClient);r.go('inventory');});
 }
};
