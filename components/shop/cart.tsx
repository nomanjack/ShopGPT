'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useIsPresent } from 'motion/react'
import type { CartLine, RecentOrder } from './types'
import { MoodSurface, EASE_OUT, EASE_DRAWER } from './atoms'
import { shiftHex, safeHex } from './utils'

function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

function formatPlaced(iso: string) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function CartButton({
  count, onClick,
}: { count: number; onClick: () => void }) {
  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.button
          onClick={onClick}
          aria-label={`cart, ${count} item${count === 1 ? '' : 's'}`}
          initial={{ opacity: 0, scale: 0.9, filter: 'blur(6px)' }}
          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, scale: 0.9, filter: 'blur(6px)' }}
          transition={{ duration: 0.24, ease: EASE_OUT }}
          className="fixed top-4 right-4 z-30 h-10 w-10 rounded-full bg-black text-white flex items-center justify-center shadow-[0_4px_20px_-6px_rgba(0,0,0,0.35)]"
        >
          <BagIcon />
          <motion.span
            key={count}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.22, ease: EASE_OUT }}
            className="absolute -top-1 -right-1 h-[18px] min-w-[18px] px-1 rounded-full bg-white text-[#242529] text-[10.5px] leading-none flex items-center justify-center font-medium"
          >
            {count}
          </motion.span>
        </motion.button>
      )}
    </AnimatePresence>
  )
}

export function CartSheet({
  open, lines, onClose, onRemove, onCheckout,
}: {
  open: boolean
  lines: CartLine[]
  onClose: () => void
  onRemove: (id: string) => void
  onCheckout: () => void
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <CartSheetInner
          lines={lines}
          onClose={onClose}
          onRemove={onRemove}
          onCheckout={onCheckout}
        />
      )}
    </AnimatePresence>
  )
}

function CartSheetInner({
  lines, onClose, onRemove, onCheckout,
}: {
  lines: CartLine[]
  onClose: () => void
  onRemove: (id: string) => void
  onCheckout: () => void
}) {
  const isPresent = useIsPresent()
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [fade, setFade] = useState({ top: false, bottom: false })

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const update = () => {
      const atTop = el.scrollTop <= 0
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1
      setFade({ top: !atTop, bottom: !atBottom })
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [lines.length])

  const subtotalNum = lines.reduce((acc, l) => {
    const n = parseFloat(l.tile.price.replace(/[^\d.]/g, '')) || 0
    return acc + n * l.qty
  }, 0)
  const hasCents = Math.round(subtotalNum * 100) % 100 !== 0
  const subtotal = hasCents ? subtotalNum.toFixed(2) : String(Math.round(subtotalNum))

  return (
    <motion.div
      className="fixed inset-0 z-40"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.24, ease: [0.2, 1, 0.3, 1] }}
      style={{ pointerEvents: isPresent ? 'auto' : 'none' }}
    >
      <motion.button
        aria-label="close cart"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.24, ease: [0.2, 1, 0.3, 1] }}
        style={{ backgroundColor: 'rgba(255, 255, 255, 0.88)' }}
      />

          <motion.div
            role="dialog"
            className="absolute inset-x-0 bottom-0 mx-auto max-w-[520px] rounded-t-[20px] bg-white shadow-[0_-10px_40px_-12px_rgba(0,0,0,0.25)] h-[64vh] flex flex-col"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.35, ease: EASE_DRAWER }}
          >
            <div className="flex items-center justify-center pt-2.5 pb-1">
              <div className="h-1 w-9 rounded-full bg-[#ECECEC]" />
            </div>
            <div className="flex items-baseline justify-between px-5 pt-1 pb-5">
              <h3 className="text-[17px] tracking-[-0.01em] font-medium">Cart</h3>
              <div className="text-[12px] leading-[16px] font-medium text-[#858585] tracking-[0]">
                {lines.length} item{lines.length === 1 ? '' : 's'}
              </div>
            </div>

            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-5"
              style={{
                WebkitMaskImage: `linear-gradient(to bottom, ${fade.top ? 'transparent 0, black 18px' : 'black 0'}, ${fade.bottom ? 'black calc(100% - 18px), transparent 100%' : 'black 100%'})`,
                maskImage: `linear-gradient(to bottom, ${fade.top ? 'transparent 0, black 18px' : 'black 0'}, ${fade.bottom ? 'black calc(100% - 18px), transparent 100%' : 'black 100%'})`,
                transition: 'mask-image 160ms ease, -webkit-mask-image 160ms ease',
              }}
            >
              {lines.length === 0 ? (
                <div className="flex flex-col gap-3 pt-2 pb-4">
                  {[0, 1, 2].map(i => (
                    <div
                      key={i}
                      className="flex items-center gap-3"
                      style={{ opacity: 1 - i * 0.22 }}
                    >
                      <div
                        className="h-14 w-14 rounded-[10px] shrink-0"
                        style={{ backgroundColor: '#f5f5f5' }}
                      />
                      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                        <div
                          className="h-[10px] w-[38%] rounded-full"
                          style={{ backgroundColor: '#f5f5f5' }}
                        />
                        <div
                          className="h-[12px] w-[72%] rounded-full"
                          style={{ backgroundColor: '#f5f5f5' }}
                        />
                        <div
                          className="h-[10px] w-[22%] rounded-full"
                          style={{ backgroundColor: '#f5f5f5' }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <ul className="flex flex-col gap-3 pb-3">
                  <AnimatePresence initial={false}>
                    {lines.map(l => (
                      <motion.li
                        key={l.tile.id}
                        layout
                        initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
                        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                        exit={{ opacity: 0, x: -20, filter: 'blur(4px)' }}
                        transition={{ duration: 0.26, ease: EASE_OUT }}
                        className="flex items-center gap-3"
                      >
                        <div className="relative h-14 w-14 rounded-[10px] overflow-hidden shrink-0 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1),0_1px_2px_rgba(0,0,0,0.06)]">
                          <MoodSurface />
                          {l.tile.image && (
                            <img
                              src={l.tile.image}
                              alt=""
                              draggable={false}
                              className="absolute inset-0 h-full w-full object-cover select-none pointer-events-none"
                            />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] leading-[16px] font-medium text-[#858585] tracking-[0] truncate">{l.tile.brand}</div>
                          <div className="text-[13px] leading-[18px] font-medium tracking-[0] truncate">
                            {capitalize(l.tile.headline)} {l.tile.titleTail}
                          </div>
                          <div className="text-[12px] leading-[16px] font-medium text-[#858585] tracking-[0] mt-0.5">
                            {l.qty > 1 ? `${l.tile.price} · qty ${l.qty}` : l.tile.price}
                          </div>
                        </div>
                        <button
                          onClick={() => onRemove(l.tile.id)}
                          aria-label="delete"
                          className="relative shrink-0 h-10 w-10 -m-2 flex items-center justify-center rounded-full text-[#858585] hover:text-[#242529] cursor-pointer"
                          style={{ transition: 'color 160ms ease' }}
                        >
                          <DeleteIcon />
                        </button>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </div>

            <div className="border-t border-[#F0F0F0] px-5 pt-4 pb-6 flex flex-col gap-3">
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] leading-[18px] font-medium text-[#858585] tracking-[0]">Subtotal</span>
                <span className="text-[16px] leading-[22px] font-semibold tracking-[-0.01em]">${subtotal}</span>
              </div>
              <button
                onClick={onCheckout}
                disabled={lines.length === 0}
                className="w-full rounded-full bg-[#242529] text-white text-[14px] leading-[20px] font-medium tracking-[0] py-3 hover:bg-[#525252] disabled:opacity-40 cursor-pointer disabled:cursor-default"
                style={{ transition: 'background-color 160ms ease' }}
              >
                Checkout
              </button>
            </div>
          </motion.div>
    </motion.div>
  )
}

export function OrderSheet({
  order, onClose,
}: {
  order: RecentOrder | null
  onClose: () => void
}) {
  useEffect(() => {
    if (!order) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [order, onClose])

  return (
    <AnimatePresence>
      {order && <OrderSheetInner order={order} onClose={onClose} />}
    </AnimatePresence>
  )
}

function OrderSheetInner({
  order, onClose,
}: {
  order: RecentOrder
  onClose: () => void
}) {
  const isPresent = useIsPresent()

  const statusLabel = order.status === 'processing'
    ? 'processing'
    : order.status === 'shipped'
    ? 'shipped'
    : 'delivered'

  const statusDot = order.status === 'delivered'
    ? '#2f8a4e'
    : order.status === 'shipped'
    ? '#c58a2e'
    : '#858585'

  return (
    <motion.div
      className="fixed inset-0 z-40"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.24, ease: [0.2, 1, 0.3, 1] }}
      style={{ pointerEvents: isPresent ? 'auto' : 'none' }}
    >
      <motion.button
        aria-label="close order"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.24, ease: [0.2, 1, 0.3, 1] }}
        style={{ backgroundColor: 'rgba(255, 255, 255, 0.88)' }}
      />

      <motion.div
        role="dialog"
        className="absolute inset-x-0 bottom-0 mx-auto max-w-[520px] rounded-t-[20px] bg-white shadow-[0_-10px_40px_-12px_rgba(0,0,0,0.25)] min-h-[64vh] max-h-[85vh] flex flex-col"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ duration: 0.35, ease: EASE_DRAWER }}
      >
        <div className="flex items-center justify-center pt-2.5 pb-1">
          <div className="h-1 w-9 rounded-full bg-[#ECECEC]" />
        </div>
        <div className="flex items-baseline justify-between px-5 pt-1 pb-3">
          <h3 className="text-[17px] tracking-[-0.01em] font-medium">Order</h3>
          <div className="text-[12px] leading-[16px] font-medium text-[#858585] tracking-[0]">
            {formatPlaced(order.placed)}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-4 flex flex-col gap-5">
          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-2">
              <div
                className="relative aspect-square overflow-hidden"
                style={{
                  borderRadius: 12,
                  boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.04), 0 8px 24px -12px rgba(0,0,0,0.12)',
                  background: `linear-gradient(160deg, ${safeHex(order.color)} 0%, ${shiftHex(safeHex(order.color), -18)} 100%)`,
                }}
              />
              <div className="flex items-baseline gap-2 px-0.5">
                <div className="flex-1 min-w-0 text-[13px] leading-[18px] font-medium truncate">
                  {order.product}
                </div>
                <div className="shrink-0 text-[13px] leading-[18px] font-medium">
                  {order.price}
                </div>
              </div>
              <div className="text-[12px] leading-[16px] font-medium text-[#858585] truncate px-0.5">
                {order.brand}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-[7px] w-[7px] rounded-full"
              style={{ backgroundColor: statusDot }}
            />
            <span className="text-[13px] leading-[18px] font-medium tracking-[0] text-[#242529] capitalize">
              {statusLabel}
            </span>
            {order.status === 'delivered' && order.deliveredOn && (
              <span className="text-[12px] leading-[16px] font-medium text-[#858585] tracking-[0]">
                · {order.deliveredOn}
              </span>
            )}
            {order.status === 'shipped' && order.eta && (
              <span className="text-[12px] leading-[16px] font-medium text-[#858585] tracking-[0]">
                · arriving {order.eta}
              </span>
            )}
            {order.status === 'processing' && order.eta && (
              <span className="text-[12px] leading-[16px] font-medium text-[#858585] tracking-[0]">
                · ships {order.eta}
              </span>
            )}
          </div>

          <dl className="flex flex-col gap-3 border-t border-[#F0F0F0] pt-4">
            {order.carrier && (
              <OrderRow label="Carrier" value={order.carrier} />
            )}
            {order.tracking && (
              <OrderRow label="Tracking" value={order.tracking} />
            )}
            <OrderRow label="Ship to" value={order.shipTo} />
            <OrderRow label="Payment" value={order.card} />
            <OrderRow label="Total" value={order.price} />
          </dl>
        </div>
      </motion.div>
    </motion.div>
  )
}

function OrderRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-[12px] leading-[16px] font-medium text-[#858585] tracking-[0] shrink-0">{label}</dt>
      <dd
        className="text-[13px] leading-[18px] font-medium text-[#242529] tracking-[0] text-right min-w-0"
      >
        {value}
      </dd>
    </div>
  )
}

function BagIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <path fillRule="evenodd" clipRule="evenodd" d="M7.99884 6C7.99884 3.79086 9.7897 2 11.9988 2C14.208 2 15.9988 3.79086 15.9988 6V7H16.0233C17.3864 7 18.5438 7.99858 18.7436 9.34699L20.151 18.847C20.3971 20.5081 19.11 22 17.4307 22H6.56696C4.8877 22 3.60056 20.5081 3.84665 18.847L5.25406 9.34699C5.45382 7.99858 6.61123 7 7.97437 7H7.99884V6ZM9.49884 7H14.4988V6C14.4988 4.61929 13.3796 3.5 11.9988 3.5C10.6181 3.5 9.49884 4.61929 9.49884 6V7Z" fill="currentColor" />
    </svg>
  )
}

function DeleteIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <path d="M4.75 6.5L5.65512 19.3901C5.72868 20.4377 6.6 21.25 7.6502 21.25H16.3498C17.4 21.25 18.2713 20.4377 18.3449 19.3901L19.25 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 10.5V16.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 10.5V16.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.25 5.75H20.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.52441 5.58289C8.7306 3.84652 10.2079 2.5 11.9998 2.5C13.7917 2.5 15.269 3.84652 15.4752 5.58289" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
