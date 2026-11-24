# Codex Powerline for VS Code

Powerline adds a collapsible section below Codex in the same sidebar. Open the Codex sidebar with the Codex icon, then open a local Codex conversation as an editor tab. Powerline follows the active tab in each window. In regular editors and new Codex tabs awaiting a thread ID, it shows the available project and account metrics.

Powerline follows the official extension’s choice of sidebar. Codex uses its secondary sidebar container in VS Code 1.106 and later and its primary sidebar container on older supported versions.

## Install locally

With Node.js 22.12 or later, run these commands from the repository root.

```sh
npm ci
npm run package
code --install-extension codex-powerline-vscode-0.1.2.vsix
```

You can also use **Extensions → Install from VSIX…** in VS Code. The extension depends on the official **Codex** extension (`openai.chatgpt`). Use `npm run build` to build the extension entry point for an Extension Development Host.

Use **Open Saved Conversation** in the Powerline header or the Command Palette to open a local chat as a Codex editor tab. For a Codex draft that keeps its draft address after the first reply, use this action to open the saved chat in a tab with its thread ID. Open two conversations this way and switch tabs to see Powerline update.

## Metrics

- The working directory and Git branch, file and line changes, and counts ahead of and behind the configured upstream. Git reads use local refs.
- The active thread’s title, ID, model, reasoning effort, context use, cumulative tokens, and cache metrics when Codex has recorded them. Powerline reads local rollouts and the session index from `CODEX_HOME`, which defaults to `~/.codex`. The conversation widgets show last-recorded values.
- The 5-hour and 7-day usage windows and reset times when the local App Server can access a signed-in account. Powerline calls [`account/rateLimits/read`](https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/src/protocol/v2/account.rs) through the official extension’s bundled Codex executable when available, honoring the official executable override. Limit data refreshes once a minute while Powerline is visible.

Chat Status and Permissions show the last status event and permission settings recorded by Codex. Session Cost requires a reported USD cost, which the local history adapter does not supply. Fast Mode requires an explicit service tier in the recorded turn settings. Widgets without source values are hidden. Git and App Server reads require a trusted workspace.

The default layout adapts the shared **Author’s Favorite** preset to the sidebar width and adds thread and token rows. Widgets with `reserveSpace` keep a blank cell while their values are unavailable. The preset aligns columns across rows and wraps the rows to fit narrower sidebars. Use the gear in the Powerline header to import a CLI settings export or a Core preset JSON file. Powerline applies the layout immediately and saves it to `codexPowerline.layout` in User Settings. Clear that setting to restore the default layout. Terminal-only widgets and formatting are skipped.
