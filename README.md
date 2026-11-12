<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/brand/readme-banner-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="docs/brand/readme-banner-light.svg">
  <img src="docs/brand/readme-banner-dark.svg" alt="image-open by NEXRON Studios: See the images you paste into Claude Code, right above the prompt" width="100%">
</picture>
<br><br>
<img src="https://img.shields.io/badge/platform-macOS_%7C_Windows-2DD4BF?style=flat-square&labelColor=19191a&logoColor=f0efec" alt="Platform: macOS and Windows">
<img src="https://img.shields.io/badge/Claude_Code-mod-2DD4BF?style=flat-square&labelColor=19191a&logo=claude&logoColor=f0efec" alt="Claude Code mod">
<img src="https://img.shields.io/badge/TypeScript-strict-2DD4BF?style=flat-square&labelColor=19191a&logo=typescript&logoColor=f0efec" alt="TypeScript strict">
<img src="https://img.shields.io/badge/preview-kitty_graphics-2DD4BF?style=flat-square&labelColor=19191a&logo=ghostty&logoColor=f0efec" alt="Preview via kitty graphics">
<img src="https://img.shields.io/badge/license-MIT-2DD4BF?style=flat-square&labelColor=19191a&logoColor=f0efec" alt="License: MIT">
</div>

When you paste a screenshot into Claude Code, the terminal shows a bare `[Image #1]` and
you have to trust it is the right one. image-open draws a real preview of every pasted
image above the prompt and puts a button under it that opens the image full size.

| | |
| --- | --- |
| 🖼️ **Preview** | A sharp thumbnail of each pasted image above the prompt, before you send. |
| 🔍 **Open full size** | One click on `Bild N öffnen` opens the image in Preview on macOS or Photos on Windows. |
| 🧩 **Works in herdr** | Real pictures inside the herdr multiplexer when it runs in Ghostty. |

## How it works

```mermaid
%%{init: {"theme": "base", "themeVariables": {"background": "#19191a", "primaryColor": "#232325", "primaryTextColor": "#f0efec", "primaryBorderColor": "#3a3a3d", "lineColor": "#8a8a8f", "secondaryColor": "#232325", "tertiaryColor": "#232325"}}}%%
flowchart LR
  paste["Paste with Ctrl+V"] --> cache["Claude Code caches<br/>images/N.png"]
  cache --> mod["image-open"]
  mod --> preview["Preview above<br/>the prompt"]
  mod --> button["Button opens<br/>Preview app"]
  classDef brand fill:#2DD4BF,stroke:#0D9488,color:#19191a
  class mod brand
```

The mod polls the prompt draft for `[Image #N]` tags, finds each paste in Claude Code's
session cache, downscales it once with `sips` and draws it with Claude Code's `Image`
element. The button hands the original file to the system viewer. On Windows, PowerShell
does both jobs (`System.Drawing` to downscale, `Start-Process` to open).

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

Do not set it in iTerm2, Terminal.app or Windows Terminal: they cannot draw these pictures
and show garbage instead. Without the setting, the mod leaves the preview out in terminals
it does not recognise, and the button still opens the image.

On Windows there is no Ghostty, so expect the button without a preview. Whether WezTerm
draws the pictures with the setting above is untested.

## Stack

- TypeScript hooks module against the Claude Code mod API (`hooks/register.tsx`, `hooks/preview.ts`)
- macOS: `sips` to downscale, `open` for the full-size view
- Windows: PowerShell with `System.Drawing` to downscale, `Start-Process` for the full-size view
- Edit, then `claude plugin marketplace update claude-image-open` and
  `claude plugin update image-open@claude-image-open`, and start a new session

<div align="center"><sub>image-open is a NEXRON Studios tool. Banner from docs/brand/banner.json.</sub></div>
