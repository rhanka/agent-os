import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { buildInventory, discoverDefaultSources } from '../inventory_core.mjs';

const fixture = (name) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

function makeTempDir(prefix = 'inventory-core-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeJsonl(filepath, entries) {
  const body = entries.map((entry) => JSON.stringify(entry)).join('\n');
  fs.writeFileSync(filepath, `${body}\n`);
}

async function captureStderr(run) {
  let output = '';
  const originalWrite = process.stderr.write;

  process.stderr.write = function patchedWrite(chunk, encoding, callback) {
    output += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);

    if (typeof encoding === 'function') {
      encoding();
    } else if (typeof callback === 'function') {
      callback();
    }

    return true;
  };

  try {
    const result = await run();
    return { result, stderr: output };
  } finally {
    process.stderr.write = originalWrite;
  }
}

test('buildInventory aggregates Claude and Codex into numeric monthly totals', async () => {
  const inventory = await buildInventory({
    claudeFiles: [fixture('claude.jsonl')],
    codexFiles: [fixture('codex.jsonl')],
    agyHistoryFile: null,
  });

  assert.equal(inventory.claude.sessions, 1);
  assert.equal(inventory.codex.sessions, 1);
  assert.equal(inventory.claude.totals.toolCalls, 2);
  assert.equal(inventory.claude.totals.binaryCalls, 2);
  assert.equal(typeof inventory.claude.totals.binaryCalls, 'number');

  const claudeBash = inventory.claude.items.find((item) => item.name === 'Bash' && item.type === 'native_tool');
  assert.equal(claudeBash.pct, 50);
  assert.deepEqual(claudeBash.examples, ["rg TODO src | sed -n '1,5p'"]);

  const claudeRead = inventory.claude.items.find((item) => item.name === 'Read' && item.type === 'native_tool');
  assert.deepEqual(claudeRead.examples, ['README.md']);

  const claudeRg = inventory.claude.items.find((item) => item.name === 'rg' && item.type === 'binary');
  assert.equal(claudeRg.pct, 50);
  assert.deepEqual(claudeRg.by_month, { '2026-05': 1 });
  assert.deepEqual(claudeRg.examples, ["rg TODO src | sed -n '1,5p'"]);

  const codexExec = inventory.codex.items.find((item) => item.name === 'exec_command' && item.type === 'native_tool');
  assert.equal(codexExec.count, 1);
  assert.equal(codexExec.pct, 50);
  assert.deepEqual(codexExec.examples, ['{"cmd":"git status && node scripts/check.mjs"}']);

  const codexGit = inventory.codex.items.find((item) => item.name === 'git' && item.type === 'binary');
  assert.deepEqual(codexGit.by_month, { '2026-05': 1 });
});

test('buildInventory parses Antigravity (agy) history.jsonl: sessions by conversationId, prompts count, no tool calls', async () => {
  const inventory = await buildInventory({
    claudeFiles: [],
    codexFiles: [],
    agyHistoryFile: fixture('agy-history.jsonl'),
  });

  assert.equal(inventory.agy.sessions, 2);
  assert.equal(inventory.agy.totals.prompts, 3);
  assert.equal(inventory.agy.totals.toolCalls, 0);
  assert.equal(inventory.agy.totals.binaryCalls, 0);
  assert.equal(inventory.agy.firstSession, '2026-05-23T16:01:38.791Z');
  assert.equal(inventory.agy.lastSession, '2026-05-28T20:26:40.000Z');
  assert.deepEqual(inventory.agy.items, []);
});

test('discoverDefaultSources returns agy history.jsonl path when present, null otherwise', (t) => {
  const tempDir = makeTempDir('inventory-discovery-');
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const claudeRoot = path.join(tempDir, 'claude');
  const codexRoot = path.join(tempDir, 'codex');
  const agyRoot = path.join(tempDir, 'agy');
  const agyMissingRoot = path.join(tempDir, 'agy-missing');

  fs.mkdirSync(path.join(claudeRoot, 'project-a'), { recursive: true });
  fs.mkdirSync(path.join(codexRoot, '2026', '05', '18'), { recursive: true });
  fs.mkdirSync(agyRoot, { recursive: true });
  fs.mkdirSync(agyMissingRoot, { recursive: true });

  const claudeFile = path.join(claudeRoot, 'project-a', 'claude.jsonl');
  const codexFile = path.join(codexRoot, '2026', '05', '18', 'codex.jsonl');
  const agyHistory = path.join(agyRoot, 'history.jsonl');

  fs.writeFileSync(claudeFile, '\n');
  fs.writeFileSync(codexFile, '\n');
  fs.writeFileSync(agyHistory, '\n');

  const sources = discoverDefaultSources({
    claudeRoot,
    codexRoot,
    agyRoot,
  });

  assert.deepEqual(sources.claudeFiles, [claudeFile]);
  assert.deepEqual(sources.codexFiles, [codexFile]);
  assert.equal(sources.agyHistoryFile, agyHistory);

  const sourcesMissing = discoverDefaultSources({
    claudeRoot,
    codexRoot,
    agyRoot: agyMissingRoot,
  });
  assert.equal(sourcesMissing.agyHistoryFile, null);
});

test('buildInventory does not count invalid JSONL files as sessions and warns explicitly', async (t) => {
  const tempDir = makeTempDir();
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const invalidFile = path.join(tempDir, 'invalid.jsonl');
  fs.writeFileSync(invalidFile, 'not json\nstill not json\n');

  const { result: inventory, stderr } = await captureStderr(() => buildInventory({
    claudeFiles: [invalidFile],
    codexFiles: [],
    agyHistoryFile: null,
  }));

  assert.equal(inventory.claude.sessions, 0);
  assert.equal(inventory.claude.totals.toolCalls, 0);
  assert.match(stderr, /Warning: skipped 2 malformed JSONL line\(s\) in .*invalid\.jsonl/);
});

test('buildInventory ignores heredoc body lines when extracting binaries', async (t) => {
  const tempDir = makeTempDir();
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const claudeFile = path.join(tempDir, 'heredoc.jsonl');
  writeJsonl(claudeFile, [
    {
      timestamp: '2026-05-03T10:00:00.000Z',
      message: {
        content: [
          {
            type: 'tool_use',
            name: 'Bash',
            input: {
              command: "cat <<'EOF' > pending.txt\namount=42\npending.delete=true\nEOF\nrg TODO src\nnode scripts/check.mjs",
            },
          },
        ],
      },
    },
  ]);

  const inventory = await buildInventory({
    claudeFiles: [claudeFile],
    codexFiles: [],
    agyHistoryFile: null,
  });

  const binaryNames = inventory.claude.items
    .filter((item) => item.type === 'binary')
    .map((item) => item.name);

  assert.deepEqual(binaryNames, ['cat', 'node', 'rg']);
});

test('buildInventory truncates long examples deterministically', async (t) => {
  const tempDir = makeTempDir();
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const longCommand = `node ${'x'.repeat(200)}`;
  const claudeFile = path.join(tempDir, 'long-example.jsonl');
  writeJsonl(claudeFile, [
    {
      timestamp: '2026-05-04T10:00:00.000Z',
      message: {
        content: [
          {
            type: 'tool_use',
            name: 'Bash',
            input: {
              command: longCommand,
            },
          },
        ],
      },
    },
  ]);

  const inventory = await buildInventory({
    claudeFiles: [claudeFile],
    codexFiles: [],
    agyHistoryFile: null,
  });

  const expectedExample = `node ${'x'.repeat(112)}...`;
  const bashItem = inventory.claude.items.find((item) => item.name === 'Bash' && item.type === 'native_tool');
  const nodeItem = inventory.claude.items.find((item) => item.name === 'node' && item.type === 'binary');

  assert.deepEqual(bashItem.examples, [expectedExample]);
  assert.deepEqual(nodeItem.examples, [expectedExample]);
  assert.equal(expectedExample.length, 120);
});

test('buildInventory keeps later commands when <<EOF appears only inside quotes', async (t) => {
  const tempDir = makeTempDir();
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const codexFile = path.join(tempDir, 'quoted-heredoc.jsonl');
  writeJsonl(codexFile, [
    {
      timestamp: '2026-05-05T10:00:00.000Z',
      type: 'response_item',
      payload: {
        type: 'function_call',
        name: 'exec_command',
        arguments: JSON.stringify({
          cmd: 'printf "<<EOF\\n"\nrg TODO src',
        }),
      },
    },
  ]);

  const inventory = await buildInventory({
    claudeFiles: [],
    codexFiles: [codexFile],
    agyHistoryFile: null,
  });

  const rgItem = inventory.codex.items.find((item) => item.name === 'rg' && item.type === 'binary');
  assert.equal(rgItem?.count, 1);
});
