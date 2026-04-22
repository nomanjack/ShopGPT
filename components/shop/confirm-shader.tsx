'use client'

import { useEffect, useRef } from 'react'

const VS = `
attribute vec2 a;
void main(){ gl_Position = vec4(a, 0.0, 1.0); }
`

const FS = `
precision mediump float;
uniform vec2 uRes;
uniform float uP;
uniform float uAlpha;
uniform float uBandTight;
uniform float uPosStart;
uniform float uPosEnd;
uniform float uHueBase;
uniform float uHueX;
uniform float uHueT;
uniform float uSat;
uniform float uLight;
uniform float uVyLow;
uniform float uVyHigh;
uniform float uFadeIn;
uniform float uFadeOutStart;

vec3 hsl2rgb(vec3 c){
  vec3 rgb = clamp(abs(mod(c.x*6.0+vec3(0.,4.,2.),6.)-3.)-1., 0., 1.);
  return c.z + c.y * (rgb - 0.5) * (1.0 - abs(2.0*c.z - 1.0));
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float p = uP;

  float pos = uPosStart + p * (uPosEnd - uPosStart);
  float d = uv.x - pos;
  float band = exp(-d*d*uBandTight);

  float hue = uHueBase + uv.x * uHueX + p * uHueT;
  vec3 col = hsl2rgb(vec3(hue, uSat, uLight));

  float vy = smoothstep(0.0, uVyLow, uv.y) * smoothstep(1.0, uVyHigh, uv.y);

  float fadeIn = smoothstep(0.0, uFadeIn, p);
  float fadeOut = 1.0 - smoothstep(uFadeOutStart, 1.0, p);

  float alpha = band * vy * fadeIn * fadeOut * uAlpha;

  gl_FragColor = vec4(col * alpha, alpha);
}
`

export type ConfirmShaderParams = {
  durationMs: number
  alpha: number
  bandTight: number
  posStart: number
  posEnd: number
  hueBase: number
  hueX: number
  hueT: number
  sat: number
  light: number
  vyLow: number
  vyHigh: number
  fadeIn: number
  fadeOutStart: number
}

// On confirming an order, the page runs a full-screen WebGL shader for a
// gentle 2 seconds to make the moment feel delightful. The band fades in
// and out so it has a shape instead of just popping in and out.
export const DEFAULT_PARAMS: ConfirmShaderParams = {
  durationMs: 2050,
  alpha: 0.45,
  bandTight: 1.6,
  posStart: -0.4,
  posEnd: 2.06,
  hueBase: 0.58,
  hueX: 0.22,
  hueT: -0.44,
  sat: 0.42,
  light: 0.78,
  vyLow: 0.35,
  vyHigh: 0.65,
  fadeIn: 0.22,
  fadeOutStart: 0.45,
}

export function ConfirmShader({
  className, params, replayKey,
}: {
  className?: string
  params?: Partial<ConfirmShaderParams>
  replayKey?: number | string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const paramsRef = useRef<ConfirmShaderParams>({ ...DEFAULT_PARAMS, ...params })
  paramsRef.current = { ...DEFAULT_PARAMS, ...params }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true })
    if (!gl) return

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error('confirm-shader compile error:', gl.getShaderInfoLog(s))
      }
      return s
    }

    const vs = compile(gl.VERTEX_SHADER, VS)
    const fs = compile(gl.FRAGMENT_SHADER, FS)
    const prog = gl.createProgram()!
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const aLoc = gl.getAttribLocation(prog, 'a')
    gl.enableVertexAttribArray(aLoc)
    gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0)

    const u = (n: string) => gl.getUniformLocation(prog, n)
    const uRes = u('uRes')
    const uP = u('uP')
    const uAlpha = u('uAlpha')
    const uBandTight = u('uBandTight')
    const uPosStart = u('uPosStart')
    const uPosEnd = u('uPosEnd')
    const uHueBase = u('uHueBase')
    const uHueX = u('uHueX')
    const uHueT = u('uHueT')
    const uSat = u('uSat')
    const uLight = u('uLight')
    const uVyLow = u('uVyLow')
    const uVyHigh = u('uVyHigh')
    const uFadeIn = u('uFadeIn')
    const uFadeOutStart = u('uFadeOutStart')

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio, 2)
      const r = canvas.getBoundingClientRect()
      const w = Math.max(1, Math.round(r.width * dpr))
      const h = Math.max(1, Math.round(r.height * dpr))
      canvas.width = w
      canvas.height = h
      gl.viewport(0, 0, w, h)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const start = performance.now()
    let raf = 0
    const tick = () => {
      const pp = paramsRef.current
      const t = (performance.now() - start) / pp.durationMs
      const p = Math.min(1, Math.max(0, t))
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform1f(uP, p)
      gl.uniform1f(uAlpha, pp.alpha)
      gl.uniform1f(uBandTight, pp.bandTight)
      gl.uniform1f(uPosStart, pp.posStart)
      gl.uniform1f(uPosEnd, pp.posEnd)
      gl.uniform1f(uHueBase, pp.hueBase)
      gl.uniform1f(uHueX, pp.hueX)
      gl.uniform1f(uHueT, pp.hueT)
      gl.uniform1f(uSat, pp.sat)
      gl.uniform1f(uLight, pp.light)
      gl.uniform1f(uVyLow, pp.vyLow)
      gl.uniform1f(uVyHigh, pp.vyHigh)
      gl.uniform1f(uFadeIn, pp.fadeIn)
      gl.uniform1f(uFadeOutStart, pp.fadeOutStart)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      gl.deleteProgram(prog)
      gl.deleteBuffer(buf)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
    }
  }, [replayKey])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={className}
      style={{ display: 'block', width: '100%', height: '100%', pointerEvents: 'none' }}
    />
  )
}
