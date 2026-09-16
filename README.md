# Private Loom deployment package

Generated from ai-dlc. Do not edit generated files by hand — regenerate them.

This repository is public. The scenario is fictional (Meridian Trust; no customer, payment or
regulatory data). Protected hosting comes from the gateway (`server.mjs`) and the hosting
secrets `DEMO_PASSWORD` and `DEMO_HOSTS`, not from repository visibility.

## Staying in sync with ai-dlc

`dist/` is what ai-dlc's `scripts/customer-demo-illustration.mjs` renders over the base package
named in `private-source/regeneration.json`, from the scenario in `private-source/`.

```sh
node --test scripts/                                   # the checker's own tests
node scripts/sync-check.mjs --ai-dlc ../ai-dlc         # 0 in sync · 1 drift · 2 cannot check
node scripts/regenerate.mjs --ai-dlc ../ai-dlc         # dry run: what --apply would change
node scripts/regenerate.mjs --ai-dlc ../ai-dlc --apply # replace dist/; review; commit
```

`.github/workflows/sync-check.yml` runs the check on every push and daily against ai-dlc `main`,
so drift is a red run, not a memory.
