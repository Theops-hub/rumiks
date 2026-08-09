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
 * Hauteur dont la tuile portée est remontée au-dessus du point de contact : sur une tablette,
 * le doigt masque exactement ce qu'on essaie de placer.
 */
const FINGER_LIFT = 22;

/**
 * Écart toléré entre la tuile portée et une combinaison pour l'y joindre. La comparaison porte
 * sur les deux rectangles et non sur un point : on accole une tuile contre une autre, il faut
 * donc la mettre au contact (à un souffle près). Une tolérance plus large aimantait les tuiles
 * relâchées dans les interstices du tapis vers des combinaisons que le joueur ne visait pas —
 * sur un plateau garni, tout l'espace libre était à moins de 30 px d'une rangée.
 */
const DROP_TOLERANCE = 8;

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

  /** Déplacement d'une combinaison entière, saisie par sa poignée. */
  let meldDrag = null;

  function tileIdsToMove(tileId) {
    // Glisser une tuile déjà sélectionnée emporte tout le groupe : c'est ce qui permet de
    // déplacer une combinaison entière d'un seul geste.
    const selection = game.getState().selection;
    return selection.has(tileId) && selection.size > 1 ? [...selection] : [tileId];
  }

  /**
   * Construit la tuile portée. Elle conserve l'endroit exact où le doigt l'a saisie, de sorte
   * qu'elle ne saute pas au moment de la prise, mais elle est remontée pour rester visible.
   */
  function buildGhost(elements, pointer) {
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    const first = elements[0].getBoundingClientRect();
    for (const element of elements) {
      const copy = element.cloneNode(true);
      copy.classList.remove('selected', 'dragging');
      ghost.append(copy);
    }
    document.body.append(ghost);
    return {
      ghost,
      grabX: pointer.x - first.left,
      grabY: pointer.y - first.top + FINGER_LIFT,
      tileWidth: first.width,
      tileHeight: first.height,
    };
  }

  /**
   * Emprise de la tuile portée. C'est elle, et non la pulpe du doigt, qui décide de la
   * destination : ce qu'on voit à l'écran doit être ce qui compte.
   */
  function draggedRect(event) {
    if (drag === null || !drag.moved) {
      return {
        left: event.clientX, right: event.clientX, top: event.clientY, bottom: event.clientY,
      };
    }
    const left = event.clientX - drag.grabX;
    const top = event.clientY - drag.grabY;
    return {
      left,
      top,
      right: left + drag.tileWidth,
      bottom: top + drag.tileHeight,
    };
  }

  function clearHighlight() {
    for (const element of root.querySelectorAll('.drop-target')) {
      element.classList.remove('drop-target');
    }
    for (const element of root.querySelectorAll('.insert-before, .insert-after')) {
      element.classList.remove('insert-before', 'insert-after');
    }
  }

  /**
   * Position visée par la combinaison portée, parmi les autres : la rangée au-dessus du
   * pointeur passe avant, celle qui l'entoure se départage à sa moitié.
   */
  /** Combinaison sous le pointeur, la portée exclue : c'est la cible d'une fusion éventuelle. */
  function meldUnderPointer(clientX, clientY, draggedEl) {
    for (const el of root.querySelectorAll('#board .meld[data-meld-id]')) {
      if (el === draggedEl) continue;
      const box = el.getBoundingClientRect();
      if (clientX >= box.left && clientX <= box.right
        && clientY >= box.top && clientY <= box.bottom) return el;
    }
    return null;
  }

  function meldInsertion(clientX, clientY, draggedEl) {
    const melds = [...root.querySelectorAll('#board .meld[data-meld-id]')]
      .filter((el) => el !== draggedEl);
    for (let i = 0; i < melds.length; i += 1) {
      const box = melds[i].getBoundingClientRect();
      if (clientY < box.top) return { index: i, element: melds[i], after: false };
      if (clientY <= box.bottom && clientX < box.left + box.width / 2) {
        return { index: i, element: melds[i], after: false };
      }
    }
    const last = melds[melds.length - 1];
    return { index: melds.length, element: last ?? null, after: true };
  }

  function finishMeldDrag(event) {
    const { ghost, meldEl, meldId, moved } = meldDrag;
    const over = moved ? meldUnderPointer(event.clientX, event.clientY, meldEl) : null;
    const target = moved ? meldInsertion(event.clientX, event.clientY, meldEl) : null;
    ghost?.remove();
    clearHighlight();
    meldEl.classList.remove('meld-dragging');
    meldDrag = null;
    if (!moved) return;
    // Déposée sur une combinaison compatible, la série fusionne avec elle ; sinon le geste
    // reste un repositionnement.
    if (over !== null && game.mergeMelds(meldId, Number(over.dataset.meldId))) return;
    const done = game.moveMeld(meldId, target.index);
    if (!done) onDropped();
  }

  /**
   * Montre où la tuile va s'intercaler. Le repère est un liseré porté par la tuile voisine et
   * non un élément inséré : ajouter un élément décalerait toute la rangée à chaque déplacement
   * du doigt.
   */
  function showInsertionMark({ element, target }) {
    if (target.kind === 'new') return;
    const tiles = [...element.querySelectorAll('.tile:not(.dragging)')];
    if (tiles.length === 0) return;
    if (target.index >= tiles.length) tiles[tiles.length - 1].classList.add('insert-after');
    else tiles[target.index].classList.add('insert-before');
  }

  /** Écart entre deux rectangles ; nul dès qu'ils se chevauchent. */
  function rectDistance(a, b) {
    const dx = Math.max(b.left - a.right, 0, a.left - b.right);
    const dy = Math.max(b.top - a.bottom, 0, a.top - b.bottom);
    return Math.hypot(dx, dy);
  }

  /**
   * Détermine la destination visée par la tuile portée.
   *
   * Il n'est pas demandé de tomber pile sur une combinaison : la plus proche l'emporte dès que
   * la tuile la frôle. Sans cette tolérance, compléter un groupe de trois relèverait de
   * l'adresse, puisqu'une combinaison naissante ne fait qu'une tuile de large.
   */
  function targetAt(rect) {
    const centreX = (rect.left + rect.right) / 2;
    const centreY = (rect.top + rect.bottom) / 2;

    let best = null;
    let bestDistance = Infinity;
    for (const meld of root.querySelectorAll('.meld[data-meld-id]')) {
      const distance = rectDistance(rect, meld.getBoundingClientRect());
      if (distance < bestDistance) {
        bestDistance = distance;
        best = meld;
      }
    }
    if (best !== null && bestDistance <= DROP_TOLERANCE) {
      return {
        element: best,
        target: {
          kind: 'meld',
          meldId: Number(best.dataset.meldId),
          index: insertionIndex(best, centreX),
        },
      };
    }

    const under = document.elementFromPoint(centreX, centreY);
    const rack = under?.closest('#rack');
    if (rack) {
      return { element: rack, target: { kind: 'rack', index: insertionIndex(rack, centreX) } };
    }
    const board = under?.closest('#board');
    if (board) return { element: board, target: { kind: 'new' } };
    return null;
  }

  function finish(event) {
    if (drag === null) return;
    const { ghost, elements, tileIds, moved } = drag;

    if (moved) {
      const rect = draggedRect(event);
      ghost.remove();
      const found = targetAt(rect);
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

    // Saisie d'une combinaison entière : par sa poignée, ou par son cadre — n'importe où qui
    // n'est ni une tuile ni un bouton. C'est toute la rangée qui se déplace.
    let meldEl = null;
    if (event.target.closest('.meld-handle')) {
      meldEl = event.target.closest('.meld[data-meld-id]');
    } else if (!event.target.closest('.tile') && !event.target.closest('button')) {
      const frame = event.target.closest('.meld[data-meld-id]');
      // Le cadre n'est une prise que si la combinaison est manipulable (c'est notre tour).
      if (frame && frame.querySelector('.tile.playable')) meldEl = frame;
    }
    if (meldEl) {
      event.preventDefault();
      meldDrag = {
        pointerId: event.pointerId,
        meldEl,
        meldId: Number(meldEl.dataset.meldId),
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        ghost: null,
        grabX: 0,
        grabY: 0,
      };
      try {
        event.target.setPointerCapture(event.pointerId);
      } catch {
        /* sans capture, on suit les événements remontés jusqu'à la racine */
      }
      return;
    }

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
    // La capture garantit de recevoir les événements même si le doigt sort de la tuile. Elle
    // échoue sur un pointeur synthétique ; le déplacement reste alors géré par bouillonnement.
    try {
      tile.setPointerCapture(event.pointerId);
    } catch {
      /* sans capture, on suit les événements remontés jusqu'à la racine */
    }
  });

  root.addEventListener('pointermove', (event) => {
    if (meldDrag !== null && event.pointerId === meldDrag.pointerId) {
      const dx = event.clientX - meldDrag.startX;
      const dy = event.clientY - meldDrag.startY;
      if (!meldDrag.moved) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        meldDrag.moved = true;
        const box = meldDrag.meldEl.getBoundingClientRect();
        const ghost = document.createElement('div');
        ghost.className = 'drag-ghost';
        ghost.append(meldDrag.meldEl.cloneNode(true));
        document.body.append(ghost);
        meldDrag.ghost = ghost;
        meldDrag.grabX = event.clientX - box.left;
        meldDrag.grabY = event.clientY - box.top + FINGER_LIFT;
        meldDrag.meldEl.classList.add('meld-dragging');
      }
      meldDrag.ghost.style.transform =
        `translate(${event.clientX - meldDrag.grabX}px, ${event.clientY - meldDrag.grabY}px)`;

      clearHighlight();
      // Survoler une combinaison compatible annonce la fusion ; ailleurs, le liseré montre où
      // la série va se repositionner.
      const over = meldUnderPointer(event.clientX, event.clientY, meldDrag.meldEl);
      if (over !== null && game.canMergeMelds(meldDrag.meldId, Number(over.dataset.meldId))) {
        over.classList.add('drop-target');
      } else {
        const target = meldInsertion(event.clientX, event.clientY, meldDrag.meldEl);
        if (target.element !== null) {
          target.element.classList.add(target.after ? 'insert-after' : 'insert-before');
        }
      }
      return;
    }

    if (drag === null || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;

    if (!drag.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      drag.moved = true;
      // La mesure doit précéder le masquage : une fois retirée du flux, la tuile n'a plus de
      // position à laquelle accrocher le geste.
      const built = buildGhost(drag.elements, { x: event.clientX, y: event.clientY });
      Object.assign(drag, built);
      for (const element of drag.elements) element.classList.add('dragging');
    }

    drag.ghost.style.transform =
      `translate(${event.clientX - drag.grabX}px, ${event.clientY - drag.grabY}px)`;

    clearHighlight();
    const found = targetAt(draggedRect(event));
    if (found) {
      found.element.classList.add('drop-target');
      showInsertionMark(found);
    }
  });

  root.addEventListener('pointerup', (event) => {
    if (meldDrag !== null && event.pointerId === meldDrag.pointerId) {
      finishMeldDrag(event);
      return;
    }
    finish(event);
  });
  root.addEventListener('pointercancel', (event) => {
    if (meldDrag !== null && event.pointerId === meldDrag.pointerId) {
      meldDrag.ghost?.remove();
      clearHighlight();
      meldDrag.meldEl.classList.remove('meld-dragging');
      meldDrag = null;
      onDropped();
      return;
    }
    if (drag === null || event.pointerId !== drag.pointerId) return;
    drag.ghost?.remove();
    clearHighlight();
    for (const element of drag.elements) element.classList.remove('dragging');
    drag = null;
    onDropped();
  });
}
