---
description: Commit current changes, push to origin, and open a Pull Request against develop
---

1. Run the `/pre-pr-check` workflow first and confirm all linting, typechecking, tests, and builds pass.
2. Stage the relevant changes and propose a Conventional Commits message summarizing the module/feature implemented. Show it to me for confirmation before committing.
   // turbo
3. Run `git push -u origin HEAD`
4. Open a PR against `develop` (using `gh pr create --base develop --fill` if GitHub CLI is available, otherwise output the GitHub PR compare URL).
5. The PR description must list:
   - Module / feature implemented
   - Acceptance criteria covered & tests added
   - Verification output
   - Any remaining TODOs or open questions
