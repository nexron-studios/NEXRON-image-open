import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { PastedImage } from '../types'
import { canDrawPictures, openInViewer, resolveTempRoot } from './platform'
import {
  MIN_PREVIEW_ROWS,
  TREE_IMAGE_BUDGET_BYTES,
  decodedBytes,
  fitPreview,
  loadPreview,
  previewPngFor,
} from './preview'

// Pasting an image raises no prompt.edit (the tag appears only on the next keystroke),
// so the draft is polled instead.
const POLL_MS = 300
const IMAGE_TAG = /\[Image #(\d+)\]/g
// The band holds the button row below the pictures and keeps one row spare.
const NON_PICTURE_ROWS = 2

const images = atom({ plugin: 'image-open', key: 'images' } as const, [] as PastedImage[])

let tempRoot: string | undefined
let found: { sessionId: string; dir: string } | undefined
let written: string | undefined
let isChecking = false
let isDrawingPictures = false

const imageNumbers = (draft: string): number[] => [
  ...new Set([...draft.matchAll(IMAGE_TAG)].map(match => Number(match[1]))),
]

// Pastes are cached as <tmp>/<project>/<session>/images/<n>.<ext>. The project folder is
// named after a working directory that may have moved, so it is found by session id.
const findImagesDir = async ($: EngineInterface): Promise<string | undefined> => {
  const sessionId = await $.session.id()
  if (found?.sessionId === sessionId) return found.dir
  tempRoot ??= await resolveTempRoot($)
  if (tempRoot === undefined) return undefined
  const entries = await $.fs.list(tempRoot).catch(() => [])
  for (const entry of entries) {
    const dir = `${tempRoot}/${entry.name}/${sessionId}/images`
    if (entry.kind !== 'dir' || !(await $.fs.exists(dir))) continue
    found = { sessionId, dir }
    return dir
  }
  return undefined
}

const findImagePath = async ($: EngineInterface, dir: string | undefined, n: number): Promise<string | null> => {
  if (dir === undefined) return null
  const entries = await $.fs.list(dir).catch(() => [])
  const file = entries.find(entry => entry.kind === 'file' && entry.name.startsWith(`${n}.`))
  return file === undefined ? null : `${dir}/${file.name}`
}

const describeImage = async (
  $: EngineInterface,
  dir: string | undefined,
  n: number,
  maxBytes: number,
): Promise<PastedImage> => {
  const path = await findImagePath($, dir, n)
  if (path === null || dir === undefined || !isDrawingPictures) return { n, path, previewKey: null, pixelSize: null }
  const out = `${dir.replace(/\/images$/, '')}/image-open-${n}.png`
  return { n, path, ...(await loadPreview($, path, out, maxBytes)) }
}

const refresh = async ($: EngineInterface) => {
  const numbers = imageNumbers((await $.prompt.read()).text)
  const dir = numbers.length > 0 ? await findImagesDir($) : undefined
  // Every preview of the draft is drawn in one tree, so they split its byte budget.
  const maxBytes = Math.floor(TREE_IMAGE_BUDGET_BYTES / Math.max(1, numbers.length))
  const list: PastedImage[] = []
  for (const n of numbers) list.push(await describeImage($, dir, n, maxBytes))
  const json = JSON.stringify(list)
  if (json === written) return
  await update($, images, () => list)
  written = json
}

const check = async ($: EngineInterface) => {
  if (isChecking) return
  isChecking = true
  try {
    await refresh($)
  } catch (error) {
    // Recovered by the next poll; logged so a failure that repeats can be found.
    $.ui.log(`image-open: refresh failed: ${String(error)}`, { to: 'debug' })
  } finally {
    isChecking = false
  }
}

const openImage = async ($: EngineInterface, image: PastedImage) => {
  if (image.path === null) {
    $.ui.toast(`Bild ${image.n} ist noch nicht gespeichert`)
    return
  }
  const { isOpened, error } = await openInViewer($, image.path)
  if (!isOpened) $.ui.toast(`Bild ${image.n} ließ sich nicht öffnen: ${error}`)
}

type Picture = { image: PastedImage; png: string }

// Guards the tree budget again at drawing time: a preview made for a shorter draft may
// still be stored under a larger share.
const picturesWithinBudget = (list: PastedImage[]): Picture[] => {
  const pictures: Picture[] = []
  let bytes = 0
  for (const image of list) {
    const png = previewPngFor(image.previewKey)
    if (png === null) continue
    bytes += decodedBytes(png)
    if (bytes > TREE_IMAGE_BUDGET_BYTES) break
    pictures.push({ image, png })
  }
  return pictures
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    isDrawingPictures = await canDrawPictures($)
    $.clock.every(POLL_MS, () => check($))
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.hasSurvey) return next(e)
    const list = await read($, images)
    if (list.length === 0) return next(e)

    const { Box, Button, Image, Text } = $.ui.resolve(e)
    const pictures = picturesWithinBudget(list)
    const maxImageRows = e.props.maxRows - NON_PICTURE_ROWS
    const maxImageColumns = Math.floor(e.props.bodyColumns / Math.max(1, pictures.length)) - 1
    const hasRoom = maxImageRows >= MIN_PREVIEW_ROWS && maxImageColumns >= 1
    const isHidden = pictures.length > 0 && !hasRoom

    return (
      <Box flexDirection="column">
        {hasRoom && pictures.length > 0 && (
          <Box flexDirection="row" gap={1}>
            {pictures.map(({ image, png }) => {
              const size = fitPreview(image.pixelSize, maxImageColumns, maxImageRows)
              return (
                <Image
                  key={`preview-${image.n}`}
                  source={{ png }}
                  columns={size.columns}
                  rows={size.rows}
                  alt={`[Image #${image.n}]`}
                />
              )
            })}
          </Box>
        )}
        <Box flexDirection="row" gap={1}>
          <Text dimColor>Bilder:</Text>
          {list.map(image => (
            <Button
              key={`image-${image.n}`}
              label={`Bild ${image.n} öffnen`}
              dimColor={image.path === null}
              onPress={() => openImage($, image)}
            />
          ))}
          {isHidden && <Text dimColor>· Vorschau ausgeblendet, zu wenig Platz</Text>}
        </Box>
      </Box>
    )
  })
}
