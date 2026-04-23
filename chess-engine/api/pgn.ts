import { VariantConfig } from '../types.js';

const PGN_RESULTS = new Set(['1-0', '0-1', '1/2-1/2', '*']);

function normalizeFormat(format: string | undefined, numPlayers: number): string {
  if (format === '4player' || format === 'verbose' || format === 'standard') {
    return format;
  }
  return numPlayers === 4 ? '4player' : 'standard';
}

function defaultHeadersFor(variant: VariantConfig | null): Record<string, string> {
  const base: Record<string, string> = {
    Event: '?',
    Site: '?',
    Date: new Date().toISOString().split('T')[0].replace(/-/g, '.'),
    Round: '?',
    Result: '*',
  };

  if (variant?.numPlayers === 4) {
    return {
      ...base,
      Red: '?',
      Blue: '?',
      Yellow: '?',
      Green: '?',
    };
  }

  return {
    ...base,
    White: '?',
    Black: '?',
  };
}

function orderedHeaderEntries(headers: Record<string, string>, variant: VariantConfig | null): [string, string][] {
  const preferred = variant?.numPlayers === 4
    ? ['Event', 'Site', 'Date', 'Round', 'Red', 'Blue', 'Yellow', 'Green', 'Result', 'Variant']
    : ['Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result', 'Variant'];

  const seen = new Set<string>();
  const entries: [string, string][] = [];

  for (const key of preferred) {
    if (Object.prototype.hasOwnProperty.call(headers, key)) {
      entries.push([key, headers[key]]);
      seen.add(key);
    }
  }

  const extraKeys = Object.keys(headers)
    .filter((key) => !seen.has(key))
    .sort((a, b) => a.localeCompare(b));

  for (const key of extraKeys) {
    entries.push([key, headers[key]]);
  }

  return entries;
}

function stripPgnHeadersAndNoise(pgn: string): string {
  return pgn
    .replace(/\[.*?\]/g, '')
    .replace(/\{.*?\}/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/;[^\n]*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTokens(moveText: string): string[] {
  return moveText
    .replace(/\d+\.(\.\.)?/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !PGN_RESULTS.has(token));
}

function wrap(text: string, width: number = 96): string {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += width) {
    chunks.push(text.slice(i, i + width));
  }
  return chunks.join('\n');
}

function labelForPlayer(player: number | undefined, turnLabels: string[]): string {
  if (typeof player === 'number' && player >= 0 && player < turnLabels.length) {
    return turnLabels[player];
  }
  return `P${typeof player === 'number' ? player : '?'}`;
}

function moveSanFrom(entry: any): string {
  return entry?.san || entry?.move?.san || '...';
}

/**
 * Export history to PGN string.
 * Supports: standard (2p), 4player labels, verbose (debug-oriented).
 *
 * @param {Array<{san: string, player?: number, move?: any}>} history
 * @param {Object} headers
 * @param {Object} options
 * @returns {string}
 */
export function exportPGN(
  history: any[], 
  headers: Record<string, string> = {}, 
  options: { 
    variant?: VariantConfig | null, 
    numPlayers?: number, 
    format?: string, 
    includeHeaders?: boolean, 
    turnLabels?: string[], 
    wrapWidth?: number 
  } = {}
): string {
  const variant = options.variant || null;
  const numPlayers = options.numPlayers || variant?.numPlayers || 2;
  const format = normalizeFormat(options.format, numPlayers);
  const includeHeaders = options.includeHeaders !== false;
  const turnLabels = options.turnLabels || variant?.turnLabels || (numPlayers === 4 ? ['R', 'B', 'Y', 'G'] : ['W', 'B']);

  const defaultHeaders = defaultHeadersFor(variant);
  const allHeaders = { ...defaultHeaders, ...headers };
  let pgn = '';

  if (includeHeaders) {
    for (const [key, value] of orderedHeaderEntries(allHeaders, variant)) {
      pgn += `[${key} "${value}"]\n`;
    }
    pgn += '\n';
  }

  const groupSize = format === 'standard' ? 2 : numPlayers;
  const tokens: string[] = [];

  for (let i = 0; i < history.length; i++) {
    if (i % groupSize === 0) {
      tokens.push(`${Math.floor(i / groupSize) + 1}.`);
    }

    const entry = history[i];
    const san = moveSanFrom(entry);
    const playerLabel = labelForPlayer(entry?.player, turnLabels);

    if (format === 'standard') {
      tokens.push(san);
      continue;
    }

    if (format === '4player') {
      tokens.push(`${playerLabel}:${san}`);
      continue;
    }

    const from = entry?.move?.from || '?';
    const to = entry?.move?.to || '?';
    const flags = entry?.move?.flags || '';
    const detail = flags ? `${from}-${to},${flags}` : `${from}-${to}`;
    tokens.push(`${playerLabel}:${san}{${detail}}`);
  }

  tokens.push(allHeaders.Result || '*');
  const body = wrap(tokens.join(' ').trim(), options.wrapWidth || 96);
  return pgn + body;
}

/**
 * Parse PGN into headers and SAN move list.
 * Supports `standard`, `4player`, and `verbose`.
 */
export function parsePGN(pgn: string, options: { numPlayers?: number, format?: string, variant?: string } = {}): { headers: Record<string, string>, moves: string[] } {
  const headers: Record<string, string> = {};
  const headerRegex = /\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]/g;
  let match;
  while ((match = headerRegex.exec(pgn)) !== null) {
    headers[match[1]] = match[2];
  }

  const headerVariant = String(headers.Variant || '').toLowerCase();
  const hintPlayers = options.numPlayers || (headerVariant.startsWith('4player') ? 4 : 2);
  const format = normalizeFormat(options.format, hintPlayers);
  const moveText = stripPgnHeadersAndNoise(pgn);
  const rawTokens = extractTokens(moveText);

  const moves: string[] = [];
  for (const token of rawTokens) {
    if (token === '...') continue;

    let moveToken = token;
    if (format === '4player' || format === 'verbose') {
      const colon = token.indexOf(':');
      if (colon !== -1) moveToken = token.slice(colon + 1);
      moveToken = moveToken.replace(/\{.*\}$/, '');
    }

    if (!moveToken || moveToken === '...') continue;
    if (!PGN_RESULTS.has(moveToken)) {
      moves.push(moveToken);
    }
  }

  return { headers, moves };
}
