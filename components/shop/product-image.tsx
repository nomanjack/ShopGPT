'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'

type Status = 'loading' | 'loaded' | 'error' | 'none'

function isCached(src: string): boolean {
  if (typeof window === 'undefined') return false
  const img = new window.Image()
  img.src = src
  return img.complete && img.naturalWidth > 0
}

export function ProductImage({
  src, color, alt, fit = 'cover',
}: {
  src?: string | null
  color: string
  alt: string
  fit?: 'cover' | 'contain'
}) {
  const [status, setStatus] = useState<Status>(src ? 'loading' : 'none')
  const [showLoader, setShowLoader] = useState(false)
  const [mountedLoaded, setMountedLoaded] = useState(false)

  useEffect(() => {
    if (!src) { setStatus('none'); return }
    if (isCached(src)) {
      setStatus('loaded')
      setMountedLoaded(true)
      return
    }
    setStatus('loading')
  }, [src])

  useEffect(() => {
    if (status !== 'loading') { setShowLoader(false); return }
    const t = setTimeout(() => setShowLoader(true), 220)
    return () => clearTimeout(t)
  }, [status])

  const isLoading = status === 'loading'
  const isMissing = status === 'error' || status === 'none'

  return (
    <div className="absolute inset-0 overflow-hidden bg-white">
      {(isLoading || isMissing) && <div className="absolute inset-0" style={{ backgroundColor: '#EEEEEE' }} />}
      {isMissing && <MissingImageGlyph />}

      {src && status !== 'error' && (
        <motion.img
          key={src}
          src={src}
          alt={alt}
          draggable={false}
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('error')}
          initial={mountedLoaded ? false : { opacity: 0, filter: 'blur(8px)' }}
          animate={{
            opacity: status === 'loaded' ? 1 : 0,
            filter: status === 'loaded' ? 'blur(0px)' : 'blur(8px)',
          }}
          transition={{ duration: mountedLoaded ? 0 : 0.32, ease: [0.2, 1, 0.3, 1] }}
          className={`absolute inset-0 w-full h-full select-none pointer-events-none ${fit === 'cover' ? 'object-cover' : 'object-contain'}`}
        />
      )}

      <AnimatePresence>
        {showLoader && isLoading && (
          <motion.div
            key="loader"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.2, 1, 0.3, 1] }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <Spinner />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function MissingImageGlyph() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <svg
        viewBox="0 0 48 48"
        aria-hidden
        style={{ width: '32%', height: '32%', maxWidth: 80, maxHeight: 80, color: '#BFC0C3' }}
      >
        <rect
          x="4" y="8" width="40" height="32" rx="3"
          fill="none" stroke="currentColor" strokeWidth="2.5"
        />
        <circle cx="16" cy="19" r="3.2" fill="currentColor" />
        <path
          d="M10 34 L20 22 L28 30 L34 25 L40 34 Z"
          fill="currentColor"
        />
      </svg>
    </div>
  )
}

function Spinner() {
  return (
    <motion.span
      aria-hidden
      animate={{ rotate: 360 }}
      transition={{ duration: 0.7, ease: 'linear', repeat: Infinity }}
      className="inline-block h-4 w-4 rounded-full"
      style={{
        border: '1.5px solid rgba(133,133,133,0.35)',
        borderTopColor: '#858585',
      }}
    />
  )
}
