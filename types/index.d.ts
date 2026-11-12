export type PreviewSize = { columns: number; rows: number }

export type PastedImage = {
  n: number
  /** Absolute path of the cached paste; null while Claude Code has not written it yet. */
  path: string | null
  /** Downscaled PNG for the in-terminal preview, base64; null when it could not be made. */
  previewPng: string | null
  /** Pixel size of the preview; null when unknown. */
  pixelSize: { width: number; height: number } | null
}

declare module 'claude-code' {
  interface PluginState {
    'image-open': { images: PastedImage[] }
  }
}
