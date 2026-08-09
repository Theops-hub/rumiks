// Point d'entrée : assemble l'état, l'interface et les retours sensoriels.

import { enableDragAndDrop } from './dragdrop.js';
import { createFeedback, supportsVibration } from './feedback.js';
import { createGame } from './game.js';
import { createUi } from './ui.js';

const game = createGame({
  onChange: () => ui.render(),
  onFeedback: (effect, options) => feedback.play(effect, options),
});

const feedback = createFeedback({
  isSoundEnabled: () => game.getState().soundEnabled,
  isHapticsEnabled: () => game.getState().hapticsEnabled,
});

const ui = createUi(game);

// Le même geste sert à attraper une tuile et à la sélectionner : le module distingue le tap du
// déplacement selon que le doigt bouge ou non.
enableDragAndDrop({
  root: document.getElementById('game'),
  game,
  onDropped: () => ui.render(),
});

// ------------------------------------------------------------------ commandes

const on = (id, handler) => document.getElementById(id).addEventListener('click', handler);

on('btn-start', () => game.startGame());
on('btn-resume', () => game.resumeGame());
on('btn-quit', () => game.backToHome());
on('btn-return', () => game.returnSelectionToRack());
on('btn-sort-color', () => game.sortRack('color'));
on('btn-sort-number', () => game.sortRack('number'));
on('btn-undo', () => game.undoTurn());
on('btn-draw', () => game.drawTile());
on('btn-commit', () => game.commitTurn());
on('btn-sound', () => game.toggleSound());
on('btn-haptics', () => game.toggleHaptics());
on('btn-next-round', () => {
  game.dismissRoundEnd();
  game.nextRound();
});
on('btn-round-home', () => {
  game.dismissRoundEnd();
  game.backToHome();
});

const rulesModal = document.getElementById('rules-modal');
const openRules = () => { rulesModal.hidden = false; };
const closeRules = () => { rulesModal.hidden = true; };
on('btn-rules', openRules);
on('btn-rules-home', openRules);
on('btn-rules-close', closeRules);
rulesModal.addEventListener('click', (event) => {
  if (event.target === rulesModal) closeRules();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeRules();
    return;
  }
  // Les tuiles restent atteignables au clavier : le glisser-déposer ne doit pas être le seul
  // chemin. Entrée ou Espace sélectionne, les boutons de dépôt font le reste.
  if (event.key === 'Enter' || event.key === ' ') {
    const tile = event.target.closest?.('.tile.playable');
    if (tile?.dataset.tileId) {
      event.preventDefault();
      game.toggleSelection(Number(tile.dataset.tileId));
    }
  }
});

// Le vibreur n'existe pas sur iPad : autant ne pas proposer un réglage sans effet.
if (!supportsVibration()) {
  const button = document.getElementById('btn-haptics');
  button.hidden = true;
}

// Safari n'autorise la lecture audio qu'après un geste : on déverrouille au premier contact,
// puis on réveille le contexte à chaque retour de l'application au premier plan.
const unlock = () => feedback.unlock();
document.addEventListener('pointerdown', unlock, { once: true });
document.addEventListener('touchstart', unlock, { once: true });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') feedback.unlock();
});

// Un double appui rapproché fait zoomer Safari même avec user-scalable=no ; ce garde-fou
// annule le second appui quand il suit le premier de très près.
let lastTouchEnd = 0;
document.addEventListener('touchend', (event) => {
  const now = Date.now();
  if (now - lastTouchEnd < 320) event.preventDefault();
  lastTouchEnd = now;
}, { passive: false });

// Empêche le rebond élastique de la page derrière le plateau.
document.addEventListener('touchmove', (event) => {
  const scrollable = event.target.closest('.board, .rack, .meld, .modal-body, #home, .actions, .players-bar');
  if (!scrollable) event.preventDefault();
}, { passive: false });

ui.render();

// Les positions libres du tapis sont exprimées en fraction de sa largeur : un changement de
// taille de fenêtre demande un nouveau rendu pour les rétablir.
window.addEventListener('resize', () => ui.render());

// ------------------------------------------------------------------ hors ligne

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((error) => {
      // Un service worker refusé (page servie en HTTP simple, par exemple) n'empêche pas de
      // jouer : seul le fonctionnement sans réseau est perdu.
      console.warn('Mode hors ligne indisponible.', error);
    });
  });
}
