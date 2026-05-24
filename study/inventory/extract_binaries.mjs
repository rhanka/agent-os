const ROOT_TOKEN_RE = /^([A-Za-z0-9_./-]+)/;
const FUNCTION_HEADER_RE = /^(?:function\s+)?[A-Za-z_][A-Za-z0-9_]*\s*\(\)\s*\{\s*/;
const FUNCTION_HEADER_CAPTURE_RE = /^(?:function\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\(\)\s*\{\s*/;

const WRAPPER_WORDS = new Set(['sudo', 'time', 'command', 'env', 'nohup', 'nice', 'exec']);
const SHELL_EVAL_BINARIES = new Set(['bash', 'sh', 'zsh', 'ksh', 'dash']);
const CONTROL_FLOW_LEADERS = new Set(['if', 'then', 'elif', 'else', 'do', 'while', 'until']);
const CONTROL_FLOW_SEGMENT_ONLY = new Set(['done', 'fi', 'esac', 'case', 'in']);
const LOOP_HEADER_KEYWORDS = new Set(['for', 'select']);
const SHELL_CONTROL_WORDS = new Set([
  ...CONTROL_FLOW_LEADERS,
  ...CONTROL_FLOW_SEGMENT_ONLY,
  ...LOOP_HEADER_KEYWORDS,
]);
const SHELL_BUILTINS = new Set([
  '.', ':', '[', '[[', 'alias', 'bg', 'break', 'cd', 'continue', 'declare', 'dirs', 'disown',
  'echo', 'eval', 'exec', 'exit', 'export', 'false', 'fg', 'getopts', 'hash', 'jobs', 'let',
  'local', 'popd', 'printf', 'pushd', 'pwd', 'read', 'readonly', 'return', 'set', 'shift',
  'source', 'test', 'times', 'trap', 'true', 'type', 'typeset', 'ulimit', 'umask', 'unalias',
  'unset', 'wait',
]);

function splitSegments(command) {
  const segments = [];
  let current = '';
  let quote = null;
  let escaped = false;

  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];

    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }

    if (ch === '\\' && quote !== "'") {
      current += ch;
      escaped = true;
      continue;
    }

    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }

    if (ch === '"' || ch === "'") {
      current += ch;
      quote = ch;
      continue;
    }

    if (ch === '&' && command[i + 1] === '&') {
      if (current.trim() !== '') segments.push(current.trim());
      current = '';
      i += 1;
      continue;
    }

    if (ch === '|' && command[i + 1] === '|') {
      if (current.trim() !== '') segments.push(current.trim());
      current = '';
      i += 1;
      continue;
    }

    if (ch === ';' || ch === '|' || ch === '\n') {
      if (current.trim() !== '') segments.push(current.trim());
      current = '';
      continue;
    }

    current += ch;
  }

  if (current.trim() !== '') segments.push(current.trim());
  return segments;
}

function tokenize(segment) {
  const tokens = [];
  let current = '';
  let quote = null;
  let escaped = false;

  for (let i = 0; i < segment.length; i += 1) {
    const ch = segment[i];

    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }

    if (ch === '\\' && quote !== "'") {
      escaped = true;
      continue;
    }

    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }

    if (/\s/.test(ch)) {
      if (current !== '') {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += ch;
  }

  if (current !== '') tokens.push(current);
  return tokens;
}

function maskNonNewlineRange(chars, start, end) {
  for (let i = start; i < end; i += 1) {
    if (chars[i] !== '\n') chars[i] = ' ';
  }
}

function normalizeHeredocDelimiter(token) {
  if (typeof token !== 'string' || token === '') return '';
  return token.replace(/['"]/g, '');
}

function maskHeredocBodies(command) {
  const chars = Array.from(command);
  let quote = null;
  let escaped = false;

  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === '\\' && quote !== "'") {
      escaped = true;
      continue;
    }

    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }

    if (ch !== '<' || command[i + 1] !== '<') continue;

    let cursor = i + 2;
    let allowTabs = false;
    if (command[cursor] === '-') {
      allowTabs = true;
      cursor += 1;
    }

    while (cursor < command.length && /\s/.test(command[cursor]) && command[cursor] !== '\n') {
      cursor += 1;
    }

    if (cursor >= command.length || command[cursor] === '\n') continue;

    const start = cursor;
    while (cursor < command.length && !/\s/.test(command[cursor]) && command[cursor] !== '<') {
      cursor += 1;
    }

    const delimiter = normalizeHeredocDelimiter(command.slice(start, cursor));
    if (delimiter === '') continue;

    const lineEnd = command.indexOf('\n', cursor);
    if (lineEnd === -1) continue;

    const bodyStart = lineEnd + 1;
    let searchIndex = bodyStart;

    while (searchIndex <= command.length) {
      const nextNewline = command.indexOf('\n', searchIndex);
      const lineEndIndex = nextNewline === -1 ? command.length : nextNewline;
      const line = command.slice(searchIndex, lineEndIndex);
      const isDelimiter = allowTabs ? line.replace(/^\t+/, '') === delimiter : line === delimiter;

      if (isDelimiter) {
        maskNonNewlineRange(chars, bodyStart, lineEndIndex);
        i = lineEndIndex;
        break;
      }

      if (nextNewline === -1) break;
      searchIndex = nextNewline + 1;
    }
  }

  return chars.join('');
}

function readCommandSubstitution(command, startIndex) {
  let content = '';
  let quote = null;
  let escaped = false;
  let depth = 1;

  for (let i = startIndex; i < command.length; i += 1) {
    const ch = command[i];

    if (escaped) {
      content += ch;
      escaped = false;
      continue;
    }

    if (ch === '\\' && quote !== "'") {
      content += ch;
      escaped = true;
      continue;
    }

    if (quote) {
      content += ch;
      if (ch === quote) quote = null;
      continue;
    }

    if (ch === '"' || ch === "'") {
      content += ch;
      quote = ch;
      continue;
    }

    if (ch === '$' && command[i + 1] === '(') {
      content += '$(';
      depth += 1;
      i += 1;
      continue;
    }

    if (ch === '(') {
      content += ch;
      depth += 1;
      continue;
    }

    if (ch === ')') {
      depth -= 1;
      if (depth === 0) {
        return { content, endIndex: i };
      }
      content += ch;
      continue;
    }

    content += ch;
  }

  return null;
}

function extractCommandSubstitutions(command) {
  const substitutions = [];
  let masked = '';
  let quote = null;
  let escaped = false;

  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];

    if (escaped) {
      masked += ch;
      escaped = false;
      continue;
    }

    if (ch === '\\' && quote !== "'") {
      masked += ch;
      escaped = true;
      continue;
    }

    if (quote) {
      if (quote === '"' && ch === '$' && command[i + 1] === '(') {
        const substitution = readCommandSubstitution(command, i + 2);
        if (!substitution) {
          masked += ch;
          continue;
        }
        substitutions.push(substitution.content);
        masked += `$(${' '.repeat(substitution.content.length)})`;
        i = substitution.endIndex;
        continue;
      }

      masked += ch;
      if (ch === quote) quote = null;
      continue;
    }

    if (ch === '"' || ch === "'") {
      masked += ch;
      quote = ch;
      continue;
    }

    if (ch === '$' && command[i + 1] === '(') {
      const substitution = readCommandSubstitution(command, i + 2);
      if (!substitution) {
        masked += ch;
        continue;
      }
      substitutions.push(substitution.content);
      masked += `$(${' '.repeat(substitution.content.length)})`;
      i = substitution.endIndex;
      continue;
    }

    masked += ch;
  }

  return { masked, substitutions };
}

function isAssignment(token) {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(token);
}

function skipOptionArguments(tokens, index) {
  return index < tokens.length ? index + 1 : index;
}

function wrapperConsumesOptionArgument(wrapper, option) {
  if (wrapper === 'nice' && option === '-n') return true;
  if (wrapper === 'exec' && option === '-a') return true;
  return false;
}

function wrapperSuppressesExecution(wrapper, option) {
  if (wrapper === 'command' && (option === '-v' || option === '-V')) return true;
  return false;
}

function stripWrappers(tokens) {
  let index = 0;

  while (true) {
    while (index < tokens.length && isAssignment(tokens[index])) {
      index += 1;
    }

    if (index >= tokens.length) return [];

    const current = tokens[index];
    const token = current.includes('/') ? current.split('/').pop() : current;
    if (!WRAPPER_WORDS.has(token)) return tokens.slice(index);

    index += 1;
    while (index < tokens.length) {
      if (isAssignment(tokens[index])) {
        index += 1;
        continue;
      }

      if (tokens[index] === '--') {
        index += 1;
        continue;
      }

      if (tokens[index].startsWith('-')) {
        const option = tokens[index];
        index += 1;
        if (wrapperSuppressesExecution(token, option)) return [];
        if (wrapperConsumesOptionArgument(token, option)) {
          index = skipOptionArguments(tokens, index);
        }
        continue;
      }

      break;
    }
  }
}

function stripControlFlow(tokens) {
  let current = tokens;

  while (current.length > 0) {
    const [first, ...rest] = current;

    if (CONTROL_FLOW_LEADERS.has(first)) {
      current = rest;
      continue;
    }

    if (LOOP_HEADER_KEYWORDS.has(first) || CONTROL_FLOW_SEGMENT_ONLY.has(first)) {
      return [];
    }

    return current;
  }

  return current;
}

function isStandaloneQuotedLiteral(segment) {
  if (segment.length < 2) return false;
  const quote = segment[0];
  return (quote === '"' || quote === "'") && segment.at(-1) === quote;
}

function stripOuterQuotes(text) {
  if (text.length < 2) return text;
  if ((text[0] === '"' && text.at(-1) === '"') || (text[0] === "'" && text.at(-1) === "'")) {
    return text.slice(1, -1);
  }
  return text;
}

function normalizeShellEvalScript(text) {
  return text.replace(/\\\$/g, '$');
}

function extractShellEvalInvocation(command) {
  const trimmed = command.trim();
  const match = trimmed.match(/^([A-Za-z0-9_./-]+)\s+(-[A-Za-z]*c[A-Za-z]*)\s+([\s\S]+)$/);
  if (!match) return null;

  const [, shellPath, , scriptArg] = match;
  const shell = shellPath.includes('/') ? shellPath.split('/').pop() : shellPath;
  if (!SHELL_EVAL_BINARIES.has(shell)) return null;

  return {
    shell,
    script: normalizeShellEvalScript(stripOuterQuotes(scriptArg.trim())),
  };
}

function collectFunctionNames(command) {
  const names = new Set();

  for (const rawSegment of splitSegments(command)) {
    const segment = rawSegment.replace(/^[({<]+/, '').trim();
    const match = segment.match(FUNCTION_HEADER_CAPTURE_RE);
    if (match) names.add(match[1]);
  }

  return names;
}

export function extractBinaries(command) {
  if (typeof command !== 'string' || command.trim() === '') return [];

  const shellEval = extractShellEvalInvocation(command);
  if (shellEval) {
    const seen = new Set([shellEval.shell]);
    const binaries = [shellEval.shell];

    for (const token of extractBinaries(shellEval.script)) {
      if (!seen.has(token)) {
        seen.add(token);
        binaries.push(token);
      }
    }

    return binaries;
  }

  const seen = new Set();
  const binaries = [];
  const heredocMaskedCommand = maskHeredocBodies(command);
  const { masked, substitutions } = extractCommandSubstitutions(heredocMaskedCommand);
  const functionNames = collectFunctionNames(masked);

  for (const substitution of substitutions) {
    for (const token of extractBinaries(substitution)) {
      if (!seen.has(token)) {
        seen.add(token);
        binaries.push(token);
      }
    }
  }

  for (const rawSegment of splitSegments(masked)) {
    const trimmedSegment = rawSegment.replace(/^[({<]+/, '').trim();
    const segment = trimmedSegment.replace(FUNCTION_HEADER_RE, '').trim();
    if (segment === '' || isStandaloneQuotedLiteral(segment)) continue;

    const tokens = tokenize(segment);
    const segmentTokens = stripWrappers(stripControlFlow(tokens));
    if (segmentTokens.length === 0) continue;
    if (segmentTokens[0].startsWith('-')) continue;

    const match = segmentTokens[0].match(ROOT_TOKEN_RE);
    if (!match) continue;

    let token = match[1];
    if (segmentTokens[0] !== token && SHELL_CONTROL_WORDS.has(token)) continue;
    if (token.includes('/')) token = token.split('/').pop();
    if (functionNames.has(token)) continue;
    if (!token || SHELL_BUILTINS.has(token) || /^\d+$/.test(token)) continue;

    if (!seen.has(token)) {
      seen.add(token);
      binaries.push(token);
    }
  }

  return binaries;
}
