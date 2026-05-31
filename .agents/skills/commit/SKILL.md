---
name: commit
description: Create a git commit for the current changes in the World of Promptcraft project. Analyzes staged and unstaged changes, drafts a descriptive commit message, and commits.
disable-model-invocation: true
argument-hint: [optional commit message override]
---

# Commit Changes

Create a git commit for the current changes in the World of Promptcraft project.

## Steps

1. Run `git status` to see all modified, added, and untracked files (never use `-uall` flag).
2. Run `git diff` and `git diff --cached` to review both staged and unstaged changes.
3. Run `git log --oneline -10` to see recent commit style.
4. Analyze the changes and categorize them:
   - **feat**: New feature or content (new NPC, zone, building, effect, UI element)
   - **fix**: Bug fix
   - **refactor**: Code restructuring without behavior change
   - **style**: Visual/CSS/material changes
   - **perf**: Performance improvement
   - **docs**: Documentation only
   - **chore**: Build, config, dependency changes
5. Draft a commit message in conventional commit format: `type(scope): description`
   - Scope should be `client`, `server`, `scene`, `ui`, `agents`, `world`, etc.
   - Description should be concise and explain the **why**, not just the **what**
6. If `$ARGUMENTS` is provided, use it as the commit message instead of drafting one.
7. Stage the relevant files (prefer specific files over `git add -A`).
8. **Do NOT commit** files that may contain secrets (`.env`, credentials, API keys). Warn if detected.
9. Create the commit with the message, appending the co-author line:
   ```
   Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
   ```
10. Run `git status` after commit to verify success.
11. Show the user the commit hash and summary. Do NOT push unless explicitly asked.
