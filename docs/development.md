# Development

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

## Contribution checks

Contributions are welcome! Open an issue to report a bug or discuss a larger change. For code changes, create
a focused branch and run `npm run check` and `npm run package -- --target <platform>`.
Check sidebar placement, keyboard input, resizing, hide/show, and restart behavior
in an isolated VS Code profile before you open a pull request.

[Back to the project README](../README.md)
