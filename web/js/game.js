// État applicatif : enchaînement des tours, manipulation en cours, sauvegarde.
//
// Ce module ne touche pas au DOM. Il expose un état et des actions, et prévient l'interface à
// chaque changement — la même séparation que le ViewModel de la version Android.

import { chooseMove } from './ai.js';
import {
  MANCHES_PER_GAME,
  computeGameXp,
  levelForXp,
  normalizeProgress,
} from './progression.js';
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
import { INITIAL_MELD_POINTS, MIN_MELD_SIZE, analyseMeld, sortByColor, sortByNumber } from './rules.js';
import {
  clearGame,
  loadGame,
  loadProgress,
  loadSettings,
  saveGame,
  saveProgress,
  saveSettings,
} from './storage.js';

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

/** Ce qui se comptabilise au fil d'une partie, remis à zéro quand une nouvelle commence. */
const freshPartie = () => ({ manche: 1, tilesLaid: 0, manchesWon: 0, rummikubs: 0 });

export function createGame({ onChange, onFeedback }) {
  const settings = loadSettings();
  const saved = loadGame();
  const progress = normalizeProgress(loadProgress());

  let state = {
    screen: 'home',
    /** Expérience cumulée du joueur ; le niveau en découle et règle la force des adversaires. */
    xp: progress.xp,
    level: levelForXp(progress.xp),
    /** Vrai quand la partie qui vient de s'achever a fait monter le joueur de niveau. */
    leveledUp: false,
    /** Vrai quand la dernière manche de la partie est jouée : le bilan affiche le classement. */
    gameOver: false,
    /** Détail de l'expérience gagnée à la fin de la dernière partie, pour le bilan. */
    xpGain: null,
    /** Avancement de la partie en cours : manche, tuiles posées, manches gagnées, Rummikubs. */
    partie: saved?.partie ?? freshPartie(),
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
    /** Tuiles posées par les adversaires depuis la dernière action du joueur : surlignées. */
    recentTileIds: new Set(),
  };

  /** Identifiants négatifs pour les combinaisons créées à la main : aucune collision possible. */
  let nextTempMeldId = -1;

  /**
   * Photographies successives de la table et du chevalet pendant le tour : « Annuler » revient
   * d'un déplacement en arrière, pas au début du tour.
   */
  let history = [];

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

  /**
   * Points de la pose initiale en cours de constitution : seules comptent les combinaisons
   * formées uniquement de tuiles du chevalet, jokers exclus.
   */
  function pendingOpeningPoints() {
    if (state.game === null || state.game.players[HUMAN_INDEX].hasOpened) return 0;
    const rackIds = new Set(state.game.players[HUMAN_INDEX].rack.map((t) => t.id));
    return state.workBoard
      .filter((m) => m.tiles.every((t) => rackIds.has(t.id) && !t.isJoker))
      .reduce((sum, m) => sum + (analyseMeld(m.tiles)?.points ?? 0), 0);
  }

  /** Vrai si un joker récupéré sur la table attend dans le chevalet d'être rejoué. */
  function jokerToReplay() {
    if (state.game === null) return false;
    const committedJokers = new Set(
      state.game.board.flatMap((m) => m.tiles).filter((t) => t.isJoker).map((t) => t.id),
    );
    return state.workRack.some((t) => committedJokers.has(t.id));
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
    // Un joker récupéré doit être rejoué avant de rendre la main.
    if (jokerToReplay()) return false;
    // Sans pose initiale, inutile de proposer la validation avant le seuil.
    return state.game.players[HUMAN_INDEX].hasOpened
      || pendingOpeningPoints() >= INITIAL_MELD_POINTS;
  }

  // ------------------------------------------------------------ écran d'accueil

  function chooseOpponentCount(count) {
    update({ opponentCount: Math.min(Math.max(count, 1), OPPONENT_NAMES.length) });
  }

  function persist() {
    if (state.game === null) return;
    saveGame({
      difficulty: state.level,
      opponentCount: state.opponentCount,
      game: state.game,
      log: state.log,
      partie: state.partie,
      gameOver: state.gameOver,
      xpGain: state.xpGain,
      leveledUp: state.leveledUp,
    });
  }

  function beginRound(carriedScores) {
    const game = startRound({
      humanName: 'Vous',
      opponentNames: OPPONENT_NAMES.slice(0, state.opponentCount),
      difficulty: state.level,
      carriedScores,
    });
    reserveMeldIds(game);
    history = [];
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
      recentTileIds: new Set(),
    });
    persist();
    if (game.currentPlayerIndex !== HUMAN_INDEX) runAiTurns();
  }

  function startGame() {
    update({ partie: freshPartie(), gameOver: false, leveledUp: false, xpGain: null });
    beginRound([]);
  }

  /**
   * Enchaîne après un bilan : la manche suivante de la même partie, scores conservés, ou une
   * nouvelle partie repartant de zéro si le classement final vient de tomber.
   */
  function nextRound() {
    if (state.game === null || state.gameOver) {
      startGame();
      return;
    }
    update({ partie: { ...state.partie, manche: state.partie.manche + 1 } });
    beginRound(state.game.players.map((p) => p.score));
  }

  /** Quitter la partie la laisse en suspens : elle reste reprenable depuis l'accueil. */
  function backToHome() {
    history = [];
    update({
      screen: 'home',
      game: null,
      workBoard: [],
      workRack: [],
      selection: new Set(),
      message: null,
      aiThinking: false,
      canResume: loadGame() !== null,
      recentTileIds: new Set(),
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
    history = [];
    update({
      screen: 'game',
      opponentCount: restored.opponentCount,
      game,
      workBoard: game.board,
      workRack: game.players[HUMAN_INDEX].rack,
      selection: new Set(),
      message: null,
      log: restored.log?.length ? restored.log : ['Partie reprise.'],
      aiThinking: false,
      recentTileIds: new Set(),
      partie: restored.partie ?? freshPartie(),
      gameOver: restored.gameOver ?? false,
      xpGain: restored.xpGain ?? null,
      leveledUp: restored.leveledUp ?? false,
      // Une manche achevée retrouve son bilan : sans lui, impossible d'enchaîner.
      showRoundEnd: isRoundOver(game),
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

  /**
   * Déplace des tuiles vers une destination.
   *
   * `target` vaut `{ kind: 'meld', meldId, index }` pour insérer dans une combinaison existante,
   * `{ kind: 'new' }` pour en former une nouvelle, ou `{ kind: 'rack', index }` pour remettre en
   * main. C'est le point de passage unique du glisser-déposer comme de la sélection au doigt.
   */
  function moveTiles(tileIds, target) {
    if (!isHumanTurn()) return false;
    const ids = new Set(tileIds);
    if (ids.size === 0) return false;

    const fromRack = state.workRack.filter((t) => ids.has(t.id));
    const fromBoard = state.workBoard.flatMap((m) => m.tiles).filter((t) => ids.has(t.id));
    // L'ordre voulu par le joueur est celui de la table puis du chevalet, chacun dans son
    // ordre d'affichage : c'est ce qui rend le résultat prévisible quand on déplace un groupe.
    const moved = [...fromBoard, ...fromRack];
    if (moved.length === 0) return false;

    const committedMelds = state.game.board;
    const committedJokers = new Set(
      committedMelds.flatMap((m) => m.tiles).filter((t) => t.isJoker).map((t) => t.id),
    );

    // Une combinaison qui contient un joker est bloquée : ses tuiles réelles ne se déplacent
    // pas, on peut seulement la compléter ou reprendre le joker en le remplaçant.
    const frozenIds = new Set(
      committedMelds
        .filter((m) => m.tiles.some((t) => t.isJoker))
        .flatMap((m) => m.tiles.filter((t) => !t.isJoker).map((t) => t.id)),
    );
    const leavesItsMeld = (t) => {
      const source = state.workBoard.find((m) => m.tiles.some((x) => x.id === t.id));
      return !(target.kind === 'meld' && source !== undefined && target.meldId === source.id);
    };
    if (moved.some((t) => frozenIds.has(t.id) && leavesItsMeld(t))) {
      update({
        message: 'Cette combinaison contient un joker : elle est bloquée. On peut la compléter ou remplacer le joker, pas en reprendre les tuiles.',
        selection: new Set(),
      });
      emit('reject');
      return false;
    }

    if (target.kind === 'rack') {
      // Les règles interdisent de reprendre une tuile posée avant ce tour — sauf le joker,
      // qui se récupère en le remplaçant et devra être rejoué avant la fin du tour.
      const committed = new Set(committedMelds.flatMap((m) => m.tiles).map((t) => t.id));
      if (moved.some((t) => !t.isJoker && committed.has(t.id))) {
        update({
          message: 'Ces tuiles étaient déjà sur la table avant votre tour : elles y restent.',
          selection: new Set(),
        });
        emit('reject');
        return false;
      }
    }

    let board = state.workBoard.map((m) => ({
      ...m,
      tiles: m.tiles.filter((t) => !ids.has(t.id)),
    }));
    let rack = state.workRack.filter((t) => !ids.has(t.id));

    if (target.kind === 'new') {
      board = board.filter((m) => m.tiles.length > 0);
      board.push(newMeld(reorder(moved), nextTempMeldId--));
    } else if (target.kind === 'meld') {
      const ejected = [];
      board = board
        .map((m) => {
          if (m.id !== target.meldId) return m;
          const at = target.index === undefined
            ? m.tiles.length
            : Math.max(0, Math.min(target.index, m.tiles.length));
          let tiles = reorder([...m.tiles.slice(0, at), ...moved, ...m.tiles.slice(at)]);
          // Un joker de la table rendu superflu par cet ajout est récupéré : il rejoint le
          // chevalet, avec l'obligation d'être rejoué avant la fin du tour. Les jokers que le
          // joueur vient lui-même de déposer restent où il les a mis.
          for (;;) {
            const spare = tiles.find((x) => x.isJoker
              && committedJokers.has(x.id)
              && !ids.has(x.id)
              && tiles.length - 1 >= MIN_MELD_SIZE
              && analyseMeld(tiles.filter((y) => y.id !== x.id)) !== null);
            if (spare === undefined) break;
            tiles = reorder(tiles.filter((y) => y.id !== spare.id));
            ejected.push(spare);
          }
          return { ...m, tiles };
        })
        .filter((m) => m.tiles.length > 0);
      rack = [...rack, ...ejected];
    } else {
      board = board.filter((m) => m.tiles.length > 0);
      const at = target.index === undefined
        ? rack.length
        : Math.max(0, Math.min(target.index, rack.length));
      rack = [...rack.slice(0, at), ...moved, ...rack.slice(at)];
    }

    history.push({ board: state.workBoard, rack: state.workRack });
    if (history.length > 100) history.shift();
    update({ workBoard: board, workRack: rack, selection: new Set(), message: null });
    emit(target.kind === 'rack' ? 'select' : 'place');
    return true;
  }

  /** Envoie la sélection sur une combinaison existante, ou en crée une si `meldId` est nul. */
  function placeSelection(meldId) {
    if (!isHumanTurn()) return;
    if (state.selection.size === 0) {
      update({ message: "Choisissez d'abord une ou plusieurs tuiles." });
      emit('reject');
      return;
    }
    moveTiles([...state.selection], meldId === null ? { kind: 'new' } : { kind: 'meld', meldId });
  }

  /** Ramène au chevalet les tuiles descendues pendant ce tour. */
  function returnSelectionToRack() {
    if (!isHumanTurn()) return;
    const onBoard = state.workBoard
      .flatMap((m) => m.tiles)
      .filter((t) => state.selection.has(t.id))
      .map((t) => t.id);
    if (onBoard.length === 0) {
      update({
        message: 'Ces tuiles étaient déjà sur la table avant votre tour : elles y restent.',
        selection: new Set(),
      });
      emit('reject');
      return;
    }
    moveTiles(onBoard, { kind: 'rack' });
  }

  function sortRack(mode) {
    update({
      workRack: mode === 'number' ? sortByNumber(state.workRack) : sortByColor(state.workRack),
    });
  }

  /** Revient d'un déplacement en arrière ; répété, il ramène au début du tour. */
  function undoTurn() {
    if (state.game === null) return;
    const previous = history.pop();
    update({
      workBoard: previous?.board ?? state.game.board,
      workRack: previous?.rack ?? state.game.players[HUMAN_INDEX].rack,
      selection: new Set(),
      message: null,
    });
  }

  // ------------------------------------------------------------ fin de tour

  function applyNewState(game, logLine) {
    history = [];
    update({
      game,
      workBoard: game.board,
      workRack: game.players[HUMAN_INDEX].rack,
      selection: new Set(),
      message: null,
      log: [...state.log, logLine].slice(-30),
      // Le joueur vient d'agir : les poses adverses encore surlignées ne le sont plus.
      recentTileIds: new Set(),
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
    const laid = result.tilesPlayed.length;
    // Chaque tuile posée nourrit l'expérience qui sera créditée à la fin de la partie.
    update({ partie: { ...state.partie, tilesLaid: state.partie.tilesLaid + laid } });
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

    const humanWon = game.winnerIndex === HUMAN_INDEX;
    const partie = {
      ...state.partie,
      manchesWon: state.partie.manchesWon + (humanWon ? 1 : 0),
      rummikubs: state.partie.rummikubs
        + (humanWon && game.endReason === ROUND_END_RUMMIKUB ? 1 : 0),
    };

    const log = [...state.log, reason];
    let patch = { partie, aiThinking: false, showRoundEnd: true };

    if (partie.manche >= MANCHES_PER_GAME) {
      // Dernière manche : le classement final tombe, et avec lui l'expérience de la partie.
      // Le niveau découle de l'expérience cumulée, enregistrée à part de la sauvegarde.
      const humanScore = game.players[HUMAN_INDEX].score;
      const rank = 1 + game.players
        .filter((p, index) => index !== HUMAN_INDEX && p.score > humanScore).length;
      const xpGain = { ...computeGameXp({ ...partie, rank }), rank };
      const xp = state.xp + xpGain.total;
      const level = levelForXp(xp);
      const leveledUp = level > state.level;
      saveProgress({ xp });

      log.push(`Fin de partie : vous gagnez ${xpGain.total} points d'expérience.`);
      if (leveledUp) log.push(`Vous passez au niveau ${level}.`);
      patch = { ...patch, xp, level, leveledUp, gameOver: true, xpGain };
    } else {
      patch = { ...patch, gameOver: false, leveledUp: false, xpGain: null };
    }

    update({ ...patch, log: log.slice(-30) });
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

      const move = chooseMove(game, player.difficulty ?? state.level);
      let next;
      let line;
      let laidTiles = [];
      if (move.type === 'play') {
        const result = engineCommit(game, move.board, move.rack);
        if (result.ok) {
          next = result.state;
          laidTiles = result.tilesPlayed;
          const laid = laidTiles.length;
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

      history = [];
      update({
        game: next,
        workBoard: next.board,
        workRack: next.players[HUMAN_INDEX].rack,
        log: [...state.log, line].slice(-30),
        // Les poses adverses s'accumulent en surbrillance jusqu'à la prochaine action du joueur.
        recentTileIds: new Set([...state.recentTileIds, ...laidTiles.map((t) => t.id)]),
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
      canUndo: history.length > 0,
      jokerToReplay: jokerToReplay(),
    }),
    chooseOpponentCount,
    startGame,
    nextRound,
    resumeGame,
    backToHome,
    forgetSavedGame,
    toggleSelection,
    clearSelection,
    moveTiles,
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

export { ROUND_END_BLOCKED, ROUND_END_RUMMIKUB };
