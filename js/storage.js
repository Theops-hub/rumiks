// Sauvegarde de la partie et réglages, dans le stockage local du navigateur.
//
// Une partie tient en quelques dizaines de kilo-octets de JSON : `localStorage` suffit, et il a
// l'avantage d'être synchrone, donc d'être écrit avant que l'onglet ne soit fermé.

const GAME_KEY = 'rumiks.partie';
const SETTINGS_KEY = 'rumiks.reglages';
const PROGRESS_KEY = 'rumiks.progression';

/** Version du format : une sauvegarde d'une autre version est écartée sans faire d'histoires. */
const SAVE_VERSION = 1;

export function loadGame() {
  try {
    const raw = localStorage.getItem(GAME_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (saved.version !== SAVE_VERSION) return null;
    if (!saved.game || !Array.isArray(saved.game.players)) return null;
    return saved;
  } catch (error) {
    console.warn('Sauvegarde illisible, elle est écartée.', error);
    clearGame();
    return null;
  }
}

export function saveGame({ difficulty, opponentCount, game, log }) {
  try {
    localStorage.setItem(
      GAME_KEY,
      JSON.stringify({ version: SAVE_VERSION, difficulty, opponentCount, game, log }),
    );
  } catch (error) {
    // Un quota dépassé ou un mode privé restrictif ne doit jamais interrompre la partie.
    console.warn('Sauvegarde impossible.', error);
  }
}

export function clearGame() {
  try {
    localStorage.removeItem(GAME_KEY);
  } catch (error) {
    console.warn('Effacement impossible.', error);
  }
}

/**
 * Progression du joueur : son niveau, qui survit aux parties. Elle est volontairement séparée
 * de la sauvegarde de partie : commencer une nouvelle partie n'y touche pas.
 */
export function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return { level: 1 };
    const level = Number(JSON.parse(raw).level);
    return { level: Number.isFinite(level) ? Math.max(Math.round(level), 1) : 1 };
  } catch {
    return { level: 1 };
  }
}

export function saveProgress(progress) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch (error) {
    console.warn('Progression non enregistrée.', error);
  }
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { soundEnabled: true, hapticsEnabled: true };
    const saved = JSON.parse(raw);
    return {
      soundEnabled: saved.soundEnabled !== false,
      hapticsEnabled: saved.hapticsEnabled !== false,
    };
  } catch {
    return { soundEnabled: true, hapticsEnabled: true };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn('Réglages non enregistrés.', error);
  }
}
