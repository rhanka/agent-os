import test from 'node:test';
import assert from 'node:assert/strict';
import { extractBinaries } from '../extract_binaries.mjs';

test('extractBinaries keeps root binaries across shell separators', () => {
  assert.deepEqual(
    extractBinaries('FOO=bar sudo rg "TODO" src | sed -n "1,5p" && node scripts/build.mjs'),
    ['rg', 'sed', 'node'],
  );
});

test('extractBinaries ignores quoted separators', () => {
  assert.deepEqual(
    extractBinaries('echo "a|b" && npm test'),
    ['npm'],
  );
});

test('extractBinaries drops shell builtins and empty control fragments', () => {
  assert.deepEqual(
    extractBinaries('cd repo && export FOO=bar && pwd && npm test'),
    ['npm'],
  );
});

test('extractBinaries strips env assignments before the command', () => {
  assert.deepEqual(
    extractBinaries('env FOO=bar node app.mjs'),
    ['node'],
  );
});

test('extractBinaries strips wrapper flags before the command', () => {
  assert.deepEqual(
    extractBinaries('nice -n 5 node app.mjs'),
    ['node'],
  );
});

test('extractBinaries handles boolean time flags without consuming the command', () => {
  assert.deepEqual(
    extractBinaries('time -p node app.mjs'),
    ['node'],
  );
});

test('extractBinaries handles boolean command flags without consuming the command', () => {
  assert.deepEqual(
    extractBinaries('command -p node app.mjs'),
    ['node'],
  );
});

test('extractBinaries deduplicates binaries across segments', () => {
  assert.deepEqual(
    extractBinaries('git status && /usr/bin/git diff && git log'),
    ['git'],
  );
});

test('extractBinaries keeps commands separated by newlines', () => {
  assert.deepEqual(
    extractBinaries('git status\nnpm test'),
    ['git', 'npm'],
  );
});

test('extractBinaries normalizes absolute paths to basenames', () => {
  assert.deepEqual(
    extractBinaries('/usr/bin/git status ; /bin/bash -lc "echo noop"'),
    ['git', 'bash'],
  );
});

test('extractBinaries skips shell keywords in until loops and finds inner commands', () => {
  assert.deepEqual(
    extractBinaries('until make all; do sleep 5; done'),
    ['make', 'sleep'],
  );
});

test('extractBinaries skips shell keywords in if blocks and finds branch commands', () => {
  assert.deepEqual(
    extractBinaries('if git status; then npm test; else echo fail; fi'),
    ['git', 'npm'],
  );
});

test('extractBinaries skips for-loop variables and finds loop body commands', () => {
  assert.deepEqual(
    extractBinaries('for file in src/*; do rg TODO "$file"; done'),
    ['rg'],
  );
});

test('extractBinaries ignores standalone quoted literals inside shell array initializers', () => {
  assert.deepEqual(
    extractBinaries('patterns=(\n  "do not modify"\n  "Code quality review"\n)\nfor pat in "${patterns[@]}"; do\n  grep -ic "$pat" "$OUT"\ndone'),
    ['grep'],
  );
});

test('extractBinaries ignores control keywords embedded in non-shell script fragments', () => {
  assert.deepEqual(
    extractBinaries('if(/tests\\/x/){'),
    [],
  );
});

test('extractBinaries ignores option-leading shell fragments without a command', () => {
  assert.deepEqual(
    extractBinaries('-C /repo status'),
    [],
  );
});

test('extractBinaries ignores stacked option-leading shell fragments without a command', () => {
  assert.deepEqual(
    extractBinaries('-sS -o /dev/null http://x'),
    [],
  );
});

test('extractBinaries finds gh inside command substitution assignments', () => {
  assert.deepEqual(
    extractBinaries('RUN_ID=$(gh run list --limit 1)'),
    ['gh'],
  );
});

test('extractBinaries finds piped commands inside command substitution assignments', () => {
  assert.deepEqual(
    extractBinaries('RUN_ID=$(cat /tmp/run-resume-from-down.id | awk "{print $1}")'),
    ['cat', 'awk'],
  );
});

test('extractBinaries keeps gh as the command head in simple command substitutions', () => {
  assert.deepEqual(
    extractBinaries('TOKEN=$(gh auth token)'),
    ['gh'],
  );
});

test('extractBinaries ignores heredoc bodies inside command substitutions', () => {
  assert.deepEqual(
    extractBinaries('MESSAGE=$(cat <<\'EOF\'\nrun() {\n  auth token\n}\nEOF\n)'),
    ['cat'],
  );
});

test('extractBinaries ignores inspected binaries from command -v lookups', () => {
  assert.deepEqual(
    extractBinaries('command -v git'),
    [],
  );
});

test('extractBinaries skips exec -a alias arguments and keeps the real command', () => {
  assert.deepEqual(
    extractBinaries('exec -a helper node app.mjs'),
    ['node'],
  );
});

test('extractBinaries ignores shell function definition headers', () => {
  assert.deepEqual(
    extractBinaries('run() { local name="$1"; curl -s http://x; }'),
    ['curl'],
  );
});

test('extractBinaries ignores shell function invocations after local definitions', () => {
  assert.deepEqual(
    extractBinaries('run() { curl -s http://x; }\nrun check'),
    ['curl'],
  );
});

test('extractBinaries keeps bash and the real inner command for bash -lc scripts', () => {
  assert.deepEqual(
    extractBinaries(`bash -lc 'rg -n "sendMessage\\(|type:\\s*\\'extension_|type:\\s*\\\"extension_|tool_execute|tool_permission|auth" /tmp/file'`),
    ['bash', 'rg'],
  );
});

test('extractBinaries ignores shell-eval heredoc bodies passed through bash -lc', () => {
  assert.deepEqual(
    extractBinaries(`bash -lc 'node <<'"'"'NODE'"'"'
import { extractBinaries } from "./study/inventory/extract_binaries.mjs";
const cases = {
  functionDef: "run() { local name=\\"$1\\"; curl -s http://x; }",
  token: "auth token",
};
console.log(cases);
NODE'`),
    ['bash', 'node'],
  );
});

test('extractBinaries finds escaped command substitutions inside bash -lc scripts', () => {
  assert.deepEqual(
    extractBinaries(`bash -lc "set -euo pipefail; TOKEN=\\$(gcloud auth print-access-token); echo \\$TOKEN"`),
    ['bash', 'gcloud'],
  );
});
