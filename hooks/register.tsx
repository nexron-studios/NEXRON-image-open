import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { PastedImage } from '../types'
import { canDrawPictures, openInViewer, resolveTempRoot } from './platform'
import { fitPreview, loadPreview } from './preview'

// Pasting an image raises no prompt.edit (the tag appears only on the next keystroke),
// so the draft is polled instead.
const POLL_MS = 300
const IMAGE_TAG = /\[Image #(\d+)\]/g

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

const describeImage = async ($: EngineInterface, dir: string | undefined, n: number): Promise<PastedImage> => {
  const path = await findImagePath($, dir, n)
  if (path === null || dir === undefined || !isDrawingPictures) return { n, path, previewPng: null, pixelSize: null }
  const out = `${dir.replace(/\/images$/, '')}/image-open-${n}.png`
  return { n, path, ...(await loadPreview($, path, out)) }
}

const refresh = async ($: EngineInterface) => {
  const numbers = imageNumbers((await $.prompt.read()).text)
  const dir = numbers.length > 0 ? await findImagesDir($) : undefined
  const list: PastedImage[] = []
  for (const n of numbers) list.push(await describeImage($, dir, n))
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
    // The band also holds the button row, so the pictures get the rest of its height.
    const maxImageRows = e.props.maxRows - 2
    const maxImageColumns = Math.floor(e.props.bodyColumns / list.length) - 1

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1}>
          {list.map(image => {
            if (image.previewPng === null || maxImageRows < 1 || maxImageColumns < 1) return null
            const size = fitPreview(image.pixelSize, maxImageColumns, maxImageRows)
            return (
              <Image
                key={`preview-${image.n}`}
                source={{ png: image.previewPng }}
                columns={size.columns}
                rows={size.rows}
                alt={`[Image #${image.n}]`}
              />
            )
          })}
        </Box>
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
        </Box>
      </Box>
    )
  })
}
