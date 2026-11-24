---
name: codex-powerline-vscode
description: Maintain the Codex Powerline extension, its sidebar layout and configuration, or its integration with Codex editor tabs in VS Code.
---

# Codex Powerline for VS Code

- Use the sibling Core and CLI repositories for shared settings, widget IDs,
  and reference behavior. Keep VS Code APIs in this repository.
- For changes that span several concerns, validate and commit each coherent
  change in sequence on the active task branch. Keep unrelated worktree
  changes out of those commits.
- Compare layout changes with the CLI renderer, including reserved space,
  absent widget values, and the Author’s Favorite preset. Keep sample values
  out of the live display.
- Verify editor selection in an isolated VS Code profile. Use the active tab
  in its own window to establish the thread identity before reading history.
- Run `npm run check` and `npm run package`. Install the VSIX in the isolated
  profile when checking placement, editor selection, or configuration.
