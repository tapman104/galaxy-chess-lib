import './style.css'
import { Chess } from '4chess'

// ── Piece image sources ──────────────────────────────────────────
const PIECE_SRC = {
  w: {
    p: 'https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_plt45.svg',
    n: 'https://upload.wikimedia.org/wikipedia/commons/7/70/Chess_nlt45.svg',
    b: 'https://upload.wikimedia.org/wikipedia/commons/b/b1/Chess_blt45.svg',
    r: 'https://upload.wikimedia.org/wikipedia/commons/7/72/Chess_rlt45.svg',
    q: 'https://upload.wikimedia.org/wikipedia/commons/1/15/Chess_qlt45.svg',
    k: 'https://upload.wikimedia.org/wikipedia/commons/4/42/Chess_klt45.svg',
  },
  b: {
    p: 'https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg',
    n: 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Chess_ndt45.svg',
    b: 'https://upload.wikimedia.org/wikipedia/commons/9/98/Chess_bdt45.svg',
    r: 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Chess_rdt45.svg',
    q: 'https://upload.wikimedia.org/wikipedia/commons/4/47/Chess_qdt45.svg',
    k: 'https://upload.wikimedia.org/wikipedia/commons/f/f0/Chess_kdt45.svg',
  },
}

// 4-player CSS filter map
const COLOR_FILTER = {
  r: 'sepia(1) saturate(8) hue-rotate(-50deg) brightness(1.1)',
  b: 'sepia(1) saturate(8) hue-rotate(180deg) brightness(1.2)',
  y: 'sepia(1) saturate(5) hue-rotate(10deg) brightness(1.4)',
  g: 'sepia(1) saturate(8) hue-rotate(80deg) brightness(1.1)',
}

const PIECE_SYMBOLS = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' }
const COLOR_LABEL   = { w: 'White', b: 'Black', r: 'Red', y: 'Yellow', g: 'Green' }

// ── State ────────────────────────────────────────────────────────
let game = new Chess()
let selected   = null   // currently selected square string
let validMoves = []     // verbose moves from selected square
let pendingPromo = null // { from, to } waiting for piece choice

// ── DOM refs ─────────────────────────────────────────────────────
const boardEl        = document.getElementById('board-container')
const ranksEl        = document.getElementById('coord-ranks')
const filesEl        = document.getElementById('coord-files')
const promoOverlay   = document.getElementById('promotion-overlay')
const promoChoices   = document.getElementById('promo-choices')
const moveListEl     = document.getElementById('move-list')
const variantSelect  = document.getElementById('variant-select')
const gameStatusInfo = document.getElementById('game-status-info')
const turnInfo       = document.getElementById('turn-info')
const gameOverModal  = document.getElementById('game-over-modal')
const gameOverIcon   = document.getElementById('game-over-icon')
const gameOverTitle  = document.getElementById('game-over-title')
const gameOverSub    = document.getElementById('game-over-sub')

// ── Init ─────────────────────────────────────────────────────────
function init() {
  buildCoords()
  render()

  // Sidebar tabs
  document.querySelectorAll('.stab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.stab').forEach(b => b.classList.remove('active'))
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'))
      btn.classList.add('active')
      document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden')
    })
  })

  // Top nav nav buttons
  document.getElementById('nav-play').addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'))
    document.getElementById('nav-play').classList.add('active')
    // Switch to moves tab in sidebar
    document.querySelectorAll('.stab').forEach(b => b.classList.remove('active'))
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'))
    document.querySelector('.stab[data-tab="moves"]').classList.add('active')
    document.getElementById('tab-moves').classList.remove('hidden')
  })

  document.getElementById('nav-settings').addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'))
    document.getElementById('nav-settings').classList.add('active')
    document.querySelectorAll('.stab').forEach(b => b.classList.remove('active'))
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'))
    document.querySelector('.stab[data-tab="info"]').classList.add('active')
    document.getElementById('tab-info').classList.remove('hidden')
  })

  // Variant change
  variantSelect.addEventListener('change', e => {
    game = new Chess({ variant: e.target.value })
    selected = null; validMoves = []
    buildCoords()
    render()
  })

  // Controls
  document.getElementById('btn-prev').addEventListener('click', () => {
    if (game.history().length === 0) return
    game.undo()
    selected = null; validMoves = []
    render()
  })

  document.getElementById('btn-first').addEventListener('click', () => {
    while (game.history().length > 0) game.undo()
    selected = null; validMoves = []
    render()
  })

  document.getElementById('btn-reset').addEventListener('click', () => {
    game.reset()
    selected = null; validMoves = []
    gameOverModal.classList.add('hidden')
    render()
  })

  // Copy moves button (sidebar)
  document.getElementById('btn-copy').addEventListener('click', () => copyMoves())

  // Game over modal actions
  document.getElementById('btn-play-again').addEventListener('click', () => {
    game.reset()
    selected = null; validMoves = []
    gameOverModal.classList.add('hidden')
    render()
  })

  document.getElementById('btn-copy-result').addEventListener('click', () => {
    copyMoves(document.getElementById('btn-copy-result'))
  })
}

// ── Build rank/file coordinates ──────────────────────────────────
function buildCoords() {
  const is4p = game.variant() === '4player@v1'
  const size = is4p ? 14 : 8

  ranksEl.innerHTML = ''
  filesEl.innerHTML = ''

  // Ranks: DOM order is 1→8 top-to-bottom, which after 180deg board flip shows 8 at top, 1 at bottom
  // Ranks: 8 at top, 1 at bottom — iterate from size down to 1
  for (let r = size; r >= 1; r--) {
    const s = document.createElement('span')
    s.textContent = r
    ranksEl.appendChild(s)
  }

  const files = is4p
    ? ['a','b','c','d','e','f','g','h','i','j','k','l','m','n']
    : ['a','b','c','d','e','f','g','h']

  for (const f of files) {
    const s = document.createElement('span')
    s.textContent = f
    filesEl.appendChild(s)
  }
}

// ── Full render ──────────────────────────────────────────────────
function render() {
  renderBoard()
  renderPlayers()
  renderMoveList()
  renderInfo()
}

// ── Board ────────────────────────────────────────────────────────
function renderBoard() {
  const snap     = game.board()
  const is4p     = snap.variant === '4player@v1'
  const history  = game.history({ verbose: true })
  const lastMove = history[history.length - 1]
  const checkSq  = game.inCheck() ? findKing(game.turnIndex()) : null

  boardEl.className = `board ${is4p ? 'four-player-view' : 'standard-view'}`
  boardEl.innerHTML = ''

  const { width, height, cells } = snap

  // Render rank by rank, starting from rank `height` down to rank 1
  // Engine cells: index 0 = a1, index width-1 = h1, ..., top rank last
  // We want rank 8 at top (DOM) → iterate ranks from high to low
  for (let rankIdx = height - 1; rankIdx >= 0; rankIdx--) {
    for (let fileIdx = 0; fileIdx < width; fileIdx++) {
      const i = rankIdx * width + fileIdx
      const cell = cells[i]

      const sq = document.createElement('div')
      sq.className = 'sq'

      if (cell === null) {
        sq.classList.add('void')
      } else {
        const isLight = (fileIdx + rankIdx) % 2 === 0
        sq.classList.add(isLight ? 'light' : 'dark')
        sq.dataset.sq = cell.square

        if (selected === cell.square)
          sq.classList.add('selected')

        if (lastMove && (lastMove.from === cell.square || lastMove.to === cell.square))
          sq.classList.add('last-move')

        if (checkSq === cell.square)
          sq.classList.add('in-check')

        // Valid move dots
        const vm = validMoves.find(m => m.to === cell.square)
        if (vm) {
          sq.classList.add(cell.piece ? 'valid-capture' : 'valid-move')
        }

        if (cell.piece) {
          const img = document.createElement('img')
          img.className = 'piece'
          const { color, type } = cell.piece

          const srcColor = (color === 'w' || color === 'r' || color === 'y') ? 'w' : 'b'
          img.src = PIECE_SRC[srcColor][type]

          if (is4p && COLOR_FILTER[color])
            img.style.filter = COLOR_FILTER[color]

          sq.appendChild(img)
        }

        sq.addEventListener('click', () => onSquareClick(cell.square, cell))
      }

      boardEl.appendChild(sq)
    }
  }
}

// ── Square click handler ─────────────────────────────────────────
function onSquareClick(square, cell) {
  if (game.isGameOver()) return

  // Deselect
  if (selected === square) {
    selected = null; validMoves = []
    renderBoard(); return
  }

  // Execute move
  if (selected) {
    const move = validMoves.find(m => m.to === square)
    if (move) {
      // Promotion?
      const needsPromo = validMoves.filter(m => m.to === square && m.promotion).length > 0
      if (needsPromo) {
        openPromo(move, cell)
        return
      }
      execMove(move)
      return
    }
  }

  // Select own piece
  const piece = game.get(square)
  if (piece && piece.color === game.turn()) {
    selected = square
    validMoves = game.moves({ square, verbose: true })
    renderBoard()
  } else {
    selected = null; validMoves = []
    renderBoard()
  }
}

function execMove(moveObj) {
  game.move(moveObj)
  selected = null; validMoves = []
  render()
  checkGameOver()
}

// ── Promotion ────────────────────────────────────────────────────
function openPromo(move, cell) {
  pendingPromo = move
  promoChoices.innerHTML = ''
  const turn = game.turn()
  const srcColor = (turn === 'w' || turn === 'r' || turn === 'y') ? 'w' : 'b'

  for (const type of ['q', 'r', 'b', 'n']) {
    const div = document.createElement('div')
    div.className = 'promo-piece'
    const img = document.createElement('img')
    img.src = PIECE_SRC[srcColor][type]
    if (srcColor === 'w' && COLOR_FILTER[turn]) img.style.filter = COLOR_FILTER[turn]
    div.appendChild(img)
    div.addEventListener('click', () => {
      promoOverlay.classList.add('hidden')
      execMove({ ...pendingPromo, promotion: type })
      pendingPromo = null
    })
    promoChoices.appendChild(div)
  }

  promoOverlay.classList.remove('hidden')
}

// ── Players ──────────────────────────────────────────────────────
function renderPlayers() {
  const is4p     = game.variant() === '4player@v1'
  const history  = game.history({ verbose: true })
  const captured = { w: [], b: [], r: [], y: [], g: [] }
  history.forEach(m => { if (m.captured) captured[m.color].push(m.captured) })

  const syms = p => PIECE_SYMBOLS[p]

  if (!is4p) {
    // White (bottom)
    document.getElementById('player-white-name').textContent = 'White'
    document.getElementById('captured-white').textContent = captured.w.map(syms).join('')
    setStatusBadge('status-white', 'w')

    // Black (top)
    document.getElementById('player-black-name').textContent = 'Black'
    document.getElementById('captured-black').textContent = captured.b.map(syms).join('')
    setStatusBadge('status-black', 'b')

    // dots
    document.querySelector('.dot-white').className = 'player-color-dot dot-white'
    document.querySelector('.dot-black').className = 'player-color-dot dot-black'
  } else {
    // Show Red bottom, Blue top (simplified; full 4p layout beyond scope)
    document.getElementById('player-white-name').textContent = 'Red & Green'
    document.getElementById('player-black-name').textContent = 'Blue & Yellow'
    document.getElementById('captured-white').textContent = ''
    document.getElementById('captured-black').textContent = ''
  }
}

function setStatusBadge(id, color) {
  const el = document.getElementById(id)
  const turn = game.turn()

  if (game.isGameOver()) {
    el.textContent = color === turn ? '🏳 Defeated' : '🏆 Winner'
  } else if (turn === color && game.inCheck()) {
    el.textContent = '⚠ Check'
  } else {
    el.textContent = turn === color ? '▶ Your turn' : ''
  }
}

// ── Move list ────────────────────────────────────────────────────
function renderMoveList() {
  const history = game.history({ verbose: true })
  const is4p    = game.variant() === '4player@v1'
  const step    = is4p ? 4 : 2

  moveListEl.innerHTML = ''

  if (history.length === 0) {
    moveListEl.innerHTML = '<div class="move-empty">No moves yet</div>'
    return
  }

  for (let i = 0; i < history.length; i += step) {
    const row = document.createElement('div')
    row.className = 'move-row'
    if (is4p) row.style.gridTemplateColumns = '28px 1fr 1fr 1fr 1fr'

    const num = document.createElement('span')
    num.className = 'move-num'
    num.textContent = Math.floor(i / step) + 1
    row.appendChild(num)

    for (let j = 0; j < step; j++) {
      const m = history[i + j]
      const span = document.createElement('span')
      span.className = 'move-san'
      span.textContent = m ? m.san : ''
      if (m && i + j === history.length - 1) span.classList.add('current')
      row.appendChild(span)
    }

    moveListEl.appendChild(row)
  }

  moveListEl.scrollTop = moveListEl.scrollHeight
}

// ── Info tab ─────────────────────────────────────────────────────
function renderInfo() {
  const turn = game.turn()
  gameStatusInfo.textContent = game.isGameOver()
    ? (game.inCheckmate() ? 'Checkmate' : 'Game Over')
    : game.inCheck() ? 'Check!'
    : 'Ready'
  turnInfo.textContent = COLOR_LABEL[turn] || turn
}

// ── Game Over Modal ──────────────────────────────────────────────
function checkGameOver() {
  if (!game.isGameOver()) return

  const history = game.history({ verbose: true })
  const lastMove = history[history.length - 1]

  if (game.inCheckmate()) {
    // The player who just moved wins
    const winner = lastMove ? COLOR_LABEL[lastMove.color] || lastMove.color : 'Unknown'
    gameOverIcon.textContent = '♛'
    gameOverTitle.textContent = 'Checkmate!'
    gameOverSub.textContent = `${winner} wins`
  } else if (game.inStalemate ? game.inStalemate() : game.isDraw && game.isDraw()) {
    gameOverIcon.textContent = '🤝'
    gameOverTitle.textContent = 'Stalemate!'
    gameOverSub.textContent = "It's a draw"
  } else {
    gameOverIcon.textContent = '🏁'
    gameOverTitle.textContent = 'Game Over'
    gameOverSub.textContent = "The game has ended"
  }

  // Small delay so the board re-renders first
  setTimeout(() => gameOverModal.classList.remove('hidden'), 350)
}

// ── Copy Moves ───────────────────────────────────────────────────
function copyMoves(btn) {
  const history = game.history()
  if (history.length === 0) return

  // Build PGN-style move text
  const step = game.variant() === '4player@v1' ? 4 : 2
  let text = ''
  for (let i = 0; i < history.length; i += step) {
    text += `${Math.floor(i / step) + 1}. `
    for (let j = 0; j < step; j++) {
      if (history[i + j]) text += history[i + j] + ' '
    }
  }

  navigator.clipboard.writeText(text.trim()).then(() => {
    const target = btn || document.getElementById('btn-copy')
    const orig = target.innerHTML
    target.classList.add('copied')
    target.innerHTML = btn
      ? '✓ Copied!'
      : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
    setTimeout(() => {
      target.innerHTML = orig
      target.classList.remove('copied')
    }, 1800)
  })
}

// ── Helpers ──────────────────────────────────────────────────────
function findKing(playerIndex) {
  const snap = game.board()
  const is4p = game.variant() === '4player@v1'
  const colorMap = is4p ? ['r', 'b', 'y', 'g'] : ['w', 'b']
  const color = colorMap[playerIndex]
  for (const cell of snap.cells) {
    if (cell && cell.piece && cell.piece.type === 'k' && cell.piece.color === color)
      return cell.square
  }
  return null
}

init()
