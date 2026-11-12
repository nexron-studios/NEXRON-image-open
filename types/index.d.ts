export type PreviewSize = { columns: number; rows: number }

export type PastedImage = {
  n: number
  /** Absolute path of the cached paste; null while Claude Code has not written it yet. */
  path: string | null
  /**
   * Key of the downscaled PNG in the module's preview cache; null when none could be made.
   * The bytes stay out of plugin state, which would copy them on every write and render.
   */
  previewKey: string | null
  /** Pixel size of the preview; null when unknown. */
  pixelSize: { width: number; height: number } | null
}

declare module 'claude-code' {
  interface PluginState {
    'image-open': { images: PastedImage[] }
  }
}
