export type StreamTextOptions = {
  intervalMs?: number
  charsPerTick?: number
}

// The assistant's intro sentence types out one character at a time instead
// of landing fully rendered. Default is 8ms per character with a blinking
// cursor on the page, which stops once the text lands.
export function streamText(
  text: string,
  onUpdate: (partial: string) => void,
  options: StreamTextOptions = {},
): () => void {
  const intervalMs = options.intervalMs ?? 8
  const charsPerTick = options.charsPerTick ?? 1
  let i = 0
  const id = setInterval(() => {
    i += charsPerTick
    if (i >= text.length) {
      onUpdate(text)
      clearInterval(id)
      return
    }
    onUpdate(text.slice(0, i))
  }, intervalMs)
  return () => clearInterval(id)
}
