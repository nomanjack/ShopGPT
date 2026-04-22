'use client'

import { useState } from 'react'
import { notFound } from 'next/navigation'
import { ConfirmShader, DEFAULT_PARAMS, type ConfirmShaderParams } from '@/components/shop/confirm-shader'

type Knob = {
  key: keyof ConfirmShaderParams
  label: string
  min: number
  max: number
  step: number
}

const KNOBS: Knob[] = [
  { key: 'durationMs',   label: 'duration (ms)',   min: 400,  max: 6000, step: 50 },
  { key: 'alpha',        label: 'alpha',           min: 0,    max: 1,    step: 0.01 },
  { key: 'bandTight',    label: 'band tightness',  min: 0.2,  max: 20,   step: 0.1 },
  { key: 'posStart',     label: 'sweep start x',   min: -1,   max: 1,    step: 0.02 },
  { key: 'posEnd',       label: 'sweep end x',     min: 0,    max: 2.5,  step: 0.02 },
  { key: 'hueBase',      label: 'hue base',        min: 0,    max: 1,    step: 0.01 },
  { key: 'hueX',         label: 'hue · x spread',  min: -1,   max: 1,    step: 0.01 },
  { key: 'hueT',         label: 'hue · time',      min: -0.5, max: 0.5,  step: 0.01 },
  { key: 'sat',          label: 'saturation',      min: 0,    max: 1,    step: 0.01 },
  { key: 'light',        label: 'lightness',       min: 0,    max: 1,    step: 0.01 },
  { key: 'vyLow',        label: 'falloff bottom',  min: 0,    max: 0.8,  step: 0.01 },
  { key: 'vyHigh',       label: 'falloff top',     min: 0.2,  max: 1,    step: 0.01 },
  { key: 'fadeIn',       label: 'fade-in end',     min: 0,    max: 0.6,  step: 0.01 },
  { key: 'fadeOutStart', label: 'fade-out start',  min: 0.4,  max: 1,    step: 0.01 },
]

export default function TunePage() {
  if (process.env.NODE_ENV === 'production') notFound()
  const [params, setParams] = useState<ConfirmShaderParams>(DEFAULT_PARAMS)
  const [replayKey, setReplayKey] = useState(0)
  const [bg, setBg] = useState<'light' | 'dark'>('light')

  const update = (k: keyof ConfirmShaderParams, v: number) =>
    setParams(p => ({ ...p, [k]: v }))

  const replay = () => setReplayKey(k => k + 1)

  const copy = () => {
    navigator.clipboard.writeText(JSON.stringify(params, null, 2))
  }

  const reset = () => {
    setParams(DEFAULT_PARAMS)
    setReplayKey(k => k + 1)
  }

  return (
    <main
      className="min-h-screen flex"
      style={{ background: bg === 'light' ? '#ffffff' : '#0a0a0a', color: bg === 'light' ? '#242529' : '#e5e5e5' }}
    >
      <div className="relative flex-1 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <ConfirmShader params={params} replayKey={replayKey} />
        </div>
        <div className="relative z-10 mx-auto w-full max-w-[576px] px-5 pt-10 pb-24 flex flex-col gap-5">
          <div className="self-end max-w-[80%] rounded-[20px] rounded-br-[6px] bg-[#F0F0F0] px-3.5 py-2 text-[13px] leading-[18px] font-medium text-[#242529]">
            place order
          </div>
          <div className="text-[16px] leading-[22px] font-semibold tracking-[-0.01em]">
            all set. pickup thursday, 2–4pm.
          </div>
          <div className="text-[13px] leading-[18px] font-medium" style={{ color: bg === 'light' ? '#525252' : '#a3a3a3' }}>
            847 president st, brooklyn. receipt is in your inbox. i'll nudge you an hour before.
          </div>
        </div>
      </div>

      <aside className="w-[320px] shrink-0 border-l border-black/10 bg-white text-[#242529] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-black/10 px-4 py-3 flex items-center gap-2">
          <button
            onClick={replay}
            className="rounded-full bg-black text-white text-[12px] font-medium px-3 py-1"
          >
            replay
          </button>
          <button
            onClick={reset}
            className="rounded-full border border-black/15 text-[12px] font-medium px-3 py-1"
          >
            reset
          </button>
          <button
            onClick={copy}
            className="rounded-full border border-black/15 text-[12px] font-medium px-3 py-1"
          >
            copy json
          </button>
          <div className="ml-auto inline-flex rounded-full border border-black/15 text-[11px] overflow-hidden">
            <button
              onClick={() => setBg('light')}
              className={`px-2 py-0.5 ${bg === 'light' ? 'bg-black text-white' : ''}`}
            >light</button>
            <button
              onClick={() => setBg('dark')}
              className={`px-2 py-0.5 ${bg === 'dark' ? 'bg-black text-white' : ''}`}
            >dark</button>
          </div>
        </div>
        <div className="p-4 flex flex-col gap-3">
          {KNOBS.map(k => (
            <label key={k.key} className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[11px] text-[#525252]">
                <span>{k.label}</span>
                <span className="tabular-nums text-[#242529]">{params[k.key].toFixed(k.step < 1 ? 2 : 0)}</span>
              </div>
              <input
                type="range"
                min={k.min}
                max={k.max}
                step={k.step}
                value={params[k.key]}
                onChange={e => update(k.key, Number(e.target.value))}
                className="w-full accent-black"
              />
            </label>
          ))}
        </div>
      </aside>
    </main>
  )
}
