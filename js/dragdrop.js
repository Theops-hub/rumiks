// Glisser-déposer des tuiles.
//
// C'est le geste du jeu : on attrape une tuile et on la pose où l'on veut — sur la table, dans
// une combinaison existante, entre deux tuiles, ou de retour dans son chevalet. Le tap pour
// sélectionner reste disponible, mais il n'est plus le seul moyen de jouer.
//
// Les événements « pointer » couvrent d'un coup le doigt, le stylet et la souris ; ils évitent
// aussi la double interprétation touch + mouse qui fait sauter les tuiles sur iPad.

/** Distance, en pixels, au-delà de laquelle un contact devient un déplacement et non un tap. */
const DRAG_THRESHOLD = 6;

/**
 * Repère où insérer entre deux tuiles : à gauche ou à droite de celle qu'on survole. Les tuiles
 * en cours de déplacement sont ignorées, sinon elles fausseraient leur propre destination.
 */
function insertionIndex(container, clientX) {
  const tiles = [...container.querySelectorAll('.tile:not(.dragging)')];
  for (let i = 0; i < tiles.length; i += 1) {
    const box = tiles[i].getBoundingClientRect();
    if (clientX < box.left + box.width / 2) return i;
  }
  return tiles.length;
}

export function enableDragAndDrop({ root, game, onDropped }) {
  let drag = null;

  function tileIdsToMove(tileId) {
    // Glisser une tuile déjà sélectionnée emporte tout le groupe : c'est ce qui permet de
    // déplacer une combinaison entière d'un seul geste.
    const selection = game.getState().selection;
    return selection.has(tileId) && selection.size > 1 ? [...selection] : [tileId];
  }

  function buildGhost(elements, pointer) {
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    const first = elements[0].getBoundingClientRect();
    for (const element of elements) {
      const copy = element.cloneNode(true);
      copy.classList.remove('selected');
      ghost.append(copy);
    }
    document.body.append(ghost);
    ghost.style.left = `${pointer.x}px`;
    ghost.style.top = `${pointer.y}px`;
    return { ghost, grabX: pointer.x - first.left, grabY: pointer.y - first.top };
  }

  function clearHighlight() {
    for (const element of root.querySelectorAll('.drop-target')) {
      element.classList.remove('drop-target');
    }
  }

  /** Détermine la destination sous le doigt. */
  function targetAt(x, y) {
    const under = document.elementFromPoint(x, y);
    if (!under) return null;

    const meld = under.closest('.meld');
    if (meld && meld.dataset.meldId) {
      return {
        element: meld,
        target: { kind: 'meld', meldId: Number(meld.dataset.meldId), index: insertionIndex(meld, x) },
      };
    }
    const rack = under.closest('#rack');
    if (rack) {
      return { element: rack, target: { kind: 'rack', index: insertionIndex(rack, x) } };
    }
    const board = under.closest('#board');
    if (board) return { element: board, target: { kind: 'new' } };
    return null;
  }

  function finish(event) {
    if (drag === null) return;
    const { ghost, elements, tileIds, moved } = drag;

    if (moved) {
      ghost.remove();
      const found = targetAt(event.clientX, event.clientY);
      clearHighlight();
      for (const element of elements) element.classList.remove('dragging');
      drag = null;
      if (found) {
        const done = game.moveTiles(tileIds, found.target);
        if (!done) onDropped();
      } else {
        // Relâché hors de toute zone : rien ne bouge, on redessine pour remettre en place.
        onDropped();
      }
    } else {
      // Le doigt n'a pas bougé : c'est un simple tap, on garde le comportement de sélection.
      // Aucune image de déplacement n'a été créée dans ce cas.
      for (const element of elements) element.classList.remove('dragging');
      const { tileId } = drag;
      drag = null;
      game.toggleSelection(tileId);
    }
  }

  root.addEventListener('pointerdown', (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    const tile = event.target.closest('.tile.playable');
    if (!tile || !tile.dataset.tileId) return;

    const tileId = Number(tile.dataset.tileId);
    const tileIds = tileIdsToMove(tileId);
    const elements = tileIds
      .map((id) => root.querySelector(`.tile[data-tile-id="${id}"]`))
      .filter(Boolean);
    if (elements.length === 0) return;

    event.preventDefault();
    drag = {
      pointerId: event.pointerId,
      tileId,
      tileIds,
      elements,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      ghost: null,
      grabX: 0,
      grabY: 0,
    };
    // La capture garantit de recevoir les événements même si le doigt sort de la tuile.
    tile.setPointerCapture(event.pointerId);
  });

  root.addEventListener('pointermove', (event) => {
    if (drag === null || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;

    if (!drag.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      drag.moved = true;
      const built = buildGhost(drag.elements, { x: event.clientX, y: event.clientY });
      drag.ghost = built.ghost;
      drag.grabX = built.grabX;
      drag.grabY = built.grabY;
      for (const element of drag.elements) element.classList.add('dragging');
    }

    drag.ghost.style.transform =
      `translate(${event.clientX - drag.grabX}px, ${event.clientY - drag.grabY}px)`;

    clearHighlight();
    const found = targetAt(event.clientX, event.clientY);
    if (found) found.element.classList.add('drop-target');
  });

  root.addEventListener('pointerup', finish);
  root.addEventListener('pointercancel', (event) => {
    if (drag === null || event.pointerId !== drag.pointerId) return;
    drag.ghost?.remove();
    clearHighlight();
    for (const element of drag.elements) element.classList.remove('dragging');
    drag = null;
    onDropped();
  });
}
