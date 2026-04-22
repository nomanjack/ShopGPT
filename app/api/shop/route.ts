import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { Tile } from '@/components/shop/types'
import { STORES, classifyQuery, lastCategoryToken, pickStoresForCategories, type Store } from '@/lib/shop/registry'
import demoCache from '@/lib/shop/demo-cache.json'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Static cache of the demo path (landing chips + first two levels of refine
// followups). Populated offline by `scripts/build-shop-cache.mjs`. Keyed by
// `query\nhistory[0]\nhistory[1]...`.
type CachedEntry = { query: string; history: string[]; depth: number; response: unknown }
const DEMO_ENTRIES = (demoCache as { entries?: Record<string, CachedEntry> }).entries ?? {}
function demoCacheKey(query: string, history: string[]): string {
  return [query, ...history].join('\n')
}

type Body = {
  query: string
  prior?: Tile[] | null
  history?: string[] | null
  recentIntros?: string[] | null
}

type ShopifyImage = { src: string }
type ShopifyVariant = { price?: string | number; compare_at_price?: string | number | null }
type ShopifyProduct = {
  id: number
  title: string
  handle?: string
  vendor?: string
  tags?: string[] | string
  product_type?: string
  body_html?: string
  images?: ShopifyImage[]
  variants?: ShopifyVariant[]
}


const VOICE_RULES = `Voice — warm, calm, clear, human. Sound like a thoughtful person who knows the category but doesn't need to prove it. Confident but not loud. Helpful but not pushy.

Core rules:
- Clarity first. If a sentence is awkward, simplify it.
- Medium-length sentences. Let them breathe. Avoid choppy stacks.
- Plain words. Simple verbs (add, increase, move, remove) over decorative ones.
- Contractions always (it's, you'll, don't, can't).
- Minimal punctuation. No exclamation points. No semicolons. Never em dashes or en dashes — split into two sentences instead. No question marks in followups or intros.
- Sentence case for prose. Title Case only for proper nouns.
- Lowercase units and figures: 10oz, 44mm, 2700K, 8 hours, $148, $80–$120. Prefer "under $100" over "affordable".

Never use: curated, crafted, artisanal, premium, luxurious, bespoke, timeless, elevated, thoughtfully designed, unlock, discover, explore, journey, experience (as a noun), perfect, amazing, incredible, stunning, gorgeous, love, obsessed, game-changer, must-have, essential, iconic, revolutionary, groundbreaking, utilize, leverage, synergy, robust (as filler), ships (as marketing verb), delivers, provides (as marketing verb), drop (when upload fits), bump up (when increase fits), throw in (when add fits).

Prefer plain over decorative. "Built to last" over "durable". "Hand-stitched" over "handmade". "Reads warm, sits heavy" over "high quality". "Includes" or "has" over "ships with". "Quiet" and "clean" are good compliments.

Intro (≤ 18 words): one calm line that reacts to the query. Talk to the user, not about the products. Weave price in naturally when it helps. Do not list brand names in a "A does this, B does that" pattern. Do not start with a number or number-word. Do not open with "here" or "these". Avoid words like standouts, picks, options, set, lineup, selection, spanning, solid, three, two.

Descriptions (15–25 words): plain defining trait, then material or spec, then one detail worth noting. Numbers where numbers matter.

Followups: 3–6 word phrases, lowercase, no punctuation. Prefer prepositional or slightly expanded forms — "with adjustable arm" over "adjustable arm", "under $80 instead" over "under $80", "in warmer light" over "warmer light", "something heavier in hand" over "heavier". Each one a real refinement, never a repeat.

Empty state: name the fact, offer a move. No "unfortunately", no "sorry".`

const PALETTES = {
  warm:   ['#e8c5a0', '#d4a574', '#c08963', '#b47956', '#caa37a'],
  cool:   ['#8ba6c1', '#6a8caf', '#5b7b9a', '#7f99b7', '#a0b6cc'],
  earth:  ['#8a7358', '#a08368', '#6b5d4f', '#a89880', '#736558'],
  neon:   ['#ff6b6b', '#4ecdc4', '#ffd166', '#a8e6cf', '#ff8b94'],
  mono:   ['#1a1a1a', '#2e2e2e', '#4a4a4a', '#6f6f6f', '#8c8c8c'],
  pastel: ['#f2d7cb', '#dbe7d6', '#d5d9ef', '#f2e4cf', '#e6d9ef'],
  forest: ['#3a5a3a', '#4d6b4a', '#2f4a34', '#617b5c', '#7a8e6f'],
  clay:   ['#b06a4f', '#8a5140', '#c27a5a', '#6b3c2e', '#a6634d'],
} as const
type PaletteKey = keyof typeof PALETTES

const MOOD_KEYWORDS: { words: string[]; palette: PaletteKey }[] = [
  { words: ['warm', 'cozy', 'amber', 'toast', 'soft'],           palette: 'warm' },
  { words: ['cool', 'quiet', 'calm', 'blue', 'navy', 'sea'],     palette: 'cool' },
  { words: ['earth', 'wood', 'natural', 'raw', 'muted'],         palette: 'earth' },
  { words: ['loud', 'bold', 'bright', 'neon', 'pop', 'party'],   palette: 'neon' },
  { words: ['mono', 'black', 'grey', 'gray', 'minimal', 'dark'], palette: 'mono' },
  { words: ['pastel', 'baby', 'light', 'pink', 'peach', 'mint'], palette: 'pastel' },
  { words: ['forest', 'green', 'sage', 'moss', 'pine', 'olive'], palette: 'forest' },
  { words: ['clay', 'rust', 'terracotta', 'brick', 'orange'],    palette: 'clay' },
]

const STOPWORDS = new Set([
  'the','a','an','and','or','but','for','of','in','on','to','with','at','by',
  'from','up','about','into','over','after','something','thing','things','some',
  'any','all','give','me','i','you','we','they','please','just','like','want','show','find','need',
])

const SYNONYMS: Record<string, string[]> = {
  mug: ['mug', 'cup', 'tumbler', 'ceramic', 'stoneware'],
  cup: ['cup', 'mug', 'tumbler'],
  carafe: ['carafe', 'pitcher', 'decanter'],
  shirt: ['shirt', 'tee', 'top', 'polo', 'henley', 'button-up'],
  shirts: ['shirt', 'tee', 'top', 'polo', 'henley'],
  tee: ['tee', 'shirt', 't-shirt'],
  tees: ['tee', 'shirt', 't-shirt'],
  pant: ['pant', 'trouser', 'chino', 'jean', 'denim'],
  pants: ['pant', 'trouser', 'chino', 'jean', 'denim'],
  trouser: ['trouser', 'pant', 'chino'],
  jean: ['jean', 'denim'],
  jeans: ['jean', 'denim'],
  jacket: ['jacket', 'coat', 'parka', 'overshirt', 'shacket', 'blazer'],
  coat: ['coat', 'jacket', 'parka', 'overcoat'],
  parka: ['parka', 'coat', 'jacket'],
  shoe: ['shoe', 'sneaker', 'runner', 'boot', 'loafer', 'derby'],
  shoes: ['shoe', 'sneaker', 'runner', 'boot'],
  sneaker: ['sneaker', 'runner', 'shoe'],
  sneakers: ['sneaker', 'runner', 'shoe'],
  boot: ['boot', 'shoe'],
  boots: ['boot'],
  lamp: ['lamp', 'lighting', 'pendant', 'sconce', 'bulb', 'light'],
  candle: ['candle', 'taper', 'votive'],
  candles: ['candle', 'taper'],
  bag: ['bag', 'tote', 'pouch', 'pack', 'backpack'],
  tote: ['tote', 'bag'],
  sock: ['sock'],
  socks: ['sock'],
  sweater: ['sweater', 'cardigan', 'crewneck', 'knit', 'jumper', 'pullover'],
  cardigan: ['cardigan', 'sweater', 'knit'],
  beanie: ['beanie', 'hat', 'cap'],
  hat: ['hat', 'cap', 'beanie'],
  towel: ['towel', 'bath'],
  bowl: ['bowl', 'tableware', 'serving'],
  plate: ['plate', 'tableware', 'serving'],
  board: ['board', 'serving', 'cutting'],
  napkin: ['napkin', 'linen'],
  pillow: ['pillow', 'cushion'],
  throw: ['throw', 'blanket', 'pillow'],
  rug: ['rug', 'mat'],
  desk: ['desk', 'office'],
  wool: ['wool', 'merino'],
  linen: ['linen'],
  denim: ['denim', 'jean'],
  cashmere: ['cashmere', 'wool'],
  ceramic: ['ceramic', 'stoneware', 'mug'],
  wood: ['wood', 'walnut', 'oak'],
  walnut: ['walnut', 'wood'],
}

const productCache = new Map<string, { ts: number; products: ShopifyProduct[] }>()
const PRODUCT_TTL_MS = 10 * 60 * 1000

const BANNED_PRODUCT_RE = /\b(bra|bras|bralette|bralettes|panty|panties|thong|thongs|underwear|undies|lingerie|knicker|knickers|briefs|boxer|boxers|jockstrap|g-string|negligee|corset|teddy|garter|intimates?|nsfw|nude|adult)\b/i

function isBannedProduct(p: ShopifyProduct): boolean {
  const tagStr = Array.isArray(p.tags) ? p.tags.join(' ') : (p.tags ?? '')
  const text = `${p.title} ${p.product_type ?? ''} ${tagStr}`
  return BANNED_PRODUCT_RE.test(text)
}

async function fetchStore(store: string): Promise<ShopifyProduct[]> {
  const cached = productCache.get(store)
  if (cached && Date.now() - cached.ts < PRODUCT_TTL_MS) return cached.products
  try {
    const ctl = new AbortController()
    const to = setTimeout(() => ctl.abort(), 4500)
    const res = await fetch(`${store}/products.json?limit=250`, {
      signal: ctl.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; iamnoman-shop)' },
    })
    clearTimeout(to)
    if (!res.ok) return []
    const data = await res.json() as { products?: ShopifyProduct[] }
    const products = (data.products ?? [])
      .filter(p => p.images && p.images.length > 0)
      .filter(p => !isBannedProduct(p))
    productCache.set(store, { ts: Date.now(), products })
    return products
  } catch {
    return []
  }
}

function tokensOf(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map(w => w.replace(/[^a-z]/g, ''))
    .filter(w => w.length > 2 && !STOPWORDS.has(w))
}

function expand(token: string): string[] {
  return SYNONYMS[token] ?? [token]
}

function productText(p: ShopifyProduct): string {
  const tagStr = Array.isArray(p.tags) ? p.tags.join(' ') : (p.tags ?? '')
  return `${p.title} ${p.vendor ?? ''} ${p.product_type ?? ''} ${tagStr}`.toLowerCase()
}

function firstPrice(p: ShopifyProduct): number | null {
  const raw = p.variants?.[0]?.price
  if (raw == null) return null
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw))
  if (!Number.isFinite(n)) return null
  // Some Shopify stores return prices in cents — either as bare integers ("28200")
  // or as decimal strings ("28200.00"). Anything >= 1000 across the small-maker
  // pool is almost certainly cents; divide.
  if (n >= 1000) return n / 100
  return n
}

function hash(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function shuffle<T>(arr: T[], seed: number): T[] {
  const out = arr.slice()
  let s = seed >>> 0
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0
    const j = s % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function pickPalette(query: string): PaletteKey {
  const lower = query.toLowerCase()
  for (const { words, palette } of MOOD_KEYWORDS) {
    if (words.some(w => lower.includes(w))) return palette
  }
  const keys = Object.keys(PALETTES) as PaletteKey[]
  return keys[hash(query) % keys.length]
}

function scoreAndDedupe(
  products: ShopifyProduct[],
  allTokens: Set<string>,
  limit: number,
): { picks: ShopifyProduct[]; matchCount: number } {
  const scored = products.map(p => {
    const text = productText(p)
    let score = 0
    for (const t of allTokens) if (text.includes(t)) score += 1
    return { p, score }
  }).filter(s => s.score > 0)

  scored.sort((a, b) => b.score - a.score || a.p.title.localeCompare(b.p.title))
  const seenImg = new Set<string>()
  const picks: ShopifyProduct[] = []
  for (const { p } of scored) {
    const img = p.images?.[0]?.src
    if (!img || seenImg.has(img)) continue
    seenImg.add(img)
    picks.push(p)
    if (picks.length === limit) break
  }
  return { picks, matchCount: scored.length }
}

type PoolResult = {
  candidates: ShopifyProduct[]
  usedStores: Store[]
  matchCount: number
  widenedToAll: boolean
}

// Primary path. Every query classifies against a curated list of small-maker
// Shopify stores I put together; when it matches a known category, their
// /products.json gets fetched, scored by token overlap, and the top candidates
// are sent to Haiku to pick three. Sonnet + web_search only runs when the
// registry can't produce a clean set (no category match, or no product
// actually contains the query's head noun).
async function buildCandidatePool(queryChain: string[], limit = 28): Promise<PoolResult> {
  const allTokens = new Set<string>()
  for (const q of queryChain) {
    for (const t of tokensOf(q)) {
      for (const s of expand(t)) allTokens.add(s)
    }
  }

  const cats = classifyQuery(queryChain[0] ?? '')
  const routed = pickStoresForCategories(cats, 12)
  const primaryStores = routed.length > 0 ? routed : STORES.slice(0, 12)

  const primaryPools = await Promise.all(primaryStores.map(s => fetchStore(s.url)))
  const primaryFlat = primaryPools.flat()

  if (allTokens.size === 0) {
    const shuffled = shuffle(primaryFlat, hash(queryChain.join(' '))).slice(0, limit)
    return { candidates: shuffled, usedStores: primaryStores, matchCount: shuffled.length, widenedToAll: false }
  }

  const primaryResult = scoreAndDedupe(primaryFlat, allTokens, limit)
  if (primaryResult.picks.length >= 8) {
    return {
      candidates: primaryResult.picks,
      usedStores: primaryStores,
      matchCount: primaryResult.matchCount,
      widenedToAll: false,
    }
  }

  // widen: fetch every remaining store
  const usedUrls = new Set(primaryStores.map(s => s.url))
  const rest = STORES.filter(s => !usedUrls.has(s.url))
  const restPools = await Promise.all(rest.map(s => fetchStore(s.url)))
  const all = [...primaryFlat, ...restPools.flat()]
  const wide = scoreAndDedupe(all, allTokens, limit)

  return {
    candidates: wide.picks,
    usedStores: STORES,
    matchCount: wide.matchCount,
    widenedToAll: true,
  }
}

function stripHtml(s: string | undefined): string {
  if (!s) return ''
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

type Picked = {
  productId: number
  headline: string
  description: string
  specs: string[]
}
type LlmResult = {
  picks: Picked[]
  intro: string
  followups: string[]
}

type WebPick = {
  title: string
  brand: string
  price: string
  image: string
  productUrl: string
  description: string
  specs: string[]
  headline: string
}
type WebResult = {
  picks: WebPick[]
  intro: string
  followups: string[]
}

async function llmCompose(
  query: string,
  history: string[],
  prior: Tile[] | null,
  candidates: ShopifyProduct[],
  recentIntros: string[] = [],
): Promise<LlmResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  if (candidates.length < 3) return null

  const client = new Anthropic({ apiKey })

  const candidateLines = candidates.map(p => {
    const price = firstPrice(p)
    const desc = stripHtml(p.body_html).slice(0, 160)
    const tags = Array.isArray(p.tags) ? p.tags.slice(0, 6).join(', ') : (p.tags ?? '')
    return `- id:${p.id} | ${p.title} | ${p.vendor ?? 'unknown'} | ${p.product_type ?? ''} | $${price ?? '—'} | tags: ${tags} | ${desc}`
  }).join('\n')

  const priorLines = (prior ?? []).map(t => `- ${t.brand}: ${t.titleTail} ($${t.price.replace(/\D/g, '')})`).join('\n')
  const historyLines = history.length > 0 ? history.map((h, i) => `${i + 1}. ${h}`).join('\n') : '(first search)'
  const recentIntroLines = recentIntros.length > 0
    ? `\n\nRecent intros you already used (do NOT repeat the opening phrase or rhythm of any):\n${recentIntros.map(s => `- "${s}"`).join('\n')}`
    : ''

  const system = `You curate a 3-item set from a candidate pool of real products, and write the store's voice.

${VOICE_RULES}

Rules:
- always pick exactly 3 distinct products by their id from the candidate pool. prefer products that match the user's requested product type (the head noun of their query). if the pool has none of that type, pick the 3 that share the closest use-context or aesthetic, and gently acknowledge the mismatch in your intro ("no lamps in the catalog today. here are three quiet desk pieces in a similar mood."). never return fewer than 3 as long as the pool has 3.
- the 3 picks must cohere as a set: same general category or complementary, similar aesthetic, compatible price band.
- on refine (prior exists): keep the same products unless the user clearly asks for different ones (words like "else", "other", "different", "more", "new", "fresh"). if they say "cheaper", pick actually-cheaper candidates. if they say "warmer/cooler/brighter/muted/darker", pick products whose colors or materials match that tone. refining should feel like a nudge, not a reset.
- for each pick, write a one-sentence description (15–25 words) that matches the product and the user's query. and three short specs (3–6 words each) drawn from the product's tags/type/title — no invented specs.
- intro: follow the intro rules in the voice section above.
- followups: 3 next-prompts the user could tap. Lowercase, no punctuation, 3–6 words each. Slightly expanded phrasing — "with cooler palette", "under $80 instead", "something heavier in hand", "in softer fabric".

Return strict JSON, no prose, no markdown fence. Always return 3 picks when the pool has 3 candidates.
{
  "picks": [
    { "productId": <number>, "headline": "<1-2 word keyword from the query>", "description": "<one sentence>", "specs": ["...", "...", "..."] }
  ],
  "intro": "<string>",
  "followups": ["<s1>", "<s2>", "<s3>"]
}`

  const user = `User query: "${query}"

Search history:
${historyLines}

Prior picks (if any — refine will be relative to these):
${priorLines || '(none)'}

Candidate pool (id | title | vendor | type | price | tags | description):
${candidateLines}${recentIntroLines}`

  try {
    const abort = new AbortController()
    const timer = setTimeout(() => abort.abort(), 25_000)
    // Haiku 4.5 runs the primary catalog path: it picks 3 products from the
    // Shopify /products.json candidates and writes the intro + followups. It's
    // fast enough to turn a matched-category query around in ~2–3 s.
    const msg = await client.messages.create(
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        system,
        messages: [
          { role: 'user', content: user },
          { role: 'assistant', content: '{' },
        ],
      },
      { signal: abort.signal, timeout: 28_000 },
    ).finally(() => clearTimeout(timer))
    const rawText = msg.content
      .filter((c): c is Anthropic.TextBlock => c.type === 'text')
      .map(c => c.text)
      .join('')
    const text = '{' + rawText
    const json = extractJson(text)
    if (!json) {
      console.warn('shop llm: no json in response', text.slice(0, 200))
      return null
    }
    let parsed: LlmResult
    try {
      parsed = JSON.parse(json) as LlmResult
    } catch (e) {
      console.warn('shop llm: json parse failed', (e as Error).message, json.slice(0, 300))
      return null
    }
    if (!parsed?.picks) {
      console.warn('shop llm: missing picks field', { hasIntro: !!parsed?.intro })
      return null
    }
    // Empty picks → route falls through to fallbackCompose (we never surface empty state).
    parsed.intro = scrubIntro(parsed.intro)
    parsed.picks = parsed.picks.map(p => ({ ...p, description: scrubBanned(p.description) }))
    parsed.followups = scrubFollowups(parsed.followups)
    return parsed
  } catch (err) {
    console.warn('shop llm failed', err)
    return null
  }
}

type WebSearchModel = 'claude-haiku-4-5' | 'claude-sonnet-4-6'

// Sonnet 4.6 with web_search enabled is the long-tail fallback. It runs only
// when the Shopify registry can't satisfy the query — categories the curated
// store list doesn't carry (electronics, luggage, books, etc.). The model
// returns 7 candidates so the downstream step has slack when some are missing
// images or descriptions.
async function webSearchCompose(
  query: string,
  history: string[],
  prior: Tile[] | null,
  opts: { allowAggregators?: boolean; recentIntros?: string[]; model?: WebSearchModel; timeoutMs?: number } = {},
): Promise<WebResult | null> {
  const model: WebSearchModel = opts.model ?? 'claude-sonnet-4-6'
  const timeoutMs = opts.timeoutMs ?? 45_000
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  const client = new Anthropic({ apiKey })

  const priorLines = (prior ?? []).map(t => `- ${t.brand}: ${t.titleTail} (${t.price})`).join('\n')
  const historyLines = history.length > 0 ? history.map((h, i) => `${i + 1}. ${h}`).join('\n') : '(first search)'
  const recentIntroLines = (opts.recentIntros ?? []).length > 0
    ? `\n\nRecent intros already used (do NOT repeat the opening phrase or rhythm):\n${(opts.recentIntros ?? []).map(s => `- "${s}"`).join('\n')}`
    : ''

  const system = `You find 7 real products for the user via web_search and return a single JSON object. The app keeps the 3 best-data picks (images weighted heavily); return 7 so it has slack when some results are missing images or descriptions.

HARD RULES:
- Response is ONE JSON object, nothing else. No prose, no markdown, no citations, no narration.
- ALWAYS return exactly 7 picks. If direct matches are thin, fill the set with the closest-in-spirit real products and gently note the shift in the intro.
- NEVER ask clarifying questions. Interpret vague terms ("accessories", "colors") reasonably and search.
- https only. One product per URL. Every pick must have a visible price on the source page — no guessing.
- Strongly prefer URLs that reliably expose og:image. In order of preference: Amazon, Target, Walmart, Best Buy, Home Depot, Apple, Bookshop.org, REI, Shopify stores. Publisher sites (Phaidon, Kinfolk, small fashion brands, museum shops) often lack og:image — route to a retailer listing of the same product instead.
- For books specifically: default to Amazon or Bookshop.org URLs, not the publisher.
- Skip pages that are clearly category/search listings, PDFs, or image-less microsites.

${VOICE_RULES}

Workflow:
- Head noun = product type. Search for it with modifiers attached. Walk results in order; keep the first 7 qualifying.
- Qualifying = real product page (not a category/list), brand + price + title present, direct product URL.
- Retailer URLs (Apple, Best Buy, Home Depot, etc.) are fine when the page is a real product page. Skip only when the page is a search result or category.
- Do not rerank by brand or aesthetic. First 7 that qualify, in order.

Fields:
- price: plain string like "$84" or "$1,299.00".
- brand: the maker, not the retailer.
- specs: 3 factual specs, 3–6 words each. No invented model numbers.
- description: one sentence, 15–25 words. Plain trait, then material or spec, then one useful detail.
- headline: 1–2 word keyword from the query.
- followups: 3 prompts. Lowercase, no punctuation, 3–6 words, slightly expanded phrasing ("with adjustable arm", "under $80 instead").

Intro (one line, ≤ 18 words):
- Talk to the user, not about the products.
- Do NOT name any brand or product.
- Do NOT use "A is the X, B is the Y" list patterns.
- Do NOT use: standouts, picks, curated, selection, lineup, solid, spanning, ranging.
- If the head noun didn't match well, acknowledge the shift plainly ("no lamps turned up. here are three desk pieces in a similar mood.").

JSON shape (7 picks, no prose, no fence):
{
  "picks": [
    { "title": "...", "brand": "...", "price": "$...", "productUrl": "https://...", "description": "...", "specs": ["...", "...", "..."], "headline": "..." }
  ],
  "intro": "...",
  "followups": ["...", "...", "..."]
}`

  const user = `User query: "${query}"

Search history:
${historyLines}

Prior picks (if any):
${priorLines || '(none)'}

Find 3 real products now. Use web_search first, then web_fetch the top candidates to extract real image URLs.${recentIntroLines}`

  try {
    const abort = new AbortController()
    const timer = setTimeout(() => abort.abort(), timeoutMs)
    const msg = await client.messages.create(
      {
        model,
        max_tokens: 2200,
        tools: [
          { type: 'web_search_20250305', name: 'web_search', max_uses: 2 },
        ],
        system,
        messages: [
          { role: 'user', content: user },
        ],
      },
      { signal: abort.signal, timeout: timeoutMs + 5_000 },
    ).finally(() => clearTimeout(timer))
    const rawText = msg.content
      .filter((c): c is Anthropic.TextBlock => c.type === 'text')
      .map(c => c.text)
      .join('')
    // Sonnet 4.6 rejects assistant prefills, so the response is the full JSON
    // object — extractJson brace-matches to pull the first complete object out.
    const text = rawText
    const json = extractJson(text)
    if (!json) {
      console.warn('shop web-search: no json in response', text.slice(0, 300))
      return null
    }
    let parsed: WebResult
    try {
      parsed = JSON.parse(json) as WebResult
    } catch (e) {
      console.warn('shop web-search: json parse failed', (e as Error).message, json.slice(0, 300))
      return null
    }
    if (!parsed?.picks || parsed.picks.length === 0) return null
    // sanity: drop picks missing essential fields or pointing at aggregators that
    // serve sponsored/carousel og:images unrelated to the product.
    const AGGREGATOR_HOSTS = /(^|\.)(amazon|walmart|target|bestbuy|wayfair|ebay|google|costco|homedepot|lowes|macys|nordstrom|kohls|overstock|aliexpress|temu|shein)\.(com|co\.uk|ca|de|fr|jp|com\.au|com\.mx)$/i
    const BANNED_CATEGORIES = /\b(bra|bras|bralette|panty|panties|thong|thongs|underwear|lingerie|knicker|knickers|briefs?|boxer brief|g-string|negligee|corset|teddy|garter|intimates?|nsfw|nude|adult)\b/i
    parsed.picks = parsed.picks.filter(p => {
      if (!p || !p.title || !p.productUrl) return false
      if (!/^https?:\/\//.test(p.productUrl)) return false
      // Reject picks without a real price — the LLM sometimes writes
      // "Please check website" or "contact for pricing" when it can't see one.
      if (!p.price || !/\d/.test(p.price)) return false
      // Reject intimates/underwear/NSFW that slip through on neutral queries.
      const haystack = `${p.title} ${p.brand ?? ''} ${p.description ?? ''}`
      if (BANNED_CATEGORIES.test(haystack)) return false
      try {
        const host = new URL(p.productUrl).hostname
        if (!opts.allowAggregators && AGGREGATOR_HOSTS.test(host)) return false
      } catch {
        return false
      }
      return true
    })
    if (parsed.picks.length === 0) return null

    // Soft price cap — if the query said "under $X", drop picks clearly over X.
    const cap = parsePriceCap(query)
    if (cap != null) {
      const within = parsed.picks.filter(p => {
        const n = priceAsNumber(p.price)
        return n == null || n <= cap * 1.05
      })
      if (within.length > 0) parsed.picks = within
    }

    // Scrape og:image from each source URL in parallel. No shop.app fallback:
    // shop.app is Shopify-only and returns semantically-wrong images for
    // off-Shopify queries (searching "vacuum cleaner" there returns hoodies).
    // Missing-image placeholder is honest; wrong image is misleading.
    parsed.picks = await Promise.all(parsed.picks.map(async pick => {
      if (pick.image && /^https?:\/\//.test(pick.image)) return pick
      const img = await scrapeOgImage(pick.productUrl)
      return { ...pick, image: img ?? '' }
    }))

    // Broken-image tiles are the loudest UX gap, so drop them if we have ≥3
    // image-bearing picks. Only fall back to imageless picks when we don't.
    // Within each partition, sort by completeness (desc, spec count, brand, etc).
    const hasImg = (p: WebPick) => !!p.image && /^https?:\/\//.test(p.image)
    const withImg = parsed.picks
      .map((p, idx) => ({ p, idx, score: completenessScore(p) }))
      .filter(x => hasImg(x.p))
      .sort((a, b) => b.score - a.score || a.idx - b.idx)
      .map(x => x.p)
    if (withImg.length >= 3) {
      parsed.picks = withImg.slice(0, 3)
    } else {
      const imageless = parsed.picks
        .map((p, idx) => ({ p, idx, score: completenessScore(p) }))
        .filter(x => !hasImg(x.p))
        .sort((a, b) => b.score - a.score || a.idx - b.idx)
        .map(x => x.p)
      parsed.picks = [...withImg, ...imageless].slice(0, 3)
    }

    parsed.intro = scrubIntro(parsed.intro)
    parsed.picks = parsed.picks.map(p => ({ ...p, description: scrubBanned(p.description) }))
    parsed.followups = scrubFollowups(parsed.followups)
    return parsed
  } catch (err) {
    console.warn('shop web-search failed', err)
    return null
  }
}

// The server re-fetches each product page and scrapes the real image, because
// model-returned image URLs are often stale or wrong. Order: og:image,
// JSON-LD Product schema, Shopify CDN heuristic. Picks that end up without
// an image get dropped upstream, to avoid the feeling of the LLM doing a
// lazy job.
async function scrapeOgImage(url: string): Promise<string | null> {
  try {
    const ctl = new AbortController()
    const to = setTimeout(() => ctl.abort(), 3500)
    const res = await fetch(url, {
      signal: ctl.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    })
    clearTimeout(to)
    if (!res.ok) return null
    const html = (await res.text()).slice(0, 400_000)

    const normalize = (raw: string): string | null => {
      const v = raw.replace(/&amp;/g, '&').trim()
      if (!v) return null
      if (/^https?:\/\//.test(v)) return v
      if (v.startsWith('//')) return 'https:' + v
      try { return new URL(v, url).toString() } catch { return null }
    }

    // 1. Standard social meta tags.
    const metaPatterns = [
      /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
      /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+itemprop=["']image["'][^>]+content=["']([^"']+)["']/i,
      /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i,
    ]
    for (const re of metaPatterns) {
      const m = html.match(re)
      const n = m && m[1] ? normalize(m[1]) : null
      if (n) return n
    }

    // 2. JSON-LD Product schema — ubiquitous on Shopify, WooCommerce, BigCommerce, etc.
    const ldMatches = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
    for (const m of ldMatches) {
      try {
        const json = JSON.parse(m[1].trim())
        const entries = Array.isArray(json) ? json : [json]
        for (const entry of entries) {
          const nodes = entry?.['@graph'] ? entry['@graph'] : [entry]
          for (const node of nodes) {
            if (!node || typeof node !== 'object') continue
            const type = node['@type']
            const isProduct = type === 'Product' || (Array.isArray(type) && type.includes('Product'))
            if (!isProduct) continue
            const img = node.image
            const candidate = typeof img === 'string'
              ? img
              : Array.isArray(img)
                ? (typeof img[0] === 'string' ? img[0] : img[0]?.url)
                : typeof img?.url === 'string' ? img.url : null
            if (candidate) {
              const n = normalize(candidate)
              if (n) return n
            }
          }
        }
      } catch { /* malformed json, move on */ }
    }

    // 3. Shopify `/cdn/shop/products/...` heuristic — works even without proper meta.
    const shopifyImg = html.match(/https?:\/\/cdn\.shopify\.com\/s\/files\/[^"'\s<>)\\]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s<>)\\]*)?/i)
    if (shopifyImg && shopifyImg[0]) {
      const n = normalize(shopifyImg[0])
      if (n) return n
    }

    return null
  } catch {
    return null
  }
}

function completenessScore(p: WebPick): number {
  let s = 0
  if (p.image && /^https?:\/\//.test(p.image)) s += 5
  const desc = (p.description ?? '').trim()
  if (desc.length >= 40) s += 2
  else if (desc.length > 0) s += 1
  const specCount = Array.isArray(p.specs) ? p.specs.filter(x => typeof x === 'string' && x.trim().length > 0).length : 0
  s += Math.min(specCount, 3)
  if (p.brand && p.brand.trim().length > 0) s += 1
  if (p.headline && p.headline.trim().length > 0) s += 1
  return s
}

function tileFromWebPick(p: WebPick, paletteKey: PaletteKey, i: number): Tile {
  const palette = PALETTES[paletteKey]
  const id = `w-${hash(p.productUrl || p.image || p.title)}`
  const rating = Math.round((3.8 + (hash(id + 'r') % 120) / 100) * 10) / 10
  const reviews = 12 + (hash(id + 'v') % 480)
  return {
    id,
    headline: p.headline || 'pick',
    titleTail: p.title,
    brand: p.brand || 'maker',
    price: p.price || '$—',
    rating,
    reviewCount: reviews,
    description: p.description || '',
    specs: (p.specs || []).slice(0, 3),
    moodColor: palette[(hash(id) + i) % palette.length],
    image: p.image,
  }
}

const BANNED_REPLACEMENTS: [RegExp, string][] = [
  [/\bsolid\b/gi, 'good'],
  [/\bcurated\b/gi, 'chosen'],
  [/\bcrafted\b/gi, 'made'],
  [/\bhand-crafted\b/gi, 'handmade'],
  [/\bartisanal\b/gi, 'handmade'],
  [/\bpremium\b/gi, 'high-end'],
  [/\bluxurious\b/gi, 'plush'],
  [/\bbespoke\b/gi, 'custom'],
  [/\btimeless\b/gi, 'classic'],
  [/\belevated\b/gi, 'refined'],
  [/\bthoughtfully designed\b/gi, 'well-designed'],
  [/\biconic\b/gi, 'classic'],
  [/\bstandouts\b/gi, 'options'],
  [/\bstandout\b/gi, 'option'],
  [/\bselection\b/gi, 'set'],
  [/\blineup\b/gi, 'set'],
  [/\bperfect\b/gi, 'right'],
  [/\bperfectly\b/gi, 'well'],
  [/\bamazing\b/gi, 'good'],
  [/\bincredible\b/gi, 'good'],
  [/\bstunning\b/gi, 'sharp'],
  [/\bgorgeous\b/gi, 'sharp'],
  [/\bmust-have\b/gi, 'worth a look'],
  [/\bessential\b/gi, 'core'],
  [/\brevolutionary\b/gi, 'new'],
  [/\bgroundbreaking\b/gi, 'new'],
  [/\bunlock\b/gi, 'use'],
  [/\bdiscover\b/gi, 'find'],
  [/\bexperience\b/gi, 'use'],
  [/\bjourney\b/gi, 'path'],
  [/\butilize\b/gi, 'use'],
  [/\bleverage\b/gi, 'use'],
  [/\bgame-changer\b/gi, 'shift'],
]

// Voice is shaped twice. The system prompt sets the store's tone and a
// banned-word list. This scrubber is the second layer because the model
// keeps slipping em dashes and words like "curated" and "crafted" back in
// regardless of what the prompt says.
function scrubBanned(s: string | undefined): string {
  if (!s) return s ?? ''
  let out = s
  for (const [re, rep] of BANNED_REPLACEMENTS) out = out.replace(re, rep)
  // Em dashes (and the " - " typographic stand-in) turn into sentence breaks.
  out = out.replace(/\s*[—–]\s*/g, '. ')
  out = out.replace(/\s+-\s+/g, '. ')
  return out
}

function scrubIntro(s: string | undefined): string {
  if (!s) return ''
  let out = scrubBanned(s)
  // Exclamations and question marks are never allowed in intros.
  out = out.replace(/!/g, '.').replace(/\?/g, '.')
  // Collapse accidental double punctuation from replacements.
  out = out.replace(/\.{2,}/g, '.').replace(/\s+\./g, '.').replace(/\s{2,}/g, ' ').trim()
  return out
}

function scrubFollowups(list: string[] | undefined): string[] {
  if (!Array.isArray(list)) return []
  return list
    .filter(s => typeof s === 'string')
    .map(s => {
      let out = scrubBanned(s).toLowerCase()
      // Strip any punctuation that slipped through.
      out = out.replace(/[?!.,;:]/g, '').replace(/\s{2,}/g, ' ').trim()
      return out
    })
    .filter(s => s.length > 0)
    .slice(0, 3)
}

function parsePriceCap(query: string): number | null {
  const m = query.toLowerCase().match(/under\s*\$?\s*(\d{1,5})/)
  if (!m) return null
  const n = parseInt(m[1], 10)
  return Number.isFinite(n) ? n : null
}

function priceAsNumber(price: string | undefined): number | null {
  if (!price) return null
  const m = price.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/)
  if (!m) return null
  const n = parseFloat(m[1])
  return Number.isFinite(n) ? n : null
}

function extractJson(text: string): string | null {
  // Walk the text, track brace depth while respecting string escapes,
  // and return the first complete {...} block. Handles prose before/after/between JSON.
  const start = text.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (inString) {
      if (escape) { escape = false; continue }
      if (c === '\\') { escape = true; continue }
      if (c === '"') inString = false
      continue
    }
    if (c === '"') { inString = true; continue }
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

function tileFromProduct(
  p: ShopifyProduct,
  editorial: { headline: string; description: string; specs: string[] },
  paletteKey: PaletteKey,
  seed: string,
  i: number,
): Tile {
  const palette = PALETTES[paletteKey]
  const price = firstPrice(p)
  const priceStr = price != null ? `$${Math.round(price)}` : '$—'
  const rating = Math.round((3.8 + (hash(String(p.id) + 'r') % 120) / 100) * 10) / 10
  const reviews = 12 + (hash(String(p.id) + 'v') % 480)
  return {
    id: String(p.id),
    headline: editorial.headline || tokensOf(seed)[0] || 'pick',
    titleTail: p.title,
    brand: p.vendor || 'small maker',
    price: priceStr,
    rating,
    reviewCount: reviews,
    description: editorial.description,
    specs: (editorial.specs || []).slice(0, 3),
    moodColor: palette[(hash(String(p.id)) + i) % palette.length],
    image: p.images?.[0]?.src ?? null,
  }
}

function fallbackCompose(
  query: string,
  prior: Tile[] | null,
  candidates: ShopifyProduct[],
  recentIntros: string[] = [],
): LlmResult {
  const seed = hash(query)
  const refine = !!prior && prior.length > 0
  const wantsFresh = /\b(else|other|different|another|more|new|fresh)\b/i.test(query)
  const cheaper = /\b(cheaper|budget|less|lower|under)\b/i.test(query)
  const nicer   = /\b(nicer|premium|rare|better|expensive)\b/i.test(query)

  let pool = candidates
  if (cheaper) pool = [...candidates].sort((a, b) => (firstPrice(a) ?? 9999) - (firstPrice(b) ?? 9999))
  else if (nicer) pool = [...candidates].sort((a, b) => (firstPrice(b) ?? 0) - (firstPrice(a) ?? 0))
  else pool = shuffle(candidates, seed + (refine ? 1 : 0))

  let picks = pool.slice(0, 3)
  if (refine && !wantsFresh && prior) {
    const priorIds = new Set(prior.map(t => t.id))
    const kept = candidates.filter(c => priorIds.has(String(c.id)))
    if (kept.length >= 3) picks = kept.slice(0, 3)
  }

  const tokens = tokensOf(query).slice(0, 3)
  const headlines = [tokens[0] ?? 'pick', tokens[1] ?? tokens[0] ?? 'quiet', tokens[2] ?? 'small']

  const prices = picks.map(p => firstPrice(p) ?? 0).filter(n => n > 0)
  const low = prices.length ? Math.min(...prices) : 0
  const high = prices.length ? Math.max(...prices) : 0
  const lo = Math.round(low)
  const hi = Math.round(high)
  const range = lo > 0 && hi > 0 ? (lo === hi ? `around $${lo}` : `$${lo} to $${hi}`) : ''
  const refineIntros = [
    `nudged it a bit. sitting ${range} now.`,
    `here's a warmer pass. ${range}.`,
    `shifted the palette. these land ${range}.`,
    `swapped a few in. ${range} across the set.`,
    `reshuffled toward what you asked for. ${range}.`,
  ]
  const initialIntros = [
    `a few I liked for "${query}". ${range}.`,
    `pulled some together on "${query}". ${range}.`,
    `these felt right for "${query}". ${range}.`,
    `went hunting for "${query}". ended up ${range}.`,
  ]
  const introPool = refine ? refineIntros : initialIntros
  const recentNorm = new Set(recentIntros.map(s => s.trim().toLowerCase()))
  const unused = introPool.filter(s => !recentNorm.has(s.trim().toLowerCase()))
  const usablePool = unused.length > 0 ? unused : introPool
  const intro = usablePool[Math.abs(seed + (prior?.length ?? 0)) % usablePool.length]

  return {
    picks: picks.map((p, i) => ({
      productId: p.id,
      headline: headlines[i],
      description: scrubBanned((stripHtml(p.body_html).split('. ')[0] || `${p.vendor ?? 'a small maker'}'s ${p.product_type ?? 'piece'}, quietly built.`).slice(0, 140)),
      specs: [
        p.product_type || 'goods',
        p.vendor ? `made by ${p.vendor}` : 'small-batch',
        'ships direct',
      ],
    })),
    intro,
    followups: [
      cheaper ? 'something nicer' : 'under $100 instead',
      refine ? 'show me other options' : 'in a cooler palette',
      'what pairs with this',
    ],
  }
}

export async function POST(req: NextRequest) {
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const query = (body.query ?? '').trim()
  if (!query) return NextResponse.json({ error: 'empty query' }, { status: 400 })

  const history = body.history ?? []
  const prior = body.prior ?? null
  const paletteKey = pickPalette(query)

  // Demo prewarm: if this exact (query, history) was captured by the offline
  // cache build, serve it after a brief simulated-work delay. Returning in
  // 5 ms feels too-fast-to-be-real and shortcircuits the commentary animation
  // on the client, so we match what a live LLM call would take (~6–9 s).
  const cached = DEMO_ENTRIES[demoCacheKey(query, history)]
  if (cached && cached.response && typeof cached.response === 'object') {
    const delayMs = 6000 + Math.floor(Math.random() * 3000) // 6.0–9.0s
    await new Promise<void>(r => setTimeout(r, delayMs))
    return NextResponse.json({
      ...(cached.response as Record<string, unknown>),
      meta: {
        ...((cached.response as Record<string, unknown>).meta as Record<string, unknown> ?? {}),
        cached: true,
      },
    })
  }

  // On a refine, the raw query ("cooler palette") has lost the original topic —
  // anchor it with the first real search term so web_search keeps the category.
  const isRefine = history.length > 0 && prior && prior.length > 0
  const anchor = isRefine ? history[0] : null
  const effectiveQuery = anchor ? `${anchor} ${query}` : query

  const recentIntros = (body.recentIntros ?? []).filter(s => typeof s === 'string' && s.trim().length > 0).slice(0, 4)

  // Shopify-first: the registry is ~60 curated Shopify stores. Their images are
  // CDN-served (never a broken og:image scrape), so when the query lives inside
  // Shopify's catalog we prefer it. Web search only kicks in when the registry
  // has nothing on topic (e.g. electronics, books, appliances).
  // Gate on classifyQuery: if the query + history don't match any known product
  // category (e.g. "vacuum cleaner", "mechanical keyboard"), the registry would
  // only surface accidental token matches — skip it entirely and go to web.
  // Phrase overrides in classifyQuery handle overloaded keywords like "price
  // cap" so a refine can't drift into a wrong category.
  const queryChain = [query, ...history]
  const classifiedCats = classifyQuery(queryChain.join(' '))
  const pool = classifiedCats.length > 0 ? await buildCandidatePool(queryChain, 28) : null
  const candidates = pool?.candidates ?? []

  // Head-noun guard: the last category-triggering token in the current query is
  // the product type the user actually wants ("lamp" in "a desk lamp"). If no
  // candidate text contains it, the registry matched on a sibling word ("desk")
  // instead, surfacing trays and clocks for a lamp query. Fall through to web.
  const headNoun = lastCategoryToken(query) || lastCategoryToken(queryChain.join(' '))
  const headPresent = headNoun
    ? candidates.some(p => productText(p).includes(headNoun))
    : true

  if (pool && !pool.widenedToAll && candidates.length >= 3 && headPresent) {
    const llm = await llmCompose(query, history, prior, candidates, recentIntros)
    const composed = llm && llm.picks.length > 0 ? llm : fallbackCompose(query, prior, candidates, recentIntros)
    const byId = new Map(candidates.map(p => [p.id, p]))
    const tiles: Tile[] = []
    for (let i = 0; i < composed.picks.length && tiles.length < 3; i++) {
      const pick = composed.picks[i]
      const product = byId.get(pick.productId)
      if (!product) continue
      tiles.push(tileFromProduct(product, pick, paletteKey, query, i))
    }
    if (tiles.length >= 3) {
      return NextResponse.json({
        tiles,
        intro: scrubIntro(composed.intro),
        followups: scrubFollowups(composed.followups.slice(0, 3)),
        meta: { matchCount: pool?.matchCount ?? 0, widened: false, noMatch: false, source: 'registry' },
      })
    }
  }

  // Registry either had no token overlap or couldn't produce 3 tiles. Hand off
  // to web_search for long-tail queries (books, electronics, specialty gear).
  const web = await webSearchCompose(effectiveQuery, history, prior, { allowAggregators: true, recentIntros })
  if (web && web.picks.length >= 3) {
    const tiles = web.picks.slice(0, 3).map((p, i) => tileFromWebPick(p, paletteKey, i))
    return NextResponse.json({
      tiles,
      intro: scrubIntro(web.intro),
      followups: scrubFollowups(web.followups ?? []),
      meta: { source: 'web', matchCount: tiles.length, widened: true, noMatch: false },
    })
  }

  // Web returned 1–2 qualifying picks. Return just those — do NOT top up from
  // the registry, which would mix unrelated categories. Better to show 1–2
  // on-topic tiles than 3 mixed ones. The UI handles variable tile counts.
  if (web && web.picks.length > 0) {
    const tiles = web.picks.map((p, i) => tileFromWebPick(p, paletteKey, i))
    return NextResponse.json({
      tiles,
      intro: scrubIntro(web.intro),
      followups: scrubFollowups(web.followups ?? []),
      meta: { source: 'web', matchCount: tiles.length, widened: true, noMatch: false },
    })
  }

  // Neither Shopify nor web had anything on topic. Keep followups honest —
  // no leading prompts like "without the price cap" that will loop the user
  // back into another empty response.
  return NextResponse.json({
    tiles: [],
    intro: "couldn't find matches for that. try a different product category or a broader phrase.",
    followups: ['cozy textiles', 'a carry-on bag', 'a desk lamp'],
    meta: { matchCount: 0, widened: true, noMatch: true, source: 'none' },
  })
}
