// Read-only diagnostics against the original engine; synthetic synchronous React stub.
// This is NOT a React lifecycle, Supabase, or product acceptance test.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../../..');
let source = fs.readFileSync(path.join(root, 'src/store/engine/ops-engine.js'), 'utf8');
source = source.replace("import * as React from 'react';", '').replace(/export (const|class) /g, '$1 ').replace(/export \{[\s\S]*?\};\s*$/, '');
class Component {
  constructor(props) { this.props = props; }
  setState(update, callback) { this.state = Object.assign({}, this.state, typeof update === 'function' ? update(this.state) : update); if (callback) callback(); }
}
const context = { React: { Component, createContext: () => ({}), createElement: () => null }, Date, Math, console, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {} };
vm.createContext(context);
vm.runInContext(source + '\nthis.Engine = OpsEngine;', context);
function engine() { const e = new context.Engine({ boxPricing: 'Sum of menu prices', packagingFee: 38.44, capacity: 200 }); e.toast = () => {}; e.advanceIfHint = () => {}; return e; }
const results = {};
const price = engine();
price.state.cfg.priceMode = 'Menu prices + packaging fee';
const items = { dcf: 1 }, priced = { dcf: 130 };
results.historicalPackaging = { before: price.boxTotal(items, priced) };
price.state.cfg.packagingFee = 50;
results.historicalPackaging.after = price.boxTotal(items, priced);
const stock = engine();
stock.state.orders = [];
stock.state.baked = { dcf: 10 };
stock.startEvent({ name: 'Synthetic event', date: 'test' });
stock.setEventStock('dcf', 5);
stock.openSelling();
results.closeThenReset = { afterLoad: stock.state.baked.dcf };
stock.closeEvent();
results.closeThenReset.afterClose = stock.state.baked.dcf;
results.closeThenReset.tableAfterClose = stock.state.eventStock.dcf;
stock.resetEvent();
results.closeThenReset.afterReset = stock.state.baked.dcf;
const sale = engine();
sale.state.orders = [];
sale.state.baked = { dcf: 10, hc: 10 };
sale.startEvent({ name: 'Synthetic event', date: 'test' });
sale.setEventStock('dcf', 5); sale.setEventStock('hc', 5); sale.openSelling();
sale.addCart('dcf', 1); sale.recordSale('Cash', false);
results.onlineSaleImmediatelySynced = sale.state.sales[0].synced;
sale.addCart('dcf', 1); sale.recordSale('Cash', false);
sale.voidSale('S1');
sale.addCart('dcf', 1); sale.recordSale('Cash', false);
results.reusedDisplayIds = sale.state.sales.map(x => x.id);
sale.addCart('dcf', 1); sale.addCart('dcf', -1); sale.addCart('hc', 1);
sale.recordSale('Cash', false);
results.zeroQuantityInRecordedItems = sale.state.sales[0].items;
const capacity = engine();
results.capacityMembership = {};
for (const status of ['Payment review', 'Confirmed', 'Preparing', 'Ready', 'Completed', 'No-show', 'Cancelled']) {
  capacity.state.orders = [{ id: 'synthetic', status, drop: capacity.state.dropNo, items: { dcf: 1 } }];
  results.capacityMembership[status] = capacity.confirmedCookies(capacity.state);
}
fs.writeFileSync(path.join(__dirname, 'engine-probes.json'), JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results, null, 2));
