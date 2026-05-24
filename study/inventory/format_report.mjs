#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const INVENTORY_PATH = fileURLToPath(new URL('./tools_inventory.json', import.meta.url));
const REPORT_PATH = fileURLToPath(new URL('./tools_inventory.md', import.meta.url));
const TOP_CLI_ITEM_ROWS = 50;
const TOP_UNION_BINARY_ROWS = 60;
const CLI_ORDER = [
  ['claude', 'CLAUDE'],
  ['codex', 'CODEX'],
  ['agy', 'AGY'],
];

const AGY_LIMITATION_NOTE =
  'Antigravity transcripts are stored as encrypted .pb files; only session and prompt counts are extracted from `history.jsonl`. Tool calls and shell binaries are not extractable.';

function asNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function markdownCell(value) {
  return String(value ?? '-')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' <br> ');
}

function formatPct(value) {
  return asNumber(value).toFixed(1);
}

function sortItems(items) {
  return [...asArray(items)].sort((left, right) => {
    return (
      asNumber(right.count) - asNumber(left.count) ||
      String(left.name).localeCompare(String(right.name)) ||
      String(left.type).localeCompare(String(right.type))
    );
  });
}

function collectMonthlyRows(cliInventory) {
  const months = new Map();

  for (const item of asArray(cliInventory?.items)) {
    const itemType = item?.type === 'binary' ? 'binary' : 'native_tool';

    for (const [month, count] of Object.entries(item?.by_month ?? {})) {
      if (!months.has(month)) {
        months.set(month, { native_tool: 0, binary: 0, total: 0 });
      }

      const bucket = months.get(month);
      const numericCount = asNumber(count);
      bucket[itemType] += numericCount;
      bucket.total += numericCount;
    }
  }

  return [...months.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function collectBinaryCounts(cliInventory) {
  const counts = new Map();

  for (const item of asArray(cliInventory?.items)) {
    if (item?.type !== 'binary') {
      continue;
    }

    counts.set(String(item.name), asNumber(item.count));
  }

  return counts;
}

function renderCliSection(cliKey, cliName, cliInventory) {
  const items = sortItems(cliInventory?.items).slice(0, TOP_CLI_ITEM_ROWS);
  const monthlyRows = collectMonthlyRows(cliInventory);
  const lines = [];

  lines.push(`## ${cliName}`);
  lines.push('');
  lines.push(`- Sessions: ${asNumber(cliInventory?.sessions)}`);
  lines.push(`- Tool calls: ${asNumber(cliInventory?.totals?.toolCalls)}`);
  lines.push(`- Binary calls: ${asNumber(cliInventory?.totals?.binaryCalls)}`);

  if (cliKey === 'agy') {
    lines.push(`- Prompts: ${asNumber(cliInventory?.totals?.prompts)}`);
  }

  if (cliInventory?.firstSession) {
    lines.push(`- First session: ${cliInventory.firstSession}`);
  }

  if (cliInventory?.lastSession) {
    lines.push(`- Last session: ${cliInventory.lastSession}`);
  }

  if (cliKey === 'agy') {
    lines.push('');
    lines.push(`> ${AGY_LIMITATION_NOTE}`);
  }

  lines.push('');
  lines.push('| Name | Type | Count | % | Example |');
  lines.push('| --- | --- | ---: | ---: | --- |');

  if (items.length === 0) {
    lines.push('| - | - | 0 | 0.0 | - |');
  } else {
    for (const item of items) {
      lines.push(
        `| ${markdownCell(item.name)} | ${markdownCell(item.type)} | ${asNumber(item.count)} | ${formatPct(item.pct)} | ${markdownCell(asArray(item.examples)[0] ?? '-')} |`,
      );
    }
  }

  lines.push('');
  lines.push('| Month | Native Tools | Binaries | Total |');
  lines.push('| --- | ---: | ---: | ---: |');

  if (monthlyRows.length === 0) {
    lines.push('| - | 0 | 0 | 0 |');
  } else {
    for (const [month, counts] of monthlyRows) {
      lines.push(
        `| ${month} | ${counts.native_tool} | ${counts.binary} | ${counts.total} |`,
      );
    }
  }

  return lines.join('\n');
}

function renderBinaryUnion(inventory) {
  const perCli = {
    claude: collectBinaryCounts(inventory?.claude),
    codex: collectBinaryCounts(inventory?.codex),
    agy: collectBinaryCounts(inventory?.agy),
  };
  const names = new Set([
    ...perCli.claude.keys(),
    ...perCli.codex.keys(),
    ...perCli.agy.keys(),
  ]);

  const rows = [...names]
    .map((name) => {
      const claude = perCli.claude.get(name) ?? 0;
      const codex = perCli.codex.get(name) ?? 0;
      const agy = perCli.agy.get(name) ?? 0;
      const total = claude + codex + agy;

      return { name, claude, codex, agy, total };
    })
    .sort((left, right) => {
      return (
        right.total - left.total ||
        left.name.localeCompare(right.name)
      );
    })
    .slice(0, TOP_UNION_BINARY_ROWS);

  const lines = [];
  lines.push('## Binary Union');
  lines.push('');
  lines.push('| Binary | Claude | Codex | Agy | Total |');
  lines.push('| --- | ---: | ---: | ---: | ---: |');

  if (rows.length === 0) {
    lines.push('| - | 0 | 0 | 0 | 0 |');
  } else {
    for (const row of rows) {
      lines.push(
        `| ${markdownCell(row.name)} | ${row.claude} | ${row.codex} | ${row.agy} | ${row.total} |`,
      );
    }
  }

  return lines.join('\n');
}

export function renderReport(inventory) {
  const lines = [];

  lines.push('# Tools Inventory Report');
  lines.push('');
  lines.push(`Generated: ${inventory?.generatedAt ?? '-'}`);
  lines.push('');
  lines.push('| Source | Files |');
  lines.push('| --- | ---: |');
  lines.push(`| Claude | ${asNumber(inventory?.sources?.claudeFiles)} |`);
  lines.push(`| Codex | ${asNumber(inventory?.sources?.codexFiles)} |`);
  lines.push(`| Antigravity (agy) | ${asNumber(inventory?.sources?.agyHistoryFile)} |`);
  lines.push('');
  lines.push(
    `This Markdown report is a summary view. Per-CLI tables show the top ${TOP_CLI_ITEM_ROWS} items by count, and the binary union table shows the top ${TOP_UNION_BINARY_ROWS} binaries by total calls. See \`tools_inventory.json\` for the complete structured dataset.`,
  );
  lines.push('');

  for (const [cliKey, cliName] of CLI_ORDER) {
    lines.push(renderCliSection(cliKey, cliName, inventory?.[cliKey] ?? {}));
    lines.push('');
  }

  lines.push(renderBinaryUnion(inventory));

  return lines.join('\n').trimEnd();
}

export function writeReport(inventoryPath = INVENTORY_PATH, reportPath = REPORT_PATH) {
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
  const report = renderReport(inventory);
  fs.writeFileSync(reportPath, `${report}\n`);
  return reportPath;
}

function isMainModule() {
  return Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  try {
    const outputPath = writeReport();
    console.log(`Wrote ${outputPath}`);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
