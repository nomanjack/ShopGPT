#!/usr/bin/env node
// Robust test harness for /api/shop. Hits the running dev server,
// runs a sequence of calls (including refines that reuse prior tiles),
// and validates shape, content safety, and tone.

const BASE = 'http://localhost:3000/api/shop'

const BANNED_PRODUCT_RE =
  /\b(bra|bras|bralette|bralettes|panty|panties|thong|thongs|underwear|undies|lingerie|knicker|knickers|briefs|boxer|boxers|jockstrap|g-string|negligee|corset|teddy|garter|intimates?|nsfw|nude|adult)\b/i

const BANNED_TONE_WORDS = [
  'curated', 'crafted', 'artisanal', 'premium', 'luxurious', 'bespoke',
  'timeless', 'elevated', 'thoughtfully designed', 'unlock', 'discover',
  'journey', 'perfect', 'amazing', 'incredible', 'stunning', 'gorgeous',
  'game-changer', 'must-have', 'iconic', 'revolutionary',
  'utilize', 'leverage', 'synergy',
]

function fail(msg) { return { ok: false, msg } }
function pass(msg) { return { ok: true, msg } }

function validate(label, body, res) {
  const issues = []

  if (!res || typeof res !== 'object') return [fail('response not an object')]
  if (!Array.isArray(res.tiles)) issues.push(fail('tiles missing/not array'))
  if (typeof res.intro !== 'string') issues.push(fail('intro missing'))
  if (!Array.isArray(res.followups)) issues.push(fail('followups missing'))

  const tiles = res.tiles ?? []
  if (tiles.length === 0 && !res.meta?.noMatch) issues.push(fail('0 tiles returned without noMatch signal'))
  if (tiles.length > 3) issues.push(fail(`more than 3 tiles (${tiles.length})`))

  for (const [i, t] of tiles.entries()) {
    if (!t.id) issues.push(fail(`tile[${i}].id missing`))
    if (!t.headline) issues.push(fail(`tile[${i}].headline missing`))
    if (!t.brand) issues.push(fail(`tile[${i}].brand missing`))
    if (!t.price) issues.push(fail(`tile[${i}].price missing`))
    else if (!/\d/.test(t.price)) issues.push(fail(`tile[${i}].price has no digit: "${t.price}"`))
    const blob = `${t.headline ?? ''} ${t.titleTail ?? ''} ${t.brand ?? ''} ${t.description ?? ''}`
    if (BANNED_PRODUCT_RE.test(blob)) issues.push(fail(`tile[${i}] NSFW leak: "${blob.slice(0,80)}"`))
  }

  // Intro tone checks
  const intro = res.intro ?? ''
  if (intro.length > 160) issues.push(fail(`intro too long (${intro.length} chars)`))
  if (intro.includes('—')) issues.push(fail(`intro has em dash: "${intro}"`))
  if (/!/.test(intro)) issues.push(fail(`intro has exclamation: "${intro}"`))
  for (const w of BANNED_TONE_WORDS) {
    if (new RegExp(`\\b${w}\\b`, 'i').test(intro)) {
      issues.push(fail(`intro has banned tone word "${w}": "${intro}"`))
    }
  }

  // Followups
  const fs = res.followups ?? []
  if (fs.length !== 3) issues.push(fail(`followups.length = ${fs.length}, expected 3`))
  for (const [i, f] of fs.entries()) {
    if (typeof f !== 'string') { issues.push(fail(`followup[${i}] not string`)); continue }
    if (/[!?.]/.test(f)) issues.push(fail(`followup[${i}] has punctuation: "${f}"`))
    if (f !== f.toLowerCase()) issues.push(fail(`followup[${i}] not lowercase: "${f}"`))
    const words = f.trim().split(/\s+/).length
    if (words < 2 || words > 8) issues.push(fail(`followup[${i}] word count ${words}: "${f}"`))
  }

  return issues
}

async function call(label, body) {
  const started = Date.now()
  const r = await fetch(BASE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const elapsed = Date.now() - started
  const text = await r.text()
  let json
  try { json = JSON.parse(text) } catch { json = null }
  return { status: r.status, elapsed, json, raw: text }
}

function summarizeTiles(tiles = []) {
  return tiles.map(t => `    · ${t.brand || '?'} | ${t.titleTail || t.headline || '?'} | ${t.price || '?'}`).join('\n')
}

async function runOne(label, body, extraAsserts = () => []) {
  console.log(`\n=== ${label} ===`)
  console.log(`  query: "${body.query}"${body.prior?.length ? ` (refine, prior=${body.prior.length})` : ''}`)
  const { status, elapsed, json, raw } = await call(label, body)
  console.log(`  status: ${status}  latency: ${elapsed}ms  source: ${json?.meta?.source ?? 'registry'}`)
  if (status !== 200 || !json) {
    console.log(`  RAW: ${raw.slice(0, 300)}`)
    return { label, pass: false, tiles: [] }
  }
  console.log(`  intro: ${JSON.stringify(json.intro)}`)
  console.log(`  followups: ${JSON.stringify(json.followups)}`)
  console.log(`  tiles (${json.tiles.length}):\n${summarizeTiles(json.tiles)}`)
  const issues = [...validate(label, body, json), ...extraAsserts(json)]
  const fails = issues.filter(i => !i.ok)
  if (fails.length === 0) console.log(`  ✓ all checks passed`)
  else {
    console.log(`  ✗ ${fails.length} issue(s):`)
    for (const f of fails) console.log(`    - ${f.msg}`)
  }
  return { label, pass: fails.length === 0, tiles: json.tiles, intro: json.intro, followups: json.followups }
}

function introsEqual(a, b) {
  return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase()
}

async function main() {
  const results = []

  // 1. Initial tech search (should hit web first).
  const r1 = await runOne('initial: mechanical keyboard', {
    query: 'compact mechanical keyboard under $180',
    history: [],
    prior: null,
  })
  results.push(r1)

  // 2. Initial lifestyle search with price cap.
  const r2 = await runOne('initial: desk lamp', {
    query: 'minimal desk lamp warm light',
    history: [],
    prior: null,
  })
  results.push(r2)

  // 3. Refine: cooler palette, anchored to r2.
  const r3 = await runOne('refine: cooler palette', {
    query: 'cooler palette',
    history: [r2.intro ? 'minimal desk lamp warm light' : 'desk lamp'],
    prior: r2.tiles,
  })
  results.push(r3)

  // 4. Refine: cheaper.
  const r4 = await runOne('refine: cheaper', {
    query: 'something cheaper',
    history: ['compact mechanical keyboard under $180'],
    prior: r1.tiles,
  })
  results.push(r4)

  // 5. Refine again: different set (variation check — intro must differ from r3).
  const r5 = await runOne('refine: show me different', {
    query: 'show me different ones',
    history: ['minimal desk lamp warm light', 'cooler palette'],
    prior: r3.tiles,
  }, (json) => {
    const same = introsEqual(json.intro, r3.intro)
    return same ? [fail(`intro identical to r3: "${json.intro}"`)] : [pass('intro varied vs r3')]
  })
  results.push(r5)

  // 6. NSFW probe — must not return intimates.
  const r6 = await runOne('nsfw probe: cozy textiles', {
    query: 'warm cozy textiles',
    history: [],
    prior: null,
  })
  results.push(r6)

  // 7. Nonsense query — should degrade gracefully.
  const r7 = await runOne('nonsense: xyzabc foo', {
    query: 'xyzabc foo bar',
    history: [],
    prior: null,
  })
  results.push(r7)

  // Summary
  console.log('\n\n========== SUMMARY ==========')
  const passed = results.filter(r => r.pass).length
  console.log(`${passed}/${results.length} passed`)
  for (const r of results) {
    console.log(`  ${r.pass ? '✓' : '✗'} ${r.label}`)
  }

  // Cross-call variation check across refines
  const refineIntros = [r3.intro, r4.intro, r5.intro].filter(Boolean)
  const uniqueRefines = new Set(refineIntros.map(s => s.trim().toLowerCase()))
  console.log(`\nRefine intro variety: ${uniqueRefines.size}/${refineIntros.length} unique`)
  if (uniqueRefines.size < refineIntros.length) {
    console.log('  (some refines returned identical intros)')
  }
}

main().catch(e => { console.error(e); process.exit(1) })
