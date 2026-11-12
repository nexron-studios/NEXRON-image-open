import type { EngineInterface } from 'claude-code'

import type { PastedImage, PreviewSize } from '../types'
import { downscaleToPng } from './platform'

// Claude Code refuses an AbovePrompt tree whose Image sources add up to more than 2 MiB
// decoded, and then drops the whole band, buttons included. All previews of one draft
// share that budget, with some room to spare.
const MAX_TREE_IMAGE_BYTES = 2 * 1024 * 1024
export const TREE_IMAGE_BUDGET_BYTES = MAX_TREE_IMAGE_BYTES - 64 * 1024
// The band is at most PREVIEW_ROWS rows tall, a few hundred pixels even on a Retina
// screen, so a larger edge only costs bytes on every redraw.
const PREVIEW_EDGE_STEPS_PX = [900, 700, 500, 350, 250]
// Terminal cells are roughly twice as tall as wide.
const CELL_ASPECT = 2
export const PREVIEW_ROWS = 14
// Below this a preview is too small to recognise anything in.
export const MIN_PREVIEW_ROWS = 3

type Preview = Pick<PastedImage, 'previewKey' | 'pixelSize'>
type StoredPreview = { png: string; pixelSize: PastedImage['pixelSize'] }

const NO_PREVIEW: Preview = { previewKey: null, pixelSize: null }
const previews = new Map<string, StoredPreview>()

export const decodedBytes = (base64: string): number => Math.floor((base64.length * 3) / 4)

const previewKeyOf = (source: string, maxBytes: number): string => `${source}@${maxBytes}`

export const previewPngFor = (key: string | null): string | null =>
  key === null ? null : (previews.get(key)?.png ?? null)

// Functions that take `$` are declarations, not arrows: the mod engine follows `$`
// across an import only into a function declaration.
async function makePreview($: EngineInterface, source: string, out: string, maxBytes: number): Promise<Preview> {
  for (const edge of PREVIEW_EDGE_STEPS_PX) {
    const pixelSize = await downscaleToPng($, source, out, edge)
    if (pixelSize === null) return NO_PREVIEW
    const { base64: png } = await $.fs.read(out, { as: 'bytes' })
    if (decodedBytes(png) > maxBytes) continue
    const previewKey = previewKeyOf(source, maxBytes)
    previews.set(previewKey, { png, pixelSize })
    return { previewKey, pixelSize }
  }
  return NO_PREVIEW
}

/** Makes (or reuses) a preview of `source` whose PNG is at most `maxBytes` decoded. */
export async function loadPreview($: EngineInterface, source: string, out: string, maxBytes: number): Promise<Preview> {
  const previewKey = previewKeyOf(source, maxBytes)
  const stored = previews.get(previewKey)
  if (stored !== undefined) return { previewKey, pixelSize: stored.pixelSize }
  // A failed attempt is not stored: Claude Code may still be writing the file.
  return makePreview($, source, out, maxBytes).catch(() => NO_PREVIEW)
}

export const fitPreview = (pixelSize: PastedImage['pixelSize'], maxColumns: number, maxRows: number): PreviewSize => {
  const rows = Math.max(1, Math.min(PREVIEW_ROWS, maxRows))
  if (pixelSize === null) return { columns: Math.min(rows * 3, maxColumns), rows }
  const columns = Math.round((rows * CELL_ASPECT * pixelSize.width) / pixelSize.height)
  if (columns <= maxColumns) return { columns: Math.max(1, columns), rows }
  const fittedRows = Math.max(1, Math.round((maxColumns * pixelSize.height) / (pixelSize.width * CELL_ASPECT)))
  return { columns: maxColumns, rows: fittedRows }
}
