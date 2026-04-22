'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import type { Tile } from './types'
import { ProductImage } from './product-image'

function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

export function TileCard({
  tile, index, onOpen, turnId,
}: {
  tile: Tile
  index: number
  onOpen: (tile: Tile) => void
  turnId: string
}) {
  // Cards enter with a small blur and fade, staggered by index, so the grid
  // arrives as one motion instead of everything popping in at once.
  const delay = 0.08 + index * 0.04
  const fullTitle = `${capitalize(tile.headline)} ${tile.titleTail}`
  const titleRef = useRef<HTMLDivElement>(null)
  const [truncated, setTruncated] = useState(false)

  useIsoLayoutEffect(() => {
    const el = titleRef.current
    if (!el) return
    const check = () => setTruncated(el.scrollWidth - 1 > el.clientWidth)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [fullTitle])

  return (
    <motion.div
      initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.32, ease: [0.2, 1, 0.3, 1], delay }}
      className="relative flex flex-col gap-2.5 w-full"
    >
      {/* The product image keeps the same layoutId across the grid, the stacked */}
      {/* pile of previous turns, and the modal, so it animates between positions */}
      {/* instead of crossfading. */}
      <motion.div
        layoutId={`${turnId}-img-${tile.id}`}
        transition={{ layout: { type: 'spring', duration: 0.6, bounce: 0 } }}
        role="button"
        tabIndex={0}
        onClick={() => onOpen(tile)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(tile) } }}
        className="group relative block w-full overflow-hidden aspect-square text-left shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1),0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.12)] md:hover:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1),0_1px_3px_rgba(0,0,0,0.06),0_16px_36px_-14px_rgba(0,0,0,0.2)] active:brightness-[0.96] cursor-pointer"
        style={{
          borderRadius: 12,
          transition: 'box-shadow 240ms cubic-bezier(0.23, 1, 0.32, 1), filter 140ms cubic-bezier(0.23, 1, 0.32, 1)',
        }}
      >
        <ProductImage src={tile.image} color={tile.moodColor} alt={fullTitle} />
      </motion.div>

      <div className="relative flex flex-col gap-0.5 px-0.5">
        <div className="md:hidden text-[13px] leading-[18px] font-medium tracking-[0] text-[#858585] truncate">
          {tile.brand}
        </div>
        <div className="flex flex-col md:flex-row md:items-baseline md:gap-3">
          <div ref={titleRef} className="group/title flex-1 min-w-0 md:pr-1 truncate text-[13px] leading-[18px] font-medium tracking-[0] text-[#242529]">
            {fullTitle}
          </div>
          <div className="shrink-0 text-[13px] leading-[18px] font-medium tracking-[0] text-[#242529]">
            {tile.price}
          </div>
        </div>
        <div className="hidden md:block text-[13px] leading-[18px] font-medium tracking-[0] text-[#858585] truncate">
          {tile.brand}
        </div>

        {truncated && (
          <div
            role="tooltip"
            className="hidden md:block pointer-events-none absolute -left-0.5 -right-0.5 top-0 z-20 rounded-[8px] bg-[#242529] px-2.5 py-1.5 text-[13px] leading-[18px] font-medium tracking-[0] text-white opacity-0 translate-y-[-2px] shadow-[0_8px_24px_-12px_rgba(0,0,0,0.28)] md:group-hover/title:opacity-100 md:group-hover/title:translate-y-0"
            style={{ transition: 'opacity 160ms ease, transform 160ms ease', textWrap: 'pretty' }}
          >
            {fullTitle}
          </div>
        )}
      </div>
    </motion.div>
  )
}
