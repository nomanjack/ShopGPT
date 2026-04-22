const HEX_RE = /^#[0-9a-f]{6}$/i

function isValidHex(hex: string): boolean {
  return typeof hex === 'string' && HEX_RE.test(hex)
}

export function safeHex(hex: string | undefined, fallback = '#EEEEEE'): string {
  return hex && isValidHex(hex) ? hex : fallback
}

export function shiftHex(hex: string, by: number): string {
  if (!isValidHex(hex)) return hex
  const n = parseInt(hex.slice(1), 16)
  const clamp = (v: number) => Math.max(0, Math.min(255, v))
  const r = clamp(((n >> 16) & 0xff) + by)
  const g = clamp(((n >> 8) & 0xff) + by)
  const b = clamp((n & 0xff) + by)
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')
}
