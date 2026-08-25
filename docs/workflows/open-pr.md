---
description: Commit current changes, push, and open a PR against develop
---

1. Call /pre-pr-check first and confirm everything passes.
2. Stage the changes and propose a Conventional Commits message summarizing the
   module implemented — show it to me for confirmation before committing.
   // turbo
3. Run `git push -u origin HEAD`
4. Open a PR against `develop` (using `gh pr create --base develop --fill` if the
   GitHub CLI is available, otherwise report the compare URL). Description should
   list: module implemented, acceptance criteria covered, any remaining TODOs.
