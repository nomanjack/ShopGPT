'use client'

import { AnimatePresence, motion } from 'motion/react'
import type { Tile } from './types'
import { MoodSurface, EASE_OUT } from './atoms'
import { HoverTip } from './hover-tip'

function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

export function AccountView({
  wishlist, onRemove, onMoveToCart, onOpen,
}: {
  wishlist: Tile[]
  onRemove: (id: string) => void
  onMoveToCart: (tile: Tile) => void
  onOpen?: (tile: Tile) => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.2, 1, 0.3, 1] }}
      className="flex flex-col gap-10"
    >
      <Section label="Basic information">
        <Row label="Name" value="Alex Morgan" />
        <Row label="Email" value="alex.morgan@example.com" />
        <Row label="Phone" value="Not added" muted />
      </Section>

      <Divider />

      <Section label="Shipping">
        <Row label="Address" value="847 President St, Apt 3" />
        <Row label="City" value="Brooklyn, NY 11215" />
        <Row label="Country" value="United States" />
      </Section>

      <Divider />

      <Section label="Payment">
        <Row label="Method" value="Apple Pay" />
        <Row label="Backup card" value="Visa ···· 4242" />
      </Section>

      <Divider />

      <section className="flex flex-col gap-3">
        <SectionHeader
          label="Wishlist"
          count={wishlist.length}
          countLabel={wishlist.length === 1 ? 'item' : 'items'}
        />
        {wishlist.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8">
            <div
              className="h-12 w-12 rounded-full flex items-center justify-center"
              style={{ backgroundColor: '#F7F7F7' }}
            >
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                <path d="M21.25 9.9375C21.25 15.8672 12.7708 20.25 12 20.25C11.2292 20.25 2.75 15.8672 2.75 9.9375C2.75 5.8125 5.31944 3.75 7.88889 3.75C10.4583 3.75 12 5.29688 12 5.29688C12 5.29688 13.5417 3.75 16.1111 3.75C18.6806 3.75 21.25 5.8125 21.25 9.9375Z" stroke="#BFBFBF" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="text-[13px] leading-[18px] font-medium text-[#858585]">Nothing saved yet</div>
          </div>
        ) : (
          <ul className="flex flex-col gap-3 md:gap-5">
            <AnimatePresence initial={false}>
              {wishlist.map(t => (
                <motion.li
                  key={t.id}
                  layout
                  initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, x: -20, filter: 'blur(4px)' }}
                  transition={{ duration: 0.26, ease: EASE_OUT }}
                  className="flex items-center gap-3"
                >
                  <button
                    type="button"
                    onClick={() => onOpen?.(t)}
                    aria-label={`open ${t.brand} ${t.headline} ${t.titleTail}`}
                    className="flex-1 min-w-0 flex items-center gap-3 text-left cursor-pointer"
                  >
                    <div className="relative h-14 w-14 rounded-[10px] overflow-hidden shrink-0 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1),0_1px_2px_rgba(0,0,0,0.06)]">
                      <MoodSurface />
                      {t.image && (
                        <img
                          src={t.image}
                          alt=""
                          draggable={false}
                          className="absolute inset-0 h-full w-full object-cover select-none pointer-events-none"
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] leading-[16px] font-medium text-[#858585] tracking-[0] truncate">{t.brand}</div>
                      <div className="text-[13px] leading-[18px] font-medium tracking-[0] truncate">
                        {capitalize(t.headline)} {t.titleTail}
                      </div>
                      <div className="text-[12px] leading-[16px] font-medium text-[#858585] tracking-[0] mt-0.5">
                        {t.price}
                      </div>
                    </div>
                  </button>
                  <HoverTip label="Add to cart" placement="top">
                    <button
                      onClick={() => onMoveToCart(t)}
                      aria-label="add to cart"
                      className="relative shrink-0 h-10 w-10 -m-2 flex items-center justify-center rounded-full text-[#858585] hover:text-[#242529] cursor-pointer"
                      style={{ transition: 'color 160ms ease' }}
                    >
                      <BagIcon />
                    </button>
                  </HoverTip>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </section>
    </motion.div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader label={label} />
      <dl className="flex flex-col">{children}</dl>
    </section>
  )
}

function SectionHeader({
  label, count, countLabel,
}: {
  label: string
  count?: number
  countLabel?: string
}) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="text-[12px] leading-[16px] font-medium tracking-[0] text-[#858585]">
        {label}
      </h2>
      {typeof count === 'number' ? (
        <span className="text-[12px] leading-[16px] font-medium tracking-[0] text-[#BFBFBF]">
          {count}{countLabel ? ` ${countLabel}` : ''}
        </span>
      ) : null}
    </div>
  )
}

function Row({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3 border-t border-[#F0F0F0] first:border-t-0">
      <dt className="shrink-0 text-[12px] leading-[16px] font-medium tracking-[0] text-[#858585]">{label}</dt>
      <dd className="min-w-0 text-right text-[13px] leading-[18px] font-medium tracking-[0] truncate"
        style={{ color: muted ? '#BFBFBF' : '#242529' }}
      >
        {value}
      </dd>
    </div>
  )
}

function Divider() {
  return <div aria-hidden className="h-px w-full bg-[#F0F0F0]" />
}

function BagIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <path fillRule="evenodd" clipRule="evenodd" d="M7.99884 6C7.99884 3.79086 9.7897 2 11.9988 2C14.208 2 15.9988 3.79086 15.9988 6V7H16.0233C17.3864 7 18.5438 7.99858 18.7436 9.34699L20.151 18.847C20.3971 20.5081 19.11 22 17.4307 22H6.56696C4.8877 22 3.60056 20.5081 3.84665 18.847L5.25406 9.34699C5.45382 7.99858 6.61123 7 7.97437 7H7.99884V6ZM9.49884 7H14.4988V6C14.4988 4.61929 13.3796 3.5 11.9988 3.5C10.6181 3.5 9.49884 4.61929 9.49884 6V7Z" fill="currentColor" />
    </svg>
  )
}
