# Codex Powerline for VS Code 0.2.3

Download the VSIX for your platform. In VS Code, open Extensions, select the
`...` menu, and choose **Install from VSIX...**.

| Platform | Package |
| --- | --- |
| Windows x64 | [Download](codex-powerline-vscode-win32-x64-0.2.3.vsix) |
| macOS Apple silicon | [Download](codex-powerline-vscode-darwin-arm64-0.2.3.vsix) |

On GitHub, open the file and select **Download raw file**. The main
[README](../../README.md#-install) also has direct download links.

## Changes

- Use the custom Powerline icon in the Activity Bar and sidebar view.
- Add a 256 × 256 PNG Marketplace icon and PNG README header.
- Match the CLI README's design, with setup, features, and development sections.
- Add versioned local release packaging and SHA-256 checksums.

## Requirements

- VS Code 1.96.2 or newer.
- Codex CLI and Codex Powerline CLI installed and available on PATH.
- Node.js 22.12 or newer for the CLI setup.

Packages contain platform-specific native terminal code. The macOS package uses
the upstream bundled Apple silicon prebuild. Building it on Windows does not
test macOS behavior. Test it on macOS before Marketplace publication.

Compare the file's SHA-256 hash with [SHA256SUMS.txt](SHA256SUMS.txt):

```powershell
Get-FileHash ./codex-powerline-vscode-win32-x64-0.2.3.vsix -Algorithm SHA256
```

```sh
shasum -a 256 codex-powerline-vscode-darwin-arm64-0.2.3.vsix
```

These are repository downloads, not a Marketplace publication.
