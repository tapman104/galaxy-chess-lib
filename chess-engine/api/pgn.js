/**
 * Export history to PGN string.
 * @param {Array<{san: string, color: string}>} history
 * @param {Object} headers
 * @returns {string}
 */
export function exportPGN(history, headers = {}) {
  const defaultHeaders = {
    Event: '?',
    Site: '?',
    Date: new Date().toISOString().split('T')[0].replace(/-/g, '.'),
    Round: '?',
    White: '?',
    Black: '?',
    Result: '*'
  };

  const allHeaders = { ...defaultHeaders, ...headers };
  let pgn = '';

  for (const [key, value] of Object.entries(allHeaders)) {
    pgn += `[${key} "${value}"]\n`;
  }
  pgn += '\n';

  let moveText = '';
  for (let i = 0; i < history.length; i++) {
    if (i % 2 === 0) {
      moveText += `${(i / 2) + 1}. `;
    }
    moveText += `${history[i].san} `;
  }
  moveText += allHeaders.Result;

  // Wrap at 80 chars
  const wrapped = moveText.replace(/(.{1,80})( +|$\n?)/g, '$1\n');
  return pgn + wrapped.trim();
}

/**
 * Very basic PGN parser.
 */
export function parsePGN(pgn) {
  const headers = {};
  const headerRegex = /\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]/g;
  let match;
  while ((match = headerRegex.exec(pgn)) !== null) {
    headers[match[1]] = match[2];
  }

  // Strip headers and comments
  const moveText = pgn
    .replace(/\[.*?\]/g, '')
    .replace(/\{.*?\}/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\d+\.\s+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const moves = moveText.split(' ').filter(m => {
    return m && !m.includes('.') && !['1-0', '0-1', '1/2-1/2', '*'].includes(m);
  });

  return { headers, moves };
}
