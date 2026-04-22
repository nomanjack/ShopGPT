export type StoreCategory =
  | 'apparel'
  | 'menswear'
  | 'womenswear'
  | 'knits'
  | 'denim'
  | 'outerwear'
  | 'footwear'
  | 'athletic'
  | 'outdoor'
  | 'streetwear'
  | 'basics'
  | 'home'
  | 'ceramics'
  | 'kitchen'
  | 'coffee'
  | 'desk'
  | 'lighting'
  | 'bags'
  | 'accessories'
  | 'eyewear'
  | 'leather'
  | 'beauty'
  | 'surf'

export type Store = {
  url: string
  name: string
  categories: StoreCategory[]
}

export const STORES: Store[] = [
  // apparel + menswear
  { url: 'https://www.taylorstitch.com',   name: 'Taylor Stitch',     categories: ['apparel','menswear','outerwear','knits'] },
  { url: 'https://www.everlane.com',       name: 'Everlane',           categories: ['apparel','menswear','womenswear','basics','denim'] },
  { url: 'https://outerknown.com',         name: 'Outerknown',         categories: ['apparel','menswear','surf','knits'] },
  { url: 'https://kotn.com',               name: 'Kotn',               categories: ['apparel','menswear','womenswear','basics','home'] },
  { url: 'https://www.tentree.com',        name: 'tentree',            categories: ['apparel','outdoor','basics'] },
  { url: 'https://finisterre.com',         name: 'Finisterre',         categories: ['apparel','outdoor','outerwear','surf'] },
  { url: 'https://www.filson.com',         name: 'Filson',             categories: ['apparel','outdoor','outerwear','bags','leather'] },
  { url: 'https://oliverspencer.co.uk',    name: 'Oliver Spencer',     categories: ['apparel','menswear','knits'] },
  { url: 'https://www.knickerbockermfg.co',name: 'Knickerbocker',      categories: ['apparel','menswear','basics','knits'] },
  { url: 'https://www.oxfordshirts.com',   name: 'Oxford Shirts',      categories: ['apparel','menswear'] },
  { url: 'https://unboundmerino.com',      name: 'Unbound Merino',     categories: ['apparel','menswear','knits','basics'] },
  { url: 'https://www.apolis.co',          name: 'Apolis',             categories: ['apparel','menswear','bags'] },
  { url: 'https://www.pactapparel.com',    name: 'PACT',               categories: ['apparel','basics','womenswear','menswear'] },
  { url: 'https://trueclassictees.com',    name: 'True Classic',       categories: ['apparel','menswear','basics'] },
  { url: 'https://www.kith.com',           name: 'Kith',               categories: ['apparel','streetwear','footwear'] },
  { url: 'https://www.organicbasics.com',  name: 'Organic Basics',     categories: ['apparel','basics','womenswear','menswear'] },

  // denim
  { url: 'https://www.hiutdenim.co.uk',    name: 'Hiut Denim',         categories: ['denim','apparel','menswear'] },
  { url: 'https://revtown.com',            name: 'Revtown',            categories: ['denim','apparel','menswear'] },

  // outerwear / outdoor
  { url: 'https://us.rains.com',           name: 'Rains',              categories: ['outerwear','apparel','bags','accessories'] },

  // footwear + athletic
  { url: 'https://www.allbirds.com',       name: 'Allbirds',           categories: ['footwear','athletic','apparel'] },
  { url: 'https://thursdayboots.com',      name: 'Thursday Boots',     categories: ['footwear','leather','menswear'] },
  { url: 'https://alohas.io',              name: 'Alohas',             categories: ['footwear','womenswear'] },
  { url: 'https://www.outdoorvoices.com',  name: 'Outdoor Voices',     categories: ['athletic','apparel'] },

  // bags / accessories / eyewear / leather
  { url: 'https://chromeindustries.com',   name: 'Chrome Industries',  categories: ['bags','outdoor','accessories'] },
  { url: 'https://handandhide.com',        name: 'Hand & Hide',        categories: ['leather','accessories'] },
  { url: 'https://www.proofeyewear.com',   name: 'Proof Eyewear',      categories: ['eyewear','accessories'] },
  { url: 'https://pela.earth',             name: 'Pela',               categories: ['accessories'] },
  { url: 'https://wellspent.co',           name: 'Well Spent',         categories: ['accessories','menswear'] },

  // home / ceramics / kitchen / coffee / desk / lighting
  { url: 'https://ugmonk.com',             name: 'Ugmonk',             categories: ['desk','ceramics','accessories','home'] },
  { url: 'https://fellowproducts.com',     name: 'Fellow',             categories: ['coffee','kitchen','ceramics'] },
  { url: 'https://kinto-usa.com',          name: 'KINTO',              categories: ['kitchen','ceramics','coffee','home'] },
  { url: 'https://www.stumptowncoffee.com',name: 'Stumptown',          categories: ['coffee','kitchen'] },
  { url: 'https://publicgoods.com',        name: 'Public Goods',       categories: ['home','kitchen','beauty'] },
  { url: 'https://areaware.com',           name: 'Areaware',           categories: ['home','desk','accessories','lighting'] },
  { url: 'https://studiorandall.com',      name: 'Studio Randall',     categories: ['home','ceramics','lighting'] },

  // beauty
  { url: 'https://tenoverten.com',         name: 'tenoverten',         categories: ['beauty'] },
]

const KEYWORD_TO_CATEGORY: Record<string, StoreCategory[]> = {
  shirt: ['apparel','menswear'], shirts: ['apparel','menswear'],
  tee: ['apparel','basics','menswear'], tees: ['apparel','basics'],
  top: ['apparel'], polo: ['apparel','menswear'], henley: ['apparel','menswear'],
  sweater: ['knits','apparel'], sweaters: ['knits','apparel'],
  cardigan: ['knits','apparel'], knit: ['knits','apparel'], knits: ['knits'],
  hoodie: ['apparel','streetwear'],
  jacket: ['outerwear','apparel'], jackets: ['outerwear'],
  coat: ['outerwear','apparel'], coats: ['outerwear'],
  parka: ['outerwear','outdoor'], shell: ['outerwear','outdoor'],
  overshirt: ['apparel','menswear','outerwear'],
  pant: ['apparel','menswear'], pants: ['apparel','menswear'],
  trouser: ['apparel','menswear'], trousers: ['apparel','menswear'],
  chino: ['apparel','menswear'], chinos: ['apparel','menswear'],
  jean: ['denim','apparel'], jeans: ['denim','apparel'], denim: ['denim'],
  shorts: ['apparel'], short: ['apparel'],
  sock: ['apparel','basics'], socks: ['apparel','basics'],
  underwear: ['basics','apparel'], boxer: ['basics','apparel'], boxers: ['basics'],
  dress: ['apparel','womenswear'], skirt: ['apparel','womenswear'],
  beanie: ['apparel','accessories'], hat: ['apparel','accessories'], cap: ['apparel','accessories'],
  scarf: ['accessories','knits'],

  shoe: ['footwear'], shoes: ['footwear'], sneaker: ['footwear','athletic'], sneakers: ['footwear','athletic'],
  runner: ['footwear','athletic'], runners: ['footwear','athletic'],
  boot: ['footwear','leather'], boots: ['footwear','leather'],
  loafer: ['footwear'], loafers: ['footwear'], derby: ['footwear','leather'],

  tote: ['bags','accessories'], bag: ['bags','accessories'], bags: ['bags'],
  backpack: ['bags','outdoor'], pack: ['bags','outdoor'],
  wallet: ['accessories','leather'], briefcase: ['bags','leather'],
  belt: ['accessories','leather'],
  watch: ['accessories'], sunglasses: ['eyewear','accessories'], glasses: ['eyewear','accessories'],

  mug: ['kitchen','ceramics','coffee'], cup: ['kitchen','ceramics'], tumbler: ['kitchen'],
  carafe: ['kitchen','ceramics'], pitcher: ['kitchen','ceramics'], decanter: ['kitchen'],
  teapot: ['kitchen','ceramics'], kettle: ['kitchen'], bowl: ['kitchen','ceramics'],
  plate: ['kitchen','ceramics'], plates: ['kitchen','ceramics'], napkin: ['kitchen','home'], napkins: ['kitchen','home'],
  board: ['kitchen','home'], tableware: ['kitchen'],
  coffee: ['coffee','kitchen'], espresso: ['coffee','kitchen'], pourover: ['coffee','kitchen','ceramics'],
  ceramic: ['ceramics','kitchen'], porcelain: ['ceramics','kitchen'], stoneware: ['ceramics','kitchen'],

  pillow: ['home'], cushion: ['home'], throw: ['home','knits'], blanket: ['home','knits'],
  rug: ['home'], mat: ['home'], vase: ['home','ceramics'],
  lamp: ['lighting','home','desk'], lamps: ['lighting','home'], light: ['lighting','home'],
  pendant: ['lighting','home'], sconce: ['lighting','home'], bulb: ['lighting'],

  desk: ['desk','home'], pen: ['desk'], pencil: ['desk'], notebook: ['desk'],
  office: ['desk'], tray: ['desk','home'], organizer: ['desk'],

  trail: ['outdoor','athletic'], hike: ['outdoor'], hiking: ['outdoor'],
  camp: ['outdoor'], camping: ['outdoor'], outdoor: ['outdoor'],
  running: ['athletic','footwear'], workout: ['athletic'], gym: ['athletic'],

  skincare: ['beauty'], lotion: ['beauty'], cream: ['beauty'], balm: ['beauty'],
  candle: ['home','beauty'], candles: ['home','beauty'],

  mens: ['menswear'], womens: ['womenswear'],

  merino: ['knits','apparel'], cashmere: ['knits','apparel'], wool: ['knits','apparel'],
  linen: ['apparel'], cotton: ['apparel','basics'],
  leather: ['leather','accessories'],
  wood: ['home','desk'], walnut: ['home','desk'], oak: ['home','desk'],
}

// Phrases where a keyword means something other than the product category.
// "price cap" = budget ceiling, not a hat. Skip the keyword when the phrase
// appears elsewhere in the query.
const PHRASE_OVERRIDES: Array<{ phrase: RegExp; skip: string[] }> = [
  { phrase: /price cap|budget cap|cost cap|spending cap/i, skip: ['cap'] },
  { phrase: /shell out|shell company/i, skip: ['shell'] },
  { phrase: /board (meeting|room)|board game|on board/i, skip: ['board'] },
]

// Return the last token in the query that maps to a product category, i.e.
// the head noun of the request ("lamp" in "a desk lamp"). Used as a sanity
// check against registry candidates — if nothing in the pool contains this
// word, the pool is matching on a sibling keyword instead.
export function lastCategoryToken(query: string): string | null {
  const lower = query.toLowerCase()
  const skip = new Set<string>()
  for (const { phrase, skip: words } of PHRASE_OVERRIDES) {
    if (phrase.test(lower)) for (const w of words) skip.add(w)
  }
  const tokens = lower.split(/[^a-z]+/).map(w => w.trim()).filter(w => w.length > 2)
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i]
    if (skip.has(t)) continue
    if (KEYWORD_TO_CATEGORY[t]) return t
  }
  return null
}

export function classifyQuery(query: string): StoreCategory[] {
  const lower = query.toLowerCase()
  const skip = new Set<string>()
  for (const { phrase, skip: words } of PHRASE_OVERRIDES) {
    if (phrase.test(lower)) for (const w of words) skip.add(w)
  }

  const tokens = lower
    .split(/[^a-z]+/)
    .map(w => w.trim())
    .filter(w => w.length > 2)

  const set = new Set<StoreCategory>()
  for (const t of tokens) {
    if (skip.has(t)) continue
    const cats = KEYWORD_TO_CATEGORY[t]
    if (cats) for (const c of cats) set.add(c)
  }
  // handle two-word hints
  if (/pour[- ]?over/.test(lower)) { set.add('kitchen'); set.add('coffee'); set.add('ceramics') }
  if (/small batch|handmade|craft/.test(lower)) set.add('home')

  return [...set]
}

export function pickStoresForCategories(cats: StoreCategory[], max = 12): Store[] {
  if (cats.length === 0) return STORES.slice(0, max)
  const wanted = new Set(cats)
  const scored = STORES.map(s => {
    const overlap = s.categories.filter(c => wanted.has(c)).length
    return { store: s, overlap }
  })
  return scored
    .filter(x => x.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, max)
    .map(x => x.store)
}
