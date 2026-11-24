---
name: codex-powerline-vscode
description: Maintain the Codex Powerline terminal extension for VS Code, its workspace launch and terminal transport, or its VSIX packaging.
---

# Codex Powerline for VS Code

- Use the sibling CLI repository for launch behavior. Run the installed
  `codex-powerline run` in a PTY so the CLI owns the layout and terminal output.
- For changes that span several concerns, validate and commit each coherent
  change in sequence on the active task branch. Keep unrelated worktree changes
  out of those commits.
- Use the active workspace folder as the process working directory. When
  testing lifecycle changes, check that hiding the view preserves the session
  and that restarting or closing the view cleans up its process.
- Run `npm run check` and package a platform-targeted VSIX. Install it into an
  isolated VS Code profile to check placement, keyboard input, and resizing.
