<div align="center">

# ![Codex Powerline for VS Code](assets/header.png)

**Your Codex terminal and Powerline status bar, right in the VS Code sidebar.**

Run the [Codex Powerline CLI](https://github.com/powerline-dev/codex-powerline-cli)
beside your code. Keep your model, context, usage limits, and Git state in view,
with the same layouts, themes, and widgets that you use in your terminal.

[![GitHub stars](https://img.shields.io/github/stars/powerline-dev/codex-powerline-vscode?style=social)](https://github.com/powerline-dev/codex-powerline-vscode)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![VS Code: 1.96.2+](https://img.shields.io/badge/VS_Code-1.96.2%2B-007ACC)](https://code.visualstudio.com/)
[![GitHub issues](https://img.shields.io/github/issues/powerline-dev/codex-powerline-vscode)](https://github.com/powerline-dev/codex-powerline-vscode/issues)

[Download the VSIX](releases/0.2.3/) · [Powerline CLI](https://github.com/powerline-dev/codex-powerline-cli) · [Report a bug](https://github.com/powerline-dev/codex-powerline-vscode/issues)

</div>

## Contents

- [Install](#install)
- [Features](#features)
- [Configure](#configure)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Release preparation](#release-preparation)
- [Contributing](#contributing)
- [Author and acknowledgments](#author-and-acknowledgments)
- [License](#license)

## Install

### 1. Set up the CLI

Install Node.js 22.12 or newer. Install Codex CLI and Powerline CLI, then sign in
and save a layout:

```sh
npm install --global @openai/codex @powerline-dev/codex-powerline-cli
codex login
codex-powerline configure
```

These npm commands apply once the scoped Powerline CLI package is published.
Until then, use the [CLI development setup](https://github.com/powerline-dev/codex-powerline-cli#development).
Both `codex` and `codex-powerline` must be on the PATH available to VS Code.

### 2. Install the extension

The extension is not yet published to the Marketplace. Download a package from
the [0.2.3 release folder](releases/0.2.3/):

| Platform | Download |
| --- | --- |
| Windows x64 | [VSIX](https://github.com/powerline-dev/codex-powerline-vscode/raw/refs/heads/main/releases/0.2.3/codex-powerline-vscode-win32-x64-0.2.3.vsix) |
| macOS Apple silicon | [VSIX](https://github.com/powerline-dev/codex-powerline-vscode/raw/refs/heads/main/releases/0.2.3/codex-powerline-vscode-darwin-arm64-0.2.3.vsix) |

In VS Code, open **Extensions**, select the **...** menu, then select
**Install from VSIX...** and choose the downloaded file. Reload VS Code if asked.
Download URLs become available after this folder is pushed to GitHub.

### 3. Open the sidebar

Select the **Codex Powerline** icon in the Activity Bar. The extension starts
`codex-powerline run` in your workspace folder. Widen the sidebar for more columns,
or move the view to the Secondary Side Bar to keep Explorer open beside it.

In a multi-root workspace, the terminal uses the folder containing the active file,
or the first folder if no file is active. Without a workspace, it uses the active
local file's folder or your home folder.

## Features

- **Codex beside your code.** Use an interactive terminal in the sidebar.
- **Your existing layout.** Use the CLI's themes, presets, widgets, and settings.
- **Workspace-aware start.** Start in the folder that matches your active project.
- **Powerline glyphs included.** The webview bundles the symbols used by Powerline separators.
- **Persistent session.** Hide and reopen the sidebar without starting a new process.
- **One-command restart.** Use **Restart Terminal** in the view header or the Command Palette.

The CLI owns the model, context, usage, and Git widgets. The extension hosts its
terminal. It does not contain a separate settings editor or widget engine.

## Configure

Use the CLI's live configuration editor:

```sh
codex-powerline configure
```

Save the layout, then run **Codex Powerline: Restart Terminal** in VS Code.
The terminal follows `terminal.integrated.fontFamily` and
`terminal.integrated.fontSize`, with the editor font as a fallback.

Update the CLI separately from the extension:

```sh
npm install --global @powerline-dev/codex-powerline-cli@latest
```

The [CLI repository](https://github.com/powerline-dev/codex-powerline-cli) contains
the settings schemas, migrations, themes, presets, widgets, and configuration skill.
No retired Core repository or npm package is needed.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| The terminal cannot start | Run `codex-powerline run` in a normal terminal. Check that both CLIs are on PATH, then fully restart VS Code. |
| The layout is too narrow | Widen the sidebar or pick a compact layout with `codex-powerline configure`. |
| A new layout does not appear | Save it in the CLI editor, then use **Restart Terminal**. |
| VSIX does not match your platform | Download the matching package or build on your target platform. Native `node-pty` binaries are platform-specific. |

## Development

Use Node.js 22.12 or newer and build on the target platform:

```sh
git clone https://github.com/powerline-dev/codex-powerline-vscode.git
cd codex-powerline-vscode
npm ci
npm run check
npm run build
npm run package -- --target win32-x64
```

Replace `win32-x64` with your VS Code target, such as `darwin-arm64` or `linux-x64`.
Linux needs the native build tools listed by [node-pty](https://github.com/microsoft/node-pty).
Install the VSIX in a separate VS Code profile for manual checks.

| Path | Purpose |
| --- | --- |
| `src/extension.ts` | Sidebar registration, webview assets, and restart command. |
| `src/terminal.ts` | Native terminal, workspace selection, and process lifecycle. |
| `src/webview.ts` | xterm.js terminal and transport to the extension host. |
| `assets/` | Sidebar SVG, Marketplace PNG, README header, and bundled font. |
| `releases/<version>/` | Downloadable VSIX packages and SHA-256 checksums. |

## Release preparation

Update the version in `package.json` and `package-lock.json`, then run:

```sh
npm run release:package
```

This checks and builds the extension, packages the current platform, and writes
the VSIX and `SHA256SUMS.txt` under `releases/<version>/`. The helper supports
Windows and macOS targets with bundled `node-pty` prebuilds. To package both
initial download targets, run:

```sh
npm run release:package -- win32-x64 darwin-arm64
```

For Linux, build on Linux with `npm run package -- --target linux-x64` and put the
package in the version folder. Check each target on its platform before
publishing. Update the download links and release notes for each new version.

The Activity Bar uses the supplied 24 × 24 SVG. The Marketplace icon is a separate
256 × 256 PNG, and the README header is PNG. This follows the
[VS Code publishing rules](https://code.visualstudio.com/api/working-with-extensions/publishing-extension).
Release folders and source-only SVG headers stay out of the VSIX.

These commands only prepare packages. They do not publish to the Marketplace.

## Contributing

Open an issue to report a bug or discuss a larger change. For code changes, create
a focused branch and run `npm run check` and `npm run package -- --target <platform>`.
Check sidebar placement, keyboard input, resizing, hide/show, and restart behavior
in an isolated VS Code profile before you open a pull request.

## Author and acknowledgments

**Martin Hájek** is the author and maintainer of Codex Powerline.

The [Powerline CLI](https://github.com/powerline-dev/codex-powerline-cli) is based
on [ccstatusline](https://github.com/sirmalloc/ccstatusline) by Matthew Breedlove.
This extension uses [xterm.js](https://github.com/xtermjs/xterm.js) and
[node-pty](https://github.com/microsoft/node-pty). See [NOTICE](NOTICE) for attribution.

## License

MIT. See [LICENSE](LICENSE) for the terms and copyright notices.
