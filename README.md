# /shop

A conversational AI shopping assistant built on Next.js 15, the Anthropic
Claude API, and a curated static catalog scraped from curated.supply.

## What's inside

```
app/
  shop/page.tsx              – landing + chat UI
  shop/tune/page.tsx         – confirm-shader playground (dev only)
  api/shop/route.ts          – Haiku router + Sonnet web_search + catalog fallback
components/shop/             – all UI (composer, cart, checkout, tiles, etc.)
lib/
  shop/registry.ts           – curated Shopify store list + keyword routing
  shop/demo-cache.json       – prewarmed responses for the landing + 2-level refines
  stream-text.ts             – typewriter utility
scripts/
  scrape-curated-supply.mjs  – one-off Playwright crawl of curated.supply
  build-shop-cache.mjs       – BFS cache builder (depth 4 by default)
  patch-demo-cache.mjs       – hand-tuned response for "programmable macro pads"
  test-shop-llm.mjs          – LLM harness (7 scenarios)
public/shop/                 – landing thumbnails + idle cutouts
```

## Run locally

```bash
# 1. Install
npm install

# 2. Set your Anthropic key
cp .env.example .env.local
# then edit .env.local and paste your key

# 3. Start the dev server
npm run dev
# visit http://localhost:3000/shop
```

## Architecture notes

- **Landing chips + first two levels of followups are prewarmed** into
  `lib/shop/demo-cache.json`. The API serves those in ~6 s with a simulated
  thinking delay; everything else goes live through the Haiku/Sonnet path.
- **Sonnet 4.6** handles the live `web_search` pass for off-catalog queries.
  Haiku 4.5 handles the registry-based composition and the cached-path writes.
- **Shopify-first**: token-classify the query, try the registry of ~60 small-
  maker stores first, fall through to web search when the catalog doesn't
  carry that product type.
- **Head-noun guard** prevents "office chair" from surfacing an "office"
  keyboard; see `lib/shop/registry.ts` for `lastCategoryToken`.

## Rebuilding the cache

```bash
# Boot the dev server in one terminal
npm run dev

# In another terminal, scrape curated.supply (Playwright, ~6 min)
node scripts/scrape-curated-supply.mjs

# Walk the demo BFS and write lib/shop/demo-cache.json (~20 min at depth 4)
node scripts/build-shop-cache.mjs

# Hand-tune the one landing chip the catalog can't satisfy
node scripts/patch-demo-cache.mjs
```

## Voice guide

System prompts in `app/api/shop/route.ts` enforce a tone the assistant
sticks to: contractions, no em dashes, no exclamations, banned marketing
words ("curated", "crafted", "premium", etc), sensory-over-spec
descriptions, lowercase price-and-unit formatting.
