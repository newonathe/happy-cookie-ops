/**
 * A drawn picture for a cookie that has no photo yet, made from its name: "Ube Crinkle" comes out purple,
 * "Chocolate Chip" golden with dark chips. The same name always draws the same picture. It is stored nowhere, and a real
 * photo takes its place as soon as one is uploaded. The owner's pages use it; the customer's shop does not.
 *
 * Only numbers and the fixed colours below reach the drawing, never the name itself, so nothing typed can leave the
 * `url(…)` it is spliced into. These colours are what the picture shows, not interface colours, so they are not tokens.
 */

interface Recipe {
  dough: readonly [hue: number, saturation: number, lightness: number];
  topping: Topping;
}

type Topping = 'chips' | 'white-chips' | 'nuts' | 'crumbs' | 'marshmallow' | 'sprinkles' | 'swirl';

const GOLDEN = [33, 58, 54] as const;
const DOUGHS: ReadonlyArray<readonly [RegExp, Recipe['dough']]> = [
  [/red velvet|strawberry|raspberry/, [352, 58, 38]],
  [/matcha|pandan|pistachio|mint/, [92, 32, 46]],
  [/\bube\b|taro|blueberry/, [275, 32, 42]],
  [/biscoff|speculoos|caramel|churro|cinnamon|peanut|\bpb\b|miso|camper/, [30, 62, 50]],
  [/white|vanilla|sugar|coconut|lemon|snicker/, [43, 62, 73]],
  [/chocolate chip|choc chip/, GOLDEN],
  [/choco|fudge|cocoa|brownie|nutella|oreo|mocha|coffee|espresso/, [18, 42, 23]]
];
const TOPPINGS: ReadonlyArray<readonly [RegExp, Topping]> = [
  [/funfetti|sprinkle|birthday|confetti/, 'sprinkles'],
  [/marshmallow|s.?more|camper/, 'marshmallow'],
  [/churro|cinnamon|nutella|swirl/, 'swirl'],
  [/peanut|\bpb\b|pecan|walnut|almond|hazelnut|pistachio|miso/, 'nuts'],
  [/biscoff|speculoos|crumble|oreo|caramel|apple|\bpie\b/, 'crumbs'],
  [/white|cheesecake|cream|vanilla|macadamia|coconut/, 'white-chips']
];
const SPRINKLES = ['hsl(350,80%,62%)', 'hsl(200,75%,55%)', 'hsl(48,90%,58%)', 'hsl(145,50%,48%)'];

function recipeFor(name: string): Recipe {
  const lower = name.toLowerCase();
  return {
    dough: DOUGHS.find(([words]) => words.test(lower))?.[1] ?? GOLDEN,
    topping: TOPPINGS.find(([words]) => words.test(lower))?.[1] ?? 'chips'
  };
}

/** The same name gives the same numbers, so a cookie keeps its picture from one page to the next. */
function numbersFrom(name: string): () => number {
  let seed = 2166136261;
  for (const ch of name.toLowerCase()) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619);
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const n = (value: number) => value.toFixed(1);

/** Spots on the cookie, spread out so they do not pile up. */
function spots(next: () => number, count: number, radius: number): Array<[number, number]> {
  const found: Array<[number, number]> = [];
  for (let tries = 0; found.length < count && tries < count * 40; tries += 1) {
    const angle = next() * Math.PI * 2;
    const reach = Math.sqrt(next()) * radius;
    const x = 60 + Math.cos(angle) * reach;
    const y = 60 + Math.sin(angle) * reach;
    if (found.every(([a, b]) => Math.hypot(a - x, b - y) > 13)) found.push([x, y]);
  }
  return found;
}

function chunk(next: () => number, x: number, y: number, size: number, fill: string): string {
  const points = Array.from({ length: 6 }, (_, i) => {
    const angle = (i / 6) * Math.PI * 2;
    const reach = size * (0.72 + next() * 0.45);
    return `${n(x + Math.cos(angle) * reach)},${n(y + Math.sin(angle) * reach)}`;
  });
  return `<polygon points="${points.join(' ')}" fill="${fill}" stroke="${fill}" stroke-width="1.6" stroke-linejoin="round"/>`;
}

function toppingOn(recipe: Recipe, next: () => number): string {
  const dark = recipe.dough[2] < 30;
  switch (recipe.topping) {
    case 'sprinkles':
      return spots(next, 16, 34)
        .map(([x, y], i) => {
          const turn = Math.round(next() * 180);
          return `<rect x="${n(x - 4)}" y="${n(y - 1.3)}" width="8" height="2.6" rx="1.3" fill="${SPRINKLES[i % SPRINKLES.length]}" transform="rotate(${turn} ${n(x)} ${n(y)})"/>`;
        })
        .join('');
    case 'marshmallow':
      return spots(next, 6, 30)
        .map(([x, y]) => {
          const toast = `hsl(38,${Math.round(55 + next() * 25)}%,${Math.round(84 + next() * 8)}%)`;
          return `<ellipse cx="${n(x)}" cy="${n(y)}" rx="7.5" ry="6" fill="${toast}"/>`;
        })
        .join('');
    case 'swirl': {
      const stroke = dark ? 'hsl(30,55%,48%)' : 'hsl(20,50%,30%)';
      let path = 'M60 60';
      for (let a = 0; a < Math.PI * 7; a += 0.35) {
        path += ` L${n(60 + Math.cos(a) * a * 1.75)} ${n(60 + Math.sin(a) * a * 1.75)}`;
      }
      return `<path d="${path}" fill="none" stroke="${stroke}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    case 'nuts':
      return spots(next, 8, 33)
        .map(([x, y]) => chunk(next, x, y, 5, 'hsl(32,48%,70%)'))
        .join('');
    case 'crumbs':
      return spots(next, 11, 35)
        .map(([x, y]) => chunk(next, x, y, 3.6, 'hsl(24,58%,32%)'))
        .join('');
    case 'white-chips':
      return spots(next, 9, 34)
        .map(([x, y]) => chunk(next, x, y, 4, 'hsl(45,70%,92%)'))
        .join('');
    default:
      return spots(next, 9, 34)
        .map(([x, y]) => chunk(next, x, y, 4.2, dark ? 'hsl(14,48%,11%)' : 'hsl(18,48%,20%)'))
        .join('');
  }
}

function drawing(name: string): string {
  const recipe = recipeFor(name);
  const next = numbersFrom(name);
  const [hue, saturation, lightness] = recipe.dough;
  const edge = Array.from({ length: 32 }, (_, i) => {
    const angle = (i / 32) * Math.PI * 2;
    const reach = 45 + next() * 2;
    return `${n(60 + Math.cos(angle) * reach)},${n(60 + Math.sin(angle) * reach)}`;
  }).join(' ');
  const bumps = spots(next, 7, 36)
    .map(
      ([x, y]) =>
        `<circle cx="${n(x)}" cy="${n(y)}" r="${n(5 + next() * 4)}" fill="hsl(${hue},${saturation}%,${lightness - 5}%)" opacity="0.45"/>`
    )
    .join('');
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">',
    `<defs><radialGradient id="d" cx="42%" cy="38%" r="70%">`,
    `<stop offset="0" stop-color="hsl(${hue},${saturation}%,${lightness + 7}%)"/>`,
    `<stop offset="1" stop-color="hsl(${hue},${saturation}%,${lightness - 7}%)"/>`,
    '</radialGradient></defs>',
    '<rect width="120" height="120" fill="hsl(40,70%,95%)"/>',
    '<ellipse cx="61" cy="65" rx="48" ry="46" fill="hsl(30,30%,30%)" opacity="0.16"/>',
    `<polygon points="${edge}" fill="url(#d)" stroke="url(#d)" stroke-width="6" stroke-linejoin="round"/>`,
    bumps,
    toppingOn(recipe, next),
    '</svg>'
  ].join('');
}

const drawn = new Map<string, string>();

/** The cookie's drawn picture as an image URL, safe inside an unquoted CSS `url(…)` and as an `<img src>`. */
export function cookieArt(name: string): string {
  const key = name.trim().toLowerCase();
  const known = drawn.get(key);
  if (known) return known;
  const url =
    'data:image/svg+xml,' +
    encodeURIComponent(drawing(key)).replace(
      /['()]/g,
      (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`
    );
  drawn.set(key, url);
  return url;
}

/** The real photo when there is one, otherwise the drawn picture. */
export function cookiePicture(photo: string, name: string): string {
  return photo || cookieArt(name);
}
