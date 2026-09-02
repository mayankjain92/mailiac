---
description: Create a correctly named feature branch off latest develop before starting work
---

// turbo

1. Run `git fetch origin`
   // turbo
2. Run `git checkout develop && git pull origin develop`
3. Ask me for the owner name and module name if not already provided, then run:
   `git checkout -b feat/<owner>/<module-name>`
4. Confirm the feature branch was created and report its active name.
