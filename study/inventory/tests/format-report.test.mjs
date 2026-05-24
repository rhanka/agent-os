import test from 'node:test';
import assert from 'node:assert/strict';
import { renderReport } from '../format_report.mjs';

function makeItem(name, type, count, byMonth = {}, example = `${name} example`) {
  return {
    name,
    type,
    count,
    pct: count,
    by_month: byMonth,
    examples: [example],
  };
}

function section(report, startHeading, nextHeading) {
  const start = report.indexOf(startHeading);
  assert.notEqual(start, -1, `missing heading ${startHeading}`);

  const end = nextHeading ? report.indexOf(nextHeading, start + startHeading.length) : report.length;
  return report.slice(start, end === -1 ? report.length : end);
}

test('renderReport prints capped per-CLI tables, monthly summaries, escaped examples, and deterministic union counts', () => {
  const claudeItems = [
    makeItem('Bash', 'native_tool', 100, { '2026-05': 3 }, 'printf "a|b"\nsecond line'),
    makeItem('shared-bin', 'binary', 99, { '2026-05': 5, '2026-06': 1 }, 'shared-bin --flag'),
  ];

  for (let index = 1; index <= 53; index += 1) {
    claudeItems.push(
      makeItem(
        `claude-bin-${String(index).padStart(2, '0')}`,
        'binary',
        98 - index,
      ),
    );
  }

  const codexItems = [
    makeItem('shared-bin', 'binary', 7, { '2026-05': 7 }, 'shared-bin codex'),
  ];

  for (let index = 54; index <= 61; index += 1) {
    codexItems.push(
      makeItem(
        `claude-bin-${String(index).padStart(2, '0')}`,
        'binary',
        98 - index,
      ),
    );
  }

  const agyInventory = {
    sessions: 5,
    totals: { toolCalls: 0, binaryCalls: 0, prompts: 18 },
    items: [],
  };

  const report = renderReport({
    generatedAt: '2026-05-18T12:00:00.000Z',
    sources: { claudeFiles: 1, codexFiles: 1, agyHistoryFile: 1 },
    claude: {
      sessions: 1,
      totals: { toolCalls: 55, binaryCalls: 54 },
      items: claudeItems,
    },
    codex: {
      sessions: 1,
      totals: { toolCalls: 9, binaryCalls: 9 },
      items: codexItems,
    },
    agy: agyInventory,
  });

  const claudeSection = section(report, '## CLAUDE', '## CODEX');
  const codexSection = section(report, '## CODEX', '## AGY');
  const agySection = section(report, '## AGY', '## Binary Union');
  const unionSection = section(report, '## Binary Union');

  assert.match(report, /## CLAUDE/);
  assert.match(report, /## CODEX/);
  assert.match(report, /## AGY/);
  assert.match(report, /\| Binary \| Claude \| Codex \| Agy \| Total \|/);
  assert.match(report, /shared-bin/);
  assert.match(
    report,
    /This Markdown report is a summary view\. Per-CLI tables show the top 50 items by count, and the binary union table shows the top 60 binaries by total calls\. See `tools_inventory\.json` for the complete structured dataset\./,
  );

  assert.match(claudeSection, /\| Month \| Native Tools \| Binaries \| Total \|/);
  assert.match(claudeSection, /\| 2026-05 \| 3 \| 5 \| 8 \|/);
  assert.match(claudeSection, /\| 2026-06 \| 0 \| 1 \| 1 \|/);
  assert.match(codexSection, /\| 2026-05 \| 0 \| 7 \| 7 \|/);
  assert.match(agySection, /- Sessions: 5/);
  assert.match(agySection, /- Prompts: 18/);
  assert.match(agySection, /Antigravity transcripts are stored as encrypted \.pb files/);

  assert.match(claudeSection, /printf "a\\\|b" <br> second line/);
  assert.match(unionSection, /\| shared-bin \| 99 \| 7 \| 0 \| 106 \|/);

  assert.match(claudeSection, /\| claude-bin-48 \| binary \| 50 \| 50\.0 \| claude-bin-48 example \|/);
  assert.doesNotMatch(claudeSection, /\| claude-bin-49 \| binary \| 49 \| 49\.0 \| claude-bin-49 example \|/);

  assert.match(unionSection, /\| claude-bin-59 \| 0 \| 39 \| 0 \| 39 \|/);
  assert.doesNotMatch(unionSection, /\| claude-bin-60 \| 0 \| 38 \| 0 \| 38 \|/);
  assert.doesNotMatch(unionSection, /\| claude-bin-61 \| 0 \| 37 \| 0 \| 37 \|/);
});
