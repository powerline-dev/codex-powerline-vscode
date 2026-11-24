# Codex Powerline for VS Code

Open **Codex Powerline** from the Activity Bar to run `codex-powerline run`
in the sidebar. The terminal starts in the open workspace folder. In a
multi-root workspace it uses the folder containing the active file, or the
first folder if no file is active. Widen the sidebar to give the CLI more columns.

Install the [Powerline CLI](https://github.com/powerline-dev/codex-powerline-cli)
and [Codex CLI](https://learn.chatgpt.com/docs/codex/cli) so VS Code can find
them on PATH. Powerline uses the installed CLI's settings, including the preset
and widgets. Use **Restart Terminal** in the Terminal header to start a fresh
process.

## Install locally

Install the VSIX with **Extensions → Install from VSIX…**. To build for your
machine with Node.js 22.12 or later, run:

```sh
npm ci
npm run package -- --target darwin-arm64
```

Replace `darwin-arm64` with the VS Code target for your platform. Build on the
target platform so the native terminal module is available. Linux builds also
need the native build tools listed by [node-pty](https://github.com/microsoft/node-pty).
