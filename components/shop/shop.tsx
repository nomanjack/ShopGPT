'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, animate, motion, type AnimationPlaybackControls } from 'motion/react'
import type { Tile, CartLine, RecentOrder } from './types'
import { streamText } from '@/lib/stream-text'
import { EASE_OUT } from './atoms'
import { shiftHex, safeHex } from './utils'
import { TileCard } from './tile-card'
import { ProductImage } from './product-image'
import { ProductModal } from './product-modal'
import { CartSheet, OrderSheet } from './cart'
import { AccountView } from './account'
import { CheckoutConfirmed } from './checkout'
import { FlyToCart, type Flight } from './fly-to-cart'
import { Commentary } from './commentary'
import { HoverTip } from './hover-tip'

const CLIENT_PALETTES: { words: string[]; name: string }[] = [
  { words: ['warm', 'cozy', 'amber', 'toast'],                   name: 'warm' },
  { words: ['cool', 'quiet', 'calm', 'blue', 'navy', 'sea'],     name: 'cool' },
  { words: ['earth', 'wood', 'natural', 'raw', 'muted'],         name: 'earthy' },
  { words: ['loud', 'bold', 'bright', 'neon', 'pop'],            name: 'bright' },
  { words: ['mono', 'black', 'grey', 'gray', 'minimal', 'dark'], name: 'mono' },
  { words: ['pastel', 'baby', 'pink', 'peach', 'mint'],          name: 'pastel' },
  { words: ['forest', 'green', 'sage', 'moss', 'pine', 'olive'], name: 'forest' },
  { words: ['clay', 'rust', 'terracotta', 'brick'],              name: 'clay' },
]

function detectPalette(q: string): string | null {
  for (const p of CLIENT_PALETTES) {
    if (p.words.some(w => q.includes(w))) return p.name
  }
  return null
}

// Extract the head noun(s) from the query for commentary interpolation. Drops
// stopwords/modifiers and takes the tail of what remains — "aluminum carry-on
// luggage" → "carry-on luggage", "apple laptops and accessories" → "laptops".
const COMMENTARY_STOPWORDS = new Set([
  'a', 'an', 'the', 'some', 'something', 'and', 'or', 'of', 'for', 'in', 'on',
  'to', 'with', 'without', 'at', 'from', 'into', 'by', 'as', 'is', 'are',
  'that', 'this', 'these', 'those', 'me', 'my', 'your', 'it', 'its',
  'show', 'find', 'need', 'want', 'like', 'have', 'get', 'give', 'pick',
  'good', 'nice', 'best', 'please',
])

function headPhrase(query: string): string {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .map(w => w.replace(/[^a-z0-9$-]/g, ''))
    .filter(w => w.length > 1 && !COMMENTARY_STOPWORDS.has(w))
  if (tokens.length === 0) return query.trim().toLowerCase()
  // Take last 1–2 meaningful tokens so short nouns like "luggage" come through
  // whole while longer queries keep the most specific tail.
  return tokens.slice(-2).join(' ')
}

function buildCommentary(query: string, isRefine: boolean): string[] {
  const q = query.toLowerCase()
  const list: string[] = []
  const priceMatch = q.match(/under\s*\$?(\d+)/i)
  const phrase = headPhrase(query)
  const quoted = `"${query.trim()}"`

  if (isRefine) {
    list.push(`Reading ${quoted}`)
    list.push('Pulling your prior picks')
    if (/cheaper|budget|under/.test(q)) list.push(priceMatch ? `Filtering under $${priceMatch[1]}` : 'Filtering to a tighter budget')
    if (/warmer|cooler|muted|brighter|bright|dark|black|green|navy|blue|cream/.test(q)) list.push('Adjusting the palette')
    list.push(`Re-ranking ${phrase}`)
    list.push('Writing the update')
    return list
  }

  list.push(`Reading ${quoted}`)
  list.push(`Searching the internet for ${phrase}`)

  if (/budget|cheap|under\s*\$?\d/.test(q)) list.push('Checking memory for your budget range')
  else list.push('Reading your saved aesthetic preferences')

  list.push(`Pulling live pages for ${phrase}`)
  if (/gift|ship|deliver/.test(q)) list.push('Checking delivery windows')

  const isApparel = /\b(shirt|shirts|tee|tees|jacket|coat|parka|pant|pants|jean|jeans|sweater|cardigan|beanie|sock|socks|boot|boots|shoe|shoes|knitwear|merino|wool)\b/.test(q)
  const isHomeGoods = /\b(mug|carafe|lamp|candle|candles|napkin|board|pillow|bowl|vase|throw|plate|tote|bag|cup)\b/.test(q)
  const isGear = /\b(helmet|pad|guard|gear|bike|ski|skate|climb|camp|tent|backpack|luggage|carry-on)\b/.test(q)
  const isTech = /\b(laptop|laptops|keyboard|keyboards|phone|phones|macbook|apple|watch|watches|headphone|headphones|speaker|console|consoles|camera|cameras)\b/.test(q)
  const isBooks = /\b(book|books|monograph|magazine)\b/.test(q)

  if (isApparel) list.push('Filtering by fabric weight and breathability')
  else if (isHomeGoods) list.push('Filtering by hand-thrown ceramic makers')
  else if (isGear) list.push('Filtering by build quality and finish')
  else if (isTech) list.push(`Cross-referencing ${phrase} reviews`)
  else if (isBooks) list.push(`Pulling design references for ${phrase}`)
  else list.push(`Checking maker notes on ${phrase}`)

  if (priceMatch) list.push(`Filtering under $${priceMatch[1]}`)

  const palette = detectPalette(q)
  if (palette) list.push(`Filtering by ${palette} palette`)

  list.push(`Cross-referencing stock for ${phrase}`)
  list.push(`Reading the top ${phrase} pages`)
  list.push('Finalizing the top three')

  return list
}

type Turn = {
  id: string
  user: string
  intro: string
  streamedIntro: string
  tiles: Tile[]
  followups: string[]
  commentary: string[]
  activeIdx: number              // -1 when commentary done
  elapsed: number[]              // per-sentence ms (filled as each completes)
  summaryExpanded: boolean
  done: boolean
  collapsed: boolean
  error: string | null
  kind?: 'search' | 'compare'
  compareTiles?: [Tile, Tile] | null
}

const COMPARE_VERB_RE =
  /\b(compare|compared|comparing|vs\.?|versus|v\.|which\s+(is|one\s+is|should)|difference[s]?\s+between|side[-\s]?by[-\s]?side|stack(s|ed)?\s+up|pit(\s+against)?)\b/i

const ORDINAL_WORD: Record<string, number> = {
  first: 0, '1st': 0, one: 0, '1': 0,
  second: 1, '2nd': 1, two: 1, '2': 1,
  third: 2, '3rd': 2, three: 2, '3': 2,
  fourth: 3, '4th': 3, four: 3, '4': 3,
  fifth: 4, '5th': 4, five: 4, '5': 4,
}

function resolveOrdinal(token: string, tiles: Tile[]): number | null {
  if (token === 'last') return tiles.length - 1
  const n = ORDINAL_WORD[token]
  return n != null && n < tiles.length ? n : null
}

function resolvePositionalCompare(q: string, tiles: Tile[] | null): [Tile, Tile] | null {
  if (!tiles || tiles.length < 2) return null

  // "first/top/these (two|2|both|pair)" → [0, 1]
  if (
    /\b(first|top|these|the)\s+(two|2|pair)\b/.test(q) ||
    /\bboth\s+(of\s+)?(them|these)?\b/.test(q) ||
    /\bthese\s+two\b/.test(q) ||
    /\bthe\s+two\b/.test(q) ||
    /\bcompare\s+(these|both|them|first\s*(two|2)?)\b/.test(q) ||
    /\btop\s+(two|2)\b/.test(q)
  ) {
    return [tiles[0], tiles[1]]
  }

  // "last two" → [n-2, n-1]
  if (/\b(last|bottom)\s+(two|2)\b/.test(q)) {
    const n = tiles.length
    return [tiles[n - 2], tiles[n - 1]]
  }

  // "1st and 2nd" / "first vs third" / "1 vs 3"
  const pair = q.match(
    /\b(first|1st|one|1|second|2nd|two|2|third|3rd|three|3|fourth|4th|four|4|fifth|5th|five|5|last)\b[^a-z0-9]+(?:and|vs\.?|versus|v\.|or|&)[^a-z0-9]+\b(first|1st|one|1|second|2nd|two|2|third|3rd|three|3|fourth|4th|four|4|fifth|5th|five|5|last)\b/,
  )
  if (pair) {
    const i = resolveOrdinal(pair[1], tiles)
    const j = resolveOrdinal(pair[2], tiles)
    if (i != null && j != null && i !== j) return [tiles[i], tiles[j]]
  }

  return null
}

function matchTileByText(needle: string, pool: Tile[]): Tile | null {
  const tokens = needle.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length >= 3)
  if (tokens.length === 0) return null
  let best: { tile: Tile; score: number } | null = null
  for (const t of pool) {
    const hay = `${t.brand} ${t.headline} ${t.titleTail}`.toLowerCase()
    let score = 0
    for (const w of tokens) if (hay.includes(w)) score++
    if (score > 0 && (!best || score > best.score)) best = { tile: t, score }
  }
  return best?.tile ?? null
}

function splitNamedCompare(q: string): { a: string; b: string } | null {
  const stripped = q
    .trim()
    .replace(/^(lets?|let's|can you|could you|please|i\s+want\s+to|help\s+me|show\s+me)\s+/i, '')
    .replace(/^(compare|compared|comparing|pit|side[-\s]?by[-\s]?side(\s+for)?|difference[s]?\s+between|which\s+(is\s+better|one\s+is\s+better|should\s+i\s+get)[,:]?)\s+/i, '')

  const vs = stripped.match(/^(.+?)\s+(?:vs\.?|versus|v\.)\s+(.+?)$/i)
  if (vs) return { a: vs[1].trim(), b: vs[2].trim() }

  if (COMPARE_VERB_RE.test(q)) {
    const andOr = stripped.match(/^(.+?)\s+(?:and|or|&)\s+(.+?)$/i)
    if (andOr) return { a: andOr[1].trim(), b: andOr[2].trim() }
  }
  return null
}

function resolveCompareTargets(
  text: string,
  latestTiles: Tile[] | null,
  pool: Tile[],
): [Tile, Tile] | null {
  const q = text.toLowerCase()
  if (!COMPARE_VERB_RE.test(q)) return null

  const pos = resolvePositionalCompare(q, latestTiles)
  if (pos) return pos

  const split = splitNamedCompare(q)
  if (!split) return null
  const a = matchTileByText(split.a, pool)
  const b = matchTileByText(split.b, pool)
  if (a && b && a.id !== b.id) return [a, b]
  return null
}

async function fetchShop(query: string, prior: Tile[] | null, history: string[]): Promise<{ tiles: Tile[]; intro: string; followups: string[] }> {
  const res = await fetch('/api/shop', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, prior, history }),
  })
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      if (body?.error) detail = `${res.status}: ${body.error}`
    } catch { /* non-json body */ }
    throw new Error(`api failed → ${detail}`)
  }
  return (await res.json()) as { tiles: Tile[]; intro: string; followups: string[] }
}

function wait(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms))
}

export default function Shop() {
  const [query, setQuery] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [pending, setPending] = useState(false)
  const [openTile, setOpenTile] = useState<{ turnId: string; tile: Tile } | null>(null)
  const [cart, setCart] = useState<CartLine[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [activeTab, setActiveTab] = useState<TopTab>('new')
  const [addedPulse, setAddedPulse] = useState<{ id: number; color: string } | null>(null)
  const [openOrder, setOpenOrder] = useState<RecentOrder | null>(null)
  const [orders, setOrders] = useState<RecentOrder[]>([])
  const [flights, setFlights] = useState<Flight[]>([])
  const [wishlist, setWishlist] = useState<Tile[]>([])
  const [wishlistPulse, setWishlistPulse] = useState<{ id: number; color: string } | null>(null)
  const [idleDim, setIdleDim] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  const reqIdRef = useRef(0)
  const cancelStreamRef = useRef<(() => void) | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const scrollAnimRef = useRef<AnimationPlaybackControls | null>(null)

  const cartCount = useMemo(
    () => cart.reduce((acc, l) => acc + l.qty, 0),
    [cart],
  )

  const latestTiles = turns.length > 0 ? turns[turns.length - 1].tiles : null
  const history = useMemo(() => turns.map(t => t.user), [turns])

  useEffect(() => () => {
    cancelStreamRef.current?.()
  }, [])

  // The full session (turns, cart, wishlist, orders) saves to localStorage
  // and rehydrates on load, so a reload drops you back into the same session
  // with no flicker. Turn history is capped at 30 so a long session doesn't
  // balloon past the ~5MB quota.
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const rawTurns = localStorage.getItem('shop:turns')
      if (rawTurns) {
        const parsed = JSON.parse(rawTurns) as Turn[]
        if (Array.isArray(parsed)) {
          const seen = new Set<string>()
          const deduped: Turn[] = []
          for (let i = parsed.length - 1; i >= 0; i--) {
            const t = parsed[i]
            if (!t?.id || seen.has(t.id)) continue
            seen.add(t.id)
            deduped.unshift(t)
          }
          let maxId = 0
          for (const t of deduped) {
            const n = Number(String(t.id ?? '').replace(/^t-/, ''))
            if (Number.isFinite(n) && n > maxId) maxId = n
          }
          reqIdRef.current = maxId
          setTurns(deduped.map(t => ({
            ...t,
            done: true,
            activeIdx: -1,
            streamedIntro: t.intro,
            error: null,
            commentary: Array.isArray(t.commentary) ? t.commentary : [],
            tiles: Array.isArray(t.tiles) ? t.tiles : [],
            followups: Array.isArray(t.followups) ? t.followups : [],
          })))
        }
      }
      const rawCart = localStorage.getItem('shop:cart')
      if (rawCart) {
        const parsed = JSON.parse(rawCart) as CartLine[]
        if (Array.isArray(parsed)) setCart(parsed)
      }
      const rawWishlist = localStorage.getItem('shop:wishlist')
      if (rawWishlist) {
        const parsed = JSON.parse(rawWishlist) as Tile[]
        if (Array.isArray(parsed)) setWishlist(parsed)
      }
      const rawOrders = localStorage.getItem('shop:orders')
      if (rawOrders) {
        const parsed = JSON.parse(rawOrders) as RecentOrder[]
        if (Array.isArray(parsed)) {
          const seen = new Set<string>()
          const deduped: RecentOrder[] = []
          for (const o of parsed) {
            if (!o?.id || seen.has(o.id)) continue
            seen.add(o.id)
            deduped.push(o)
          }
          setOrders(deduped)
        }
      }
    } catch { /* ignore */ }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!hydrated) return
    const id = window.setTimeout(() => {
      try {
        if (orders.length === 0) localStorage.removeItem('shop:orders')
        else localStorage.setItem('shop:orders', JSON.stringify(orders))
      } catch { /* ignore */ }
    }, 250)
    return () => window.clearTimeout(id)
  }, [orders, hydrated])

  useEffect(() => {
    if (!hydrated) return
    if (turns.length === 0) return
    requestAnimationFrame(() => {
      const container = scrollRef.current
      if (!container) return
      container.scrollTop = container.scrollHeight
    })
  }, [hydrated])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const id = window.setTimeout(() => {
      try {
        // Cap the persisted history so a long session doesn't balloon past
        // localStorage's ~5 MB quota. Keep the latest 30 — more than any
        // reasonable demo session, well clear of the ceiling.
        const done = turns.filter(t => t.done && !t.error).slice(-30)
        if (done.length === 0) localStorage.removeItem('shop:turns')
        else localStorage.setItem('shop:turns', JSON.stringify(done))
      } catch { /* ignore */ }
    }, 250)
    return () => window.clearTimeout(id)
  }, [turns])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const id = window.setTimeout(() => {
      try {
        if (wishlist.length === 0) localStorage.removeItem('shop:wishlist')
        else localStorage.setItem('shop:wishlist', JSON.stringify(wishlist))
      } catch { /* ignore */ }
    }, 250)
    return () => window.clearTimeout(id)
  }, [wishlist])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const id = window.setTimeout(() => {
      try {
        if (cart.length === 0) localStorage.removeItem('shop:cart')
        else localStorage.setItem('shop:cart', JSON.stringify(cart))
      } catch { /* ignore */ }
    }, 250)
    return () => window.clearTimeout(id)
  }, [cart])

  // Scrolls are animated instead of jumped. A new scroll request cancels the
  // one in flight and takes over from the current position, so rapid turn
  // submissions don't stutter.
  const animatedScrollTo = (target: number, duration = 0.6) => {
    const container = scrollRef.current
    if (!container) return
    if (scrollAnimRef.current) scrollAnimRef.current.stop()
    const start = container.scrollTop
    if (Math.abs(target - start) < 1) return
    scrollAnimRef.current = animate(start, target, {
      duration,
      ease: [0.2, 1, 0.3, 1],
      onUpdate: (v) => { container.scrollTop = v },
    })
  }

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      const container = scrollRef.current
      if (!container) return
      animatedScrollTo(container.scrollHeight)
    })
  }

  const scrollTurnToTop = (turnId: string, instant = false) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = document.getElementById(`turn-${turnId}`)
        const container = scrollRef.current
        if (!el || !container) return
        const target = el.offsetTop - 24
        if (instant) {
          if (scrollAnimRef.current) scrollAnimRef.current.stop()
          container.scrollTop = target
        } else {
          animatedScrollTo(target)
        }
      })
    })
  }

  const updateTurn = (turnId: string, patch: Partial<Turn> | ((t: Turn) => Partial<Turn>)) => {
    setTurns(prev => prev.map(t => {
      if (t.id !== turnId) return t
      const p = typeof patch === 'function' ? patch(t) : patch
      return { ...t, ...p }
    }))
  }

  const streamIntro = (turnId: string, text: string) => {
    cancelStreamRef.current?.()
    let ticks = 0
    cancelStreamRef.current = streamText(
      text,
      (partial) => {
        updateTurn(turnId, { streamedIntro: partial })
        ticks++
        if (partial.length >= text.length) {
          updateTurn(turnId, { done: true })
        }
      },
      { intervalMs: 8 },
    )
  }

  const runCommentary = async (turnId: string, list: string[], isDone: () => boolean, myReq: number) => {
    const STEP_MS = 1600
    const TAIL_MS = 400
    const cancelled = () => reqIdRef.current !== myReq
    // Loop the commentary until the fetch finishes. One full cycle runs through the
    // list at STEP_MS; if the fetch is still pending at the end, we start over from
    // the top. Once fetch resolves, we finish the current step and bail out so the
    // response shows as soon as the cycle winds down.
    outer: while (true) {
      for (let i = 0; i < list.length; i++) {
        if (cancelled()) return
        updateTurn(turnId, { activeIdx: i })
        const isLast = i === list.length - 1
        if (isLast && isDone()) {
          await wait(TAIL_MS)
          break outer
        }
        await wait(STEP_MS)
        if (cancelled()) return
        if (isDone()) break outer
      }
    }
    updateTurn(turnId, { activeIdx: -1 })
  }

  const toggleSummary = (turnId: string) => {
    updateTurn(turnId, prev => ({ summaryExpanded: !prev.summaryExpanded }))
  }

  const expandTurn = (turnId: string) => {
    setTurns(prev => prev.map((t, i) => {
      if (t.id === turnId) return { ...t, collapsed: false }
      if (i === prev.length - 1) return t
      return { ...t, collapsed: true }
    }))
    requestAnimationFrame(() => {
      const el = document.getElementById(`turn-${turnId}`)
      const container = scrollRef.current
      if (!el || !container) return
      animatedScrollTo(el.offsetTop - 24)
    })
  }

  const collapseTurn = (turnId: string) => {
    setTurns(prev => prev.map(t => t.id === turnId ? { ...t, collapsed: true } : t))
  }

  const submit = async (override?: string) => {
    const text = (override ?? query).trim()
    if (!text || pending) return
    const myReq = ++reqIdRef.current
    const turnId = `t-${myReq}`
    const isRefine = turns.length > 0

    cancelStreamRef.current?.()
    cancelStreamRef.current = null

    // compare intent: if both tiles can be resolved from session memory
    // (named or positional), run an instant side-by-side turn without hitting the API.
    {
      const seen = new Map<string, Tile>()
      for (const t of turns.flatMap(t => t.tiles)) seen.set(t.id, t)
      for (const l of cart) seen.set(l.tile.id, l.tile)
      for (const w of wishlist) seen.set(w.id, w)
      const pool = Array.from(seen.values())
      const latestTurnTiles = latestTiles
      const resolved = resolveCompareTargets(text, latestTurnTiles, pool)
      if (resolved) {
        const [aTile, bTile] = resolved
        setPending(true)
        setQuery('')
        const commentary = ['Pulling specs for both', 'Lining up the differences', 'Formatting the comparison']
        setTurns(prev => [
          ...prev.map(t => ({ ...t, collapsed: true })),
          {
            id: turnId,
            user: text,
            intro: 'Here they are, side by side.',
            streamedIntro: '',
            tiles: [],
            followups: [`Add ${aTile.brand}`, `Add ${bTile.brand}`, 'Find more like these'],
            commentary,
            activeIdx: -2,
            elapsed: [],
            summaryExpanded: false,
            done: false,
            collapsed: false,
            error: null,
            kind: 'compare',
            compareTiles: [aTile, bTile],
          },
        ])
        scrollTurnToTop(turnId)
        try {
          for (let i = 0; i < commentary.length; i++) {
            if (reqIdRef.current !== myReq) return
            updateTurn(turnId, { activeIdx: i })
            await wait(700)
          }
          if (reqIdRef.current !== myReq) return
          updateTurn(turnId, { activeIdx: -1 })
          streamIntro(turnId, 'Here they are, side by side.')
        } finally {
          if (reqIdRef.current === myReq) setPending(false)
        }
        return
      }
    }

    setPending(true)
    setQuery('')

    const commentary = buildCommentary(text, isRefine)

    setTurns(prev => [
      ...prev.map(t => isRefine ? { ...t, collapsed: true } : t),
      {
        id: turnId,
        user: text,
        intro: '',
        streamedIntro: '',
        tiles: [],
        followups: [],
        commentary,
        activeIdx: -2,         // -2 = not started yet
        elapsed: [],
        summaryExpanded: false,
        done: false,
        collapsed: false,
        error: null,
      },
    ])
    scrollTurnToTop(turnId)

    try {
      let fetchDone = false
      const fetchPromise = fetchShop(text, latestTiles, history).then(r => {
        if (typeof window !== 'undefined') {
          for (const t of r.tiles) {
            if (t.image) {
              const img = new window.Image()
              img.decoding = 'async'
              img.src = t.image
            }
          }
        }
        fetchDone = true
        return r
      }).catch(err => {
        fetchDone = true
        throw err
      })
      const [res] = await Promise.all([
        fetchPromise,
        runCommentary(turnId, commentary, () => fetchDone, myReq),
      ])
      if (reqIdRef.current !== myReq) return
      updateTurn(turnId, { intro: res.intro, tiles: res.tiles, followups: res.followups })
      streamIntro(turnId, res.intro)
    } catch (err) {
      console.error('shop api error', err)
      if (reqIdRef.current === myReq) {
        const msg = err instanceof Error ? err.message : 'something went wrong'
        updateTurn(turnId, { error: msg, activeIdx: -1, done: true })
      }
    } finally {
      if (reqIdRef.current === myReq) setPending(false)
    }
  }

  const retryTurn = async (turnId: string) => {
    if (pending) return
    const turn = turns.find(t => t.id === turnId)
    if (!turn) return
    const myReq = ++reqIdRef.current
    const isRefine = turns.findIndex(t => t.id === turnId) > 0
    const commentary = buildCommentary(turn.user, isRefine)
    const priorTiles = (() => {
      const idx = turns.findIndex(t => t.id === turnId)
      for (let i = idx - 1; i >= 0; i--) {
        if (turns[i].tiles.length > 0) return turns[i].tiles
      }
      return null
    })()
    const priorHistory = turns.slice(0, turns.findIndex(t => t.id === turnId)).map(t => t.user)

    cancelStreamRef.current?.()
    cancelStreamRef.current = null
    setPending(true)

    updateTurn(turnId, {
      intro: '',
      streamedIntro: '',
      tiles: [],
      followups: [],
      commentary,
      activeIdx: -2,
      elapsed: [],
      summaryExpanded: false,
      done: false,
      collapsed: false,
      error: null,
    })

    try {
      let fetchDone = false
      const fetchPromise = fetchShop(turn.user, priorTiles, priorHistory).then(r => {
        if (typeof window !== 'undefined') {
          for (const t of r.tiles) {
            if (t.image) {
              const img = new window.Image()
              img.decoding = 'async'
              img.src = t.image
            }
          }
        }
        fetchDone = true
        return r
      }).catch(err => {
        fetchDone = true
        throw err
      })
      const [res] = await Promise.all([
        fetchPromise,
        runCommentary(turnId, commentary, () => fetchDone, myReq),
      ])
      if (reqIdRef.current !== myReq) return
      updateTurn(turnId, { intro: res.intro, tiles: res.tiles, followups: res.followups })
      streamIntro(turnId, res.intro)
    } catch (err) {
      console.error('shop api error', err)
      if (reqIdRef.current === myReq) {
        const msg = err instanceof Error ? err.message : 'something went wrong'
        updateTurn(turnId, { error: msg, activeIdx: -1, done: true })
      }
    } finally {
      if (reqIdRef.current === myReq) setPending(false)
    }
  }

  const stop = () => {
    if (!pending) return
    reqIdRef.current++
    cancelStreamRef.current?.()
    cancelStreamRef.current = null
    setPending(false)
    setTurns(prev => {
      if (prev.length === 0) return prev
      return prev.map((t, i) => i === prev.length - 1 && !t.done
        ? { ...t, activeIdx: -1, done: true }
        : t)
    })
  }

  const commitAdd = (tile: Tile) => {
    setCart(prev => {
      const found = prev.find(l => l.tile.id === tile.id)
      if (found) return prev.map(l => l.tile.id === tile.id ? { ...l, qty: l.qty + 1 } : l)
      return [...prev, { tile, qty: 1 }]
    })
    setAddedPulse(prev => ({ id: (prev?.id ?? 0) + 1, color: safeHex(tile.moodColor) }))
  }

  const addToCart = (tile: Tile, origin: DOMRect) => {
    setOpenTile(null)
    const cartEl = document.querySelector('[data-cart-target]') as HTMLElement | null
    if (!cartEl) {
      commitAdd(tile)
      return
    }
    const to = cartEl.getBoundingClientRect()
    const id = `f-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setFlights(prev => [...prev, {
      id,
      tile,
      from: { x: origin.left, y: origin.top, w: origin.width, h: origin.height },
      to: { x: to.left, y: to.top, w: to.width, h: to.height },
    }])
  }

  const commitWishlistAdd = (tile: Tile) => {
    setWishlist(prev => {
      if (prev.some(w => w.id === tile.id)) return prev
      return [...prev, tile]
    })
    setWishlistPulse(prev => ({ id: (prev?.id ?? 0) + 1, color: safeHex(tile.moodColor) }))
  }

  const toggleWishlist = (tile: Tile, origin: DOMRect) => {
    const already = wishlist.some(w => w.id === tile.id)
    if (already) {
      setWishlist(prev => prev.filter(w => w.id !== tile.id))
      return
    }
    const targetEl = document.querySelector('[data-wishlist-target]') as HTMLElement | null
    if (!targetEl) {
      commitWishlistAdd(tile)
      return
    }
    const to = targetEl.getBoundingClientRect()
    const id = `f-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setFlights(prev => [...prev, {
      id,
      tile,
      kind: 'wishlist',
      from: { x: origin.left, y: origin.top, w: origin.width, h: origin.height },
      to: { x: to.left, y: to.top, w: to.width, h: to.height },
    }])
  }

  const handleFlightArrive = (flight: Flight) => {
    if (flight.kind === 'wishlist') {
      commitWishlistAdd(flight.tile)
    } else {
      commitAdd(flight.tile)
    }
  }

  const handleFlightDone = (id: string) => {
    setFlights(prev => prev.filter(f => f.id !== id))
  }

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(l => l.tile.id !== id))
  }

  const checkout = () => {
    if (cart.length > 0) {
      const order = buildOrderFromCart(cart)
      setOrders(prev => [order, ...prev].slice(0, 30))
    }
    setCartOpen(false)
    setConfirmed(true)
  }

  const keepShopping = () => {
    setCart([])
    setConfirmed(false)
  }

  const goHome = () => {
    cancelStreamRef.current?.()
    cancelStreamRef.current = null
    setQuery('')
    setPending(false)
    setActiveTab('new')
    setTurns([])
    requestAnimationFrame(() => {
      const container = scrollRef.current
      if (container) container.scrollTop = 0
    })
  }

  const newSearch = goHome

  if (confirmed) {
    return (
      <main className="min-h-screen bg-white text-[#242529] font-sans antialiased">
        <CheckoutConfirmed lines={cart} onDone={keepShopping} />
      </main>
    )
  }

  const isEmpty = turns.length === 0

  // When a modal, cart, or order sheet opens, the page behind scales down to
  // 0.98 and fades to 0 opacity. This gives the impression of the modal
  // emerging from the page rather than sitting on top of it.
  const suppressed = openTile !== null || cartOpen || openOrder !== null
  const cartDimmed = openTile !== null || openOrder !== null

  const latestTurn = turns.length > 0 ? turns[turns.length - 1] : null
  const showInlineFollowups =
    !!latestTurn &&
    latestTurn.done &&
    latestTurn.followups.length > 0 &&
    query.trim().length === 0 &&
    activeTab === 'new'

  const composerPills = showInlineFollowups
    ? (latestTurn!.kind !== 'compare' && latestTurn!.tiles.length >= 2
        ? ['Compare first 2', ...latestTurn!.followups]
        : latestTurn!.followups)
    : null

  return (
    <main className="fixed inset-0 bg-white text-[#242529] font-sans antialiased flex flex-col">
      <IdleCutouts
        active={isEmpty && !suppressed && !pending && activeTab === 'new'}
        onActiveChange={setIdleDim}
      />
      <TopBar
        onHome={goHome}
        onNewSearch={newSearch}
        onOpenCart={() => setCartOpen(o => !o)}
        cartCount={cartCount}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        cartOpen={cartOpen}
        dimmed={suppressed}
        cartDimmed={cartDimmed}
        addedPulse={addedPulse}
        wishlistPulse={wishlistPulse}
      />
      <motion.div
        initial={false}
        animate={{
          opacity: suppressed ? 0 : (idleDim ? 0 : 1),
          scale: suppressed ? 0.98 : 1,
          filter: idleDim ? 'blur(8px)' : 'blur(0px)',
        }}
        transition={
          suppressed
            ? { type: 'spring', duration: 0.4, bounce: 0 }
            : idleDim
              ? { duration: 0.2, ease: 'easeOut' }
              : { duration: 0.12, ease: 'easeOut' }
        }
        style={{ transformOrigin: 'center center' }}
        className="flex-1 flex flex-col min-h-0"
      >
        <div className="relative flex-1 min-h-0">
          <div
            ref={scrollRef}
            className="absolute inset-0 overflow-y-auto"
          >
            <div className="mx-auto w-full max-w-[576px] px-5 pt-8 pb-6">
              {!hydrated ? (
                <div aria-hidden />
              ) : activeTab === 'account' ? (
                <AccountView
                  wishlist={wishlist}
                  onRemove={(id) => setWishlist(prev => prev.filter(w => w.id !== id))}
                  onMoveToCart={(tile) => {
                    setWishlist(prev => prev.filter(w => w.id !== tile.id))
                    commitAdd(tile)
                  }}
                  onOpen={(tile) => setOpenTile({ turnId: 'wishlist', tile })}
                />
              ) : activeTab === 'history' ? (
                <HistoryList
                  turns={turns}
                  orders={orders}
                  onOpenOrder={setOpenOrder}
                  onPick={(turnId) => {
                    setActiveTab('new')
                    requestAnimationFrame(() => {
                      document.getElementById(`turn-${turnId}`)?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start',
                      })
                    })
                  }}
                />
              ) : isEmpty ? (
                <LandingState onPick={submit} pending={pending} />
              ) : (
                <div className="flex flex-col gap-10">
                  {turns.map((t, i) => {
                    const isLast = i === turns.length - 1
                    return (
                    <motion.div
                      key={t.id}
                      id={`turn-${t.id}`}
                      layout
                      transition={{ layout: { type: 'spring', duration: 0.6, bounce: 0 } }}
                      style={{
                        overflowAnchor: isLast ? 'auto' : 'none',
                        scrollMarginTop: 24,
                        minHeight: isLast && turns.length > 1 ? 'calc(100dvh - 220px)' : undefined,
                      }}
                    >
                      <TurnBlock
                        turn={t}
                        isLast={i === turns.length - 1}
                        scrollRef={scrollRef}
                        onOpen={(tile) => setOpenTile({ turnId: t.id, tile })}
                        onToggleSummary={toggleSummary}
                        onExpand={() => expandTurn(t.id)}
                        onAutoCollapse={() => collapseTurn(t.id)}
                        onRetry={() => retryTurn(t.id)}
                        onAdd={addToCart}
                      />
                    </motion.div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-10"
            style={{
              background: 'linear-gradient(to bottom, #ffffff 0%, rgba(255,255,255,0.85) 40%, rgba(255,255,255,0.4) 75%, rgba(255,255,255,0) 100%)',
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-12"
            style={{
              background: 'linear-gradient(to top, #ffffff 0%, rgba(255,255,255,0.9) 40%, rgba(255,255,255,0.4) 75%, rgba(255,255,255,0) 100%)',
            }}
          />
        </div>

        {activeTab === 'new' && (
          <Composer
            query={query}
            setQuery={setQuery}
            onSubmit={submit}
            onStop={stop}
            pending={pending}
            isEmpty={isEmpty}
            followups={composerPills}
            onPickFollowup={submit}
            recents={history}
          />
        )}
      </motion.div>

      <ProductModal
        tile={openTile?.tile ?? null}
        turnId={openTile?.turnId ?? null}
        query={openTile ? (turns.find(t => t.id === openTile.turnId)?.user ?? '') : ''}
        onClose={() => setOpenTile(null)}
        onAdd={addToCart}
        onWishlist={toggleWishlist}
        saved={openTile ? wishlist.some(w => w.id === openTile.tile.id) : false}
      />

      <CartSheet
        open={cartOpen}
        lines={cart}
        onClose={() => setCartOpen(false)}
        onRemove={removeFromCart}
        onCheckout={checkout}
      />

      <OrderSheet
        order={openOrder}
        onClose={() => setOpenOrder(null)}
      />

      {flights.map(f => (
        <FlyToCart
          key={f.id}
          flight={f}
          onArrive={handleFlightArrive}
          onDone={handleFlightDone}
        />
      ))}

    </main>
  )
}

function TurnBlock({
  turn, isLast, scrollRef, onOpen, onToggleSummary, onExpand, onAutoCollapse, onRetry, onAdd,
}: {
  turn: Turn
  isLast: boolean
  scrollRef: React.RefObject<HTMLDivElement | null>
  onOpen: (t: Tile) => void
  onToggleSummary: (turnId: string) => void
  onExpand: () => void
  onAutoCollapse: () => void
  onRetry: () => void
  onAdd: (tile: Tile, origin: DOMRect) => void
}) {
  const commentaryDone = turn.activeIdx === -1
  const showIntro = commentaryDone
  const isCompare = turn.kind === 'compare' && turn.compareTiles != null
  const showCards = turn.done && (isCompare || turn.tiles.length > 0)
  const collapsed = turn.collapsed && showCards
  const cardsRef = useRef<HTMLDivElement | null>(null)
  const autoCollapseRef = useRef(onAutoCollapse)
  autoCollapseRef.current = onAutoCollapse

  useEffect(() => {
    if (isLast) return
    if (turn.collapsed) return
    if (!showCards) return
    const el = cardsRef.current
    const root = scrollRef.current
    if (!el || !root) return
    let everVisible = false
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          everVisible = true
          return
        }
        if (everVisible) autoCollapseRef.current()
      },
      { root, threshold: 0.01 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [isLast, turn.collapsed, showCards, scrollRef])
  const storeCountMatch = turn.commentary.find(c => /(\d+)\s+Shopify/.test(c))?.match(/(\d+)/)
  const storeCount = storeCountMatch ? parseInt(storeCountMatch[1], 10) : null
  const summaryLabel = isCompare
    ? 'Lined up side by side'
    : storeCount ? `Searched ${storeCount} stores` : 'Reviewed the set'

  return (
    <motion.div layout transition={{ layout: { type: 'spring', duration: 0.6, bounce: 0 } }} className="flex flex-col gap-4">
      <motion.div
        layout="position"
        initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.28, ease: EASE_OUT }}
        className="self-end max-w-[80%] rounded-[20px] rounded-br-[6px] bg-[#F0F0F0] px-3.5 py-2 text-[13px] leading-[18px] font-medium tracking-[0] text-[#242529]"
      >
        {turn.user}
      </motion.div>

      <motion.div layout="position" className="flex flex-col gap-4">
        <Commentary
          steps={turn.commentary}
          activeIdx={turn.activeIdx}
          expanded={turn.summaryExpanded}
          summaryLabel={summaryLabel}
          summaryCount={isCompare ? null : storeCount}
          onToggle={() => onToggleSummary(turn.id)}
        />

        <AnimatePresence>
          {showIntro && (
            <motion.div
              key="intro"
              layout="position"
              initial={{ opacity: 0, filter: 'blur(4px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              transition={{
                opacity: { duration: 0.3, ease: [0.2, 1, 0.3, 1] },
                filter: { duration: 0.3, ease: [0.2, 1, 0.3, 1] },
                layout: { duration: 0.42, ease: [0.2, 1, 0.3, 1] },
              }}
              className="-mt-2 text-[14px] leading-[20px] font-medium tracking-[0] text-[#242529] min-h-[1.5em]"
            >
              {turn.streamedIntro}
              {isLast && !turn.done && (
                <motion.span
                  aria-hidden
                  animate={{ opacity: [1, 0] }}
                  transition={{ duration: 0.5, repeat: Infinity, repeatType: 'reverse', ease: 'linear' }}
                  className="ml-[1px] text-[#242529]"
                >|</motion.span>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {turn.error && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 4, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, filter: 'blur(4px)' }}
              transition={{ duration: 0.28, ease: EASE_OUT }}
              className="flex items-center gap-2.5 text-[13px] leading-[18px] font-medium tracking-[0] text-[#858585]"
            >
              <span aria-hidden className="h-[6px] w-[6px] rounded-full shrink-0" style={{ backgroundColor: '#c25a4a' }} />
              <span className="flex-1 min-w-0 truncate">Couldn't reach the stores. {turn.error}</span>
              <button
                onClick={onRetry}
                className="shrink-0 rounded-full border border-[#ECECEC] bg-white px-2.5 py-1 text-[12px] leading-[16px] font-medium tracking-[0] text-[#242529] hover:border-[#242529] cursor-pointer"
                style={{ transition: 'border-color 160ms ease' }}
              >
                Retry
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {showCards && (
          <motion.div
            ref={cardsRef}
            layout
            transition={{ layout: { type: 'spring', duration: 0.6, bounce: 0 } }}
            className="relative"
          >
            {collapsed ? (
              <TileStack tiles={isCompare ? turn.compareTiles! : turn.tiles} turnId={turn.id} onExpand={onExpand} />
            ) : isCompare ? (
              <CompareView
                tiles={turn.compareTiles!}
                turnId={turn.id}
                onOpen={onOpen}
                onAdd={onAdd}
              />
            ) : (
              <motion.div layout className="grid grid-cols-3 gap-2 md:gap-4">
                {turn.tiles.map((tile, i) => (
                  <TileCard key={tile.id} tile={tile} turnId={turn.id} index={i} onOpen={onOpen} />
                ))}
              </motion.div>
            )}
          </motion.div>
        )}

      </motion.div>
    </motion.div>
  )
}

function capitalizeCompare(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

function parsePrice(p: string): number {
  const n = parseFloat(p.replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? n : 0
}

function CompareView({
  tiles, turnId, onOpen, onAdd,
}: {
  tiles: [Tile, Tile]
  turnId: string
  onOpen: (t: Tile) => void
  onAdd: (t: Tile, origin: DOMRect) => void
}) {
  const [a, b] = tiles
  const pa = parsePrice(a.price)
  const pb = parsePrice(b.price)
  const priceWinner = pa === pb ? null : pa < pb ? 'a' : 'b'
  const ratingWinner = a.rating === b.rating ? null : a.rating > b.rating ? 'a' : 'b'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.32, ease: [0.2, 1, 0.3, 1] }}
      className="grid grid-cols-2 gap-6"
    >
      <CompareColumn
        tile={a}
        turnId={turnId}
        onOpen={onOpen}
        onAdd={onAdd}
        priceEmphasized={priceWinner === 'a'}
        ratingEmphasized={ratingWinner === 'a'}
      />
      <CompareColumn
        tile={b}
        turnId={turnId}
        onOpen={onOpen}
        onAdd={onAdd}
        priceEmphasized={priceWinner === 'b'}
        ratingEmphasized={ratingWinner === 'b'}
      />
    </motion.div>
  )
}

function CompareColumn({
  tile, turnId, onOpen, onAdd, priceEmphasized, ratingEmphasized,
}: {
  tile: Tile
  turnId: string
  onOpen: (t: Tile) => void
  onAdd: (t: Tile, origin: DOMRect) => void
  priceEmphasized: boolean
  ratingEmphasized: boolean
}) {
  const imgRef = useRef<HTMLDivElement | null>(null)
  return (
    <div className="flex flex-col gap-2.5 min-w-0">
      <motion.div
        ref={imgRef}
        layoutId={`${turnId}-img-${tile.id}`}
        transition={{ layout: { type: 'spring', duration: 0.6, bounce: 0 } }}
        role="button"
        tabIndex={0}
        onClick={() => onOpen(tile)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(tile) } }}
        className="group relative block w-full overflow-hidden aspect-square text-left shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1),0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.12)] md:hover:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1),0_1px_3px_rgba(0,0,0,0.06),0_16px_36px_-14px_rgba(0,0,0,0.2)] cursor-pointer"
        style={{
          borderRadius: 12,
          transition: 'box-shadow 240ms cubic-bezier(0.23, 1, 0.32, 1)',
        }}
      >
        <ProductImage src={tile.image} color={tile.moodColor} alt={`${tile.headline} ${tile.titleTail}`} />
      </motion.div>

      <div className="flex flex-col gap-0.5 px-0.5 min-w-0">
        <div className="text-[12px] leading-[16px] font-medium tracking-[0] text-[#858585] truncate">
          {tile.brand}
        </div>
        <div className="text-[13px] leading-[18px] font-medium tracking-[0] text-[#242529] truncate">
          {capitalizeCompare(tile.headline)} {tile.titleTail}
        </div>
      </div>

      <div className="flex flex-col gap-1 px-0.5 mt-1">
        <div
          className="text-[13px] leading-[18px] font-medium tracking-[0]"
          style={{ color: priceEmphasized ? '#242529' : '#858585' }}
        >
          {tile.price}
        </div>
        <div
          className="text-[12px] leading-[16px] font-medium tracking-[0]"
          style={{ color: ratingEmphasized ? '#242529' : '#858585' }}
        >
          {tile.rating.toFixed(1)} · {tile.reviewCount.toLocaleString()} reviews
        </div>
      </div>

      {tile.specs.length > 0 && (
        <ul className="flex flex-col gap-1 px-0.5 mt-1">
          {tile.specs.map((s, i) => (
            <li
              key={i}
              className="text-[13px] leading-[18px] font-medium tracking-[0] text-[#525252] truncate"
            >
              {s}
            </li>
          ))}
        </ul>
      )}

      <button
        onClick={() => {
          const rect = imgRef.current?.getBoundingClientRect()
          if (rect) onAdd(tile, rect)
        }}
        className="mt-2 self-start rounded-full bg-[#242529] text-white text-[13px] leading-[18px] font-medium tracking-[0] px-4 py-2 hover:bg-[#525252] cursor-pointer"
        style={{ transition: 'background-color 160ms ease' }}
      >
        Add to cart
      </button>
    </div>
  )
}

// Upon submitting a new message, the previous turn's tile grid collapses into
// this small stacked pile. Each image keeps its layoutId so it animates from
// the grid slot to its position in the stack instead of crossfading.
function TileStack({ tiles, turnId, onExpand }: { tiles: Tile[]; turnId: string; onExpand: () => void }) {
  const top = tiles.slice(0, 3)
  const count = top.length
  return (
    <button
      onClick={onExpand}
      aria-label={`expand ${tiles.length} picks`}
      className="group relative block cursor-pointer"
      style={{ width: 88 + (count - 1) * 28, height: 112 }}
    >
      {top.map((tile, i) => {
        const mid = (count - 1) / 2
        const hoverX = (i - mid) * 10
        const hoverY = Math.abs(i - mid) * -3
        return (
          <motion.div
            key={tile.id}
            layoutId={`${turnId}-img-${tile.id}`}
            transition={{ layout: { type: 'spring', duration: 0.6, bounce: 0 } }}
            whileHover={{ x: hoverX, y: hoverY }}
            className="absolute overflow-hidden"
            style={{
              width: 88,
              height: 88,
              top: i * 4,
              left: i * 14,
              borderRadius: 10,
              zIndex: i,
              boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.06), 0 12px 28px -14px rgba(0,0,0,0.18)',
            }}
          >
            <ProductImage src={tile.image} color={tile.moodColor} alt={`${tile.headline} ${tile.titleTail}`} />
          </motion.div>
        )
      })}
    </button>
  )
}

const IDLE_CUTOUTS = [
  'adidas_adizeroevosl Background Removed.png',
  'aeron Background Removed.png',
  'Bang_Lớp small square in orange acrylic CE Background Removed.png',
  'Elago_W9 Stand Background Removed.png',
  'niggli_gridsystems Background Removed.png',
  'nuphy_air96v2 Background Removed.png',
  'Playdate_Playdate Console Background Removed.png',
  'Rimowa_Classic Cabin Background Removed.png',
].map(f => `/shop/landing/cutouts/${encodeURI(f)}`)

type IdleCutout = {
  id: string
  src: string
  size: number
  // Intro position (where the cutout first appears)
  x0: number
  y0: number
  rot0: number
  // Exit position (off-screen)
  x1: number
  y1: number
  rot1: number
  // Seconds to drift from (x0,y0) to (x1,y1)
  dur: number
  // 'popcorn' = pop in place at a random on-screen spot, then drift off.
  // 'drift'   = slide in from off-screen, cross the view, exit the other side.
  entry: 'popcorn' | 'drift'
}

const CUTOUT_SPEED_PX_PER_SEC = 28

// Minimum separation between popcorn-spawned cutouts. Rejection-sampled during
// batch placement so two cutouts don't pop on top of each other.
const CUTOUT_MIN_SEPARATION_PX = 60

function randomOffscreenExit(vw: number, vh: number, size: number, fromX: number, fromY: number) {
  // Shoot toward the nearest edge from the spawn point so the cutout exits
  // the view instead of just wandering somewhere also-on-screen.
  const angle = Math.random() * Math.PI * 2
  const travel = Math.max(vw, vh) + size + 80
  return {
    x: fromX + Math.cos(angle) * travel,
    y: fromY + Math.sin(angle) * travel,
  }
}

function makeCutout(
  id: string,
  src: string,
  vw: number,
  vh: number,
  entry: 'popcorn' | 'drift',
): IdleCutout {
  const size = 180 + Math.random() * 160
  let x0 = 0, y0 = 0, x1 = 0, y1 = 0
  if (entry === 'popcorn') {
    // Spawn somewhere already in view. Inset by size so the whole cutout
    // fits on screen when it pops.
    const xMin = 40, xMax = Math.max(xMin + 1, vw - size - 40)
    const yMin = 40, yMax = Math.max(yMin + 1, vh - size - 40)
    x0 = xMin + Math.random() * (xMax - xMin)
    y0 = yMin + Math.random() * (yMax - yMin)
    const exit = randomOffscreenExit(vw, vh, size, x0, y0)
    x1 = exit.x; y1 = exit.y
  } else {
    // Slide in from off-screen. Pick an edge, randomize the perpendicular axis.
    const side = Math.floor(Math.random() * 4) // 0=L 1=R 2=T 3=B
    if (side === 0) { x0 = -size - 40; y0 = Math.random() * (vh - size); x1 = vw + 40; y1 = Math.random() * (vh - size) }
    else if (side === 1) { x0 = vw + 40; y0 = Math.random() * (vh - size); x1 = -size - 40; y1 = Math.random() * (vh - size) }
    else if (side === 2) { x0 = Math.random() * (vw - size); y0 = -size - 40; x1 = Math.random() * (vw - size); y1 = vh + 40 }
    else                 { x0 = Math.random() * (vw - size); y0 = vh + 40;   x1 = Math.random() * (vw - size); y1 = -size - 40 }
  }
  const dist = Math.hypot(x1 - x0, y1 - y0)
  const dur = Math.max(4, dist / CUTOUT_SPEED_PX_PER_SEC)
  const rot0 = -16 + Math.random() * 32
  const rot1 = rot0 + (Math.random() < 0.5 ? -1 : 1) * (20 + Math.random() * 30)
  return { id, src, size, x0, y0, x1, y1, rot0, rot1, dur, entry }
}

let cutoutCounter = 0
function nextCutout(vw: number, vh: number): IdleCutout {
  // Replacements never popcorn — they drift in from an edge so the scene
  // refills smoothly.
  const src = IDLE_CUTOUTS[Math.floor(Math.random() * IDLE_CUTOUTS.length)]
  return makeCutout(`c-${++cutoutCounter}`, src, vw, vh, 'drift')
}

// Rejection-sample popcorn spawn positions so no two cutouts pop on top of
// each other. Each candidate is generated with makeCutout and tested against
// already-placed cutouts; the first one that clears CUTOUT_MIN_SEPARATION_PX
// wins, otherwise we keep the farthest-apart attempt after 30 tries.
function makePopcornBatch(srcs: string[], vw: number, vh: number): IdleCutout[] {
  const placed: IdleCutout[] = []
  for (const src of srcs) {
    let best = makeCutout('_tmp', src, vw, vh, 'popcorn')
    let bestGap = -Infinity
    for (let attempt = 0; attempt < 30; attempt++) {
      const candidate = attempt === 0 ? best : makeCutout('_tmp', src, vw, vh, 'popcorn')
      // Minimum gap between this candidate's center and any already-placed center,
      // minus the sum of their half-sizes so we compare empty-space distance.
      let minGap = Infinity
      for (const p of placed) {
        const cx = candidate.x0 + candidate.size / 2
        const cy = candidate.y0 + candidate.size / 2
        const px = p.x0 + p.size / 2
        const py = p.y0 + p.size / 2
        const gap = Math.hypot(cx - px, cy - py) - (candidate.size + p.size) / 2
        if (gap < minGap) minGap = gap
      }
      if (minGap > bestGap) { best = candidate; bestGap = minGap }
      if (minGap >= CUTOUT_MIN_SEPARATION_PX) break
    }
    placed.push({ ...best, id: `c-${++cutoutCounter}` })
  }
  return placed
}

function CutoutTraveler({ item, leaving }: { item: IdleCutout; leaving: boolean }) {
  // Phases:
  //   0 pre-mount — invisible, at spawn point
  //   1 intro     — popcorn pops scale 0.5→1, drift slides in with opacity
  //   2 exit      — linear transform toward the off-screen end point
  const [phase, setPhase] = useState<0 | 1 | 2>(0)
  const phase2StartRef = useRef<number | null>(null)
  useEffect(() => {
    const introMs = item.entry === 'popcorn' ? 420 : 600
    const t1 = window.setTimeout(() => setPhase(1), 30)
    const t2 = window.setTimeout(() => {
      phase2StartRef.current = performance.now()
      setPhase(2)
    }, introMs)
    return () => { window.clearTimeout(t1); window.clearTimeout(t2) }
  }, [item.entry])

  // Snapshot the current drift position when leaving flips true, so the
  // reverse-popcorn shrink happens in place (no slide toward the exit point).
  const frozenRef = useRef<{ x: number; y: number; rot: number } | null>(null)
  if (leaving && !frozenRef.current) {
    if (phase === 2 && phase2StartRef.current != null) {
      const elapsed = Math.max(0, (performance.now() - phase2StartRef.current) / 1000)
      const t = Math.min(1, elapsed / Math.max(0.001, item.dur))
      frozenRef.current = {
        x: item.x0 + (item.x1 - item.x0) * t,
        y: item.y0 + (item.y1 - item.y0) * t,
        rot: item.rot0 + (item.rot1 - item.rot0) * t,
      }
    } else {
      frozenRef.current = { x: item.x0, y: item.y0, rot: item.rot0 }
    }
  }
  if (!leaving && frozenRef.current) frozenRef.current = null

  const at = leaving && frozenRef.current
    ? frozenRef.current
    : phase === 2
      ? { x: item.x1, y: item.y1, rot: item.rot1 }
      : { x: item.x0, y: item.y0, rot: item.rot0 }

  const baseScale = item.entry === 'popcorn' && phase === 0 ? 0.5 : 1
  const scale = leaving ? 0.5 : baseScale
  const opacity = leaving ? 0 : (phase === 0 ? 0 : 1)

  let transition: string
  if (leaving) {
    // Un-popcorn: scale + opacity only. No transform movement — we already
    // pinned position to the current drift location above.
    transition = 'opacity 200ms ease-out, transform 240ms cubic-bezier(0.4, 0, 0.6, 1)'
  } else if (phase === 1) {
    transition = item.entry === 'popcorn'
      ? 'opacity 180ms ease-out, transform 360ms cubic-bezier(0.34, 1.56, 0.64, 1)'
      : 'opacity 320ms ease-out, transform 0ms'
  } else if (phase === 2) {
    transition = `transform ${item.dur}s linear, opacity 0.4s ease-out`
  } else {
    transition = 'none'
  }

  return (
    <img
      src={item.src}
      alt=""
      draggable={false}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        // Fix the bounding box to size × size so portrait cutouts (e.g.
        // luggage, stands) can't overflow past the y0 range and land off-
        // screen. object-fit: contain preserves the image aspect ratio
        // inside that box without stretching.
        width: item.size,
        height: item.size,
        objectFit: 'contain',
        userSelect: 'none',
        opacity,
        transform: `translate3d(${at.x}px, ${at.y}px, 0) rotate(${at.rot}deg) scale(${scale})`,
        transformOrigin: 'center',
        transition,
        willChange: 'transform, opacity',
      }}
    />
  )
}

function IdleCutouts({ active, onActiveChange }: { active: boolean; onActiveChange?: (on: boolean) => void }) {
  const [items, setItems] = useState<IdleCutout[]>([])
  const [leaving, setLeaving] = useState(false)
  const activeRef = useRef(active)
  activeRef.current = active
  const onActiveChangeRef = useRef(onActiveChange)
  onActiveChangeRef.current = onActiveChange

  useEffect(() => {
    if (!active) { setItems([]); setLeaving(false); onActiveChangeRef.current?.(false); return }

    let timer: number | null = null
    let unmountTimer: number | null = null

    const schedule = (delayMs: number) => {
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        const vw = window.innerWidth
        const vh = window.innerHeight
        // Show every cutout at once — each one pops into its own random spot,
        // rejection-sampled so they don't overlap.
        const srcs = [...IDLE_CUTOUTS].sort(() => Math.random() - 0.5)
        setItems(makePopcornBatch(srcs, vw, vh))
        setLeaving(false)
        onActiveChangeRef.current?.(true)
      }, delayMs)
    }

    const clear = () => {
      // Reverse popcorn: scale 1 → 0.5, opacity 1 → 0, then unmount.
      setItems(prev => {
        if (prev.length === 0) return prev
        setLeaving(true)
        if (unmountTimer) window.clearTimeout(unmountTimer)
        unmountTimer = window.setTimeout(() => {
          setItems([])
          setLeaving(false)
        }, 280)
        return prev
      })
      onActiveChangeRef.current?.(false)
      // After a dismiss, wait 5s of real idle before the cutouts come back.
      schedule(5000)
    }

    schedule(5000)
    window.addEventListener('mousemove', clear, { passive: true })
    window.addEventListener('mousedown', clear, { passive: true })
    window.addEventListener('keydown', clear)
    window.addEventListener('wheel', clear, { passive: true })
    window.addEventListener('touchstart', clear, { passive: true })
    return () => {
      if (timer) window.clearTimeout(timer)
      if (unmountTimer) window.clearTimeout(unmountTimer)
      window.removeEventListener('mousemove', clear)
      window.removeEventListener('mousedown', clear)
      window.removeEventListener('keydown', clear)
      window.removeEventListener('wheel', clear)
      window.removeEventListener('touchstart', clear)
    }
  }, [active])

  // Each cutout schedules its own "drift complete, replace me" timer keyed by
  // item id. Tracking by id prevents the timer-reset bug where a single
  // replacement re-runs this effect and extends every other cutout's schedule.
  const timersRef = useRef<Map<string, number>>(new Map())
  useEffect(() => {
    const currentIds = new Set(items.map(i => i.id))
    // Cancel timers for items that are gone.
    for (const [id, t] of timersRef.current) {
      if (!currentIds.has(id)) {
        window.clearTimeout(t)
        timersRef.current.delete(id)
      }
    }
    // Schedule replacement for any newly-added items. Untouched items keep
    // their in-flight timer.
    for (const it of items) {
      if (timersRef.current.has(it.id)) continue
      const t = window.setTimeout(() => {
        timersRef.current.delete(it.id)
        if (!activeRef.current) return
        setItems(prev => prev.map(p =>
          p.id === it.id ? nextCutout(window.innerWidth, window.innerHeight) : p
        ))
      }, it.dur * 1000 + 40)
      timersRef.current.set(it.id, t)
    }
    return () => { /* kept alive across re-renders; cleared on unmount below */ }
  }, [items])

  useEffect(() => () => {
    for (const t of timersRef.current.values()) window.clearTimeout(t)
    timersRef.current.clear()
  }, [])

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" aria-hidden>
      <AnimatePresence>
        {items.length > 0 && (
          <motion.div
            key="dim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="absolute inset-0 bg-white/95 backdrop-blur-[6px]"
          />
        )}
        {items.map(it => (
          <CutoutTraveler key={it.id} item={it} leaving={leaving} />
        ))}
      </AnimatePresence>
    </div>
  )
}

type LandingPrompt = { text: string; thumbs: string[]; image?: string }

const LANDING_PROMPTS: LandingPrompt[] = [
  { text: 'apple laptops and accessories', thumbs: ['#3b8ae0', '#5468f0', '#1a1d2e'], image: '/shop/landing/apple_macbookneo.webp' },
  { text: 'mechanical keyboards', thumbs: ['#e8e1d4', '#c7beab', '#3a3428'], image: '/shop/landing/nuphy_air96v2.webp' },
  { text: 'handheld gaming consoles', thumbs: ['#f5c842', '#1a1a1a', '#e0c838'], image: '/shop/landing/Playdate_Playdate Console.webp' },
  { text: 'programmable macro pads', thumbs: ['#2a2a2a', '#4a4a4a', '#1a1a1a'], image: '/shop/landing/Work Louder_knob1.webp' },
  { text: 'desk stands for phones', thumbs: ['#d8d4cc', '#a8a49b', '#2c2a26'], image: '/shop/landing/Elago_W9 Stand.webp' },
  { text: 'minimalist coffee table books', thumbs: ['#e34a91', '#38b5d8', '#f5a524'], image: '/shop/landing/phaidon_theartbook.webp' },
  { text: 'aluminum carry-on luggage', thumbs: ['#c8c8c8', '#a8a8a8', '#2a2a2a'], image: '/shop/landing/Rimowa_Classic Cabin.webp' },
  { text: 'gradient wall posters', thumbs: ['#f05a2a', '#3aa6d8', '#e85a8a'], image: '/shop/landing/Posterlad_Crystal.webp' },
]

function hexWithAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function LandingState({
  onPick, pending,
}: {
  onPick: (q: string) => void
  pending: boolean
}) {
  const [vw, setVw] = useState(1024)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const [isCoarse, setIsCoarse] = useState(false)
  const HOVER_LIFT = 24
  useEffect(() => {
    const update = () => setVw(window.innerWidth)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(hover: none), (pointer: coarse)')
    const update = () => setIsCoarse(mq.matches || window.innerWidth < 768)
    update()
    mq.addEventListener('change', update)
    window.addEventListener('resize', update)
    return () => {
      mq.removeEventListener('change', update)
      window.removeEventListener('resize', update)
    }
  }, [])
  useEffect(() => {
    if (!isCoarse || hoverIdx === null) return
    const clear = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null
      if (target && target.closest('[data-landing-card]')) return
      setHoverIdx(null)
    }
    window.addEventListener('pointerdown', clear)
    return () => window.removeEventListener('pointerdown', clear)
  }, [isCoarse, hoverIdx])
  const visibleCount = vw < 520 ? 3 : vw < 720 ? 4 : vw < 960 ? 6 : 8
  const prompts = LANDING_PROMPTS.slice(0, visibleCount)
  const count = prompts.length
  const spread = vw < 520 ? vw * 0.4 : Math.min(vw * 0.75, 720)
  return (
    <div className="flex flex-col items-center justify-center min-h-[68vh] gap-8">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.2, 1, 0.3, 1], delay: 0.06 }}
        className="flex flex-col items-center"
      >
        <h1 className="text-[24px] leading-[30px] tracking-[-0.012em] font-medium text-[#242529] text-center" style={{ textWrap: 'balance' }}>
          What are you after?
        </h1>
      </motion.div>

      <div
        className="relative w-full max-w-[760px]"
        style={{ height: 260 }}
      >
        {prompts.map((p, i) => {
          const cardW = vw < 520 ? 128 : 164
          const cardH = vw < 520 ? 180 : 230
          const t = count === 1 ? 0.5 : i / (count - 1)
          const xOffset = (t - 0.5) * spread
          const curveY = Math.pow(t - 0.5, 2) * 22
          const seeded = Math.sin(i * 127.1 + 311.7) * 43758.5453
          const rotate = ((seeded - Math.floor(seeded)) * 16) - 8
          const shadowColor = p.thumbs[0]
          const baseZ = i <= Math.floor(count / 2) ? i : count - 1 - i
          const z = hoverIdx === i ? 40 : baseZ

          return (
            <motion.button
              key={p.text}
              data-landing-card
              onClick={() => {
                if (isCoarse && hoverIdx !== i) {
                  setHoverIdx(i)
                  return
                }
                onPick(p.text)
              }}
              onHoverStart={() => { if (!isCoarse) setHoverIdx(i) }}
              onHoverEnd={() => { if (!isCoarse) setHoverIdx(h => (h === i ? null : h)) }}
              disabled={pending}
              initial={false}
              animate={
                isCoarse && hoverIdx === i
                  ? { x: xOffset, y: curveY - HOVER_LIFT, rotate: 0 }
                  : { x: xOffset, y: curveY, rotate }
              }
              whileHover={!isCoarse ? { y: curveY - HOVER_LIFT, rotate: 0 } : undefined}
              transition={{ type: 'spring', stiffness: 1400, damping: 38, mass: 0.2 }}
              className="absolute left-1/2 overflow-hidden border border-[#ECECEC] bg-white disabled:opacity-50 cursor-pointer disabled:cursor-default"
              style={{
                width: cardW,
                height: cardH,
                top: `calc(50% - ${cardH * 0.62}px)`,
                marginLeft: -cardW / 2,
                borderRadius: 16,
                zIndex: z,
                boxShadow: `0 1px 2px rgba(0,0,0,0.04), 0 14px 28px -14px ${hexWithAlpha(shadowColor, 0.5)}`,
              }}
            >
              {p.image ? (
                <>
                  <div className="absolute inset-0" style={{ background: '#FFFFFF' }} />
                  <img
                    src={p.image}
                    alt=""
                    draggable={false}
                    width={cardW}
                    height={cardH}
                    decoding="async"
                    className="absolute inset-0 h-full w-full object-contain select-none pointer-events-none"
                    style={{ padding: 0 }}
                  />
                </>
              ) : (
                <>
                  <div
                    className="absolute inset-0"
                    style={{
                      background: `linear-gradient(160deg, ${p.thumbs[0]} 0%, ${hexWithAlpha(p.thumbs[1] || p.thumbs[0], 0.9)} 55%, ${hexWithAlpha(p.thumbs[2] || p.thumbs[0], 0.85)} 100%)`,
                    }}
                  />
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.35), inset 0 -40px 60px -30px rgba(0,0,0,0.18)' }}
                  />
                </>
              )}
            </motion.button>
          )
        })}
      </div>

      <div className="h-[18px] -mt-4 flex items-center justify-center px-6">
        <AnimatePresence mode="wait">
          {hoverIdx !== null && prompts[hoverIdx] && (
            <motion.span
              key={prompts[hoverIdx].text}
              initial={{ opacity: 0, y: 2, filter: 'blur(3px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -2, filter: 'blur(3px)' }}
              transition={{ duration: 0.2, ease: [0.2, 1, 0.3, 1] }}
              className="text-[13px] leading-[18px] font-medium tracking-[0] text-[#858585] text-center"
            >
              {prompts[hoverIdx].text}
              {isCoarse && <span className="text-[#BFBFBF]"> · tap again</span>}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function buildOrderFromCart(lines: CartLine[]): RecentOrder {
  const total = lines.reduce((acc, l) => {
    const n = parseFloat(l.tile.price.replace(/[^\d.]/g, '')) || 0
    return acc + n * l.qty
  }, 0)
  const hasCents = Math.round(total * 100) % 100 !== 0
  const priceStr = hasCents ? `$${total.toFixed(2)}` : `$${Math.round(total)}`

  const firstTile = lines[0]?.tile
  const qtyCount = lines.reduce((acc, l) => acc + l.qty, 0)
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const etaStr = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const trackingSuffix = now.getTime().toString(36).toUpperCase().slice(-6)
  const tracking = `1Z${trackingSuffix}`

  const headline = firstTile?.headline ?? 'order'
  const cap = headline ? headline.charAt(0).toUpperCase() + headline.slice(1) : headline
  const productLabel = qtyCount > 1 ? `${cap} +${qtyCount - 1} more` : cap

  return {
    id: `o-${now.getTime().toString(36)}`,
    brand: firstTile?.brand ?? 'Various',
    product: productLabel,
    date: dateStr,
    color: safeHex(firstTile?.moodColor),
    price: priceStr,
    status: 'processing',
    placed: now.toISOString(),
    carrier: 'USPS Ground',
    tracking,
    eta: etaStr,
    card: 'Apple Pay',
    shipTo: '847 President St, Brooklyn',
  }
}

function HistoryList({
  turns, orders, onPick, onOpenOrder,
}: {
  turns: Turn[]
  orders: RecentOrder[]
  onPick: (turnId: string) => void
  onOpenOrder: (o: RecentOrder) => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.2, 1, 0.3, 1] }}
      className="flex flex-col gap-10"
    >
      <section className="flex flex-col gap-3">
        <SectionHeader label="Recent orders" count={orders.length} />
        {orders.length === 0 ? (
          <div className="text-[13px] leading-[18px] font-medium tracking-[0] text-[#858585]" style={{ textWrap: 'pretty' }}>
            Nothing here yet. Orders show up once you check out.
          </div>
        ) : (
        <ul className="flex flex-col [&:hover_button:not(:hover)]:opacity-50 [&_button]:transition-opacity [&_button]:duration-[40ms]">
          {orders.map((o, i) => {
            const statusDot = o.status === 'delivered'
              ? '#2f8a4e'
              : o.status === 'shipped'
              ? '#c58a2e'
              : '#BFBFBF'
            return (
              <motion.li
                key={o.id}
                initial={{ opacity: 0, y: 2 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.26, ease: [0.2, 1, 0.3, 1], delay: 0.04 + i * 0.03 }}
              >
                <button
                  onClick={() => onOpenOrder(o)}
                  className="group w-full text-left flex items-center gap-3 py-3 border-t border-[#F0F0F0] hover:border-[#ECECEC] cursor-pointer"
                  style={{ transition: 'border-color 160ms ease, opacity 40ms ease' }}
                >
                  <span
                    aria-hidden
                    className="h-9 w-9 shrink-0 rounded-[8px]"
                    style={{
                      background: `linear-gradient(160deg, ${safeHex(o.color)} 0%, ${shiftHex(safeHex(o.color), -18)} 100%)`,
                    }}
                  />
                  <span className="flex-1 min-w-0 flex flex-col">
                    <span className="text-[13px] leading-[18px] font-medium tracking-[0] text-[#242529] truncate">
                      {o.product}
                    </span>
                    <span className="text-[12px] leading-[16px] font-medium tracking-[0] text-[#858585] truncate inline-flex items-center gap-1.5">
                      <span aria-hidden className="h-[6px] w-[6px] rounded-full shrink-0" style={{ backgroundColor: statusDot }} />
                      <span className="truncate">{o.brand} · {o.status}</span>
                    </span>
                  </span>
                  <span
                    className="shrink-0 text-[12px] leading-[16px] font-medium tracking-[0] text-[#BFBFBF] group-hover:text-[#858585]"
                    style={{ transition: 'color 160ms ease' }}
                  >
                    {o.date}
                  </span>
                </button>
              </motion.li>
            )
          })}
        </ul>
        )}
      </section>

      <div aria-hidden className="h-px w-full bg-[#F0F0F0]" />

      <section className="flex flex-col gap-3">
        <SectionHeader
          label="Searches"
          count={turns.length}
          countLabel={turns.length === 1 ? 'search' : 'searches'}
        />
        {turns.length === 0 ? (
          <div className="text-[13px] leading-[18px] font-medium tracking-[0] text-[#858585]" style={{ textWrap: 'pretty' }}>
            Nothing here yet. Ask something to start a search.
          </div>
        ) : (
          <ul className="flex flex-col [&:hover_button:not(:hover)]:opacity-50 [&_button]:transition-opacity [&_button]:duration-[40ms]">
            {[...turns].reverse().map((t, i) => (
              <motion.li
                key={t.id}
                initial={{ opacity: 0, y: 2 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.26, ease: [0.2, 1, 0.3, 1], delay: 0.04 + i * 0.02 }}
              >
                <button
                  onClick={() => onPick(t.id)}
                  className="group w-full text-left flex items-baseline gap-3 py-3 border-t border-[#F0F0F0] hover:border-[#ECECEC] cursor-pointer"
                  style={{ transition: 'border-color 160ms ease, opacity 40ms ease' }}
                >
                  <span className="flex-1 text-[13px] leading-[18px] font-medium tracking-[0] text-[#242529] truncate">
                    {t.user}
                  </span>
                  <span
                    className="shrink-0 text-[12px] leading-[16px] font-medium tracking-[0] text-[#BFBFBF] group-hover:text-[#858585]"
                    style={{ transition: 'color 160ms ease' }}
                  >
                    {t.tiles.length > 0 ? `${t.tiles.length} picks` : 'Pending'}
                  </span>
                </button>
              </motion.li>
            ))}
          </ul>
        )}
      </section>
    </motion.div>
  )
}

function SectionHeader({
  label, count, countLabel,
}: {
  label: string
  count: number
  countLabel?: string
}) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="text-[12px] leading-[16px] font-medium tracking-[0] text-[#858585]">
        {label}
      </h2>
      <span className="text-[12px] leading-[16px] font-medium tracking-[0] text-[#BFBFBF]">
        {count}{countLabel ? ` ${countLabel}` : ''}
      </span>
    </div>
  )
}

type TopTab = 'new' | 'history' | 'account'

function TopBar({
  onHome, onNewSearch, onOpenCart, cartCount, activeTab, onTabChange, cartOpen, dimmed, cartDimmed, addedPulse,
  wishlistPulse,
}: {
  onHome: () => void
  onNewSearch: () => void
  onOpenCart: () => void
  cartCount: number
  activeTab: TopTab
  onTabChange: (tab: TopTab) => void
  cartOpen: boolean
  dimmed: boolean
  cartDimmed: boolean
  addedPulse: { id: number; color: string } | null
  wishlistPulse: { id: number; color: string } | null
}) {
  const indicatorX =
    activeTab === 'new' ? 0 :
    activeTab === 'history' ? 40 :
    80
  return (
    <div className="shrink-0 px-4 md:px-6 pt-3 md:pt-6 pb-2 relative z-50">
      <div className="flex items-center justify-between">
        <motion.div
          initial={false}
          animate={{ opacity: dimmed ? 0 : 1 }}
          transition={{ duration: 0.32, ease: [0.2, 1, 0.3, 1] }}
          style={{ pointerEvents: dimmed ? 'none' : 'auto' }}
        >
          <IconBtn ariaLabel="home" onClick={onHome} tooltip="Home">
            <ShopifyLogo />
          </IconBtn>
        </motion.div>

        <motion.div
          initial={false}
          animate={{ opacity: dimmed ? 0 : 1 }}
          transition={{ duration: 0.32, ease: [0.2, 1, 0.3, 1] }}
          style={{ pointerEvents: dimmed ? 'none' : 'auto' }}
          className="relative flex items-center rounded-full bg-[#f7f7f7] p-1 gap-0"
        >
          <motion.div
            initial={false}
            animate={{ x: indicatorX }}
            transition={{ type: 'spring', duration: 0.32, bounce: 0 }}
            aria-hidden
            className="absolute top-1 bottom-1 left-1 w-[40px] rounded-full bg-white"
            style={{
              boxShadow: '0 0 0 1px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.10)',
            }}
          />
          <TabBtn
            ariaLabel="new search"
            onClick={() => {
              if (activeTab === 'new') onNewSearch()
              else onTabChange('new')
            }}
            active={activeTab === 'new'}
            tooltip="New search"
          >
            <SparkleSearchIcon />
          </TabBtn>
          <TabBtn ariaLabel="history" onClick={() => onTabChange('history')} active={activeTab === 'history'} tooltip="History">
            <HistoryIcon />
          </TabBtn>
          <div className="relative" data-wishlist-target>
            <AnimatePresence>
              {wishlistPulse && (
                <motion.span
                  key={wishlistPulse.id}
                  aria-hidden
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: [0, 0.32, 0], scale: [0.6, 1, 1.1] }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1.6, ease: [0.2, 1, 0.3, 1], times: [0, 0.35, 1] }}
                  className="pointer-events-none absolute top-1/2 left-1/2 rounded-full"
                  style={{
                    width: 420, height: 420, marginLeft: -210, marginTop: -210,
                    background: `radial-gradient(circle, ${wishlistPulse.color}55 0%, ${wishlistPulse.color}22 30%, ${wishlistPulse.color}09 55%, ${wishlistPulse.color}00 75%)`,
                    filter: 'blur(36px)',
                  }}
                />
              )}
            </AnimatePresence>
            <TabBtn ariaLabel="account" onClick={() => onTabChange('account')} active={activeTab === 'account'} tooltip="Account">
              <AccountIcon />
            </TabBtn>
          </div>
        </motion.div>

        <motion.div
          initial={false}
          animate={{ opacity: cartDimmed ? 0 : 1 }}
          transition={{ duration: 0.32, ease: [0.2, 1, 0.3, 1] }}
          style={{ pointerEvents: cartDimmed ? 'none' : 'auto' }}
          className="flex items-center gap-1"
        >
        <div
          className="relative"
          data-cart-target
        >
        <AnimatePresence>
          {addedPulse && (
            <motion.span
              key={addedPulse.id}
              aria-hidden
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: [0, 0.32, 0], scale: [0.6, 1, 1.1] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.6, ease: [0.2, 1, 0.3, 1], times: [0, 0.35, 1] }}
              className="pointer-events-none absolute top-1/2 left-1/2 rounded-full"
              style={{
                width: 560,
                height: 560,
                marginLeft: -280,
                marginTop: -280,
                background: `radial-gradient(circle, ${addedPulse.color}66 0%, ${addedPulse.color}33 30%, ${addedPulse.color}0d 55%, ${addedPulse.color}00 75%)`,
                filter: 'blur(40px)',
              }}
            />
          )}
        </AnimatePresence>
        {/* Icon buttons switching between states use a blur and opacity crossfade */}
        {/* instead of a static entry and exit, so the transition feels like the */}
        {/* icon is changing shape rather than being swapped out. */}
        <IconBtn ariaLabel={cartOpen ? 'close cart' : `cart, ${cartCount} items`} onClick={onOpenCart} tooltip={cartOpen ? 'Close cart' : 'Cart'}>
          <span className="relative flex items-center justify-center h-4 w-4">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={cartOpen ? 'x' : 'bag'}
                aria-hidden
                initial={{ opacity: 0, filter: 'blur(4px)' }}
                animate={{ opacity: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, filter: 'blur(4px)' }}
                transition={{ duration: 0.16, ease: [0.2, 1, 0.3, 1] }}
                className="absolute inset-0 inline-flex items-center justify-center"
              >
                {cartOpen ? <XIcon /> : <BagIcon />}
              </motion.span>
            </AnimatePresence>
            <AnimatePresence initial={false}>
              {!cartOpen && cartCount > 0 && (
                <motion.span
                  layout
                  initial={{ opacity: 0, scale: 0.25, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, scale: 0.25, filter: 'blur(4px)' }}
                  transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
                  className="absolute -top-[18px] -right-[18px] h-[16px] min-w-[16px] px-[4px] rounded-full bg-[#242529] text-white ring-2 ring-white text-[10px] leading-none flex items-center justify-center font-medium overflow-hidden"
                >
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={cartCount}
                      initial={{ opacity: 0, y: 6, filter: 'blur(3px)' }}
                      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                      exit={{ opacity: 0, y: -6, filter: 'blur(3px)' }}
                      transition={{ type: 'spring', duration: 0.28, bounce: 0 }}
                      className="inline-block"
                    >
                      {cartCount}
                    </motion.span>
                  </AnimatePresence>
                </motion.span>
              )}
            </AnimatePresence>
          </span>
        </IconBtn>
        </div>
        </motion.div>
      </div>
    </div>
  )
}

function IconBtn({
  children, ariaLabel, onClick, tooltip,
}: {
  children: React.ReactNode
  ariaLabel: string
  onClick?: () => void
  tooltip?: string
}) {
  const btn = (
    <button
      aria-label={ariaLabel}
      onClick={onClick}
      className="relative h-10 w-10 flex items-center justify-center rounded-full text-[#858585] hover:text-[#242529] cursor-pointer"
      style={{ transition: 'color 160ms ease, background-color 160ms ease' }}
    >
      {children}
    </button>
  )
  return tooltip ? <HoverTip label={tooltip}>{btn}</HoverTip> : btn
}

function TabBtn({
  children, ariaLabel, onClick, active, tooltip,
}: {
  children: React.ReactNode
  ariaLabel: string
  onClick: () => void
  active: boolean
  tooltip?: string
}) {
  const btn = (
    <button
      aria-label={ariaLabel}
      aria-pressed={active}
      onClick={onClick}
      className="relative z-10 h-8 w-10 flex items-center justify-center rounded-full cursor-pointer"
      style={{ color: active ? '#242529' : 'rgba(36,37,41,0.55)', transition: 'color 180ms ease' }}
    >
      {children}
    </button>
  )
  return tooltip ? <HoverTip label={tooltip}>{btn}</HoverTip> : btn
}

function XIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <path d="M17.2197 5.71967C17.5126 5.42678 17.9873 5.42678 18.2802 5.71967C18.5731 6.01256 18.5731 6.48732 18.2802 6.78022L13.0605 11.9999L18.2802 17.2197C18.5731 17.5126 18.5731 17.9873 18.2802 18.2802C17.9873 18.5731 17.5126 18.5731 17.2197 18.2802L11.9999 13.0605L6.78022 18.2802C6.48732 18.5731 6.01256 18.5731 5.71967 18.2802C5.42678 17.9873 5.42678 17.5126 5.71967 17.2197L10.9394 11.9999L5.71967 6.78022C5.42678 6.48732 5.42678 6.01256 5.71967 5.71967C6.01256 5.42678 6.48732 5.42678 6.78022 5.71967L11.9999 10.9394L17.2197 5.71967Z" fill="currentColor" />
    </svg>
  )
}

function BagIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <path fillRule="evenodd" clipRule="evenodd" d="M7.99884 6C7.99884 3.79086 9.7897 2 11.9988 2C14.208 2 15.9988 3.79086 15.9988 6V7H16.0233C17.3864 7 18.5438 7.99858 18.7436 9.34699L20.151 18.847C20.3971 20.5081 19.11 22 17.4307 22H6.56696C4.8877 22 3.60056 20.5081 3.84665 18.847L5.25406 9.34699C5.45382 7.99858 6.61123 7 7.97437 7H7.99884V6ZM9.49884 7H14.4988V6C14.4988 4.61929 13.3796 3.5 11.9988 3.5C10.6181 3.5 9.49884 4.61929 9.49884 6V7Z" fill="currentColor" />
    </svg>
  )
}

function AccountIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <path d="M12 2C9.51472 2 7.5 4.01472 7.5 6.5C7.5 8.98528 9.51472 11 12 11C14.4853 11 16.5 8.98528 16.5 6.5C16.5 4.01472 14.4853 2 12 2Z" fill="currentColor" />
      <path d="M12.0014 12.5C8.27968 12.5 5.43692 14.7258 4.28043 17.8527C3.97401 18.6813 4.18231 19.4953 4.67127 20.078C5.14989 20.6484 5.89317 21 6.69823 21H17.3046C18.1096 21 18.8529 20.6484 19.3315 20.078C19.8205 19.4953 20.0288 18.6813 19.7223 17.8527C18.5659 14.7258 15.7231 12.5 12.0014 12.5Z" fill="currentColor" />
    </svg>
  )
}

function ShopifyLogo() {
  return (
    <svg width={18} height={20} viewBox="0 0 29 32" fill="none" aria-hidden>
      <g clipPath="url(#shopify-logo-clip)">
        <path fillRule="evenodd" clipRule="evenodd" d="M19.9655 31.435L19.8941 4.01555C19.7092 3.83086 19.3486 3.88663 19.2077 3.92777L18.2686 4.21852C18.1527 3.8375 18.0023 3.46782 17.8192 3.11406C17.1529 1.8432 16.179 1.1712 15.0002 1.16937H14.9965C14.9178 1.16937 14.84 1.17669 14.7613 1.18309L14.7521 1.184C14.7181 1.14206 14.6826 1.1012 14.646 1.06149C14.1334 0.512917 13.4744 0.245032 12.6855 0.267889C11.1643 0.311775 9.64952 1.41075 8.42031 3.36275C7.55538 4.73692 6.89914 6.46218 6.71151 7.79795L3.71583 8.72595C2.83443 9.00297 2.80697 9.0304 2.69073 9.86149C2.60378 10.4905 0.296387 28.3365 0.296387 28.3365L19.6342 31.6809L19.9655 31.435ZM13.63 1.52137C13.3728 1.35223 13.0717 1.2736 12.7148 1.28092C10.3662 1.34857 8.3178 5.0176 7.79518 7.4624L10.0449 6.76572L10.4467 6.64137C10.7414 5.08892 11.481 3.47795 12.4484 2.44115C12.7867 2.06963 13.186 1.75857 13.6291 1.52137H13.63ZM11.5588 6.29669L14.7878 5.29646C14.7979 4.45532 14.7064 3.21189 14.2854 2.33417C13.8369 2.51886 13.4598 2.84252 13.1889 3.13235C12.4631 3.91223 11.8709 5.10172 11.5597 6.29669H11.5588ZM15.7992 4.98377L17.3003 4.5184C17.0605 3.73943 16.4912 2.43383 15.337 2.2144C15.6958 3.14057 15.7882 4.21303 15.7992 4.98377Z" fill="#95BF47" />
        <path d="M24.2985 6.05529C24.1832 6.04615 21.9481 6.0114 21.9481 6.0114C21.9481 6.0114 20.0782 4.19563 19.8933 4.01003C19.8217 3.94404 19.731 3.90242 19.6343 3.89117V31.6763L28.0136 29.5927C28.0136 29.5927 24.5941 6.46946 24.5722 6.31129C24.5616 6.24412 24.5288 6.18241 24.479 6.13602C24.4293 6.08962 24.3663 6.0612 24.2985 6.05529Z" fill="#5E8E3E" />
        <path d="M14.9904 10.3698L14.0166 14.0124C14.0166 14.0124 12.9311 13.5177 11.6433 13.5991C9.75599 13.718 9.73585 14.9093 9.75507 15.2082C9.85758 16.8357 14.142 17.1922 14.3827 21.0076C14.5721 24.0092 12.791 26.0636 10.2246 26.2245C7.14472 26.4192 5.44873 24.6016 5.44873 24.6016L6.10132 21.824C6.10132 21.824 7.80829 23.1122 9.17387 23.0254C10.0672 22.9696 10.3857 22.2437 10.3537 21.7298C10.2191 19.606 6.73011 19.7303 6.50953 16.2396C6.32464 13.3001 8.25311 10.3241 12.51 10.0553C14.1502 9.9511 14.9904 10.3708 14.9904 10.3708" fill="white" />
      </g>
      <defs>
        <clipPath id="shopify-logo-clip">
          <rect width="28.3733" height="32" fill="white" />
        </clipPath>
      </defs>
    </svg>
  )
}

function SparkleSearchIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <path fillRule="evenodd" clipRule="evenodd" d="M6.91957 3H11.25C11.6642 3 12 3.33579 12 3.75C12 4.16421 11.6642 4.5 11.25 4.5H6.95C6.37757 4.5 5.99336 4.50058 5.69748 4.52476C5.41036 4.54822 5.27307 4.5901 5.18251 4.63624C4.94731 4.75608 4.75608 4.94731 4.63624 5.18251C4.5901 5.27307 4.54822 5.41035 4.52476 5.69748C4.50058 5.99336 4.5 6.37757 4.5 6.95V17.05C4.5 17.6224 4.50058 18.0066 4.52476 18.3025C4.54822 18.5896 4.5901 18.7269 4.63624 18.8175C4.75608 19.0527 4.94731 19.2439 5.18251 19.3638C5.27307 19.4099 5.41036 19.4518 5.69748 19.4752C5.99336 19.4994 6.37757 19.5 6.95 19.5H17.05C17.6224 19.5 18.0066 19.4994 18.3025 19.4752C18.5896 19.4518 18.7269 19.4099 18.8175 19.3638C19.0527 19.2439 19.2439 19.0527 19.3638 18.8175C19.4099 18.7269 19.4518 18.5896 19.4752 18.3025C19.4994 18.0066 19.5 17.6224 19.5 17.05V12.75C19.5 12.3358 19.8358 12 20.25 12C20.6642 12 21 12.3358 21 12.75V17.0805C21 17.6146 21 18.0604 20.9703 18.4247C20.9392 18.8046 20.8721 19.1612 20.7003 19.4985C20.4366 20.0159 20.0159 20.4366 19.4985 20.7003C19.1612 20.8721 18.8046 20.9392 18.4247 20.9703C18.0604 21 17.6146 21 17.0805 21H6.91955C6.3854 21 5.93956 21 5.57533 20.9703C5.19545 20.9392 4.83879 20.8721 4.50153 20.7003C3.98408 20.4366 3.56338 20.0159 3.29973 19.4985C3.12789 19.1612 3.06078 18.8046 3.02974 18.4247C2.99998 18.0604 2.99999 17.6146 3 17.0804V6.91956C2.99999 6.38541 2.99998 5.93956 3.02974 5.57533C3.06078 5.19545 3.12789 4.83879 3.29973 4.50153C3.56338 3.98408 3.98408 3.56338 4.50153 3.29973C4.83879 3.12789 5.19545 3.06078 5.57533 3.02974C5.93956 2.99998 6.38541 2.99999 6.91957 3Z" fill="currentColor" />
      <path d="M20.9445 2.88358C19.8706 1.80964 18.1294 1.80964 17.0555 2.88358L8.51256 11.4265C8.18437 11.7547 8 12.1998 8 12.6639V15.2497C8 15.6639 8.33579 15.9997 8.75 15.9997H11.3358C11.7999 15.9997 12.245 15.8153 12.5732 15.4871L21.1161 6.94424C22.1901 5.8703 22.1901 4.1291 21.1161 3.05515L20.9445 2.88358Z" fill="currentColor" />
    </svg>
  )
}

function HistoryIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <path d="M5.75 4.5C4.23122 4.5 3 5.73122 3 7.25C3 8.76878 4.23122 10 5.75 10C7.26878 10 8.5 8.76878 8.5 7.25C8.5 5.73122 7.26878 4.5 5.75 4.5Z" fill="currentColor" />
      <path d="M11.75 6.5C11.3358 6.5 11 6.83579 11 7.25C11 7.66421 11.3358 8 11.75 8H20.25C20.6642 8 21 7.66421 21 7.25C21 6.83579 20.6642 6.5 20.25 6.5H11.75Z" fill="currentColor" />
      <path d="M5.75 14C4.23122 14 3 15.2312 3 16.75C3 18.2688 4.23122 19.5 5.75 19.5C7.26878 19.5 8.5 18.2688 8.5 16.75C8.5 15.2312 7.26878 14 5.75 14Z" fill="currentColor" />
      <path d="M11.75 16C11.3358 16 11 16.3358 11 16.75C11 17.1642 11.3358 17.5 11.75 17.5H20.25C20.6642 17.5 21 17.1642 21 16.75C21 16.3358 20.6642 16 20.25 16H11.75Z" fill="currentColor" />
    </svg>
  )
}

const COMPOSER_SUGGESTIONS = [
  'warm cozy textiles under $80',
  'hand-thrown clay mugs',
  'quiet navy knitwear',
  'minimal desk objects',
  'earthy scented candles',
]

const PLACEHOLDER_ROTATION: readonly string[] = [
  'a macbook for light design work',
  'a low-profile mechanical keyboard',
  'a handheld console for retro games',
  'a macro pad with a knob',
  'a desk stand for my phone',
  'a coffee table book on architecture',
  'an aluminum carry-on under 8kg',
  'a gradient poster for above the desk',
] as const

function Composer({
  query, setQuery, onSubmit, onStop, pending, isEmpty, followups, onPickFollowup, recents,
}: {
  query: string
  setQuery: (v: string) => void
  onSubmit: (override?: string) => void
  onStop: () => void
  pending: boolean
  isEmpty: boolean
  followups: string[] | null
  onPickFollowup: (q: string) => void
  recents: string[]
}) {
  const hasQuery = query.trim().length > 0
  const [focused, setFocused] = useState(false)
  const [typed, setTyped] = useState<string>(PLACEHOLDER_ROTATION[0])
  const [swapping, setSwapping] = useState(false)

  const rotatingActive = isEmpty && !pending && !hasQuery
  useEffect(() => {
    if (!rotatingActive) return
    let cancelled = false
    let idx = 0
    setTyped(PLACEHOLDER_ROTATION[0])
    setSwapping(false)
    const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
    const run = async () => {
      while (!cancelled) {
        await sleep(2800)
        if (cancelled) return
        const curr = PLACEHOLDER_ROTATION[idx]
        for (let k = curr.length - 1; k >= 0; k--) {
          if (cancelled) return
          setTyped(curr.slice(0, k))
          await sleep(10 + Math.random() * 8)
        }
        setSwapping(true)
        idx = (idx + 1) % PLACEHOLDER_ROTATION.length
        const next = PLACEHOLDER_ROTATION[idx]
        await sleep(220)
        if (cancelled) return
        setSwapping(false)
        for (let k = 1; k <= next.length; k++) {
          if (cancelled) return
          setTyped(next.slice(0, k))
          await sleep(26 + Math.random() * 18)
        }
      }
    }
    run()
    return () => { cancelled = true }
  }, [rotatingActive])

  const chips = useMemo(() => {
    const out: string[] = []
    for (let i = recents.length - 1; i >= 0 && out.length < 2; i--) {
      const r = recents[i]?.trim()
      if (r && !out.includes(r)) out.push(r)
    }
    for (const s of COMPOSER_SUGGESTIONS) {
      if (out.length >= 3) break
      if (!out.includes(s)) out.push(s)
    }
    return out.slice(0, 3)
  }, [recents])

  const hasFollowups = !!(followups && followups.length > 0)
  const showChips = focused && !pending && !hasFollowups && chips.length > 0

  return (
    <div className="w-full pt-6 pb-6">
      <div className="mx-auto max-w-[576px] px-5 flex flex-col gap-2">
        <AnimatePresence>
          {followups && followups.length > 0 && (
            <motion.div
              key="composer-followups"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.28, ease: [0.2, 1, 0.3, 1] }}
              className="flex gap-2 overflow-x-auto pb-1"
              style={{
                scrollbarWidth: 'none',
                maskImage: 'linear-gradient(to right, #000 0, #000 calc(100% - 32px), transparent 100%)',
                WebkitMaskImage: 'linear-gradient(to right, #000 0, #000 calc(100% - 32px), transparent 100%)',
              }}
            >
              {followups.map((f, i) => (
                <motion.button
                  key={f}
                  onClick={() => onPickFollowup(f)}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.26, ease: [0.2, 1, 0.3, 1], delay: i * 0.04 }}
                  className="shrink-0 rounded-full border border-dashed border-[#ECECEC] bg-[#FAFAFA] px-3.5 py-1.5 text-[12px] md:text-[13px] leading-[16px] md:leading-[18px] font-medium tracking-[0] text-[#858585] hover:text-[#242529] active:text-black/50 cursor-pointer whitespace-nowrap"
                  style={{ transition: 'color 160ms ease, transform 160ms ease' }}
                >
                  {f}
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showChips && (
            <motion.div
              key="composer-affordances"
              initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
              transition={{ duration: 0.24, ease: [0.2, 1, 0.3, 1] }}
              className="flex gap-2 overflow-x-auto pb-1 -mb-1"
              style={{
                scrollbarWidth: 'none',
                maskImage: 'linear-gradient(to right, #000 0, #000 calc(100% - 32px), transparent 100%)',
                WebkitMaskImage: 'linear-gradient(to right, #000 0, #000 calc(100% - 32px), transparent 100%)',
              }}
            >
              {chips.map((c, i) => (
                <motion.button
                  key={c}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => setQuery(c)}
                  initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  transition={{ duration: 0.22, delay: i * 0.04, ease: [0.2, 1, 0.3, 1] }}
                  className="shrink-0 rounded-full border border-[#F0F0F0] bg-white px-3 py-1.5 text-[12px] md:text-[13px] leading-[16px] md:leading-[18px] font-medium tracking-[0] text-[#858585] hover:text-[#242529] hover:border-[#ECECEC] cursor-pointer whitespace-nowrap"
                  style={{ transition: 'color 160ms ease, border-color 160ms ease' }}
                >
                  {c}
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          initial={{ opacity: 0, y: 10, filter: 'blur(8px)', scale: 0.97 }}
          animate={{
            opacity: 1, y: 0, filter: 'blur(0px)', scale: 1,
            boxShadow: focused
              ? '0 0 0 1px rgba(0,0,0,0.14), 0 1px 2px rgba(0,0,0,0.12)'
              : '0 0 0 1px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.10)',
          }}
          transition={{
            // Spring pop for position + scale so the input feels alive on first paint.
            y: { type: 'spring', stiffness: 520, damping: 26, mass: 0.7 },
            scale: { type: 'spring', stiffness: 520, damping: 26, mass: 0.7 },
            // Blur + opacity resolve quickly so there's no lingering haze.
            opacity: { duration: 0.28, ease: [0.2, 1, 0.3, 1] },
            filter: { duration: 0.28, ease: [0.2, 1, 0.3, 1] },
            boxShadow: { duration: 0.18, ease: 'easeOut' },
          }}
          className="relative rounded-[16px] bg-white"
          style={{
            transition: 'background-color 200ms ease',
          }}
        >
          <textarea
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                onSubmit()
              }
            }}
            rows={1}
            className="block w-full resize-none bg-transparent text-[13px] leading-[18px] font-medium tracking-[0] outline-none caret-[#242529] text-[#242529] px-3 pt-2 pb-9 md:pb-10 min-h-[62px] md:min-h-[100px]"
          />
          {!hasQuery && !pending && (
            // Plain CSS rather than motion.div so SSR + hydration render the
            // same style object. Focus-driven 35ms blur-fade snaps the rotating
            // hint out of the way the moment the cursor lands in the input.
            <div
              aria-hidden
              className="pointer-events-none absolute top-2 left-3 right-12 text-[13px] leading-[18px] font-medium tracking-[0] truncate"
              style={{
                color: '#BFBFBF',
                opacity: focused ? 0 : 1,
                filter: focused ? 'blur(4px)' : 'blur(0px)',
                transition: 'opacity 35ms linear, filter 35ms linear',
              }}
            >
              {rotatingActive ? (
                <span
                  className="block"
                  style={{
                    filter: swapping ? 'blur(3px)' : 'blur(0px)',
                    opacity: swapping ? 0 : 1,
                    transition: 'filter 160ms ease, opacity 160ms ease',
                  }}
                >
                  {typed}
                </span>
              ) : (
                <span className="block">Ask a follow up or search something else</span>
              )}
            </div>
          )}
          <AnimatePresence>
            {(hasQuery || pending) && (
              <motion.button
                key="send-stop"
                onClick={() => pending ? onStop() : onSubmit()}
                aria-label={pending ? 'stop' : 'send'}
                initial={{ opacity: 0, filter: 'blur(4px)' }}
                animate={{ opacity: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, filter: 'blur(4px)' }}
                transition={{ duration: 0.18, ease: [0.2, 1, 0.3, 1] }}
                className="absolute bottom-2.5 right-2.5 h-6 w-6 rounded-full flex items-center justify-center cursor-pointer before:content-[''] before:absolute before:inset-[-8px]"
                style={{
                  backgroundColor: '#242529',
                  color: '#ffffff',
                }}
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={pending ? 'stop' : 'send'}
                    initial={{ opacity: 0, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, filter: 'blur(4px)' }}
                    transition={{ duration: 0.16, ease: [0.2, 1, 0.3, 1] }}
                    className="absolute inset-0 inline-flex items-center justify-center"
                  >
                    {pending ? (
                      <svg width={10} height={10} viewBox="0 0 10 10" fill="none">
                        <rect x="1" y="1" width="8" height="8" rx="1.5" fill="currentColor" />
                      </svg>
                    ) : (
                      <svg width={12} height={12} viewBox="0 0 16 16" fill="none">
                        <path d="M8 13V3M4 7l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </motion.span>
                </AnimatePresence>
              </motion.button>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  )
}
