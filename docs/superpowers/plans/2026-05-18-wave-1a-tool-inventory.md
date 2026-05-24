# Wave 1A Tool Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ad hoc `study/inventory` scripts with a deterministic Node.js pipeline that parses Claude, Codex, and Gemini session logs, aggregates native-tool and shell-binary usage by month, and writes decision-ready `tools_inventory.json` and `tools_inventory.md`.

**Architecture:** Keep the workflow in plain Node.js ESM scripts under `study/inventory/` so it stays easy to run in a throwaway study workspace. Extract shell parsing and inventory aggregation into small modules that can be tested with Node's built-in test runner, then keep `parse_transcripts.mjs` as the entrypoint and `format_report.mjs` as the report renderer that consumes the structured JSON artifact. `/home/antoinefa/src/agent-os` is not a Git repository today, so this plan omits commit steps until the user decides whether to initialize git.

**Tech Stack:** Node.js ESM, `node:test`, JSONL transcript files under `~/.claude/projects`, `~/.codex/sessions`, and `~/.gemini/tmp/*/chats`.

---

## File Structure

- Create: `study/inventory/extract_binaries.mjs` for shell segment splitting, wrapper stripping, and binary normalization.
- Create: `study/inventory/inventory_core.mjs` for file discovery, per-CLI aggregation, monthly bucketing, and JSON output shaping.
- Create: `study/inventory/tests/extract-binaries.test.mjs` for shell parsing behavior.
- Create: `study/inventory/tests/inventory-core.test.mjs` for fixture-based Claude/Codex/Gemini aggregation.
- Create: `study/inventory/tests/format-report.test.mjs` for Markdown rendering.
- Create: `study/inventory/tests/fixtures/claude.jsonl` as a minimal Claude transcript fixture.
- Create: `study/inventory/tests/fixtures/codex.jsonl` as a minimal Codex transcript fixture.
- Create: `study/inventory/tests/fixtures/gemini.jsonl` as a minimal Gemini transcript fixture using the real `.gemini` `toolCalls` shape.
- Create: `study/inventory/README.md` documenting commands, source directories, and expected outputs.
- Modify: `study/inventory/parse_transcripts.mjs` to call `inventory_core.mjs` and write `tools_inventory.json`.
- Modify: `study/inventory/format_report.mjs` to read `tools_inventory.json`, render top-50 tables, union tables, and monthly trends, then write `tools_inventory.md`.
- Generate: `study/inventory/tools_inventory.json`.
- Generate: `study/inventory/tools_inventory.md`.

### Task 1: Lock Shell Binary Extraction

**Files:**
- Create: `study/inventory/extract_binaries.mjs`
- Test: `study/inventory/tests/extract-binaries.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractBinaries } from '../extract_binaries.mjs';

test('extractBinaries keeps root binaries across shell separators', () => {
  assert.deepEqual(
    extractBinaries('FOO=bar sudo rg "TODO" src | sed -n "1,5p" && node scripts/build.mjs'),
    ['rg', 'sed', 'node'],
  );
});

test('extractBinaries drops shell builtins and empty control fragments', () => {
  assert.deepEqual(
    extractBinaries('cd repo && export FOO=bar && pwd && npm test'),
    ['npm'],
  );
});

test('extractBinaries normalizes absolute paths to basenames', () => {
  assert.deepEqual(
    extractBinaries('/usr/bin/git status ; /bin/bash -lc "echo noop"'),
    ['git', 'bash'],
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test study/inventory/tests/extract-binaries.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `study/inventory/extract_binaries.mjs`

- [ ] **Step 3: Write minimal implementation**

```js
const SEGMENT_SPLIT_RE = /(?:\|\||&&|;|\||\n)/;
const LEADING_ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S+)\s*/;
const ROOT_TOKEN_RE = /^([A-Za-z0-9_./-]+)/;

const WRAPPER_WORDS = new Set(['sudo', 'time', 'command', 'env', 'nohup', 'nice', 'exec']);
const SHELL_BUILTINS = new Set([
  '.', ':', '[', '[[', 'alias', 'bg', 'break', 'cd', 'continue', 'declare', 'dirs', 'disown',
  'echo', 'eval', 'exec', 'exit', 'export', 'false', 'fg', 'getopts', 'hash', 'jobs', 'let',
  'local', 'popd', 'printf', 'pushd', 'pwd', 'read', 'readonly', 'return', 'set', 'shift',
  'source', 'test', 'times', 'trap', 'true', 'type', 'typeset', 'ulimit', 'umask', 'unalias',
  'unset', 'wait',
]);

function stripAssignments(segment) {
  let value = segment.trim();
  while (LEADING_ASSIGNMENT_RE.test(value)) {
    value = value.replace(LEADING_ASSIGNMENT_RE, '').trim();
  }
  return value;
}

function stripWrappers(segment) {
  let value = segment;
  while (true) {
    const match = value.match(ROOT_TOKEN_RE);
    if (!match) return value;
    const token = match[1].includes('/') ? match[1].split('/').pop() : match[1];
    if (!WRAPPER_WORDS.has(token)) return value;
    value = value.slice(match[0].length).trim();
  }
}

export function extractBinaries(command) {
  if (typeof command !== 'string' || command.trim() === '') return [];

  const seen = new Set();
  const binaries = [];

  for (const rawSegment of command.split(SEGMENT_SPLIT_RE)) {
    const segment = stripWrappers(stripAssignments(rawSegment).replace(/^[({<]+/, '').trim());
    const match = segment.match(ROOT_TOKEN_RE);
    if (!match) continue;

    let token = match[1];
    if (token.includes('/')) token = token.split('/').pop();
    if (!token || SHELL_BUILTINS.has(token) || /^\d+$/.test(token)) continue;

    if (!seen.has(token)) {
      seen.add(token);
      binaries.push(token);
    }
  }

  return binaries;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test study/inventory/tests/extract-binaries.test.mjs`
Expected: PASS for all 3 tests

### Task 2: Build Structured Claude and Codex Inventory

**Files:**
- Create: `study/inventory/inventory_core.mjs`
- Create: `study/inventory/tests/fixtures/claude.jsonl`
- Create: `study/inventory/tests/fixtures/codex.jsonl`
- Create: `study/inventory/tests/inventory-core.test.mjs`
- Modify: `study/inventory/parse_transcripts.mjs`

- [ ] **Step 1: Write the failing fixture-based tests**

`study/inventory/tests/fixtures/claude.jsonl`

```json
{"timestamp":"2026-05-01T10:00:00.000Z","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"rg TODO src | sed -n '1,5p'"}},{"type":"tool_use","name":"Read","input":{"file_path":"README.md"}}]}}
```

`study/inventory/tests/fixtures/codex.jsonl`

```json
{"timestamp":"2026-05-02T09:00:00.000Z","type":"response_item","payload":{"type":"function_call","name":"exec_command","arguments":"{\"cmd\":\"git status && node scripts/check.mjs\"}"}}
{"timestamp":"2026-05-02T09:01:00.000Z","type":"response_item","payload":{"type":"function_call","name":"update_plan","arguments":"{\"plan\":[]}"}}
```

`study/inventory/tests/inventory-core.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { buildInventory } from '../inventory_core.mjs';

const fixture = (name) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

test('buildInventory aggregates Claude and Codex into numeric monthly totals', async () => {
  const inventory = await buildInventory({
    claudeFiles: [fixture('claude.jsonl')],
    codexFiles: [fixture('codex.jsonl')],
    geminiFiles: [],
  });

  assert.equal(inventory.claude.sessions, 1);
  assert.equal(inventory.codex.sessions, 1);
  assert.equal(inventory.claude.totals.toolCalls, 2);
  assert.equal(inventory.claude.totals.binaryCalls, 2);
  assert.equal(typeof inventory.claude.totals.binaryCalls, 'number');

  const claudeRg = inventory.claude.items.find((item) => item.name === 'rg' && item.type === 'binary');
  assert.deepEqual(claudeRg.by_month, { '2026-05': 1 });
  assert.deepEqual(claudeRg.examples, ['rg TODO src | sed -n \'1,5p\'']);

  const codexExec = inventory.codex.items.find((item) => item.name === 'exec_command' && item.type === 'native_tool');
  assert.equal(codexExec.count, 1);

  const codexGit = inventory.codex.items.find((item) => item.name === 'git' && item.type === 'binary');
  assert.deepEqual(codexGit.by_month, { '2026-05': 1 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test study/inventory/tests/inventory-core.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `study/inventory/inventory_core.mjs`

- [ ] **Step 3: Implement the core inventory model and refactor the entrypoint**

`study/inventory/inventory_core.mjs`

```js
import fs from 'node:fs';
import readline from 'node:readline';
import { extractBinaries } from './extract_binaries.mjs';

function createAggregate() {
  return {
    tools: Object.create(null),
    binaries: Object.create(null),
    sessions: 0,
    firstSession: null,
    lastSession: null,
  };
}

function monthKey(timestamp) {
  return typeof timestamp === 'string' ? timestamp.slice(0, 7) : 'unknown';
}

function touchSession(aggregate, timestamp) {
  if (!timestamp) return;
  if (!aggregate.firstSession || timestamp < aggregate.firstSession) aggregate.firstSession = timestamp;
  if (!aggregate.lastSession || timestamp > aggregate.lastSession) aggregate.lastSession = timestamp;
}

function recordItem(bucket, name, month, example) {
  if (!name) return;
  if (!bucket[name]) {
    bucket[name] = { count: 0, by_month: Object.create(null), examples: [] };
  }
  bucket[name].count += 1;
  bucket[name].by_month[month] = (bucket[name].by_month[month] || 0) + 1;
  if (example && bucket[name].examples.length < 3 && !bucket[name].examples.includes(example)) {
    bucket[name].examples.push(example);
  }
}

function finalizeItems(bucket, type) {
  const total = Object.values(bucket).reduce((sum, entry) => sum + entry.count, 0);
  return Object.entries(bucket)
    .map(([name, entry]) => ({
      name,
      type,
      count: entry.count,
      pct: total === 0 ? 0 : Number((entry.count / total * 100).toFixed(2)),
      by_month: entry.by_month,
      examples: entry.examples,
    }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
}

async function parseClaudeFile(filepath, aggregate) {
  const rl = readline.createInterface({ input: fs.createReadStream(filepath), crlfDelay: Infinity });
  let countedSession = false;
  for await (const line of rl) {
    if (!line.trim()) continue;
    let payload;
    try {
      payload = JSON.parse(line);
    } catch {
      continue;
    }

    const timestamp = payload.timestamp;
    const month = monthKey(timestamp);
    if (!countedSession) {
      aggregate.sessions += 1;
      countedSession = true;
    }
    touchSession(aggregate, timestamp);

    const content = payload.message?.content;
    if (!Array.isArray(content)) continue;

    for (const item of content) {
      if (item?.type !== 'tool_use') continue;
      recordItem(aggregate.tools, item.name || 'unknown', month, item.input?.command ?? item.input?.file_path);
      if (item.name === 'Bash' && typeof item.input?.command === 'string') {
        for (const binary of extractBinaries(item.input.command)) {
          recordItem(aggregate.binaries, binary, month, item.input.command);
        }
      }
    }
  }
}

async function parseCodexFile(filepath, aggregate) {
  const rl = readline.createInterface({ input: fs.createReadStream(filepath), crlfDelay: Infinity });
  let countedSession = false;
  for await (const line of rl) {
    if (!line.trim()) continue;
    let payload;
    try {
      payload = JSON.parse(line);
    } catch {
      continue;
    }

    const timestamp = payload.timestamp;
    const month = monthKey(timestamp);
    if (!countedSession) {
      aggregate.sessions += 1;
      countedSession = true;
    }
    touchSession(aggregate, timestamp);

    if (payload.type !== 'response_item' || !payload.payload) continue;
    if (payload.payload.type !== 'function_call') continue;

    const name = payload.payload.name || 'unknown';
    recordItem(aggregate.tools, name, month, payload.payload.arguments);

    let args = payload.payload.arguments;
    if (typeof args === 'string') {
      try {
        args = JSON.parse(args);
      } catch {
        args = null;
      }
    }

    const command = args?.cmd || args?.command || (Array.isArray(args?.argv) ? args.argv.join(' ') : null);
    if (typeof command === 'string') {
      for (const binary of extractBinaries(command)) {
        recordItem(aggregate.binaries, binary, month, command);
      }
    }
  }
}

export async function buildInventory({ claudeFiles, codexFiles, geminiFiles }) {
  const claude = createAggregate();
  const codex = createAggregate();

  for (const filepath of claudeFiles) await parseClaudeFile(filepath, claude);
  for (const filepath of codexFiles) await parseCodexFile(filepath, codex);

  return {
    generatedAt: new Date().toISOString(),
    sources: {
      claudeFiles: claudeFiles.length,
      codexFiles: codexFiles.length,
      geminiFiles: geminiFiles.length,
    },
    claude: {
      sessions: claude.sessions,
      firstSession: claude.firstSession,
      lastSession: claude.lastSession,
      totals: {
        toolCalls: Object.values(claude.tools).reduce((sum, entry) => sum + entry.count, 0),
        binaryCalls: Object.values(claude.binaries).reduce((sum, entry) => sum + entry.count, 0),
      },
      items: [...finalizeItems(claude.tools, 'native_tool'), ...finalizeItems(claude.binaries, 'binary')],
    },
    codex: {
      sessions: codex.sessions,
      firstSession: codex.firstSession,
      lastSession: codex.lastSession,
      totals: {
        toolCalls: Object.values(codex.tools).reduce((sum, entry) => sum + entry.count, 0),
        binaryCalls: Object.values(codex.binaries).reduce((sum, entry) => sum + entry.count, 0),
      },
      items: [...finalizeItems(codex.tools, 'native_tool'), ...finalizeItems(codex.binaries, 'binary')],
    },
    gemini: {
      sessions: 0,
      firstSession: null,
      lastSession: null,
      totals: { toolCalls: 0, binaryCalls: 0 },
      items: [],
    },
  };
}
```

`study/inventory/parse_transcripts.mjs`

```js
#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildInventory } from './inventory_core.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

function findJsonlFiles(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(target);
      if (entry.isFile() && target.endsWith('.jsonl')) files.push(target);
    }
  }
  return files.sort();
}

const inventory = await buildInventory({
  claudeFiles: findJsonlFiles(path.join(process.env.HOME, '.claude', 'projects')),
  codexFiles: findJsonlFiles(path.join(process.env.HOME, '.codex', 'sessions')),
  geminiFiles: [],
});

const outputPath = path.join(here, 'tools_inventory.json');
fs.writeFileSync(outputPath, JSON.stringify(inventory, null, 2));
process.stdout.write(`Wrote ${outputPath}\n`);
```

- [ ] **Step 4: Run the tests and the parser**

Run: `node --test study/inventory/tests/extract-binaries.test.mjs study/inventory/tests/inventory-core.test.mjs`
Expected: PASS for both files

Run: `node study/inventory/parse_transcripts.mjs`
Expected: prints `Wrote /home/antoinefa/src/agent-os/study/inventory/tools_inventory.json`

### Task 3: Add Gemini Support and Default Source Discovery

**Files:**
- Create: `study/inventory/tests/fixtures/gemini.jsonl`
- Modify: `study/inventory/tests/inventory-core.test.mjs`
- Modify: `study/inventory/inventory_core.mjs`
- Modify: `study/inventory/parse_transcripts.mjs`

- [ ] **Step 1: Extend the fixture suite with a failing Gemini case**

`study/inventory/tests/fixtures/gemini.jsonl`

```json
{"sessionId":"85e7b2ed-9510-4a83-9c02-059e0dd44fb8","projectHash":"demo","startTime":"2026-05-03T14:57:09.630Z","lastUpdated":"2026-05-03T14:57:09.630Z","kind":"main"}
{"id":"2b115e89-c29d-4b29-a028-c94d7569943c","timestamp":"2026-05-03T21:42:12.445Z","type":"gemini","content":"","toolCalls":[{"id":"ddanbz98","name":"run_shell_command","args":{"command":"cat << 'EOF' > /tmp/check_sig.py\npython /tmp/check_sig.py"}}],"status":"success"}
```

Append this test to `study/inventory/tests/inventory-core.test.mjs`:

```js
test('buildInventory parses Gemini toolCalls and shell commands', async () => {
  const inventory = await buildInventory({
    claudeFiles: [],
    codexFiles: [],
    geminiFiles: [fixture('gemini.jsonl')],
  });

  assert.equal(inventory.gemini.sessions, 1);
  assert.equal(inventory.gemini.totals.toolCalls, 1);

  const tool = inventory.gemini.items.find((item) => item.name === 'run_shell_command' && item.type === 'native_tool');
  assert.equal(tool.count, 1);

  const python = inventory.gemini.items.find((item) => item.name === 'python' && item.type === 'binary');
  assert.deepEqual(python.by_month, { '2026-05': 1 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test study/inventory/tests/inventory-core.test.mjs`
Expected: FAIL because `inventory.gemini.sessions` is still `0`

- [ ] **Step 3: Implement Gemini parsing and real source discovery**

Replace `study/inventory/inventory_core.mjs` with:

```js
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { extractBinaries } from './extract_binaries.mjs';

function createAggregate() {
  return {
    tools: Object.create(null),
    binaries: Object.create(null),
    sessions: 0,
    firstSession: null,
    lastSession: null,
  };
}

function monthKey(timestamp) {
  return typeof timestamp === 'string' ? timestamp.slice(0, 7) : 'unknown';
}

function touchSession(aggregate, timestamp) {
  if (!timestamp) return;
  if (!aggregate.firstSession || timestamp < aggregate.firstSession) aggregate.firstSession = timestamp;
  if (!aggregate.lastSession || timestamp > aggregate.lastSession) aggregate.lastSession = timestamp;
}

function recordItem(bucket, name, month, example) {
  if (!name) return;
  if (!bucket[name]) bucket[name] = { count: 0, by_month: Object.create(null), examples: [] };
  bucket[name].count += 1;
  bucket[name].by_month[month] = (bucket[name].by_month[month] || 0) + 1;
  if (example && bucket[name].examples.length < 3 && !bucket[name].examples.includes(example)) {
    bucket[name].examples.push(example);
  }
}

function finalizeItems(bucket, type) {
  const total = Object.values(bucket).reduce((sum, entry) => sum + entry.count, 0);
  return Object.entries(bucket)
    .map(([name, entry]) => ({
      name,
      type,
      count: entry.count,
      pct: total === 0 ? 0 : Number((entry.count / total * 100).toFixed(2)),
      by_month: entry.by_month,
      examples: entry.examples,
    }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
}

function findJsonlFiles(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(target);
      if (entry.isFile() && target.endsWith('.jsonl')) files.push(target);
    }
  }
  return files.sort();
}

async function parseClaudeFile(filepath, aggregate) {
  const rl = readline.createInterface({ input: fs.createReadStream(filepath), crlfDelay: Infinity });
  let countedSession = false;
  for await (const line of rl) {
    if (!line.trim()) continue;
    let payload;
    try { payload = JSON.parse(line); } catch { continue; }

    const timestamp = payload.timestamp;
    const month = monthKey(timestamp);
    if (!countedSession) {
      aggregate.sessions += 1;
      countedSession = true;
    }
    touchSession(aggregate, timestamp);

    const content = payload.message?.content;
    if (!Array.isArray(content)) continue;

    for (const item of content) {
      if (item?.type !== 'tool_use') continue;
      recordItem(aggregate.tools, item.name || 'unknown', month, item.input?.command ?? item.input?.file_path);
      if (item.name === 'Bash' && typeof item.input?.command === 'string') {
        for (const binary of extractBinaries(item.input.command)) {
          recordItem(aggregate.binaries, binary, month, item.input.command);
        }
      }
    }
  }
}

async function parseCodexFile(filepath, aggregate) {
  const rl = readline.createInterface({ input: fs.createReadStream(filepath), crlfDelay: Infinity });
  let countedSession = false;
  for await (const line of rl) {
    if (!line.trim()) continue;
    let payload;
    try { payload = JSON.parse(line); } catch { continue; }

    const timestamp = payload.timestamp;
    const month = monthKey(timestamp);
    if (!countedSession) {
      aggregate.sessions += 1;
      countedSession = true;
    }
    touchSession(aggregate, timestamp);

    if (payload.type !== 'response_item' || !payload.payload || payload.payload.type !== 'function_call') continue;
    const name = payload.payload.name || 'unknown';
    recordItem(aggregate.tools, name, month, payload.payload.arguments);

    let args = payload.payload.arguments;
    if (typeof args === 'string') {
      try { args = JSON.parse(args); } catch { args = null; }
    }

    const command = args?.cmd || args?.command || (Array.isArray(args?.argv) ? args.argv.join(' ') : null);
    if (typeof command === 'string') {
      for (const binary of extractBinaries(command)) {
        recordItem(aggregate.binaries, binary, month, command);
      }
    }
  }
}

async function parseGeminiFile(filepath, aggregate) {
  const rl = readline.createInterface({ input: fs.createReadStream(filepath), crlfDelay: Infinity });
  let countedSession = false;
  for await (const line of rl) {
    if (!line.trim()) continue;
    let payload;
    try { payload = JSON.parse(line); } catch { continue; }

    const timestamp = payload.timestamp || payload.startTime;
    const month = monthKey(timestamp);
    if (!countedSession && payload.sessionId) {
      aggregate.sessions += 1;
      countedSession = true;
    }
    touchSession(aggregate, payload.lastUpdated || timestamp);

    if (!Array.isArray(payload.toolCalls)) continue;
    for (const call of payload.toolCalls) {
      recordItem(aggregate.tools, call.name || 'unknown', month, call.args?.command);
      const command = call.args?.command;
      if (typeof command === 'string') {
        for (const binary of extractBinaries(command)) {
          recordItem(aggregate.binaries, binary, month, command);
        }
      }
    }
  }
}

export function discoverDefaultSources() {
  const home = process.env.HOME;
  return {
    claudeFiles: findJsonlFiles(path.join(home, '.claude', 'projects')),
    codexFiles: findJsonlFiles(path.join(home, '.codex', 'sessions')),
    geminiFiles: findJsonlFiles(path.join(home, '.gemini', 'tmp')),
  };
}

export async function buildInventory({ claudeFiles, codexFiles, geminiFiles }) {
  const claude = createAggregate();
  const codex = createAggregate();
  const gemini = createAggregate();

  for (const filepath of claudeFiles) await parseClaudeFile(filepath, claude);
  for (const filepath of codexFiles) await parseCodexFile(filepath, codex);
  for (const filepath of geminiFiles) await parseGeminiFile(filepath, gemini);

  return {
    generatedAt: new Date().toISOString(),
    sources: {
      claudeFiles: claudeFiles.length,
      codexFiles: codexFiles.length,
      geminiFiles: geminiFiles.length,
    },
    claude: {
      sessions: claude.sessions,
      firstSession: claude.firstSession,
      lastSession: claude.lastSession,
      totals: {
        toolCalls: Object.values(claude.tools).reduce((sum, entry) => sum + entry.count, 0),
        binaryCalls: Object.values(claude.binaries).reduce((sum, entry) => sum + entry.count, 0),
      },
      items: [...finalizeItems(claude.tools, 'native_tool'), ...finalizeItems(claude.binaries, 'binary')],
    },
    codex: {
      sessions: codex.sessions,
      firstSession: codex.firstSession,
      lastSession: codex.lastSession,
      totals: {
        toolCalls: Object.values(codex.tools).reduce((sum, entry) => sum + entry.count, 0),
        binaryCalls: Object.values(codex.binaries).reduce((sum, entry) => sum + entry.count, 0),
      },
      items: [...finalizeItems(codex.tools, 'native_tool'), ...finalizeItems(codex.binaries, 'binary')],
    },
    gemini: {
      sessions: gemini.sessions,
      firstSession: gemini.firstSession,
      lastSession: gemini.lastSession,
      totals: {
        toolCalls: Object.values(gemini.tools).reduce((sum, entry) => sum + entry.count, 0),
        binaryCalls: Object.values(gemini.binaries).reduce((sum, entry) => sum + entry.count, 0),
      },
      items: [...finalizeItems(gemini.tools, 'native_tool'), ...finalizeItems(gemini.binaries, 'binary')],
    },
  };
}
```

Replace `study/inventory/parse_transcripts.mjs` with:

```js
#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildInventory, discoverDefaultSources } from './inventory_core.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.join(here, 'tools_inventory.json');

const inventory = await buildInventory(discoverDefaultSources());
fs.writeFileSync(outputPath, JSON.stringify(inventory, null, 2));
process.stdout.write(`Wrote ${outputPath}\n`);
```

- [ ] **Step 4: Run tests and regenerate the JSON artifact**

Run: `node --test study/inventory/tests/extract-binaries.test.mjs study/inventory/tests/inventory-core.test.mjs`
Expected: PASS, including Gemini assertions

Run: `node study/inventory/parse_transcripts.mjs`
Expected: prints `Wrote /home/antoinefa/src/agent-os/study/inventory/tools_inventory.json`

Run: `rg -n '"gemini"|by_month|examples' study/inventory/tools_inventory.json`
Expected: multiple matches showing Gemini sections and per-item monthly buckets

### Task 4: Render the Markdown Report and Document the Workflow

**Files:**
- Create: `study/inventory/tests/format-report.test.mjs`
- Modify: `study/inventory/format_report.mjs`
- Create: `study/inventory/README.md`

- [ ] **Step 1: Write the failing renderer test**

`study/inventory/tests/format-report.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderReport } from '../format_report.mjs';

test('renderReport prints per-CLI sections and a union binary table', () => {
  const report = renderReport({
    generatedAt: '2026-05-18T12:00:00.000Z',
    sources: { claudeFiles: 1, codexFiles: 1, geminiFiles: 1 },
    claude: {
      sessions: 1,
      totals: { toolCalls: 2, binaryCalls: 2 },
      items: [
        { name: 'Bash', type: 'native_tool', count: 1, pct: 50, by_month: { '2026-05': 1 }, examples: ['rg TODO src'] },
        { name: 'rg', type: 'binary', count: 1, pct: 50, by_month: { '2026-05': 1 }, examples: ['rg TODO src'] },
      ],
    },
    codex: { sessions: 1, totals: { toolCalls: 1, binaryCalls: 1 }, items: [] },
    gemini: { sessions: 1, totals: { toolCalls: 1, binaryCalls: 1 }, items: [] },
  });

  assert.match(report, /## CLAUDE/);
  assert.match(report, /## CODEX/);
  assert.match(report, /## GEMINI/);
  assert.match(report, /\| Binary \| Claude \| Codex \| Gemini \| Total \|/);
  assert.match(report, /rg/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test study/inventory/tests/format-report.test.mjs`
Expected: FAIL because `format_report.mjs` does not export `renderReport`

- [ ] **Step 3: Implement the renderer and the runbook**

Replace `study/inventory/format_report.mjs` with:

```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const jsonPath = path.join(here, 'tools_inventory.json');
const markdownPath = path.join(here, 'tools_inventory.md');

function monthlySummary(items) {
  const months = new Map();
  for (const item of items) {
    for (const [month, count] of Object.entries(item.by_month)) {
      months.set(month, (months.get(month) || 0) + count);
    }
  }
  return [...months.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function unionBinaryTable(inventory) {
  const rows = new Map();
  for (const cli of ['claude', 'codex', 'gemini']) {
    for (const item of inventory[cli].items.filter((entry) => entry.type === 'binary')) {
      if (!rows.has(item.name)) rows.set(item.name, { claude: 0, codex: 0, gemini: 0 });
      rows.get(item.name)[cli] = item.count;
    }
  }
  return [...rows.entries()]
    .map(([name, counts]) => ({ name, ...counts, total: counts.claude + counts.codex + counts.gemini }))
    .sort((left, right) => right.total - left.total || left.name.localeCompare(right.name));
}

export function renderReport(inventory) {
  const lines = [];
  lines.push('# Tools Inventory');
  lines.push('');
  lines.push(`Generated at: ${inventory.generatedAt}`);
  lines.push(`Sources: Claude ${inventory.sources.claudeFiles}, Codex ${inventory.sources.codexFiles}, Gemini ${inventory.sources.geminiFiles}`);
  lines.push('');

  for (const cli of ['claude', 'codex', 'gemini']) {
    const upper = cli.toUpperCase();
    const section = inventory[cli];
    lines.push(`## ${upper}`);
    lines.push('');
    lines.push(`Sessions: ${section.sessions}`);
    lines.push(`Tool calls: ${section.totals.toolCalls}`);
    lines.push(`Binary calls: ${section.totals.binaryCalls}`);
    lines.push('');
    lines.push('| Name | Type | Count | % | Example |');
    lines.push('| --- | --- | ---: | ---: | --- |');
    for (const item of section.items.slice(0, 50)) {
      lines.push(`| ${item.name} | ${item.type} | ${item.count} | ${item.pct} | ${item.examples[0] || ''} |`);
    }
    lines.push('');
    lines.push('| Month | Calls |');
    lines.push('| --- | ---: |');
    for (const [month, count] of monthlySummary(section.items)) {
      lines.push(`| ${month} | ${count} |`);
    }
    lines.push('');
  }

  lines.push('## UNION BINARIES');
  lines.push('');
  lines.push('| Binary | Claude | Codex | Gemini | Total |');
  lines.push('| --- | ---: | ---: | ---: | ---: |');
  for (const row of unionBinaryTable(inventory).slice(0, 60)) {
    lines.push(`| ${row.name} | ${row.claude} | ${row.codex} | ${row.gemini} | ${row.total} |`);
  }
  lines.push('');

  return lines.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const inventory = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  fs.writeFileSync(markdownPath, renderReport(inventory));
  process.stdout.write(`Wrote ${markdownPath}\n`);
}
```

Create `study/inventory/README.md`:

````md
# Tool Inventory Workflow

## Inputs

- Claude sessions: `~/.claude/projects/**/*.jsonl`
- Codex sessions: `~/.codex/sessions/**/*.jsonl`
- Gemini sessions: `~/.gemini/tmp/*/chats/session-*.jsonl`

## Commands

```bash
node --test study/inventory/tests/extract-binaries.test.mjs study/inventory/tests/inventory-core.test.mjs study/inventory/tests/format-report.test.mjs
node study/inventory/parse_transcripts.mjs
node study/inventory/format_report.mjs
```

## Outputs

- `study/inventory/tools_inventory.json`: structured machine-readable inventory with `by_month` and `examples`
- `study/inventory/tools_inventory.md`: human-readable report with per-CLI top items and the union binary table

## Sanity Checks

- `rg -n '"gemini"|by_month|examples' study/inventory/tools_inventory.json`
- `rg -n '^## |^\\| Binary \\|' study/inventory/tools_inventory.md`
````

- [ ] **Step 4: Run the renderer tests and generate the final report**

Run: `node --test study/inventory/tests/extract-binaries.test.mjs study/inventory/tests/inventory-core.test.mjs study/inventory/tests/format-report.test.mjs`
Expected: PASS for all tests

Run: `node study/inventory/parse_transcripts.mjs`
Expected: prints `Wrote /home/antoinefa/src/agent-os/study/inventory/tools_inventory.json`

Run: `node study/inventory/format_report.mjs`
Expected: prints `Wrote /home/antoinefa/src/agent-os/study/inventory/tools_inventory.md`

Run: `rg -n '^## |^\\| Binary \\|' study/inventory/tools_inventory.md`
Expected: matches `## CLAUDE`, `## CODEX`, `## GEMINI`, and the union table header

## Self-Review

- Spec coverage: this plan covers the Wave 1A outputs required in [2026-05-15-agent-os-study-design.md](/home/antoinefa/src/agent-os/docs/superpowers/specs/2026-05-15-agent-os-study-design.md:87), including Claude/Codex/Gemini parsing, monthly aggregation, structured JSON, and human-readable reporting.
- Placeholder scan: no `TODO`, `TBD`, or implicit "figure it out later" steps remain.
- Type consistency: the same `items[]` schema is used by the parser, tests, and renderer: `{ name, type, count, pct, by_month, examples }`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-18-wave-1a-tool-inventory.md`. Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
