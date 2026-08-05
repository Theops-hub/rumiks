// État applicatif : enchaînement des tours, manipulation en cours, sauvegarde.
//
// Ce module ne touche pas au DOM. Il expose un état et des actions, et prévient l'interface à
// chaque changement — la même séparation que le ViewModel de la version Android.

import { chooseMove, DIFFICULTIES } from './ai.js';
import {
  HUMAN_INDEX,
  ROUND_END_BLOCKED,
  ROUND_END_RUMMIKUB,
  commitTurn as engineCommit,
  currentPlayer,
  drawAndPass,
  isRoundOver,
  newMeld,
  reserveMeldIds,
  startRound,
} from './engine.js';
import { INITIAL_MELD_POINTS, analyseMeld, sortByColor, sortByNumber } from './rules.js';
import { clearGame, loadGame, loadSettings, saveGame, saveSettings } from './storage.js';

const OPPONENT_NAMES = ['Alice', 'Bruno', 'Chloé'];

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Laisse le navigateur peindre avant de rendre la main. La recherche d'un joueur virtuel
 * monopolise le fil principal pendant quelques centaines de millisecondes ; sans cette pause,
 * le message « réfléchit » n'apparaîtrait qu'une fois le calcul terminé.
 */
const nextPaint = () => new Promise((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(resolve));
});

export function createGame({ onChange, onFeedback }) {
  const settings = loadSettings();
  const saved = loadGame();

  let state = {
    screen: 'home',
    difficulty: saved?.difficulty ?? 'medium',
    opponentCount: saved?.opponentCount ?? 2,
    game: null,
    workBoard: [],
    workRack: [],
    selection: new Set(),
    message: null,
    log: [],
    aiThinking: false,
    canResume: saved !== null,
    soundEnabled: settings.soundEnabled,
    hapticsEnabled: settings.hapticsEnabled,
  };

  /** Identifiants négatifs pour les combinaisons créées à la main : aucune collision possible. */
  let nextTempMeldId = -1;

  function notify() {
    onChange(state);
  }

  function update(patch) {
    state = { ...state, ...patch };
    notify();
  }

  function emit(effect, options) {
    onFeedback(effect, options);
  }

  // ------------------------------------------------------------ valeurs dérivées

  function isHumanTurn() {
    return state.game !== null
      && !isRoundOver(state.game)
      && state.game.currentPlayerIndex === HUMAN_INDEX
      && !state.aiThinking;
  }

  function tilesLaidThisTurn() {
    if (state.game === null) return 0;
    return state.game.players[HUMAN_INDEX].rack.length - state.workRack.length;
  }

  function boardIsSound() {
    return state.workBoard.every((m) => m.tiles.length >= 3 && analyseMeld(m.tiles) !== null);
  }

  /** Points de la pose initiale en cours de constitution. */
  function pendingOpeningPoints() {
    if (state.game === null || state.game.players[HUMAN_INDEX].hasOpened) return 0;
    const already = new Set(
      state.game.board.map((m) => m.tiles.map((t) => t.id).sort((a, b) => a - b).join(',')),
    );
    return state.workBoard
      .filter((m) => !already.has(m.tiles.map((t) => t.id).sort((a, b) => a - b).join(',')))
      .reduce((sum, m) => sum + (analyseMeld(m.tiles)?.points ?? 0), 0);
  }

  /**
   * Vrai si la table ou le chevalet diffèrent réellement du début de tour. La comparaison porte
   * sur la répartition des tuiles, pas sur leur ordre : ranger une combinaison ne compte pas
   * comme un coup entamé.
   */
  function hasPendingChanges() {
    if (state.game === null) return false;
    if (state.workRack.length !== state.game.players[HUMAN_INDEX].rack.length) return true;
    const key = (melds) => melds
      .map((m) => m.tiles.map((t) => t.id).sort((a, b) => a - b).join(','))
      .sort()
      .join(';');
    return key(state.game.board) !== key(state.workBoard);
  }

  function canCommit() {
    if (!isHumanTurn() || tilesLaidThisTurn() <= 0 || !boardIsSound()) return false;
    // Sans pose initiale, inutile de proposer la validation avant le seuil.
    return state.game.players[HUMAN_INDEX].hasOpened
      || pendingOpeningPoints() >= INITIAL_MELD_POINTS;
  }

  // ------------------------------------------------------------ écran d'accueil

  function chooseDifficulty(key) {
    if (DIFFICULTIES[key]) update({ difficulty: key });
  }

  function chooseOpponentCount(count) {
    update({ opponentCount: Math.min(Math.max(count, 1), OPPONENT_NAMES.length) });
  }

  function persist() {
    if (state.game === null) return;
    saveGame({
      difficulty: state.difficulty,
      opponentCount: state.opponentCount,
      game: state.game,
      log: state.log,
    });
  }

  function beginRound(carriedScores) {
    const game = startRound({
      humanName: 'Vous',
      opponentNames: OPPONENT_NAMES.slice(0, state.opponentCount),
      difficulty: state.difficulty,
      carriedScores,
    });
    reserveMeldIds(game);
    update({
      screen: 'game',
      game,
      workBoard: game.board,
      workRack: game.players[HUMAN_INDEX].rack,
      selection: new Set(),
      message: null,
      log: [`La partie commence. C'est à ${currentPlayer(game).name}.`],
      canResume: true,
      aiThinking: false,
    });
    persist();
    if (game.currentPlayerIndex !== HUMAN_INDEX) runAiTurns();
  }

  function startGame() {
    beginRound([]);
  }

  function nextRound() {
    beginRound(state.game ? state.game.players.map((p) => p.score) : []);
  }

  /** Quitter la partie la laisse en suspens : elle reste reprenable depuis l'accueil. */
  function backToHome() {
    update({
      screen: 'home',
      game: null,
      workBoard: [],
      workRack: [],
      selection: new Set(),
      message: null,
      aiThinking: false,
      canResume: loadGame() !== null,
    });
  }

  /** Reprend la partie interrompue, en relançant les joueurs virtuels si la main est à eux. */
  function resumeGame() {
    const restored = loadGame();
    if (restored === null) {
      update({ canResume: false });
      return;
    }
    const game = restored.game;
    reserveMeldIds(game);
    update({
      screen: 'game',
      difficulty: restored.difficulty,
      opponentCount: restored.opponentCount,
      game,
      workBoard: game.board,
      workRack: game.players[HUMAN_INDEX].rack,
      selection: new Set(),
      message: null,
      log: restored.log?.length ? restored.log : ['Partie reprise.'],
      aiThinking: false,
    });
    if (!isRoundOver(game) && game.currentPlayerIndex !== HUMAN_INDEX) runAiTurns();
  }

  function forgetSavedGame() {
    clearGame();
    update({ canResume: false });
  }

  // ------------------------------------------------------------ manipulation des tuiles

  function toggleSelection(tileId) {
    if (!isHumanTurn()) return;
    const selection = new Set(state.selection);
    if (selection.has(tileId)) selection.delete(tileId);
    else selection.add(tileId);
    update({ selection, message: null });
    emit('select');
  }

  function clearSelection() {
    update({ selection: new Set() });
  }

  function reorder(tiles) {
    return analyseMeld(tiles)?.ordered ?? tiles;
  }

  /** Envoie la sélection sur une combinaison existante, ou en crée une si `meldId` est nul. */
  function placeSelection(meldId) {
    if (!isHumanTurn()) return;
    if (state.selection.size === 0) {
      update({ message: "Choisissez d'abord une ou plusieurs tuiles." });
      emit('reject');
      return;
    }

    const selection = state.selection;
    const fromRack = state.workRack.filter((t) => selection.has(t.id));
    const fromBoard = state.workBoard.flatMap((m) => m.tiles).filter((t) => selection.has(t.id));
    const moved = [...fromRack, ...fromBoard];
    if (moved.length === 0) return;

    let board = state.workBoard.map((m) => ({
      ...m,
      tiles: m.tiles.filter((t) => !selection.has(t.id)),
    }));
    const rack = state.workRack.filter((t) => !selection.has(t.id));

    if (meldId === null) {
      board = board.filter((m) => m.tiles.length > 0);
      board.push(newMeld(reorder(moved), nextTempMeldId--));
    } else {
      board = board
        .map((m) => (m.id === meldId ? { ...m, tiles: reorder([...m.tiles, ...moved]) } : m))
        .filter((m) => m.tiles.length > 0);
    }

    update({ workBoard: board, workRack: rack, selection: new Set(), message: null });
    emit('place');
  }

  /** Ramène au chevalet les tuiles descendues pendant ce tour. */
  function returnSelectionToRack() {
    if (!isHumanTurn()) return;
    const committed = new Set(state.game.board.flatMap((m) => m.tiles).map((t) => t.id));
    const moved = state.workBoard
      .flatMap((m) => m.tiles)
      .filter((t) => state.selection.has(t.id) && !committed.has(t.id));
    if (moved.length === 0) {
      update({
        message: 'Ces tuiles étaient déjà sur la table avant votre tour : elles y restent.',
        selection: new Set(),
      });
      emit('reject');
      return;
    }
    const movedIds = new Set(moved.map((t) => t.id));
    const board = state.workBoard
      .map((m) => ({ ...m, tiles: m.tiles.filter((t) => !movedIds.has(t.id)) }))
      .filter((m) => m.tiles.length > 0);
    update({
      workBoard: board,
      workRack: sortByColor([...state.workRack, ...moved]),
      selection: new Set(),
      message: null,
    });
    emit('select');
  }

  function sortRack(mode) {
    update({
      workRack: mode === 'number' ? sortByNumber(state.workRack) : sortByColor(state.workRack),
    });
  }

  function undoTurn() {
    if (state.game === null) return;
    update({
      workBoard: state.game.board,
      workRack: state.game.players[HUMAN_INDEX].rack,
      selection: new Set(),
      message: null,
    });
  }

  // ------------------------------------------------------------ fin de tour

  function applyNewState(game, logLine) {
    update({
      game,
      workBoard: game.board,
      workRack: game.players[HUMAN_INDEX].rack,
      selection: new Set(),
      message: null,
      log: [...state.log, logLine].slice(-30),
    });
    persist();
    if (isRoundOver(game)) announceRoundEnd(game);
    else if (game.currentPlayerIndex !== HUMAN_INDEX) runAiTurns();
  }

  function commitTurn() {
    if (!isHumanTurn()) return;
    const result = engineCommit(state.game, state.workBoard, state.workRack);
    if (!result.ok) {
      update({ message: result.reason });
      emit('reject');
      return;
    }
    emit('commit');
    const laid = result.tilesPlayed;
    applyNewState(result.state, `Vous posez ${laid} tuile${laid > 1 ? 's' : ''}.`);
  }

  function drawTile() {
    if (!isHumanTurn()) return;
    if (hasPendingChanges()) {
      update({ message: "Annulez d'abord vos déplacements en cours." });
      emit('reject');
      return;
    }
    const empty = state.game.pool.length === 0;
    emit('draw');
    applyNewState(
      drawAndPass(state.game),
      empty ? 'Pioche vide : vous passez.' : 'Vous piochez une tuile.',
    );
  }

  function announceRoundEnd(game) {
    const winner = game.winnerIndex !== null ? game.players[game.winnerIndex].name : 'personne';
    const reason = game.endReason === ROUND_END_RUMMIKUB
      ? `Rummikub ! ${winner} a posé sa dernière tuile.`
      : `Pioche épuisée : ${winner} a le chevalet le plus léger.`;
    update({ log: [...state.log, reason].slice(-30), aiThinking: false, showRoundEnd: true });
    emit('roundEnd');
    persist();
  }

  function dismissRoundEnd() {
    update({ showRoundEnd: false });
  }

  function dismissMessage() {
    update({ message: null });
  }

  // ------------------------------------------------------------ tours des joueurs virtuels

  async function runAiTurns() {
    update({ aiThinking: true });
    for (;;) {
      const game = state.game;
      if (game === null || isRoundOver(game) || game.currentPlayerIndex === HUMAN_INDEX) break;

      const player = currentPlayer(game);
      await delay(450);
      await nextPaint();

      const move = chooseMove(game, player.difficulty ?? state.difficulty);
      let next;
      let line;
      if (move.type === 'play') {
        const result = engineCommit(game, move.board, move.rack);
        if (result.ok) {
          next = result.state;
          const laid = result.tilesPlayed;
          line = `${player.name} pose ${laid} tuile${laid > 1 ? 's' : ''}.`;
          emit('place', { haptic: false });
        } else {
          // Filet de sécurité : plutôt que d'imposer un coup douteux, le joueur virtuel pioche.
          next = drawAndPass(game);
          line = `${player.name} pioche.`;
          emit('draw', { haptic: false });
        }
      } else {
        next = drawAndPass(game);
        line = game.pool.length === 0 ? `${player.name} passe.` : `${player.name} pioche.`;
        emit('draw', { haptic: false });
      }

      update({
        game: next,
        workBoard: next.board,
        workRack: next.players[HUMAN_INDEX].rack,
        log: [...state.log, line].slice(-30),
      });
      persist();
      if (isRoundOver(next)) {
        announceRoundEnd(next);
        return;
      }
    }
    update({ aiThinking: false, selection: new Set() });
  }

  // ------------------------------------------------------------ réglages

  function toggleSound() {
    const soundEnabled = !state.soundEnabled;
    update({ soundEnabled });
    saveSettings({ soundEnabled, hapticsEnabled: state.hapticsEnabled });
    if (soundEnabled) emit('select');
  }

  function toggleHaptics() {
    const hapticsEnabled = !state.hapticsEnabled;
    update({ hapticsEnabled });
    saveSettings({ soundEnabled: state.soundEnabled, hapticsEnabled });
    if (hapticsEnabled) emit('select');
  }

  return {
    getState: () => state,
    derived: () => ({
      isHumanTurn: isHumanTurn(),
      tilesLaidThisTurn: tilesLaidThisTurn(),
      boardIsSound: boardIsSound(),
      canCommit: canCommit(),
      hasPendingChanges: hasPendingChanges(),
      pendingOpeningPoints: pendingOpeningPoints(),
    }),
    chooseDifficulty,
    chooseOpponentCount,
    startGame,
    nextRound,
    resumeGame,
    backToHome,
    forgetSavedGame,
    toggleSelection,
    clearSelection,
    placeSelection,
    returnSelectionToRack,
    sortRack,
    undoTurn,
    commitTurn,
    drawTile,
    dismissRoundEnd,
    dismissMessage,
    toggleSound,
    toggleHaptics,
    notify,
  };
}

export { DIFFICULTIES, ROUND_END_BLOCKED, ROUND_END_RUMMIKUB };
