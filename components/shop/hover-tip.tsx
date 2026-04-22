'use client'

import { useEffect, useRef, useState } from 'react'

// Shared across instances so moving from one trigger to another skips the delay.
let warmUntil = 0

export function HoverTip({
  label, children, placement = 'bottom',
}: {
  label: string
  children: React.ReactNode
  placement?: 'bottom' | 'top'
}) {
  const [open, setOpen] = useState(false)
  const timer = useRef<number | null>(null)
  const [canHover, setCanHover] = useState(false)
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)')
    setCanHover(mq.matches)
    const onChange = () => setCanHover(mq.matches)
    mq.addEventListener?.('change', onChange)
    const rmq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(rmq.matches)
    const onRm = () => setReduced(rmq.matches)
    rmq.addEventListener?.('change', onRm)
    return () => {
      mq.removeEventListener?.('change', onChange)
      rmq.removeEventListener?.('change', onRm)
    }
  }, [])

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current)
  }, [])

  const show = () => {
    if (!canHover) return
    if (timer.current) window.clearTimeout(timer.current)
    const delay = Date.now() < warmUntil ? 0 : 400
    timer.current = window.setTimeout(() => setOpen(true), delay)
  }
  const hide = () => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = null
    if (open) warmUntil = Date.now() + 500
    setOpen(false)
  }

  const pos = placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
  const origin = placement === 'top' ? 'center bottom' : 'center top'
  const restingY = placement === 'top' ? '2px' : '-2px'

  return (
    <span
      className="relative inline-flex"
      onPointerEnter={show}
      onPointerLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      <span
        role="tooltip"
        aria-hidden={!open}
        className={`pointer-events-none absolute left-1/2 -translate-x-1/2 ${pos} rounded-[8px] bg-[#242529] px-2 py-1 text-[11px] leading-[14px] font-medium tracking-[0] text-white whitespace-nowrap shadow-[0_8px_24px_-12px_rgba(0,0,0,0.28)] z-50`}
        style={{
          opacity: open ? 1 : 0,
          transform: open || reduced ? 'scale(1) translateY(0)' : `scale(0.97) translateY(${restingY})`,
          transformOrigin: origin,
          transition: reduced
            ? 'opacity 80ms linear'
            : 'opacity 150ms cubic-bezier(0.23, 1, 0.32, 1), transform 150ms cubic-bezier(0.23, 1, 0.32, 1)',
        }}
      >
        {label}
      </span>
    </span>
  )
}
