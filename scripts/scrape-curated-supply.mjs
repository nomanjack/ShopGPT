#!/usr/bin/env node
// One-off scraper for curated.supply. Crawls the public sitemap, drives a real
// browser (playwright-core with the system Chrome) at each /products/<slug>
// page so client-rendered product images resolve, and emits a static JSON
// catalog that the /shop2 assistant searches locally.
//
// Run: node scripts/scrape-curated-supply.mjs
// Output: lib/shop/catalog.json

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUTPUT = path.join(__dirname, '..', 'lib', 'shop', 'catalog.json')
const SITEMAP = 'https://www.curated.supply/sitemap.xml'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36'
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
// Site-level og:image that every Framer page shares; skip it.
const SITE_PLACEHOLDER_FRAGMENT = 'yQRnqZsGDmPBZ7e7xuDVv7qyNQ'

async function fetchText(url, { timeoutMs = 15_000 } = {}) {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      headers: { 'user-agent': UA, accept: 'text/html,application/xml' },
      redirect: 'follow',
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(t)
  }
}

function extractProductUrls(xml) {
  const urls = []
  for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    if (m[1].includes('/products/')) urls.push(m[1])
  }
  return Array.from(new Set(urls))
}

// Returns { slug, title, brand, category, price, priceNum, image, description, lists, productUrl }
async function scrapeOne(page, url) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 25_000 })
  const data = await page.evaluate(() => {
    const meta = (prop) => document.querySelector(`meta[property="${prop}"], meta[name="${prop}"]`)?.getAttribute('content') ?? null

    // Product images live on assets.curated.supply (the site uses Framer for
    // layout but hosts its own product photography). The FIRST large image
    // from that CDN on the page is the main product shot; the rest are the
    // "More in <category>" shelf below.
    const imgs = Array.from(document.querySelectorAll('img'))
      .map(el => ({ src: el.currentSrc || el.src || '', w: el.naturalWidth, h: el.naturalHeight }))
      .filter(i => i.src.startsWith('https://assets.curated.supply/') && i.w >= 300)
    const image = imgs[0]?.src ?? null

    const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ').trim()
    return {
      ogTitle: meta('og:title'),
      ogDescription: meta('og:description'),
      bodyText,
      image,
    }
  })

  const slug = url.match(/\/products\/([^/?#]+)/)?.[1] ?? null
  const title = data.ogTitle ?? null
  if (!slug || !title) return null

  // Parse breadcrumb: "<Brand> · <Category>" just before the product name. The
  // page header puts "Discover Browse Blog About" before everything, so strip
  // that first, then grab the last "<Word(s)> · <Word>" chunk before the title.
  const text = data.bodyText.replace(/^\s*Discover\s+Browse\s+Blog\s+About\s+/i, '')
  const titleIdx = text.indexOf(title)
  let brand = null, category = null
  if (titleIdx >= 0) {
    const before = text.slice(0, titleIdx).trim()
    // Last "<Brand> · <Category>" before the title. Brand is 1–3 Capitalized
    // words (Herman Miller, Teenage Engineering, Saint Florentin).
    const m = before.match(/([A-Z][A-Za-z0-9'.&-]+(?:\s+[A-Z][A-Za-z0-9'.&-]+){0,3})\s+·\s+([A-Z][a-zA-Z]+)\s*$/)
    if (m) { brand = m[1].trim(); category = m[2].trim() }
  }
  if (!brand || !category) {
    const m2 = text.match(/([A-Z][A-Za-z0-9'.&-]+(?:\s+[A-Z][A-Za-z0-9'.&-]+){0,3})\s+·\s+([A-Z][a-zA-Z]+)/)
    if (m2) { brand = brand ?? m2[1].trim(); category = category ?? m2[2].trim() }
  }

  // Price: first "$NNN" or "$N,NNN[.NN]" after the title. Fall back to first
  // price anywhere on the page if the slice after title didn't catch it.
  let price = null, priceNum = null
  const priceSources = titleIdx >= 0
    ? [text.slice(titleIdx, titleIdx + 400), text]
    : [text]
  for (const src of priceSources) {
    const pm = src.match(/\$([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?)/)
    if (!pm) continue
    const n = parseFloat(pm[1].replace(/,/g, ''))
    if (!Number.isFinite(n) || n < 1 || n > 2_000_000) continue
    priceNum = n
    price = n >= 1000 ? `$${n.toLocaleString('en-US')}` : `$${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`
    break
  }

  // Description: text after "About" header or after "Purchase Link", trimmed
  // before "More in" / "Featured in".
  let description = null
  if (titleIdx >= 0) {
    const afterTitle = text.slice(titleIdx)
    // Try "About " first, then "Purchase Link " as a fallback marker.
    const markerAbout = afterTitle.match(/\bAbout\s+/)
    const markerPurchase = afterTitle.match(/\bPurchase Link\s+/)
    const marker = markerAbout ?? markerPurchase
    if (marker) {
      const start = afterTitle.indexOf(marker[0]) + marker[0].length
      const rest = afterTitle.slice(start)
      const endIdx = rest.search(/\s+(More in|Featured in|Purchase Link)\s+/i)
      const raw = (endIdx >= 0 ? rest.slice(0, endIdx) : rest.slice(0, 700)).trim()
      // Filter out cases where we caught nav junk instead of real prose.
      if (raw.length > 30 && !/^(Subscribe|Select links|Navigation)/i.test(raw)) {
        description = raw
      }
    }
  }

  // Lists: "Featured in" section — "Name 12 Name 34 ..." pattern. The page
  // also emits "See all <Name>" links next to each list; strip that prefix.
  const lists = []
  const fi = text.indexOf('Featured in')
  if (fi >= 0) {
    const slice = text.slice(fi + 'Featured in'.length, fi + 600)
    const seen = new Set()
    for (const m of slice.matchAll(/([A-Z][A-Za-z0-9][A-Za-z0-9 &'.-]*?)\s+\d+(?=\s+[A-Z]|\s+Purchase|\s*$)/g)) {
      let n = m[1].trim()
      n = n.replace(/^See all\s+/i, '').trim()
      if (n.length < 2 || n.length > 40) continue
      if (/^(purchase link|subscribe|see all|browse|discover)$/i.test(n)) continue
      if (!seen.has(n)) { seen.add(n); lists.push(n) }
      if (lists.length >= 6) break
    }
  }

  return { slug, title, brand, category, price, priceNum, image: data.image, description, lists, productUrl: url }
}

async function main() {
  console.log('fetching sitemap...')
  const xml = await fetchText(SITEMAP)
  const urls = extractProductUrls(xml)
  console.log(`found ${urls.length} product URLs`)

  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
  })

  const CONCURRENCY = 6
  const contexts = await Promise.all(
    Array.from({ length: CONCURRENCY }, () =>
      browser.newContext({
        userAgent: UA,
        viewport: { width: 1280, height: 900 },
      }).then(c => c.newPage())
    )
  )

  let idx = 0
  let done = 0
  const started = Date.now()
  const results = new Array(urls.length)

  async function worker(page) {
    while (true) {
      const my = idx++
      if (my >= urls.length) return
      try {
        results[my] = await scrapeOne(page, urls[my])
      } catch (err) {
        results[my] = { __error: err?.message ?? String(err), url: urls[my] }
      }
      done++
      if (done % 25 === 0) {
        const secs = ((Date.now() - started) / 1000).toFixed(0)
        console.log(`  ${done}/${urls.length} · ${secs}s`)
      }
    }
  }

  await Promise.all(contexts.map(p => worker(p)))
  await browser.close()

  const products = results.filter(r => r && !r.__error && r.slug && r.title && r.image)
  const errors = results.filter(r => r && r.__error)
  const incomplete = results.filter(r => r && !r.__error && (!r.slug || !r.title || !r.image))

  console.log(`\n✓ ${products.length} products`)
  console.log(`✗ ${errors.length} fetch errors`)
  console.log(`⚠ ${incomplete.length} incomplete (missing slug/title/image)`)
  const stats = {
    withBrand: products.filter(p => p.brand).length,
    withCategory: products.filter(p => p.category).length,
    withPrice: products.filter(p => p.price).length,
    withDescription: products.filter(p => p.description).length,
    withLists: products.filter(p => p.lists.length > 0).length,
    uniqueImages: new Set(products.map(p => p.image)).size,
  }
  console.log('coverage:', stats)

  const catalog = {
    generatedAt: new Date().toISOString(),
    source: 'https://www.curated.supply',
    productCount: products.length,
    products,
  }
  await fs.mkdir(path.dirname(OUTPUT), { recursive: true })
  await fs.writeFile(OUTPUT, JSON.stringify(catalog, null, 2))
  console.log(`\nwrote ${OUTPUT} (${(JSON.stringify(catalog).length / 1024).toFixed(0)} KB)`)
}

main().catch(e => { console.error(e); process.exit(1) })
