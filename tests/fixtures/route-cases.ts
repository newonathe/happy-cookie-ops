/** Stable IDs map to the route/state inventory in master-plan/01. No backend claims. */
export const routeCases = [
  ['/', 'Home'],
  ['/sales', 'Sales log'],
  ['/orders', 'Orders'],
  ['/order', 'Order detail'],
  ['/lookup', 'Find my order'],
  ['/reconcile', 'Payments'],
  ['/bake', 'Bake plan'],
  ['/batch', 'Production focus'],
  ['/inventory', 'Inventory'],
  ['/stocktake', 'Inventory'],
  ['/more', 'All tools'],
  ['/grocery', 'Grocery list'],
  ['/bazaar', 'Bazaar Mode'],
  ['/pnl', 'P and L'],
  ['/formqueue', 'Form queue'],
  ['/health', 'System health'],
  ['/products', 'Products'],
  ['/notifications', 'Notifications'],
  ['/shop', 'Customer shop'],
  ['/checkout', 'Customer checkout'],
  ['/status', 'Customer order status'],
  ['/recipes', 'Recipes'],
  ['/drops', 'Drops'],
  ['/suppliers', 'Suppliers'],
  ['/settings', 'Settings']
] as const;
export const fixtureTime = new Date('2026-03-04T09:30:00+08:00');
