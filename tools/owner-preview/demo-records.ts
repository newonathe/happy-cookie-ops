// Synthetic preview records only. No hosted reads or writes are used by this module.
const stamp = '2026-11-04T00:00:00.000Z';
const line = (name: string, qty: number, unit = 'g', kind: 'ingredient' | 'packaging' = 'ingredient') => ({ name, qty, unit, kind });
export const demoRecipes = [
  { product_id: 'dcf', version: 3, lines: [line('All-purpose flour',250),line('Unsalted butter',130),line('Brown sugar',120),line('Chocolate chunks',150),line('Cocoa powder',25)] },
  { product_id: 'hc', version: 2, lines: [line('All-purpose flour',250),line('Unsalted butter',130),line('Brown sugar',120),line('Chocolate chunks',120),line('Marshmallows',80)] },
  { product_id: 'wcb', version: 2, lines: [line('All-purpose flour',250),line('Unsalted butter',130),line('Brown sugar',120),line('Biscoff spread',80)] },
  { product_id: 'pbm', version: 1, lines: [line('All-purpose flour',250),line('Unsalted butter',130),line('Peanut butter',100)] },
  { product_id: 'rvc', version: 1, lines: [line('All-purpose flour',250),line('Unsalted butter',130),line('Cream cheese',100)] },
  { product_id: 'nch', version: 1, lines: [line('All-purpose flour',250),line('Unsalted butter',130),line('Hazelnut spread',80)] }
].map(row => ({ ...row, yield:12, updated_at:stamp,
  lines:[...row.lines,line('Cookie pouch',12,'pcs','packaging')],
  history:row.version>1?[{version:row.version-1,yield:12,lines:row.lines.map(l=>({...l,qty:l.qty*0.9}))}]:[] }));

const item = (id:string,name:string,unit:string,qty:number,par:number,pack:number,category='Ingredients',counted=true) => ({
  id:'demo-'+id,name,unit,category,on_hand:qty,par_level:par,pack_size:pack,pack_label:`${pack} ${unit}`,
  supplier_id:category==='Packaging'?'demo-packaging':'qa-baking',use_by_days:null,
  last_counted:counted?stamp:null,active:true,updated_at:stamp
});
export const demoStock = [
  item('butter','Unsalted butter','g',600,500,225),item('sugar','Brown sugar','g',0,500,1000,'Ingredients',false),
  item('chocolate','Chocolate chunks','g',1400,500,1000),item('cocoa','Cocoa powder','g',500,200,500),
  item('marshmallow','Marshmallows','g',200,100,500),item('biscoff','Biscoff spread','g',90,200,400),
  item('peanut','Peanut butter','g',400,200,500),item('cream-cheese','Cream cheese','g',300,200,250),
  item('hazelnut','Hazelnut spread','g',500,200,400),item('pouch','Cookie pouch','pcs',120,50,50,'Packaging'),
  item('sticker','Brand sticker','pcs',0,50,100,'Packaging',false)
];
export const demoSuppliers = [
  {id:'demo-packaging',name:'Packaging Supply',place:'Quezon City',phone:'',notes:'Cookie pouches and brand stickers',active:true,updated_at:stamp},
  {id:'demo-pantry',name:'Pantry Wholesale',place:'Marikina',phone:'',notes:'Alternative ingredient supplier',active:true,updated_at:stamp}
];
