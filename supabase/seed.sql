-- Seed for local development.
--
-- GENERATED from the engine's own constants (src/store/engine/ops-engine.js: PRODUCTS,
-- INVENTORY, SUPPLIERS, PACK_SIZE, RECIPES, USE_BY_DAYS), so `pnpm db:reset` gives you
-- exactly the numbers the design shows. Do not hand-edit: change the engine, then
-- regenerate with `node scripts/gen-seed.mjs`.
--
-- Money is centavos. Quantities are the item's own unit (g, ml, pcs), never rounded.

-- suppliers -----------------------------------------------------------------
insert into suppliers (id, name, place) values
  ('s-r-membership', 'S&R Membership', 'Congressional Ave'),
  ('landers', 'Landers', 'Balintawak'),
  ('chocolate-lover', 'Chocolate Lover', 'Online · ships in 2 days'),
  ('divisoria-packaging', 'Divisoria Packaging', 'Tabora St'),
  ('sticker-shop-ph', 'Sticker Shop PH', 'Online · Shopee'),
  ('puregold', 'Puregold', 'Fairview'),
  ('wet-market', 'Wet market', 'Novaliches'),
  ('baking-supply', 'Baking supply', 'Shopee · Baker’s Depot'),
  ('japanese-grocery', 'Japanese grocery', ''),
  ('healthy-options', 'Healthy Options', '')
on conflict (id) do nothing;

-- catalogue -----------------------------------------------------------------
insert into products (id, name, short_name, price_cents, kind, tag, description, image_path, sort_order) values
  ('dcf', 'double chocolate fudge', 'Double Chocolate Fudge', 13000, 'Permanent', '', 'golden-brown edges and soft, pillowy center studded with pools of molten chocolate.', '/assets/double-chocolate-fudge.png', 1),
  ('hc', 'happy camper', 'Happy Camper', 14000, 'Permanent', '', 'browned butter, toasted marshmallow pockets, melted milk chocolate, graham cracker crunch.', '/assets/happy-camper.png', 2),
  ('wcb', 'white chocolate biscoff', 'White Chocolate Biscoff', 14500, 'Permanent', 'Best seller', 'crunchy, caramelized biscuit, biscoff cookie butter. white chocolate chips that melts in your mouth.', '/assets/white-chocolate-biscoff.png', 3),
  ('pbm', 'pb & miso', 'PB & Miso', 8000, 'Permanent', 'Best seller', 'white shiro miso infused with chunky peanut butter. sugar-crusted outside, soft center.', '/assets/pb-miso.png', 4),
  ('rvc', 'red velvet cheesecake', 'Red Velvet Cheesecake', 15000, 'Rotating', 'New', 'rich red velvet packed with melted white chocolate and a tangy cream cheese center.', '/assets/red-velvet-cheesecake.png', 5),
  ('nch', 'nutella churro', 'Nutella Churro', 20000, 'Rotating', 'New', 'churro-inspired cinnamon sugar base, soft cookie center filled with rich molten nutella.', '/assets/nutella-churro.png', 6)
on conflict (id) do nothing;

-- stock ---------------------------------------------------------------------
insert into inventory_items (id, category, name, unit, on_hand, par_level, pack_size, supplier_id, use_by_days, last_counted) values
  ('unsalted-butter', 'Ingredients', 'Unsalted butter', 'g', 900, 2000, 1000, 's-r-membership', 9, now() - interval '3 days'),
  ('bread-flour', 'Ingredients', 'Bread flour', 'g', 4200, 3000, 1000, 'landers', null, now() - interval '3 days'),
  ('all-purpose-flour', 'Ingredients', 'All-purpose flour', 'g', 3800, 2500, 1000, 'landers', null, now() - interval '3 days'),
  ('brown-sugar', 'Ingredients', 'Brown sugar', 'g', 2600, 2000, 1000, 'puregold', null, now() - interval '3 days'),
  ('white-sugar', 'Ingredients', 'White sugar', 'g', 1900, 1500, 1000, 'puregold', null, now() - interval '3 days'),
  ('eggs', 'Ingredients', 'Eggs', 'pcs', 24, 18, 30, 'wet-market', 13, now() - interval '2 days'),
  ('dark-chocolate-55', 'Ingredients', 'Dark chocolate 55%', 'g', 1450, 1000, 1000, 'chocolate-lover', 128, now() - interval '5 days'),
  ('milk-chocolate', 'Ingredients', 'Milk chocolate', 'g', 820, 600, 1000, 'chocolate-lover', 96, now() - interval '5 days'),
  ('white-chocolate-chips', 'Ingredients', 'White chocolate chips', 'g', 1100, 800, 1000, 'chocolate-lover', 110, now() - interval '5 days'),
  ('cocoa-powder', 'Ingredients', 'Cocoa powder', 'g', 640, 400, 500, 'landers', null, now() - interval '5 days'),
  ('biscoff-spread', 'Ingredients', 'Biscoff spread', 'g', 90, 500, 400, 'landers', 60, now() - interval '3 days'),
  ('biscoff-biscuits', 'Ingredients', 'Biscoff biscuits', 'g', 480, 300, 250, 'landers', null, now() - interval '3 days'),
  ('chunky-peanut-butter', 'Ingredients', 'Chunky peanut butter', 'g', 900, 600, 1000, 's-r-membership', null, now() - interval '3 days'),
  ('shiro-miso', 'Ingredients', 'Shiro miso', 'g', 220, 150, 500, 'japanese-grocery', null, now() - interval '17 days'),
  ('cream-cheese', 'Ingredients', 'Cream cheese', 'g', 700, 500, 900, 's-r-membership', 5, now() - interval '3 days'),
  ('nutella', 'Ingredients', 'Nutella', 'g', 950, 600, 750, 'landers', 74, now() - interval '3 days'),
  ('mini-marshmallows', 'Ingredients', 'Mini marshmallows', 'g', 380, 300, 500, 'puregold', null, now() - interval '5 days'),
  ('graham-crackers', 'Ingredients', 'Graham crackers', 'g', 420, 250, 500, 'puregold', null, now() - interval '5 days'),
  ('cinnamon', 'Ingredients', 'Cinnamon', 'g', 160, 80, 250, 'landers', null, now() - interval '17 days'),
  ('baking-soda', 'Ingredients', 'Baking soda', 'g', 240, 100, 500, 'puregold', null, now() - interval '17 days'),
  ('fine-salt', 'Ingredients', 'Fine salt', 'g', 500, 200, 500, 'puregold', null, now() - interval '17 days'),
  ('maldon-sea-salt', 'Ingredients', 'Maldon sea salt', 'g', 180, 100, 250, 'healthy-options', null, now() - interval '17 days'),
  ('vanilla-extract', 'Ingredients', 'Vanilla extract', 'ml', 120, 60, 250, 'landers', null, now() - interval '17 days'),
  ('red-velvet-gel-colour', 'Ingredients', 'Red velvet gel colour', 'ml', 45, 20, 100, 'baking-supply', null, now() - interval '17 days'),
  ('box-of-6', 'Packaging', 'Box of 6', 'pcs', 9, 20, 25, 'divisoria-packaging', null, now() - interval '3 days'),
  ('single-cookie-pouch', 'Packaging', 'Single cookie pouch', 'pcs', 64, 40, 100, 'divisoria-packaging', null, now() - interval '3 days'),
  ('brand-sticker', 'Packaging', 'Brand sticker', 'pcs', 4, 25, 100, 'sticker-shop-ph', null, now() - interval '3 days'),
  ('thank-you-card', 'Packaging', 'Thank-you card', 'pcs', 42, 25, 50, 'sticker-shop-ph', null, now() - interval '17 days'),
  ('paper-bag', 'Packaging', 'Paper bag', 'pcs', 30, 20, 25, 'divisoria-packaging', null, now() - interval '17 days'),
  ('bubble-wrap-sheet', 'Packaging', 'Bubble wrap sheet', 'pcs', 55, 30, 50, 'divisoria-packaging', null, now() - interval '17 days')
on conflict (id) do nothing;

-- supplier price book ------------------------------------------------------
insert into supplier_prices (supplier_id, item_name, pack_label, price_cents, previous_cents, last_bought, preferred) values
  ('s-r-membership', 'Unsalted butter', '1 kg block', 42000, '{43800,44500}', '2 Aug', true),
  ('s-r-membership', 'Cream cheese', '900 g tub', 61000, '{59800}', '2 Aug', true),
  ('s-r-membership', 'Chunky peanut butter', '1 kg jar', 38500, '{39900}', '11 Aug', true),
  ('landers', 'Biscoff spread', '400 g jar', 28500, '{27900,29500}', '11 Aug', true),
  ('landers', 'Nutella', '750 g jar', 46500, '{48000}', '5 Aug', true),
  ('landers', 'Bread flour', '1 kg', 9200, '{8800}', '5 Aug', true),
  ('landers', 'Unsalted butter', '1 kg block', 45500, '{45000}', '19 Jul', false),
  ('chocolate-lover', 'Dark chocolate 55%', '1 kg', 72000, '{74000,71500}', '9 Aug', true),
  ('chocolate-lover', 'White chocolate chips', '1 kg', 68000, '{69000}', '9 Aug', true),
  ('chocolate-lover', 'Milk chocolate', '1 kg', 64000, '{65500}', '9 Aug', true),
  ('divisoria-packaging', 'Box of 6', 'Pack of 25', 37500, '{36000,35500}', '1 Aug', true),
  ('divisoria-packaging', 'Single cookie pouch', 'Pack of 100', 24000, '{23500}', '1 Aug', true),
  ('sticker-shop-ph', 'Brand sticker', 'Roll of 100', 20500, '{19900}', '4 Aug', true),
  ('sticker-shop-ph', 'Thank-you card', 'Pack of 50', 18000, '{17500}', '4 Aug', true),
  ('puregold', 'Brown sugar', '1 kg', 7800, '{7500}', '11 Aug', true),
  ('puregold', 'White sugar', '1 kg', 6800, '{7000}', '11 Aug', true),
  ('puregold', 'Unsalted butter', '1 kg block', 43800, '{43000}', '5 Jul', false),
  ('wet-market', 'Eggs', 'Tray of 30', 24000, '{25200,23500}', '12 Aug', true),
  ('baking-supply', 'All-purpose flour', '1 kg', 7400, '{7800}', '5 Aug', true),
  ('baking-supply', 'Cocoa powder', '500 g', 32000, '{33500}', '9 Aug', true),
  ('baking-supply', 'Biscoff biscuits', '250 g', 16500, '{17200}', '11 Aug', true),
  ('baking-supply', 'Baking soda', '500 g', 8500, '{8200}', '28 Jul', true),
  ('baking-supply', 'Fine salt', '500 g', 4500, '{4500}', '28 Jul', true),
  ('baking-supply', 'Vanilla extract', '250 ml', 28000, '{29000}', '28 Jul', true),
  ('baking-supply', 'Red velvet gel colour', '100 ml', 19500, '{20500}', '28 Jul', true),
  ('baking-supply', 'Mini marshmallows', '500 g', 14500, '{15000}', '9 Aug', true),
  ('baking-supply', 'Graham crackers', '500 g', 13000, '{12800}', '9 Aug', true),
  ('baking-supply', 'Cinnamon', '250 g', 17500, '{18000}', '28 Jul', true),
  ('baking-supply', 'Shiro miso', '500 g', 34000, '{35500}', '28 Jul', true),
  ('baking-supply', 'Maldon sea salt', '250 g', 42000, '{43000}', '28 Jul', true)
on conflict (supplier_id, item_name) do nothing;

-- recipes -------------------------------------------------------------------
insert into recipes (product_id, yield_count) values
  ('wcb', 24),
  ('hc', 14),
  ('dcf', 24),
  ('pbm', 24),
  ('rvc', 24),
  ('nch', 13)
on conflict (product_id) do nothing;

insert into recipe_ingredients (product_id, item_name, qty, unit) values
  ('wcb', 'Unsalted butter', 340, 'g'),
  ('wcb', 'Brown sugar', 300, 'g'),
  ('wcb', 'White sugar', 150, 'g'),
  ('wcb', 'Eggs', 2, 'pcs'),
  ('wcb', 'Bread flour', 480, 'g'),
  ('wcb', 'Baking soda', 6, 'g'),
  ('wcb', 'Fine salt', 5, 'g'),
  ('wcb', 'Biscoff spread', 250, 'g'),
  ('wcb', 'Biscoff biscuits', 120, 'g'),
  ('wcb', 'White chocolate chips', 300, 'g'),
  ('hc', 'Unsalted butter', 340, 'g'),
  ('hc', 'Brown sugar', 320, 'g'),
  ('hc', 'Eggs', 2, 'pcs'),
  ('hc', 'Bread flour', 470, 'g'),
  ('hc', 'Baking soda', 6, 'g'),
  ('hc', 'Fine salt', 5, 'g'),
  ('hc', 'Milk chocolate', 280, 'g'),
  ('hc', 'Mini marshmallows', 150, 'g'),
  ('hc', 'Graham crackers', 120, 'g'),
  ('dcf', 'Unsalted butter', 320, 'g'),
  ('dcf', 'Brown sugar', 300, 'g'),
  ('dcf', 'Eggs', 2, 'pcs'),
  ('dcf', 'Bread flour', 400, 'g'),
  ('dcf', 'Cocoa powder', 90, 'g'),
  ('dcf', 'Baking soda', 6, 'g'),
  ('dcf', 'Dark chocolate 55%', 380, 'g'),
  ('dcf', 'Maldon sea salt', 8, 'g'),
  ('pbm', 'Unsalted butter', 260, 'g'),
  ('pbm', 'Brown sugar', 280, 'g'),
  ('pbm', 'Eggs', 2, 'pcs'),
  ('pbm', 'All-purpose flour', 440, 'g'),
  ('pbm', 'Chunky peanut butter', 320, 'g'),
  ('pbm', 'Shiro miso', 60, 'g'),
  ('pbm', 'Baking soda', 6, 'g'),
  ('pbm', 'White sugar', 120, 'g'),
  ('rvc', 'Unsalted butter', 300, 'g'),
  ('rvc', 'White sugar', 280, 'g'),
  ('rvc', 'Eggs', 2, 'pcs'),
  ('rvc', 'All-purpose flour', 430, 'g'),
  ('rvc', 'Cocoa powder', 40, 'g'),
  ('rvc', 'Red velvet gel colour', 12, 'ml'),
  ('rvc', 'Cream cheese', 300, 'g'),
  ('rvc', 'White chocolate chips', 220, 'g'),
  ('nch', 'Unsalted butter', 300, 'g'),
  ('nch', 'White sugar', 260, 'g'),
  ('nch', 'Eggs', 2, 'pcs'),
  ('nch', 'All-purpose flour', 450, 'g'),
  ('nch', 'Cinnamon', 24, 'g'),
  ('nch', 'Nutella', 360, 'g'),
  ('nch', 'Baking soda', 6, 'g'),
  ('nch', 'Vanilla extract', 10, 'ml');
