import type { EngineInterface } from 'claude-code'

import type { PastedImage, PreviewSize } from '../types'

// The Image element takes at most 2 MiB of decoded PNG; screenshots are often larger,
// so each paste is downscaled once with sips (macOS) before it is drawn.
const MAX_PREVIEW_BYTES = 2 * 1024 * 1024
const PREVIEW_EDGE_STEPS_PX = [1400, 900, 600]
// Terminal cells are roughly twice as tall as wide.
const CELL_ASPECT = 2
export const PREVIEW_ROWS = 14

type Preview = Pick<PastedImage, 'previewPng' | 'pixelSize'>

const NO_PREVIEW: Preview = { previewPng: null, pixelSize: null }
const cache = new Map<string, Preview>()

const decodedBytes = (base64: string): number => Math.floor((base64.length * 3) / 4)

// Functions that take `$` are declarations, not arrows: the mod engine follows `$`
// across an import only into a function declaration.
async function readPixelSize($: EngineInterface, path: string): Promise<PastedImage['pixelSize']> {
  const { exitCode, stdout } = await $.process.run(['sips', '-g', 'pixelWidth', '-g', 'pixelHeight', path])
  if (exitCode !== 0) return null
  const width = Number(/pixelWidth: (\d+)/.exec(stdout)?.[1])
  const height = Number(/pixelHeight: (\d+)/.exec(stdout)?.[1])
  return width > 0 && height > 0 ? { width, height } : null
}

async function makePreview($: EngineInterface, source: string, out: string): Promise<Preview> {
  for (const edge of PREVIEW_EDGE_STEPS_PX) {
    const { exitCode } = await $.process.run(['sips', '-s', 'format', 'png', '-Z', String(edge), source, '--out', out])
    if (exitCode !== 0) return NO_PREVIEW
    const { base64: png } = await $.fs.read(out, { as: 'bytes' })
    if (decodedBytes(png) > MAX_PREVIEW_BYTES) continue
    return { previewPng: png, pixelSize: await readPixelSize($, out) }
  }
  return NO_PREVIEW
}

export async function loadPreview($: EngineInterface, source: string, out: string): Promise<Preview> {
  const cached = cache.get(source)
  if (cached !== undefined) return cached
  const preview = await makePreview($, source, out).catch(() => NO_PREVIEW)
  // A failed attempt is not cached: Claude Code may still be writing the file.
  if (preview.previewPng !== null) cache.set(source, preview)
  return preview
}

export const fitPreview = (pixelSize: PastedImage['pixelSize'], maxColumns: number, maxRows: number): PreviewSize => {
  const rows = Math.max(1, Math.min(PREVIEW_ROWS, maxRows))
  if (pixelSize === null) return { columns: Math.min(rows * 3, maxColumns), rows }
  const columns = Math.round((rows * CELL_ASPECT * pixelSize.width) / pixelSize.height)
  if (columns <= maxColumns) return { columns: Math.max(1, columns), rows }
  const fittedRows = Math.max(1, Math.round((maxColumns * pixelSize.height) / (pixelSize.width * CELL_ASPECT)))
  return { columns: maxColumns, rows: fittedRows }
}
