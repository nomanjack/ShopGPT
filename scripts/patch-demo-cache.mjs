#!/usr/bin/env node
// Patches lib/shop/demo-cache.json with hand-tuned entries for the one landing
// chip the automated build couldn't satisfy ("programmable macro pads" — the
// catalog doesn't have dedicated macro pads). We surface Work Louder's
// programmable-adjacent products (a macro keypad + knob controller + keyboard)
// with an honest intro.

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CATALOG = path.join(__dirname, '..', 'lib', 'shop', 'catalog.json')
const CACHE   = path.join(__dirname, '..', 'lib', 'shop', 'demo-cache.json')

function deterministicHash(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function toShopTile(t) {
  const hash = deterministicHash(t.slug ?? t.title ?? '')
  const fullTitle = (t.title ?? '').trim()
  const brand = (t.brand ?? '').trim()
  const stripped = brand && fullTitle.toLowerCase().startsWith(brand.toLowerCase())
    ? fullTitle.slice(brand.length).trim() : fullTitle
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

async function main() {
  const catalog = JSON.parse(await fs.readFile(CATALOG, 'utf8'))
  const cache = JSON.parse(await fs.readFile(CACHE, 'utf8'))
  const bySlug = new Map(catalog.products.map(p => [p.slug, p]))

  const pick = (slug) => {
    const p = bySlug.get(slug)
    if (!p) throw new Error(`catalog missing ${slug}`)
    return toShopTile(p)
  }

  // Macro pad chip — use Work Louder's programmable peripherals.
  cache.entries['programmable macro pads'] = {
    query: 'programmable macro pads',
    history: [],
    depth: 0,
    response: {
      tiles: [
        pick('creator-micro-2'),
        pick('k-no-b-1'),
        pick('nomad-e-v2'),
      ],
      intro: "No dedicated macro pads in my catalog, but Work Louder builds programmable keypads and knobs that cover the same ground.",
      followups: [
        'under 200 dollars',
        'with tactile knobs',
        'mechanical keyboards instead',
      ],
      meta: { source: 'catalog', handcrafted: true },
    },
  }

  cache.generatedAt = new Date().toISOString()
  await fs.writeFile(CACHE, JSON.stringify(cache, null, 2))
  console.log('patched programmable macro pads → 3 Work Louder tiles')
}

main().catch(e => { console.error(e); process.exit(1) })
