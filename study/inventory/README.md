# Inventory Workflow

This directory builds a CLI tool inventory from local transcript exports and renders a Markdown report.

## Inputs

- `~/.claude/projects/**/*.jsonl`
- `~/.codex/sessions/**/*.jsonl`
- `~/.gemini/antigravity-cli/history.jsonl` (Antigravity / `agy` CLI)

Note: Antigravity stores conversations in `~/.gemini/antigravity-cli/conversations/*.pb` as encrypted protobuf with non-public Codeium schemas. Only `history.jsonl` (one prompt per line, with `conversationId`) is parseable. For `agy`, the inventory reports sessions (unique `conversationId`) and prompt counts only; tool calls and shell binaries are not extractable.

## Commands

```bash
node --test study/inventory/tests/extract-binaries.test.mjs study/inventory/tests/inventory-core.test.mjs study/inventory/tests/format-report.test.mjs
node study/inventory/parse_transcripts.mjs
node study/inventory/format_report.mjs
```

`parse_transcripts.mjs` writes the complete structured dataset to `study/inventory/tools_inventory.json`. `format_report.mjs` renders `study/inventory/tools_inventory.md` as a Markdown summary view with the top 50 items per CLI table and the top 60 rows in the binary union table.

## Outputs

- `study/inventory/tools_inventory.json`: complete structured dataset
- `study/inventory/tools_inventory.md`: Markdown summary view derived from the JSON output, capped to the top 50 items per CLI table and top 60 rows in the binary union table

## Sanity Checks

```bash
rg -n '"agy"|by_month|examples' study/inventory/tools_inventory.json
rg -n '^## |^\| Binary \|' study/inventory/tools_inventory.md
```
