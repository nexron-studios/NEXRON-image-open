# image-open

A Claude Code mod that shows the images you paste. For every `[Image #N]` in the prompt
draft it draws a preview above the prompt and a button that opens the image full size in
the macOS Preview app.

## Install

Inside Claude Code:

```
/plugin marketplace add nexron-studios/NEXRON-image-open
/plugin install image-open@claude-image-open
/reload-plugins
```

## Real pictures or none

The preview is a real picture only in terminals that speak the kitty graphics protocol:
Ghostty, kitty or WezTerm. That also holds inside the herdr multiplexer, but herdr does
not identify itself as such a terminal, so Claude Code has to be told to draw pictures
anyway. Add this to the `env` block of `~/.claude/settings.json` and start a new session:

```json
"env": { "CLAUDE_CODE_FORCE_TERMINAL_IMAGES": "1" }
```

Do not set it in iTerm2 or Terminal.app: they cannot draw these pictures and show garbage
instead. There the preview is left out and the button still opens the image.

## Requirements

- macOS (the preview is downscaled with `sips`, the button uses `open`)
- Claude Code with mods support

## Develop

Edit the files, then `claude plugin marketplace update claude-image-open` and
`claude plugin update image-open@claude-image-open`, and start a new session.

## License

MIT
