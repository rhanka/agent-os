import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { extractBinaries } from './extract_binaries.mjs';

const EXAMPLE_LIMIT = 3;
const MAX_EXAMPLE_LENGTH = 120;
const CLAUDE_DIR = path.join(os.homedir(), '.claude', 'projects');
const CODEX_DIR = path.join(os.homedir(), '.codex', 'sessions');
const AGY_DIR = path.join(os.homedir(), '.gemini', 'antigravity-cli');
const AGY_HISTORY_FILENAME = 'history.jsonl';

function defaultWarn(message) {
  process.stderr.write(`${message}\n`);
}

function createAccumulator() {
  return {
    sessions: 0,
    firstSession: null,
    lastSession: null,
    nativeTools: new Map(),
    binaries: new Map(),
    totals: {
      toolCalls: 0,
      binaryCalls: 0,
      prompts: 0,
    },
  };
}

function createItemState() {
  return {
    count: 0,
    byMonth: new Map(),
    examples: [],
    exampleSet: new Set(),
  };
}

function getMonthKey(timestamp) {
  if (typeof timestamp !== 'string' || timestamp.length < 7) return 'unknown';
  return timestamp.slice(0, 7);
}

function updateSessionBounds(accumulator, timestamp) {
  if (typeof timestamp !== 'string' || timestamp === '') return;

  if (!accumulator.firstSession || timestamp < accumulator.firstSession) {
    accumulator.firstSession = timestamp;
  }

  if (!accumulator.lastSession || timestamp > accumulator.lastSession) {
    accumulator.lastSession = timestamp;
  }
}

function normalizeExample(example) {
  if (typeof example !== 'string') return null;

  const normalized = example.replace(/\r\n/g, '\n').trim();
  if (normalized === '') return null;
  if (normalized.length <= MAX_EXAMPLE_LENGTH) return normalized;

  return `${normalized.slice(0, MAX_EXAMPLE_LENGTH - 3)}...`;
}

function incrementItem(store, name, timestamp, example) {
  if (typeof name !== 'string' || name === '') return;

  let item = store.get(name);
  if (!item) {
    item = createItemState();
    store.set(name, item);
  }

  item.count += 1;

  const monthKey = getMonthKey(timestamp);
  item.byMonth.set(monthKey, (item.byMonth.get(monthKey) || 0) + 1);

  const normalizedExample = normalizeExample(example);
  if (
    normalizedExample &&
    item.examples.length < EXAMPLE_LIMIT &&
    !item.exampleSet.has(normalizedExample)
  ) {
    item.exampleSet.add(normalizedExample);
    item.examples.push(normalizedExample);
  }
}

function finalizeItems(store, type, totalCount) {
  return [...store.entries()]
    .map(([name, item]) => ({
      name,
      type,
      count: item.count,
      pct: totalCount === 0 ? 0 : Number(((item.count / totalCount) * 100).toFixed(4)),
      by_month: Object.fromEntries([...item.byMonth.entries()].sort(([a], [b]) => a.localeCompare(b))),
      examples: item.examples.slice(),
    }))
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      if (left.type !== right.type) return left.type.localeCompare(right.type);
      return left.name.localeCompare(right.name);
    });
}

function finalizeCli(accumulator) {
  return {
    sessions: accumulator.sessions,
    firstSession: accumulator.firstSession,
    lastSession: accumulator.lastSession,
    totals: {
      toolCalls: accumulator.totals.toolCalls,
      binaryCalls: accumulator.totals.binaryCalls,
      prompts: accumulator.totals.prompts,
    },
    items: [
      ...finalizeItems(accumulator.nativeTools, 'native_tool', accumulator.totals.toolCalls),
      ...finalizeItems(accumulator.binaries, 'binary', accumulator.totals.binaryCalls),
    ].sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      if (left.type !== right.type) return left.type.localeCompare(right.type);
      return left.name.localeCompare(right.name);
    }),
  };
}

async function parseJsonlFile(filepath, onObject) {
  const stats = {
    invalidLines: 0,
    validRecords: 0,
  };

  const rl = readline.createInterface({
    input: fs.createReadStream(filepath),
    crlfDelay: Infinity,
  });

  try {
    for await (const line of rl) {
      if (line.trim() === '') continue;

      let value;
      try {
        value = JSON.parse(line);
      } catch {
        stats.invalidLines += 1;
        continue;
      }

      stats.validRecords += 1;
      onObject(value);
    }
  } finally {
    rl.close();
  }

  return stats;
}

function extractHeredocDelimiters(line) {
  const delimiters = [];
  let quote = null;
  let escaped = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (quote) {
      if (char === '\\' && quote === '"') {
        escaped = true;
        continue;
      }

      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (char !== '<' || line[index + 1] !== '<') continue;

    let cursor = index + 2;
    let allowIndented = false;

    if (line[cursor] === '-') {
      allowIndented = true;
      cursor += 1;
    }

    while (cursor < line.length && /\s/.test(line[cursor])) {
      cursor += 1;
    }

    if (cursor >= line.length || line[cursor] === '<') continue;

    let delimiter = '';

    if (line[cursor] === "'" || line[cursor] === '"') {
      const delimiterQuote = line[cursor];
      const start = cursor + 1;
      cursor = start;

      while (cursor < line.length) {
        if (line[cursor] === '\\' && delimiterQuote === '"' && cursor + 1 < line.length) {
          cursor += 2;
          continue;
        }

        if (line[cursor] === delimiterQuote) break;
        cursor += 1;
      }

      if (cursor >= line.length) continue;
      delimiter = line.slice(start, cursor);
      index = cursor;
    } else {
      const start = cursor;
      while (cursor < line.length && !/\s/.test(line[cursor]) && line[cursor] !== '<') {
        cursor += 1;
      }
      delimiter = line.slice(start, cursor);
      index = cursor - 1;
    }

    if (delimiter === '') continue;

    delimiters.push({
      allowIndented,
      delimiter,
    });
  }

  return delimiters;
}

function isHeredocTerminator(line, heredoc) {
  const candidate = heredoc.allowIndented ? line.replace(/^\t+/, '') : line;
  return candidate.trimEnd() === heredoc.delimiter;
}

function hasHeredocTerminator(lines, startIndex, heredoc) {
  for (let index = startIndex; index < lines.length; index += 1) {
    if (isHeredocTerminator(lines[index], heredoc)) {
      return true;
    }
  }

  return false;
}

function stripHeredocBodies(command) {
  const lines = command.replace(/\r\n/g, '\n').split('\n');
  const keptLines = [];
  const queuedDelimiters = [];
  let activeHeredoc = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (activeHeredoc) {
      if (isHeredocTerminator(line, activeHeredoc)) {
        activeHeredoc = queuedDelimiters.shift() ?? null;
      }
      continue;
    }

    keptLines.push(line);

    const delimiters = extractHeredocDelimiters(line);
    if (delimiters.length > 0) {
      const matchedDelimiters = delimiters.filter((heredoc) => hasHeredocTerminator(lines, index + 1, heredoc));
      if (matchedDelimiters.length > 0) {
        activeHeredoc = matchedDelimiters.shift() ?? null;
        queuedDelimiters.push(...matchedDelimiters);
      }
    }
  }

  return keptLines.join('\n');
}

function sanitizeShellCommand(command) {
  if (typeof command !== 'string') return null;

  const sanitized = stripHeredocBodies(command).trim();
  return sanitized === '' ? null : sanitized;
}

function findJsonlFiles(dir, includeFile = () => true) {
  if (!fs.existsSync(dir)) return [];

  const files = [];
  const stack = [dir];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    let entries = [];

    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }

      if (entry.isFile() && entryPath.endsWith('.jsonl') && includeFile(entryPath)) {
        files.push(entryPath);
      }
    }
  }

  files.sort((left, right) => left.localeCompare(right));
  return files;
}

function extractCodexCommand(argumentsValue, warn, warningContext) {
  let args = argumentsValue;

  if (typeof args === 'string') {
    try {
      args = JSON.parse(args);
    } catch {
      warn(`Warning: invalid function_call arguments JSON in ${warningContext}`);
      return null;
    }
  }

  if (!args || typeof args !== 'object') return null;
  if (typeof args.cmd === 'string') return sanitizeShellCommand(args.cmd);
  if (typeof args.command === 'string') return sanitizeShellCommand(args.command);
  if (Array.isArray(args.argv)) return sanitizeShellCommand(args.argv.join(' '));
  return null;
}

function extractClaudeExample(input) {
  if (!input || typeof input !== 'object') return null;
  if (typeof input.command === 'string' && input.command !== '') return sanitizeShellCommand(input.command);
  if (typeof input.file_path === 'string' && input.file_path !== '') return input.file_path;
  return null;
}

function extractCodexExample(argumentsValue) {
  if (typeof argumentsValue === 'string' && argumentsValue !== '') return argumentsValue;
  if (!argumentsValue || typeof argumentsValue !== 'object') return null;
  return JSON.stringify(argumentsValue);
}

function agyTimestampToIso(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return new Date(value).toISOString();
}

async function parseClaudeFile(filepath, accumulator, warn) {
  let stats;

  try {
    stats = await parseJsonlFile(filepath, (entry) => {
      updateSessionBounds(accumulator, entry.timestamp);

      const content = entry?.message?.content;
      if (!Array.isArray(content)) return;

      for (const item of content) {
        if (item?.type !== 'tool_use') continue;

        const name = typeof item.name === 'string' && item.name !== '' ? item.name : 'unknown';
        incrementItem(accumulator.nativeTools, name, entry.timestamp, extractClaudeExample(item.input));
        accumulator.totals.toolCalls += 1;

        if (name !== 'Bash') continue;

        const command = sanitizeShellCommand(item?.input?.command);
        if (!command) continue;

        for (const binary of extractBinaries(command)) {
          incrementItem(accumulator.binaries, binary, entry.timestamp, command);
          accumulator.totals.binaryCalls += 1;
        }
      }
    });
  } catch (error) {
    warn(`Warning: failed to process ${filepath}: ${error.message}`);
    return;
  }

  if (stats.invalidLines > 0) {
    warn(`Warning: skipped ${stats.invalidLines} malformed JSONL line(s) in ${filepath}`);
  }

  if (stats.validRecords > 0) {
    accumulator.sessions += 1;
  }
}

async function parseCodexFile(filepath, accumulator, warn) {
  let stats;

  try {
    stats = await parseJsonlFile(filepath, (entry) => {
      updateSessionBounds(accumulator, entry.timestamp);

      if (entry?.type !== 'response_item') return;
      if (entry?.payload?.type !== 'function_call') return;

      const name = typeof entry.payload.name === 'string' && entry.payload.name !== '' ? entry.payload.name : 'unknown';
      incrementItem(accumulator.nativeTools, name, entry.timestamp, extractCodexExample(entry.payload.arguments));
      accumulator.totals.toolCalls += 1;

      const command = extractCodexCommand(entry.payload.arguments, warn, `${filepath} (${name})`);
      if (!command) return;

      for (const binary of extractBinaries(command)) {
        incrementItem(accumulator.binaries, binary, entry.timestamp, command);
        accumulator.totals.binaryCalls += 1;
      }
    });
  } catch (error) {
    warn(`Warning: failed to process ${filepath}: ${error.message}`);
    return;
  }

  if (stats.invalidLines > 0) {
    warn(`Warning: skipped ${stats.invalidLines} malformed JSONL line(s) in ${filepath}`);
  }

  if (stats.validRecords > 0) {
    accumulator.sessions += 1;
  }
}

async function parseAgyHistoryFile(filepath, accumulator, warn) {
  const conversationIds = new Set();
  let stats;

  try {
    stats = await parseJsonlFile(filepath, (entry) => {
      const iso = agyTimestampToIso(entry?.timestamp);
      updateSessionBounds(accumulator, iso);

      accumulator.totals.prompts += 1;

      if (typeof entry?.conversationId === 'string' && entry.conversationId !== '') {
        conversationIds.add(entry.conversationId);
      }
    });
  } catch (error) {
    warn(`Warning: failed to process ${filepath}: ${error.message}`);
    return;
  }

  if (stats.invalidLines > 0) {
    warn(`Warning: skipped ${stats.invalidLines} malformed JSONL line(s) in ${filepath}`);
  }

  accumulator.sessions = conversationIds.size;
}

export function discoverDefaultSources({
  claudeRoot = CLAUDE_DIR,
  codexRoot = CODEX_DIR,
  agyRoot = AGY_DIR,
} = {}) {
  const agyHistoryPath = path.join(agyRoot, AGY_HISTORY_FILENAME);
  const agyHistoryFile = fs.existsSync(agyHistoryPath) ? agyHistoryPath : null;

  return {
    claudeFiles: findJsonlFiles(claudeRoot),
    codexFiles: findJsonlFiles(codexRoot),
    agyHistoryFile,
  };
}

export async function buildInventory({ claudeFiles, codexFiles, agyHistoryFile, onWarning = defaultWarn }) {
  const claude = createAccumulator();
  const codex = createAccumulator();
  const agy = createAccumulator();

  for (const filepath of claudeFiles) {
    await parseClaudeFile(filepath, claude, onWarning);
  }

  for (const filepath of codexFiles) {
    await parseCodexFile(filepath, codex, onWarning);
  }

  if (agyHistoryFile) {
    await parseAgyHistoryFile(agyHistoryFile, agy, onWarning);
  }

  return {
    generatedAt: new Date().toISOString(),
    sources: {
      claudeFiles: claudeFiles.length,
      codexFiles: codexFiles.length,
      agyHistoryFile: agyHistoryFile ? 1 : 0,
    },
    claude: finalizeCli(claude),
    codex: finalizeCli(codex),
    agy: finalizeCli(agy),
  };
}
