# image-open

Claude Code mod. For every `[Image #N]` in the prompt draft it shows a preview above the
prompt and a button that opens the image full size in the macOS Preview app.

The preview is a real picture only in terminals that speak the kitty graphics protocol
(Ghostty, kitty, WezTerm), also inside herdr. herdr does not identify itself as such a
terminal, so `CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1` must be set in the `env` block of
`~/.claude/settings.json`. In iTerm2 that setting draws garbage instead of pictures.

Install: `claude plugin marketplace add ~/dev/prv/claude-image-open` and
`claude plugin install image-open@claude-image-open`. After editing, run
`claude plugin marketplace update claude-image-open` and `claude plugin update image-open@claude-image-open`.
