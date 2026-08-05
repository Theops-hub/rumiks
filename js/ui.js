// Rendu de l'interface.
//
// Le DOM est reconstruit à partir de l'état à chaque changement. Le jeu n'affiche jamais plus
// d'une centaine de tuiles : un rendu complet coûte moins d'une milliseconde et évite toute la
// complexité d'une mise à jour incrémentale.

import { DIFFICULTIES } from './ai.js';
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
    + 'faire d\'autre. Cette première pose se fait uniquement avec ses propres tuiles : '
    + 'interdiction d\'utiliser celles déjà sur la table.'],
  ['Manipuler la table',
    'Une fois ouvert, un joueur peut découper, fusionner et réarranger librement les '
    + 'combinaisons posées, à deux conditions : descendre au moins une tuile de son chevalet et '
    + 'laisser, à la fin de son tour, une table entièrement valide.'],
  ['Les jokers',
    'Un joker remplace la tuile de son choix. Posé sur la table, il peut être récupéré en le '
    + 'remplaçant par la tuile qu\'il représente, mais il doit alors être rejoué dans le même '
    + 'tour : il ne retourne jamais sur un chevalet.'],
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
  + `Il faut ${INITIAL_MELD_POINTS} points pour ouvrir.`;

function tileElement(t, { selected = false, board = false, playable = false } = {}) {
  const el = document.createElement('div');
  el.className = `tile ${t.color}${board ? ' board' : ''}${selected ? ' selected' : ''}`;
  if (t.isJoker) el.classList.add('joker');
  if (playable) el.classList.add('playable');
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

  function renderDifficultyCards(ui) {
    const host = $('difficulty-cards');
    host.replaceChildren();
    for (const level of Object.values(DIFFICULTIES)) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'difficulty-card';
      card.setAttribute('aria-pressed', String(level.key === ui.difficulty));
      const title = document.createElement('h3');
      title.textContent = level.label;
      const text = document.createElement('p');
      text.textContent = level.description;
      card.append(title, text);
      card.addEventListener('click', () => game.chooseDifficulty(level.key));
      host.append(card);
    }
  }

  function renderHome(ui) {
    renderOpponentPills(ui);
    renderDifficultyCards(ui);
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
      for (const t of meld.tiles) {
        row.append(tileElement(t, {
          board: true,
          selected: ui.selection.has(t.id),
          playable: derived.isHumanTurn,
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
    if (!ui.game.players[HUMAN_INDEX].hasOpened && !isRoundOver(ui.game)) {
      return `Pose initiale : ${derived.pendingOpeningPoints} / ${INITIAL_MELD_POINTS} points`;
    }
    return ui.log[ui.log.length - 1] ?? '';
  }

  function renderStatus(ui, derived) {
    const host = $('status');
    host.className = `status${ui.message ? ' warning' : ''}`;
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
    for (const t of ui.workRack) {
      host.append(tileElement(t, {
        selected: ui.selection.has(t.id),
        playable: derived.isHumanTurn,
      }));
    }
  }

  function renderActions(ui, derived) {
    $('btn-return').disabled = !derived.isHumanTurn || ui.selection.size === 0;
    $('btn-sort-color').disabled = !derived.isHumanTurn;
    $('btn-sort-number').disabled = !derived.isHumanTurn;
    $('btn-undo').disabled = !derived.isHumanTurn || !derived.hasPendingChanges;
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

  function renderRoundEnd(ui) {
    const game_ = ui.game;
    if (!game_ || !isRoundOver(game_)) return;
    const winner = game_.winnerIndex;
    $('round-end-title').textContent = game_.endReason === ROUND_END_RUMMIKUB
      ? 'Rummikub !'
      : 'Partie bloquée';

    const host = $('round-end-body');
    host.replaceChildren();
    const intro = document.createElement('p');
    intro.textContent = game_.endReason === ROUND_END_RUMMIKUB
      ? `${game_.players[winner].name} a posé sa dernière tuile.`
      : `La pioche est épuisée et plus personne ne peut jouer. ${game_.players[winner].name} conserve le chevalet le plus léger.`;
    host.append(intro);

    game_.players.forEach((player, index) => {
      const row = document.createElement('div');
      row.className = `score-row${index === winner ? ' winner' : ''}`;
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = player.name;
      const left = document.createElement('span');
      left.className = 'left';
      left.textContent = `${player.rack.length} tuile(s), ${rackPenalty(player)} pts en main`;
      const score = document.createElement('span');
      score.className = `score ${player.score >= 0 ? 'positive' : 'negative'}`;
      score.textContent = `${player.score > 0 ? '+' : ''}${player.score}`;
      row.append(name, left, score);
      host.append(row);
    });

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
