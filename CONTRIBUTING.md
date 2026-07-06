# Contributing to make-sfx

Thanks for helping grow procedural game audio tooling.

## Quick start

```bash
pnpm install
pnpm build
pnpm test
pnpm verify:engineer
```

## Good first issues

Look for issues labeled [`good first issue`](https://github.com/Tuntii/make-sfx/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22).

## Adding a preset

1. Add params in `packages/core/src/presets.ts` (`presets` + `presetCatalog` with `category`)
2. Map category in `packages/core/src/categories.ts` if new id
3. Add MCP alias in `packages/mcp/src/describe.ts` if needed
4. Run `pnpm test`

## Pull requests

- Keep changes focused
- `pnpm build && pnpm test` must pass (CI enforces this)
- No generated `dist/` commits in package PRs (prepublish builds on npm)

## Demo assets

```bash
pnpm demo:gif          # Remotion → docs/demo.gif
pnpm example:generate  # game pack WAVs
```

Live demo deploys to GitHub Pages on push to `main`.