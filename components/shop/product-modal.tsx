'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useIsPresent } from 'motion/react'
import type { Tile } from './types'
import { ProductImage } from './product-image'

const MODAL_EASE = [0.2, 1, 0.3, 1] as const

function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

export function ProductModal({
  tile, turnId, query, onClose, onAdd, onWishlist, saved,
}: {
  tile: Tile | null
  turnId: string | null
  query: string
  onClose: () => void
  onAdd: (tile: Tile, origin: DOMRect) => void
  onWishlist: (tile: Tile, origin: DOMRect) => void
  saved: boolean
}) {
  useEffect(() => {
    if (!tile) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [tile, onClose])

  return (
    <AnimatePresence>
      {tile && (
        <ModalInner tile={tile} turnId={turnId} query={query} onClose={onClose} onAdd={onAdd} onWishlist={onWishlist} saved={saved} />
      )}
    </AnimatePresence>
  )
}

function deriveCategory(titleTail: string): string {
  const t = titleTail.toLowerCase()
  if (/lamp|candle|taper/.test(t)) return 'lighting'
  if (/mug|carafe|bowl|cup|napkin|board/.test(t)) return 'kitchenware'
  if (/tote|bag/.test(t)) return 'accessories'
  if (/tee|shirt|crew|cardigan|mock-neck|sweater|flannel/.test(t)) return 'apparel'
  if (/denim|jean|trouser|pant/.test(t)) return 'bottoms'
  if (/overshirt|parka|coat|jacket/.test(t)) return 'outerwear'
  if (/beanie|hat/.test(t)) return 'headwear'
  if (/derby|boot|shoe/.test(t)) return 'footwear'
  if (/pendant|lamp|rug|pillow|throw/.test(t)) return 'home'
  return 'objects'
}

function ModalInner({
  tile, turnId, query, onClose, onAdd, onWishlist, saved,
}: {
  tile: Tile
  turnId: string | null
  query: string
  onClose: () => void
  onAdd: (tile: Tile, origin: DOMRect) => void
  onWishlist: (tile: Tile, origin: DOMRect) => void
  saved: boolean
}) {
  const isPresent = useIsPresent()
  const [qty, setQty] = useState(1)
  const [color, setColor] = useState<'dark' | 'cream'>('dark')
  const imgWrapRef = useRef<HTMLDivElement | null>(null)
  const priceNum = parseFloat(tile.price.replace(/[^\d.]/g, '')) || 0
  const totalNum = priceNum * qty
  const totalHasCents = Math.round(totalNum * 100) % 100 !== 0
  const total = totalHasCents ? totalNum.toFixed(2) : String(Math.round(totalNum))
  const category = deriveCategory(tile.titleTail)

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.24, ease: MODAL_EASE }}
      style={{ pointerEvents: isPresent ? 'auto' : 'none' }}
    >
      <motion.button
        aria-label="close"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4, ease: MODAL_EASE }}
        style={{ backgroundColor: 'rgba(255, 255, 255, 0.88)' }}
      />

      <motion.div
        role="dialog"
        className="relative w-full max-w-[1100px] h-[100dvh] md:h-[min(720px,88vh)] bg-white shadow-[0_20px_60px_-20px_rgba(0,0,0,0.18),0_0_0_1px_rgba(0,0,0,0.04)] flex flex-col md:flex-row overflow-hidden rounded-none md:rounded-2xl"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.26, ease: MODAL_EASE }}
        style={{ transformOrigin: 'center center' }}
      >
        <button
          onClick={onClose}
          aria-label="close"
          className="absolute top-4 right-4 z-20 h-10 w-10 rounded-full flex items-center justify-center text-[#242529] md:text-[#858585] hover:text-[#242529] bg-white/80 md:bg-transparent hover:bg-[#F7F7F7] cursor-pointer backdrop-blur-sm md:backdrop-blur-0"
          style={{ transition: 'color 160ms ease, background-color 160ms ease' }}
        >
          <svg width={14} height={14} viewBox="0 0 16 16" fill="none">
            <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>

        <div ref={imgWrapRef} className="relative w-full md:flex-[3] aspect-square md:aspect-auto shrink-0 overflow-hidden flex items-center justify-center md:border-r md:border-[#F0F0F0]">
          <div className="relative w-[72%] aspect-square overflow-hidden rounded-[12px]">
            <ProductImage src={tile.image} color={tile.moodColor} alt={`${tile.headline} ${tile.titleTail}`} fit="cover" />
          </div>
        </div>

        <div className="relative flex-1 md:flex-[2] min-w-0 min-h-0 flex flex-col">

          <div className="flex-1 min-h-0 overflow-y-auto px-5 md:px-8 pt-6 md:pt-8 pb-6 flex flex-col gap-5">
            <div className="flex flex-col gap-3">
              <div className="text-[12px] leading-[16px] font-medium tracking-[0] text-[#858585]">
                {capitalize(category)} — {tile.brand}
              </div>
              <h2 className="text-[24px] leading-[30px] tracking-[-0.012em] font-medium text-[#242529]" style={{ textWrap: 'balance' }}>
                {capitalize(tile.headline)} {tile.titleTail}
              </h2>
              <div className="text-[16px] leading-[22px] font-semibold tracking-[-0.005em] text-[#242529]">
                {tile.price}
              </div>
            </div>

            <p className="text-[13px] leading-[18px] font-medium tracking-[0] text-[#525252]" style={{ textWrap: 'pretty' }}>
              {tile.description}
            </p>

            <div className="flex flex-col gap-2 pt-1">
              <div className="text-[12px] leading-[16px] font-medium tracking-[0] text-[#858585]">
                Color: <span className="text-[#242529]">{color === 'dark' ? 'Graphite' : 'Cream'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Swatch
                  fill="#242529"
                  selected={color === 'dark'}
                  onClick={() => setColor('dark')}
                  label="Graphite"
                />
                <Swatch
                  fill="#EFE4D2"
                  selected={color === 'cream'}
                  onClick={() => setColor('cream')}
                  label="Cream"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="text-[12px] leading-[16px] font-medium tracking-[0] text-[#858585]">Quantity</div>
              <div className="inline-flex items-center bg-[#F7F7F7] rounded-full self-start h-9 px-1">
                <QtyBtn
                  ariaLabel="decrease"
                  onClick={() => setQty(q => Math.max(1, q - 1))}
                  disabled={qty === 1}
                >
                  <svg width={10} height={2} viewBox="0 0 10 2" fill="none">
                    <path d="M1 1h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                </QtyBtn>
                <span className="w-7 text-center text-[13px] leading-[18px] font-medium text-[#242529]">
                  {qty}
                </span>
                <QtyBtn ariaLabel="increase" onClick={() => setQty(q => q + 1)}>
                  <svg width={10} height={10} viewBox="0 0 10 10" fill="none">
                    <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                </QtyBtn>
              </div>
            </div>

          </div>

          <div className="shrink-0 border-t border-[#F0F0F0] px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] flex items-stretch gap-2">
            <button
              aria-label={saved ? 'remove from wishlist' : 'save to wishlist'}
              aria-pressed={saved}
              onClick={() => {
                const rect = imgWrapRef.current?.getBoundingClientRect()
                if (!rect) return
                onWishlist(tile, rect)
              }}
              className="shrink-0 w-12 rounded-full flex items-center justify-center border border-[#EDEDED] text-[#242529] hover:bg-[#F7F7F7] cursor-pointer"
              style={{ transition: 'background-color 160ms ease, color 160ms ease' }}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={saved ? 'saved' : 'unsaved'}
                  initial={{ opacity: 0, filter: 'blur(3px)' }}
                  animate={{ opacity: 1, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, filter: 'blur(3px)' }}
                  transition={{ duration: 0.16, ease: MODAL_EASE }}
                  className="inline-flex"
                  style={{ color: saved ? '#E5484D' : undefined }}
                >
                  {saved ? (
                    <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                      <path d="M12 4.32781C12.1935 4.18729 12.4386 4.02609 12.7319 3.86553C13.5214 3.43347 14.6725 3 16.1111 3C17.5979 3 19.0829 3.5977 20.1921 4.78484C21.3047 5.97563 22 7.71515 22 9.9375C22 13.2536 19.6489 16.0247 17.3927 17.8948C16.2446 18.8464 15.0735 19.6049 14.1357 20.1276C13.6669 20.3889 13.2492 20.5954 12.9151 20.7391C12.7487 20.8106 12.5947 20.8702 12.4603 20.9134C12.3511 20.9485 12.1754 21 12 21C11.8246 21 11.6489 20.9485 11.5397 20.9134C11.4053 20.8702 11.2513 20.8106 11.0849 20.7391C10.7508 20.5954 10.3331 20.3889 9.86432 20.1276C8.92652 19.6049 7.75539 18.8464 6.60732 17.8948C4.35114 16.0247 2 13.2536 2 9.9375C2 7.71515 2.69528 5.97563 3.80789 4.78484C4.91708 3.5977 6.40208 3 7.88889 3C9.32752 3 10.4786 3.43347 11.2681 3.86553C11.5614 4.02609 11.8065 4.18729 12 4.32781Z" fill="currentColor" />
                    </svg>
                  ) : (
                    <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                      <path d="M21.25 9.9375C21.25 15.8672 12.7708 20.25 12 20.25C11.2292 20.25 2.75 15.8672 2.75 9.9375C2.75 5.8125 5.31944 3.75 7.88889 3.75C10.4583 3.75 12 5.29688 12 5.29688C12 5.29688 13.5417 3.75 16.1111 3.75C18.6806 3.75 21.25 5.8125 21.25 9.9375Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                    </svg>
                  )}
                </motion.span>
              </AnimatePresence>
            </button>
            <button
              onClick={() => {
                const rect = imgWrapRef.current?.getBoundingClientRect()
                if (!rect) return
                for (let i = 0; i < qty; i++) {
                  setTimeout(() => onAdd(tile, rect), i * 90)
                }
              }}
              className="flex-1 rounded-full bg-[#242529] text-white text-[14px] leading-[20px] font-medium tracking-[0] py-3.5 hover:bg-[#525252] cursor-pointer"
              style={{ transition: 'background-color 160ms ease' }}
            >
              Add to cart · ${total}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

function Swatch({
  fill, selected, onClick, label,
}: {
  fill: string
  selected: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
      className="relative h-7 w-7 rounded-full cursor-pointer before:content-[''] before:absolute before:inset-[-6px]"
      style={{
        backgroundColor: fill,
        boxShadow: selected
          ? '0 0 0 1.5px #242529, inset 0 0 0 2px #ffffff'
          : '0 0 0 1px rgba(36,37,41,0.08)',
        transition: 'box-shadow 160ms ease',
      }}
    />
  )
}

function QtyBtn({
  children, ariaLabel, onClick, disabled,
}: {
  children: React.ReactNode
  ariaLabel: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      className="relative h-7 w-7 flex items-center justify-center rounded-full text-[#242529] hover:bg-white disabled:text-[#BFBFBF] disabled:hover:bg-transparent cursor-pointer disabled:cursor-default before:content-[''] before:absolute before:inset-[-6px]"
      style={{ transition: 'background-color 160ms ease' }}
    >
      {children}
    </button>
  )
}
