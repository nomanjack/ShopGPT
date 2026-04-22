'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { animate } from 'motion/react'
import type { Tile } from './types'
import { ProductImage } from './product-image'

export type Rect = { x: number; y: number; w: number; h: number }

export type Flight = {
  id: string
  tile: Tile
  from: Rect
  to: Rect
  kind?: 'cart' | 'wishlist'
}

// Adding a product to the cart animates along a curved path, not a straight
// line. Lift scales with distance so tiles near the cart arc shallowly and
// tiles across the page arc high. A subtle particle trail follows the path.
const SIZE = 56
const DURATION = 1.2
const EASE: [number, number, number, number] = [0.42, 0, 0.22, 1]
const ARC_LIFT_BASE = 110
const ARC_LIFT_FACTOR = 0.42
const ARC_LIFT_MAX = 200
const ARC_TOP_MARGIN = 24
const TRAIL_INTERVAL = 20
const TRAIL_LIFE = 150
const TRAIL_DOT = 3

// Wishlist flights land full-size at the tab, hold briefly, then slip behind the topbar.
const WISHLIST_ARC_DURATION = 0.9
const WISHLIST_FINAL_SCALE = 0.62
const WISHLIST_HOLD_MS = 420
const WISHLIST_FADE_MS = 320

type Particle = { id: number; x: number; y: number; color: string }

export function FlyToCart({
  flight, onDone, onArrive,
}: {
  flight: Flight
  onDone: (id: string) => void
  onArrive: (flight: Flight) => void
}) {
  const elRef = useRef<HTMLDivElement | null>(null)
  const [particles, setParticles] = useState<Particle[]>([])
  const [behind, setBehind] = useState(false)
  const particleIdRef = useRef(0)
  const onArriveRef = useRef(onArrive)
  const onDoneRef = useRef(onDone)
  onArriveRef.current = onArrive
  onDoneRef.current = onDone

  const isWishlist = flight.kind === 'wishlist'

  useEffect(() => {
    const { from, to } = flight
    const startX = from.x + from.w / 2 - SIZE / 2
    const startY = from.y + from.h / 2 - SIZE / 2
    const endX = to.x + to.w / 2 - SIZE / 2
    const endY = to.y + to.h / 2 - SIZE / 2
    const cpX = (startX + endX) / 2
    const dx = Math.abs(endX - startX)
    const lift = Math.min(ARC_LIFT_MAX, ARC_LIFT_BASE + dx * ARC_LIFT_FACTOR)
    const cpY = Math.max(ARC_TOP_MARGIN, Math.min(startY, endY) - lift)

    if (elRef.current) {
      elRef.current.style.transform = `translate3d(${startX}px, ${startY}px, 0)`
    }

    let holdTimer: ReturnType<typeof setTimeout> | null = null
    let fadeControls: ReturnType<typeof animate> | null = null
    let arrived = false

    const arcDuration = isWishlist ? WISHLIST_ARC_DURATION : DURATION
    const arcControls = animate(0, 1, {
      duration: arcDuration,
      ease: EASE,
      onUpdate: (t) => {
        const it = 1 - t
        const x = it * it * startX + 2 * it * t * cpX + t * t * endX
        const y = it * it * startY + 2 * it * t * cpY + t * t * endY
        const scale = isWishlist
          ? 1 - t * (1 - WISHLIST_FINAL_SCALE)
          : 1 - t * 0.55
        const opacity = isWishlist
          ? 1
          : t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25
        const el = elRef.current
        if (el) {
          el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`
          el.style.opacity = String(opacity)
        }
        if (!arrived && t > 0.82) {
          arrived = true
          onArriveRef.current(flight)
        }
      },
      onComplete: () => {
        if (!isWishlist) {
          onDoneRef.current(flight.id)
          return
        }
        holdTimer = setTimeout(() => {
          setBehind(true)
          fadeControls = animate(1, 0, {
            duration: WISHLIST_FADE_MS / 1000,
            ease: [0.4, 0, 0.6, 1],
            onUpdate: (op) => {
              const el = elRef.current
              if (el) el.style.opacity = String(op)
            },
            onComplete: () => onDoneRef.current(flight.id),
          })
        }, WISHLIST_HOLD_MS)
      },
    })

    const spawn = setInterval(() => {
      const el = elRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const id = particleIdRef.current++
      const p: Particle = {
        id,
        x: cx + (Math.random() - 0.5) * 10,
        y: cy + (Math.random() - 0.5) * 10,
        color: flight.tile.moodColor,
      }
      setParticles(prev => [...prev, p])
      setTimeout(() => {
        setParticles(prev => prev.filter(q => q.id !== id))
      }, TRAIL_LIFE)
    }, TRAIL_INTERVAL)

    return () => {
      arcControls.stop()
      fadeControls?.stop()
      if (holdTimer) clearTimeout(holdTimer)
      clearInterval(spawn)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flight.id])

  if (typeof window === 'undefined') return null

  // Wishlist flights drop below the topbar (z-50) once the hold ends, so the
  // image dissolves behind the pill instead of over it.
  const zIndex = isWishlist && behind ? 40 : 60

  return createPortal(
    <div className="pointer-events-none fixed inset-0" style={{ zIndex }}>
      <div
        ref={elRef}
        className="absolute top-0 left-0 overflow-hidden"
        style={{
          width: SIZE,
          height: SIZE,
          borderRadius: 12,
          boxShadow: '0 8px 24px -6px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.06)',
          willChange: 'transform, opacity',
        }}
      >
        <ProductImage src={flight.tile.image} color={flight.tile.moodColor} alt="" fit="cover" />
      </div>
      {particles.map(p => (
        <span
          key={p.id}
          className="absolute"
          style={{
            left: p.x,
            top: p.y,
            width: TRAIL_DOT,
            height: TRAIL_DOT,
            backgroundColor: p.color,
            transform: 'translate(-50%, -50%)',
            animation: `shop-trail-fade ${TRAIL_LIFE}ms ease-in forwards`,
          }}
        />
      ))}
      <style>{`@keyframes shop-trail-fade { from { opacity: 1 } to { opacity: 0 } }`}</style>
    </div>,
    document.body,
  )
}
