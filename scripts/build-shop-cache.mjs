#!/usr/bin/env node
// Prewarm the /shop demo path. Starts at the 8 landing chips, walks each
// response's `followups` out to depth 2 (chip → 1st refine → 2nd refine) and
// saves the full API response for every node to `lib/shop/demo-cache.json`
// keyed by `query\nhistory[0]\nhistory[1]...`.
//
// Backend choice: we call /api/shop2 (the curated-supply catalog) and
// transform each response into /shop's tile shape. /shop's own web_search
// path returns inconsistent images for the landing-chip queries (tech, books,
// luggage) because brand sites don't reliably expose og:image. /shop2's
// Framer CDN images are 100 % reliable, so caching through that source
// produces a demo that never shows broken tiles.
//
// Run with the dev server already listening on BASE.
//   node scripts/build-shop-cache.mjs
//
// Reruns are safe — existing keys are overwritten in place.

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BASE = process.env.SHOP_CACHE_BASE ?? 'http://localhost:3000/api/shop2'
const OUTPUT = path.join(__dirname, '..', 'lib', 'shop', 'demo-cache.json')
const MAX_DEPTH = 4 // 0 = chip, 1–4 = refine levels. Entries roughly triple per level.
const TIMEOUT_MS = 45_000

const LANDING_CHIPS = [
  'apple laptops and accessories',
  'mechanical keyboards',
  'handheld gaming consoles',
  'programmable macro pads',
  'desk stands for phones',
  'minimalist coffee table books',
  'aluminum carry-on luggage',
  'gradient wall posters',
]

function cacheKey(query, history) {
  return [query, ...history].join('\n')
}

async function callShop2(query, history, prior) {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    // /api/shop2 takes Shop2Tile shapes in `prior`.
    const r = await fetch(BASE, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, history, prior }),
      signal: ctl.signal,
    })
    if (!r.ok) {
      let msg = `${r.status} ${r.statusText}`
      try { const b = await r.json(); if (b?.error) msg = `${r.status}: ${b.error}` } catch {}
      throw new Error(msg)
    }
    return await r.json()
  } finally {
    clearTimeout(t)
  }
}

// Mirror of components/shop2/shop2-app.tsx `tileFromShop2` so cached responses
// match the runtime Tile shape /shop's client expects.
function deterministicHash(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function shop2TileToShopTile(t) {
  const hash = deterministicHash(t.slug ?? t.title ?? '')
  const fullTitle = (t.title ?? '').trim()
  const brandPrefix = (t.brand ?? '').trim()
  const stripped = brandPrefix && fullTitle.toLowerCase().startsWith(brandPrefix.toLowerCase())
    ? fullTitle.slice(brandPrefix.length).trim()
    : fullTitle
  const firstSpace = stripped.indexOf(' ')
  const headline = firstSpace > 0 ? stripped.slice(0, firstSpace) : stripped
  const titleTail = firstSpace > 0 ? stripped.slice(firstSpace + 1).trim() : ''
  return {
    id: t.slug,
    headline: (headline || 'pick').toLowerCase(),
    titleTail,
    brand: t.brand ?? 'maker',
    price: t.price ?? '$—',
    rating: Math.round((4 + (hash % 90) / 100) * 10) / 10,
    reviewCount: 20 + (hash % 480),
    description: t.description ?? '',
    specs: t.category ? [t.category.toLowerCase(), 'from curated.supply', 'real product'] : ['real product'],
    moodColor: '#EEEEEE',
    image: t.image ?? null,
  }
}

// Shop2 response has kind = search | reply | decline. /shop's client only
// understands { tiles, intro, followups }. Flatten: reply returns its
// references as tiles with the reply text as the intro; decline returns
// empty tiles with the redirect text.
function shop2ToShopResponse(shop2) {
  if (!shop2 || typeof shop2 !== 'object') return null
  const followups = Array.isArray(shop2.followups) ? shop2.followups : []
  if (shop2.kind === 'search') {
    return {
      tiles: (Array.isArray(shop2.tiles) ? shop2.tiles : []).map(shop2TileToShopTile),
      intro: typeof shop2.intro === 'string' ? shop2.intro : '',
      followups,
      meta: { ...(shop2.meta ?? {}), source: 'catalog' },
    }
  }
  if (shop2.kind === 'reply') {
    return {
      tiles: (Array.isArray(shop2.references) ? shop2.references : []).map(shop2TileToShopTile),
      intro: typeof shop2.text === 'string' ? shop2.text : '',
      followups,
      meta: { source: 'catalog', kind: 'reply' },
    }
  }
  // decline
  return {
    tiles: [],
    intro: typeof shop2.text === 'string' ? shop2.text : "i couldn't find matches for that — try a different angle.",
    followups,
    meta: { source: 'catalog', kind: 'decline', noMatch: true },
  }
}

// Shop2 expects prior tiles in its own Shop2Tile format. Keep the raw Shop2Tiles
// around in the BFS node so we can pass them back verbatim on refines.
function extractShop2Prior(shop2) {
  if (!shop2 || typeof shop2 !== 'object') return null
  if (shop2.kind === 'search' && Array.isArray(shop2.tiles)) return shop2.tiles
  if (shop2.kind === 'reply' && Array.isArray(shop2.references)) return shop2.references
  return null
}

function pad(n, w) { return String(n).padStart(w, ' ') }

async function main() {
  // Load any existing cache so we can incrementally top up.
  let cache = { generatedAt: new Date().toISOString(), version: 1, entries: {} }
  try {
    const raw = await fs.readFile(OUTPUT, 'utf8')
    const prev = JSON.parse(raw)
    if (prev && typeof prev === 'object' && prev.entries) {
      cache.entries = prev.entries
      console.log(`loaded existing cache with ${Object.keys(cache.entries).length} entries`)
    }
  } catch { /* no existing cache; start fresh */ }

  // BFS queue of { query, history, prior, depth }.
  const queue = LANDING_CHIPS.map(q => ({ query: q, history: [], prior: null, depth: 0 }))
  const visited = new Set()
  let idx = 0
  const started = Date.now()
  const failures = []

  while (queue.length > 0) {
    const node = queue.shift()
    const key = cacheKey(node.query, node.history)
    if (visited.has(key)) continue
    visited.add(key)
    idx++

    const label = `${pad(idx, 3)}  depth=${node.depth}  "${node.query.slice(0, 40)}"`

    try {
      const shop2Response = await callShop2(node.query, node.history, node.prior)
      const response = shop2ToShopResponse(shop2Response)
      if (!response) throw new Error('unexpected shop2 response shape')

      const elapsed = ((Date.now() - started) / 1000).toFixed(0)
      const tileCount = Array.isArray(response.tiles) ? response.tiles.length : 0
      const withImg = Array.isArray(response.tiles)
        ? response.tiles.filter(t => t.image && /^https?:\/\//.test(t.image)).length
        : 0
      const followupCount = Array.isArray(response.followups) ? response.followups.length : 0
      const kind = shop2Response?.kind ?? 'search'
      console.log(`${label}  →  ${kind}  ${tileCount} tiles / ${withImg} img / ${followupCount} followups  (${elapsed}s total)`)

      cache.entries[key] = {
        query: node.query,
        history: node.history,
        depth: node.depth,
        response,
      }

      // BFS deeper using the raw Shop2 tiles as prior (so /api/shop2 resolves
      // slugs). Only walk when we got search-kind results with real tiles.
      const rawPrior = extractShop2Prior(shop2Response)
      if (node.depth < MAX_DEPTH && followupCount > 0 && tileCount > 0 && kind === 'search') {
        for (const fu of response.followups) {
          queue.push({
            query: fu,
            history: [...node.history, node.query],
            prior: rawPrior,
            depth: node.depth + 1,
          })
        }
      }

      // Write incrementally so a crash halfway doesn't lose the work.
      cache.generatedAt = new Date().toISOString()
      await fs.mkdir(path.dirname(OUTPUT), { recursive: true })
      await fs.writeFile(OUTPUT, JSON.stringify(cache, null, 2))
    } catch (err) {
      console.error(`${label}  ✗ ${err?.message ?? err}`)
      failures.push({ key, error: err?.message ?? String(err) })
    }
  }

  const took = ((Date.now() - started) / 1000).toFixed(0)
  console.log(`\nwrote ${OUTPUT}`)
  console.log(`${Object.keys(cache.entries).length} entries · ${took}s total · ${failures.length} failures`)
  if (failures.length) {
    console.log('failures:')
    for (const f of failures) console.log(`  ${f.key.slice(0, 60)} → ${f.error}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
