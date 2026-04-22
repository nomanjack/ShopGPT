'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, animate, motion } from 'motion/react'
import { EASE_OUT } from './atoms'

function AnimatedCount({ to, duration = 0.7 }: { to: number; duration?: number }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    const controls = animate(0, to, {
      duration,
      ease: [0.2, 1, 0.3, 1],
      onUpdate: (v) => setN(Math.round(v)),
    })
    return () => controls.stop()
  }, [to, duration])
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{n}</span>
}

// While the assistant is thinking, a status line cycles through a few short
// messages with a gentle gradient sweeping across the text. It keeps the
// wait feeling intentional instead of blank.
const EASE_SOFT = [0.2, 1, 0.3, 1] as const
const EASE_SWEEP = [0.33, 0, 0.2, 1] as const

function Chevron() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path fillRule="evenodd" clipRule="evenodd" d="M9.46967 7.46967C9.76256 7.17678 10.2374 7.17678 10.5303 7.46967L13.8232 10.7626C14.5066 11.446 14.5066 12.554 13.8232 13.2374L10.5303 16.5303C10.2374 16.8232 9.76256 16.8232 9.46967 16.5303C9.17678 16.2374 9.17678 15.7626 9.46967 15.4697L12.7626 12.1768C12.8602 12.0791 12.8602 11.9209 12.7626 11.8232L9.46967 8.53033C9.17678 8.23744 9.17678 7.76256 9.46967 7.46967Z" fill="currentColor" />
    </svg>
  )
}

const SWEEP_GRADIENT =
  'linear-gradient(100deg, #8f8f8f 0%, #8f8f8f 40%, #c8c8c8 48%, #e2e2e2 50%, #c8c8c8 52%, #8f8f8f 60%, #8f8f8f 100%)'

export function Commentary({
  steps, activeIdx, summaryLabel, summaryCount, expanded, onToggle,
}: {
  steps: string[]
  activeIdx: number
  summaryLabel: ReactNode
  summaryCount?: number | null
  expanded: boolean
  onToggle: () => void
}) {
  const done = activeIdx === -1

  if (done) {
    return (
      <motion.div
        key="summary"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, ease: EASE_OUT }}
      >
        <button
          onClick={onToggle}
          aria-expanded={expanded}
          className="inline-flex items-center gap-1 md:gap-1.5 text-[12px] leading-[16px] font-medium tracking-[0] text-[#858585] hover:text-[#525252] cursor-pointer"
          style={{ transition: 'color 160ms ease' }}
        >
          <span>
            {summaryCount != null
              ? <>Searched <AnimatedCount to={summaryCount} /> stores</>
              : summaryLabel}
          </span>
          <motion.span
            animate={{ rotate: expanded ? 90 : 0 }}
            transition={{ duration: 0.28, ease: EASE_SOFT }}
            className="inline-flex"
          >
            <Chevron />
          </motion.span>
        </button>
        <motion.div
          initial={false}
          animate={{ height: expanded ? 'auto' : 0 }}
          transition={{ duration: 0.38, ease: EASE_SOFT }}
          style={{ overflow: 'hidden' }}
          aria-hidden={!expanded}
        >
          <ul className="pt-1.5 flex flex-col gap-1">
            {steps.map((s, i) => (
              <li
                key={i}
                className="text-[12px] leading-[16px] font-medium tracking-[0] text-[#858585]"
              >
                {s}
              </li>
            ))}
          </ul>
        </motion.div>
      </motion.div>
    )
  }

  return (
    <div className="min-h-[16px] relative">
      <AnimatePresence initial={false}>
        <motion.div
          key={`active-${activeIdx}`}
          initial={{ opacity: 0, filter: 'blur(3px)', backgroundPositionX: '100%' }}
          animate={{ opacity: 1, filter: 'blur(0px)', backgroundPositionX: '0%' }}
          exit={{
            opacity: 0,
            filter: 'blur(3px)',
            transition: {
              opacity: { duration: 0.16, ease: EASE_OUT },
              filter: { duration: 0.16, ease: EASE_OUT },
            },
          }}
          transition={{
            opacity: { duration: 0.16, ease: EASE_OUT },
            filter: { duration: 0.16, ease: EASE_OUT },
            backgroundPositionX: { duration: 2.6, ease: EASE_SWEEP, delay: 0.05 },
          }}
          className="absolute inset-0 text-[12px] leading-[16px] font-medium tracking-[0] w-fit"
          style={{
            backgroundImage: SWEEP_GRADIENT,
            backgroundSize: '300% 100%',
            backgroundRepeat: 'no-repeat',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            willChange: 'filter, opacity, background-position, transform',
          }}
        >
          {activeIdx >= 0 ? steps[activeIdx] : '\u00a0'}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
