// Rendu de l'interface.
//
// Le DOM est reconstruit à partir de l'état à chaque changement. Le jeu n'affiche jamais plus
// d'une centaine de tuiles : un rendu complet coûte moins d'une milliseconde et évite toute la
// complexité d'une mise à jour incrémentale.

import { EXTENDS_FROM_LEVEL, REARRANGES_FROM_LEVEL } from './ai.js';
import {
  MANCHES_PER_GAME,
  MAX_LEVEL,
  xpFloorForLevel,
  xpForNextLevel,
} from './progression.js';
import { HUMAN_INDEX, ROUND_END_RUMMIKUB, isRoundOver, rackPenalty } from './engine.js';
import { COLORS, INITIAL_MELD_POINTS, JOKER_PENALTY, analyseMeld, tile } from './rules.js';

const $ = (id) => document.getElementById(id);

const RULES = [
  ['Le matériel',
    '106 tuiles : les numéros 1 à 13 dans quatre couleurs, chacun en double, plus deux jokers. '
    + 'Chaque joueur reçoit 14 tuiles au début de la manche.'],
  ['Les combinaisons',
    "Une suite réunit au moins trois numéros consécutifs d'une même couleur ; le 13 ne se relie "
    + 'jamais au 1. Un groupe réunit trois ou quatre fois le même numéro, toutes les couleurs '
    + 'étant différentes.'],
  ['La pose initiale',
    `Tant qu'un joueur n'a pas posé ${INITIAL_MELD_POINTS} points d'un seul coup, il ne peut rien `
    + 'faire d\'autre. Ces points se font uniquement avec ses propres tuiles, sans joker. Une '
    + 'fois le seuil atteint, le tour continue librement : on peut enchaîner d\'autres poses et '
    + 'compléter la table dans la foulée.'],
  ['Manipuler la table',
    'Une fois ouvert, un joueur peut découper, fusionner et réarranger librement les '
    + 'combinaisons posées, à deux conditions : descendre au moins une tuile de son chevalet et '
    + 'laisser, à la fin de son tour, une table entièrement valide.'],
  ['Les jokers',
    'Deux jokers circulent, un rouge et un noir ; chacun remplace la tuile de son choix. Dans '
    + 'une suite, le joker vaut la place où vous le posez — devant, au milieu ou derrière — et '
    + 'les points suivent. Une combinaison qui contient un joker est bloquée : on peut la '
    + 'compléter, mais pas en reprendre les tuiles. Remplacer le joker par la tuile qu\'il '
    + 'représente le renvoie dans votre chevalet : il doit alors être rejoué avant la fin du '
    + 'tour.'],
  ['Piocher',
    "Un joueur qui ne peut ou ne veut rien poser pioche une tuile et son tour s'achève."],
  ['Fin de la manche',
    'Le premier joueur à poser sa dernière tuile crie « Rummikub » et remporte la manche. Si la '
    + 'pioche s\'épuise sans que personne ne puisse jouer, c\'est le chevalet le plus léger qui '
    + 'l\'emporte.'],
  ['Le décompte',
    `Chaque perdant totalise en négatif les points restants sur son chevalet, un joker comptant `
    + `${JOKER_PENALTY}. Le gagnant marque en positif la somme de ces pénalités.`],
];

/** Comment jouer, rappelé sur la table tant que rien n'est posé. */
const EMPTY_BOARD_HINT = 'Faites glisser vos tuiles ici pour former vos combinaisons. '
  + `Il faut ${INITIAL_MELD_POINTS} points pour ouvrir, sans joker.`;

function tileElement(t, {
  selected = false, board = false, playable = false, recent = false, mustPlay = false,
} = {}) {
  const el = document.createElement('div');
  el.className = `tile ${t.color}${board ? ' board' : ''}${selected ? ' selected' : ''}`;
  if (t.isJoker) el.classList.add('joker');
  if (playable) el.classList.add('playable');
  if (recent) el.classList.add('recent');
  if (mustPlay) el.classList.add('must-play');
  el.dataset.tileId = String(t.id);

  const value = document.createElement('span');
  value.className = 'value';
  value.textContent = t.isJoker ? '☺' : String(t.number);
  el.append(value);

  const dot = document.createElement('span');
  dot.className = 'dot';
  el.append(dot);

  el.setAttribute('role', playable ? 'button' : 'img');
  el.setAttribute(
    'aria-label',
    t.isJoker ? 'joker' : `${t.number} ${{ black: 'noir', red: 'rouge', blue: 'bleu', orange: 'orange' }[t.color]}`,
  );
  // Le clic n'est pas géré ici : c'est le module de glisser-déposer qui distingue le tap du
  // déplacement, sur le même geste. Le clavier garde en revanche son propre chemin.
  if (playable) el.tabIndex = 0;
  return el;
}

export function createUi(game) {
  const state = () => game.getState();

  // ---------------------------------------------------------------- accueil

  function renderBrandTiles() {
    const host = $('brand-tiles');
    host.replaceChildren(
      tileElement(tile(-1, 1, 'red')),
      tileElement(tile(-2, 3, 'blue')),
      tileElement(tile(-3, 0, 'black', true)),
    );
  }

  function renderOpponentPills(ui) {
    const host = $('opponent-pills');
    host.replaceChildren();
    for (let count = 1; count <= 3; count += 1) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pill';
      button.textContent = String(count);
      button.setAttribute('aria-pressed', String(count === ui.opponentCount));
      button.setAttribute('aria-label', `${count} adversaire${count > 1 ? 's' : ''}`);
      button.addEventListener('click', () => game.chooseOpponentCount(count));
      host.append(button);
    }
  }

  /** Ce que le niveau change concrètement chez les adversaires, dit avec leurs paliers. */
  function levelDescription(level) {
    if (level < EXTENDS_FROM_LEVEL) {
      return 'Les adversaires ne posent que leurs propres combinaisons.';
    }
    if (level < REARRANGES_FROM_LEVEL) {
      return 'Les adversaires complètent aussi ce qui est déjà posé.';
    }
    return 'Les adversaires réorganisent toute la table à leur profit.';
  }

  function renderLevelCard(ui) {
    const host = $('level-card');
    host.replaceChildren();
    const title = document.createElement('h3');
    title.textContent = `Niveau ${ui.level}`;
    const what = document.createElement('p');
    what.textContent = levelDescription(ui.level);
    host.append(title, what);

    if (ui.level < MAX_LEVEL) {
      const inLevel = ui.xp - xpFloorForLevel(ui.level);
      const needed = xpForNextLevel(ui.level);
      const bar = document.createElement('div');
      bar.className = 'xp-bar';
      const fill = document.createElement('span');
      fill.style.width = `${Math.min(100, Math.round((inLevel / needed) * 100))}%`;
      bar.append(fill);
      const progress = document.createElement('p');
      progress.textContent = `${inLevel} / ${needed} XP avant le niveau ${ui.level + 1}`;
      const hint = document.createElement('p');
      hint.textContent = "L'expérience se gagne en fin de partie : tuiles posées, manches "
        + 'gagnées, position au classement. Les adversaires progressent avec vous.';
      host.append(bar, progress, hint);
    } else {
      const hint = document.createElement('p');
      hint.textContent = 'Niveau maximum atteint : les adversaires jouent à leur meilleur.';
      host.append(hint);
    }
  }

  function renderHome(ui) {
    renderOpponentPills(ui);
    renderLevelCard(ui);
    const resume = $('btn-resume');
    resume.hidden = !ui.canResume;
    $('btn-start').textContent = ui.canResume ? 'Nouvelle partie' : 'Commencer la partie';
  }

  // ---------------------------------------------------------------- partie

  function renderPlayers(ui) {
    const host = $('players');
    host.replaceChildren();
    ui.game.players.forEach((player, index) => {
      const chip = document.createElement('div');
      const active = index === ui.game.currentPlayerIndex && !isRoundOver(ui.game);
      chip.className = `player-chip${active ? ' active' : ''}${player.hasOpened ? ' opened' : ''}`;

      const marker = document.createElement('span');
      marker.className = 'marker';
      const name = document.createElement('span');
      name.textContent = player.name;
      const tally = document.createElement('span');
      tally.className = 'tally';
      tally.textContent = `${player.rack.length} · ${player.score}`;
      chip.append(marker, name, tally);
      chip.title = player.hasOpened ? 'a fait sa pose initiale' : "n'a pas encore ouvert";
      host.append(chip);
    });
    $('player-level').textContent = `Niveau ${ui.level}`;
    $('manche-count').textContent = `Manche ${ui.partie.manche}/${MANCHES_PER_GAME}`;
    $('pool-count').textContent = `Pioche ${ui.game.pool.length}`;
  }

  function renderBoard(ui, derived) {
    const host = $('board');
    host.replaceChildren();

    const empty = ui.workBoard.length === 0 && ui.selection.size === 0;
    host.className = `board${empty ? ' empty' : ''}`;
    if (empty) {
      const hint = document.createElement('p');
      hint.className = 'board-empty';
      hint.textContent = EMPTY_BOARD_HINT;
      host.append(hint);
      return;
    }

    for (const meld of ui.workBoard) {
      const sound = meld.tiles.length >= 3 && analyseMeld(meld.tiles) !== null;
      const row = document.createElement('div');
      row.className = `meld${sound ? '' : ' invalid'}`;
      row.dataset.meldId = String(meld.id);
      if (derived.isHumanTurn) {
        // Poignée de déplacement : attraper toute la combinaison pour réorganiser le tapis.
        const handle = document.createElement('div');
        handle.className = 'meld-handle';
        handle.textContent = '⠿';
        handle.setAttribute('aria-hidden', 'true');
        row.append(handle);
      }
      for (const t of meld.tiles) {
        row.append(tileElement(t, {
          board: true,
          selected: ui.selection.has(t.id),
          playable: derived.isHumanTurn,
          recent: ui.recentTileIds.has(t.id),
        }));
      }
      if (derived.isHumanTurn && ui.selection.size > 0) {
        const drop = document.createElement('button');
        drop.type = 'button';
        drop.className = 'drop-btn';
        drop.textContent = '+';
        drop.setAttribute('aria-label', 'déposer la sélection sur cette combinaison');
        drop.addEventListener('click', () => game.placeSelection(meld.id));
        row.append(drop);
      }
      host.append(row);
    }

    if (derived.isHumanTurn && ui.selection.size > 0) {
      const zone = document.createElement('button');
      zone.type = 'button';
      zone.className = 'new-meld-zone';
      zone.textContent = '+ Nouvelle combinaison';
      zone.addEventListener('click', () => game.placeSelection(null));
      host.append(zone);
    }
  }

  function statusText(ui, derived) {
    if (ui.message) return ui.message;
    if (ui.aiThinking) return `${ui.game.players[ui.game.currentPlayerIndex].name} réfléchit…`;
    if (derived.isHumanTurn && !derived.boardIsSound) {
      return 'Une combinaison est incomplète ou invalide (encadrée en rouge).';
    }
    if (derived.jokerToReplay) {
      return 'Le joker récupéré doit être rejoué avant de valider.';
    }
    if (!ui.game.players[HUMAN_INDEX].hasOpened && !isRoundOver(ui.game)) {
      return `Pose initiale : ${derived.pendingOpeningPoints} / ${INITIAL_MELD_POINTS} points, sans joker`;
    }
    return ui.log[ui.log.length - 1] ?? '';
  }

  function renderStatus(ui, derived) {
    const host = $('status');
    const warning = ui.message
      || (derived.isHumanTurn && !derived.boardIsSound)
      || derived.jokerToReplay;
    host.className = `status${warning ? ' warning' : ''}`;
    host.replaceChildren();
    if (ui.aiThinking) {
      const spinner = document.createElement('span');
      spinner.className = 'spinner';
      host.append(spinner);
    }
    const text = document.createElement('span');
    text.className = 'text';
    text.textContent = statusText(ui, derived);
    host.append(text);
  }

  /** Au-delà de ce nombre de tuiles, le chevalet passe sur deux rangées comme le vrai. */
  const SINGLE_ROW_LIMIT = 8;

  function renderRack(ui, derived) {
    const host = $('rack');
    host.replaceChildren();
    if (ui.workRack.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'empty';
      empty.textContent = 'Chevalet vide';
      host.append(empty);
      return;
    }

    // Le nombre de colonnes est fixé plutôt que laissé au retour à la ligne automatique : c'est
    // ce qui garantit deux rangées équilibrées, et non une rangée pleine suivie d'un reste.
    const grid = document.createElement('div');
    grid.className = 'rack-grid';
    const columns = ui.workRack.length <= SINGLE_ROW_LIMIT
      ? ui.workRack.length
      : Math.ceil(ui.workRack.length / 2);
    grid.style.setProperty('--rack-columns', String(columns));

    // Un joker récupéré sur la table attend ici d'être rejoué : il est signalé.
    const committedJokers = new Set(
      ui.game.board.flatMap((m) => m.tiles).filter((t) => t.isJoker).map((t) => t.id),
    );
    for (const t of ui.workRack) {
      const el = tileElement(t, {
        selected: ui.selection.has(t.id),
        playable: derived.isHumanTurn,
        mustPlay: committedJokers.has(t.id),
      });
      if (t.id === ui.drawnTileId) el.classList.add('drawn');
      grid.append(el);
    }
    host.append(grid);
  }

  function renderActions(ui, derived) {
    $('btn-return').disabled = !derived.isHumanTurn || ui.selection.size === 0;
    $('btn-sort-color').disabled = !derived.isHumanTurn;
    $('btn-sort-number').disabled = !derived.isHumanTurn;
    $('btn-undo').disabled = !derived.isHumanTurn || !derived.canUndo;
    $('btn-draw').disabled = !derived.isHumanTurn || derived.hasPendingChanges;
    $('btn-commit').disabled = !derived.canCommit;
    $('btn-sound').setAttribute('aria-pressed', String(ui.soundEnabled));
    $('btn-haptics').setAttribute('aria-pressed', String(ui.hapticsEnabled));
  }

  // ---------------------------------------------------------------- fenêtres

  function renderRules() {
    const host = $('rules-body');
    host.replaceChildren();
    for (const [title, body] of RULES) {
      const heading = document.createElement('h3');
      heading.textContent = title;
      const paragraph = document.createElement('p');
      paragraph.textContent = body;
      host.append(heading, paragraph);
    }
  }

  const RANK_LABELS = ['1ᵉʳ', '2ᵉ', '3ᵉ', '4ᵉ'];

  function renderRoundEnd(ui) {
    const game_ = ui.game;
    if (!game_ || !isRoundOver(game_)) return;
    const winner = game_.winnerIndex;
    $('round-end-title').textContent = ui.gameOver
      ? 'Fin de partie'
      : (game_.endReason === ROUND_END_RUMMIKUB ? 'Rummikub !' : 'Manche bloquée');
    $('btn-next-round').textContent = ui.gameOver ? 'Nouvelle partie' : 'Manche suivante';

    const host = $('round-end-body');
    host.replaceChildren();
    const intro = document.createElement('p');
    const mancheText = game_.endReason === ROUND_END_RUMMIKUB
      ? `${game_.players[winner].name} a posé sa dernière tuile.`
      : `La pioche est épuisée et plus personne ne peut jouer. ${game_.players[winner].name} conserve le chevalet le plus léger.`;
    if (ui.gameOver) {
      const best = game_.players.reduce((a, b) => (b.score > a.score ? b : a));
      intro.textContent = `${mancheText} ${best.name} remporte la partie.`;
    } else {
      intro.textContent = `Manche ${ui.partie.manche} sur ${MANCHES_PER_GAME} — ${mancheText}`;
    }
    host.append(intro);

    // Bilan de manche : joueurs dans l'ordre de la table. Bilan de partie : au classement.
    const players = game_.players.map((player, index) => ({ player, index }));
    if (ui.gameOver) players.sort((a, b) => b.player.score - a.player.score);
    players.forEach(({ player, index }, at) => {
      const row = document.createElement('div');
      const highlighted = ui.gameOver ? at === 0 : index === winner;
      row.className = `score-row${highlighted ? ' winner' : ''}`;
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = ui.gameOver ? `${RANK_LABELS[at]} · ${player.name}` : player.name;
      const left = document.createElement('span');
      left.className = 'left';
      left.textContent = `${player.rack.length} tuile(s), ${rackPenalty(player)} pts en main`;
      const score = document.createElement('span');
      score.className = `score ${player.score >= 0 ? 'positive' : 'negative'}`;
      score.textContent = `${player.score > 0 ? '+' : ''}${player.score}`;
      row.append(name, left, score);
      host.append(row);
    });

    if (ui.gameOver && ui.xpGain) {
      const gains = [
        [`Tuiles posées (${ui.partie.tilesLaid})`, ui.xpGain.tiles],
        [`Manches gagnées (${ui.partie.manchesWon})`, ui.xpGain.manches],
        [`Rummikub (${ui.partie.rummikubs})`, ui.xpGain.rummikubBonus],
        [`Position finale (${RANK_LABELS[ui.xpGain.rank - 1]})`, ui.xpGain.position],
      ];
      const block = document.createElement('div');
      block.className = 'xp-summary';
      for (const [label, value] of gains) {
        if (value <= 0) continue;
        const row = document.createElement('div');
        row.className = 'xp-row';
        const text = document.createElement('span');
        text.textContent = label;
        const amount = document.createElement('span');
        amount.textContent = `+${value} XP`;
        row.append(text, amount);
        block.append(row);
      }
      const total = document.createElement('div');
      total.className = 'xp-row total';
      const totalLabel = document.createElement('span');
      totalLabel.textContent = 'Expérience gagnée';
      const totalAmount = document.createElement('span');
      totalAmount.textContent = `+${ui.xpGain.total} XP`;
      total.append(totalLabel, totalAmount);
      block.append(total);
      host.append(block);

      const levelLine = document.createElement('p');
      levelLine.className = 'level-up';
      levelLine.textContent = ui.leveledUp
        ? `Vous passez au niveau ${ui.level} : les adversaires seront plus coriaces.`
        : (ui.level < MAX_LEVEL
          ? `Niveau ${ui.level} — ${ui.xp - xpFloorForLevel(ui.level)} / ${xpForNextLevel(ui.level)} XP avant le niveau ${ui.level + 1}.`
          : `Niveau ${MAX_LEVEL} : le maximum.`);
      host.append(levelLine);
    }

    const note = document.createElement('p');
    note.className = 'left';
    note.style.marginTop = '0.6rem';
    note.style.fontSize = '0.72rem';
    note.textContent = `Un joker resté en main coûte ${JOKER_PENALTY} points.`;
    host.append(note);
  }

  // ---------------------------------------------------------------- rendu global

  function render() {
    const ui = state();
    const derived = game.derived();

    $('home').hidden = ui.screen !== 'home';
    $('game').hidden = ui.screen !== 'game';

    if (ui.screen === 'home') {
      renderHome(ui);
    } else if (ui.game) {
      renderPlayers(ui);
      renderBoard(ui, derived);
      renderStatus(ui, derived);
      renderActions(ui, derived);
      renderRack(ui, derived);
    }

    const endModal = $('round-end-modal');
    const showEnd = Boolean(ui.showRoundEnd && ui.game && isRoundOver(ui.game));
    if (showEnd && endModal.hidden) renderRoundEnd(ui);
    endModal.hidden = !showEnd;
  }

  renderBrandTiles();
  renderRules();
  return { render };
}

export { COLORS };
