'use client'

import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { CartLine } from './types'
import { MoodSurface, EASE_OUT } from './atoms'
import { streamText } from '@/lib/stream-text'
import { Commentary } from './commentary'
import { ConfirmShader } from './confirm-shader'

function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

function orderNumber(lines: CartLine[], now: number) {
  const seed = lines.reduce((acc, l) => acc + l.tile.id.charCodeAt(0) + l.qty, 0) + now
  const n = (seed * 9301 + 49297) % 233280
  return `A${n.toString(36).toUpperCase().padStart(4, '0').slice(0, 4)}`
}

export function CheckoutConfirmed({
  lines, onDone,
}: {
  lines: CartLine[]
  onDone: () => void
}) {
  const order = useMemo(() => orderNumber(lines, Date.now()), [lines])
  const subtotalNum = lines.reduce((acc, l) => {
    const n = parseFloat(l.tile.price.replace(/[^\d.]/g, '')) || 0
    return acc + n * l.qty
  }, 0)
  const hasCents = Math.round(subtotalNum * 100) % 100 !== 0
  const subtotal = hasCents ? subtotalNum.toFixed(2) : String(Math.round(subtotalNum))
  const itemCount = lines.reduce((acc, l) => acc + l.qty, 0)

  const steps = [
    `Authorizing payment · $${subtotal}`,
    'Emailing your receipt',
    'Reserving pickup window',
    'Pinging the shop',
  ]

  const headline = 'All set. Pickup Thursday, 2–4pm.'
  const detail = `847 President St, Brooklyn. Receipt is in your inbox. I'll nudge you an hour before.`

  const [activeIdx, setActiveIdx] = useState(-2)
  const [streamed, setStreamed] = useState('')
  const [introStarted, setIntroStarted] = useState(false)
  const [summaryExpanded, setSummaryExpanded] = useState(false)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const run = async () => {
      await new Promise(r => { timer = setTimeout(r, 420) })
      for (let i = 0; i < steps.length; i++) {
        if (cancelled) return
        setActiveIdx(i)
        const dur = 950 + Math.random() * 500
        await new Promise(r => { timer = setTimeout(r, dur) })
      }
      if (cancelled) return
      setActiveIdx(-1)
      await new Promise(r => { timer = setTimeout(r, 260) })
      if (cancelled) return
      setIntroStarted(true)
    }
    run()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!introStarted) return
    const cancel = streamText(detail, setStreamed, { intervalMs: 12 })
    return cancel
  }, [introStarted, detail])

  const done = activeIdx === -1
  const introDone = streamed === detail

  return (
    <motion.main
      initial={{ opacity: 0, filter: 'blur(8px)' }}
      animate={{ opacity: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, filter: 'blur(8px)' }}
      transition={{ duration: 0.36, ease: EASE_OUT }}
      className="relative min-h-screen bg-white text-[#242529] font-sans antialiased overflow-hidden"
    >
      {introStarted && (
        <div className="pointer-events-none absolute inset-0 z-0">
          <ConfirmShader />
        </div>
      )}
      <div className="relative z-10 mx-auto w-full max-w-[576px] px-5 pt-10 pb-24 flex flex-col gap-5">
        <motion.div
          initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.28, ease: EASE_OUT }}
          className="self-end max-w-[80%] rounded-[20px] rounded-br-[6px] bg-[#F0F0F0] px-3.5 py-2 text-[13px] leading-[18px] font-medium"
        >
          place order
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.38, ease: EASE_OUT, delay: 0.14 }}
          className="grid grid-cols-3 gap-4"
        >
          {lines.map((l) => (
            <div key={l.tile.id} className="flex flex-col gap-2">
              <div
                className="relative aspect-square overflow-hidden"
                style={{
                  borderRadius: 12,
                  boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.04), 0 8px 24px -12px rgba(0,0,0,0.12)',
                }}
              >
                <MoodSurface />
                {l.tile.image && (
                  <img
                    src={l.tile.image}
                    alt=""
                    draggable={false}
                    className="absolute inset-0 h-full w-full object-cover select-none pointer-events-none"
                  />
                )}
                {l.qty > 1 && (
                  <div className="absolute top-1.5 right-1.5 rounded-full bg-black/75 text-white text-[12px] leading-[16px] font-medium px-1.5 py-0.5">
                    ×{l.qty}
                  </div>
                )}
              </div>
              <div className="flex items-baseline gap-2 px-0.5">
                <div className="flex-1 min-w-0 text-[13px] leading-[18px] font-medium truncate">
                  {capitalize(l.tile.headline)}
                </div>
                <div className="shrink-0 text-[13px] leading-[18px] font-medium">
                  {l.tile.price}
                </div>
              </div>
              <div className="text-[12px] leading-[16px] font-medium text-[#858585] truncate px-0.5">
                {l.tile.brand}
              </div>
            </div>
          ))}
        </motion.div>

        <Commentary
          steps={steps}
          activeIdx={activeIdx}
          summaryLabel={`Confirmed · order #${order}`}
          expanded={summaryExpanded}
          onToggle={() => setSummaryExpanded(e => !e)}
        />

        <AnimatePresence>
          {introStarted && (
            <motion.div
              key="intro-block"
              initial={{ opacity: 0, filter: 'blur(4px)', y: 4 }}
              animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
              transition={{ duration: 0.36, ease: EASE_OUT }}
              className="flex flex-col gap-1.5"
            >
              <div className="text-[16px] leading-[22px] font-semibold tracking-[-0.01em]">
                {headline}
              </div>
              <div className="text-[13px] leading-[18px] font-medium text-[#525252] min-h-[18px]">
                {streamed}
                {!introDone && (
                  <motion.span
                    aria-hidden
                    animate={{ opacity: [1, 0] }}
                    transition={{ duration: 0.5, repeat: Infinity, repeatType: 'reverse' }}
                    className="ml-[1px]"
                  >|</motion.span>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {introDone && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.34, ease: EASE_OUT, delay: 0.1 }}
              className="flex flex-col gap-4 pt-1"
            >
              <span className="text-[12px] leading-[16px] font-medium text-[#858585]">
                {itemCount} {itemCount === 1 ? 'item' : 'items'} · ${subtotal} paid
              </span>
              <div aria-hidden className="h-px w-full bg-[#ECECEC]" />
              <button
                onClick={onDone}
                className="self-start rounded-full bg-white text-[13px] leading-[18px] font-medium text-[#242529] px-4 h-8 cursor-pointer"
                style={{
                  boxShadow: '0 0 0 1px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.10)',
                  transition: 'box-shadow 160ms ease',
                }}
              >
                Keep shopping
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.main>
  )
}
