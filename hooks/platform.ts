import type { EngineInterface } from 'claude-code'

// Functions that take `$` are declarations, not arrows: the mod engine follows `$`
// across an import only into a function declaration.

export type PixelSize = { width: number; height: number }

export async function isWindows($: EngineInterface): Promise<boolean> {
  return (await $.env.get('OS')) === 'Windows_NT'
}

// Claude Code keeps its temp files in <base>/claude-<uid>, or <base>\claude on Windows.
// The base is CLAUDE_CODE_TMPDIR when set, else /tmp (%TEMP% on Windows).
export async function resolveTempRoot($: EngineInterface): Promise<string | undefined> {
  const fromEnv = await $.env.get('CLAUDE_CODE_TMPDIR')
  if (await isWindows($)) {
    const base = fromEnv ?? (await $.env.get('TEMP'))
    return base === undefined ? undefined : `${base.replace(/[\\/]+$/, '')}/claude`
  }
  const uid = (await $.process.run(['id', '-u'])).stdout.trim()
  return `${(fromEnv ?? '/tmp').replace(/\/+$/, '')}/claude-${uid}`
}

// Whether Claude Code will draw an Image element as a picture. Where it won't, it shows
// the alt text, so the preview is left out instead of adding a bare "[Image #N]" line.
export async function canDrawPictures($: EngineInterface): Promise<boolean> {
  if (await $.env.get('CLAUDE_CODE_FORCE_TERMINAL_IMAGES')) return true
  if ((await $.env.get('TMUX')) || (await $.env.get('STY'))) return false
  if ((await $.env.get('KITTY_WINDOW_ID')) || (await $.env.get('GHOSTTY_RESOURCES_DIR'))) return true
  const term = (await $.env.get('TERM')) ?? ''
  const termProgram = (await $.env.get('TERM_PROGRAM')) ?? ''
  return /kitty|ghostty/i.test(term) || /^ghostty$/i.test(termProgram)
}

const quotePowerShell = (text: string): string => `'${text.replaceAll("'", "''")}'`

// -EncodedCommand takes UTF-16LE base64, so paths with spaces or quotes need no escaping
// on the command line.
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

// Written out because the mod environment's typings promise no Uint8Array.toBase64.
const toBase64 = (bytes: Uint8Array): string => {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1] ?? 0
    const c = bytes[i + 2] ?? 0
    const triple = (a << 16) | (b << 8) | c
    out += BASE64_ALPHABET[(triple >> 18) & 63]
    out += BASE64_ALPHABET[(triple >> 12) & 63]
    out += i + 1 < bytes.length ? BASE64_ALPHABET[(triple >> 6) & 63] : '='
    out += i + 2 < bytes.length ? BASE64_ALPHABET[triple & 63] : '='
  }
  return out
}

const encodePowerShell = (script: string): string => {
  const bytes = new Uint8Array(script.length * 2)
  for (let i = 0; i < script.length; i += 1) {
    const code = script.charCodeAt(i)
    bytes[i * 2] = code & 0xff
    bytes[i * 2 + 1] = code >> 8
  }
  return toBase64(bytes)
}

async function runPowerShell($: EngineInterface, script: string) {
  return $.process.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-EncodedCommand', encodePowerShell(script)])
}

const resizeScript = (source: string, out: string, edge: number): string => `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile(${quotePowerShell(source)})
try {
  $scale = [Math]::Min(1.0, ${edge} / [Math]::Max($src.Width, $src.Height))
  $w = [Math]::Max(1, [int]($src.Width * $scale))
  $h = [Math]::Max(1, [int]($src.Height * $scale))
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($src, 0, 0, $w, $h)
  $g.Dispose()
  $bmp.Save(${quotePowerShell(out)}, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  "$w $h"
} finally { $src.Dispose() }
`

async function readPixelSizeWithSips($: EngineInterface, path: string): Promise<PixelSize | null> {
  const { exitCode, stdout } = await $.process.run(['sips', '-g', 'pixelWidth', '-g', 'pixelHeight', path])
  if (exitCode !== 0) return null
  const width = Number(/pixelWidth: (\d+)/.exec(stdout)?.[1])
  const height = Number(/pixelHeight: (\d+)/.exec(stdout)?.[1])
  return width > 0 && height > 0 ? { width, height } : null
}

/** Writes `source` as a PNG of at most `edge` pixels on its long side to `out`; resolves its size, or null on failure. */
export async function downscaleToPng($: EngineInterface, source: string, out: string, edge: number): Promise<PixelSize | null> {
  if (await isWindows($)) {
    const { exitCode, stdout } = await runPowerShell($, resizeScript(source, out, edge))
    if (exitCode !== 0) return null
    const [width, height] = stdout.trim().split(/\s+/).map(Number)
    return width !== undefined && height !== undefined && width > 0 && height > 0 ? { width, height } : null
  }
  const { exitCode } = await $.process.run(['sips', '-s', 'format', 'png', '-Z', String(edge), source, '--out', out])
  return exitCode === 0 ? readPixelSizeWithSips($, out) : null
}

/** Opens the file in the system's image viewer (Preview on macOS, Photos on Windows). */
export async function openInViewer($: EngineInterface, path: string): Promise<{ isOpened: boolean; error: string }> {
  const { exitCode, stderr } = (await isWindows($))
    ? await runPowerShell($, `Start-Process -FilePath ${quotePowerShell(path)}`)
    : await $.process.run(['open', path])
  return { isOpened: exitCode === 0, error: stderr.trim() }
}
