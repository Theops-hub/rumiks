// Retours sonores et tactiles.
//
// Safari sur iOS suspend tout contexte audio tant que l'utilisateur n'a pas touché l'écran :
// le contexte est donc créé au premier geste, puis réveillé à chaque retour au premier plan.

const SOUNDS = {
  select: { file: 'sounds/tile_select.wav', gain: 0.35 },
  place: { file: 'sounds/tile_place.wav', gain: 0.85 },
  commit: { file: 'sounds/turn_commit.wav', gain: 0.7 },
  draw: { file: 'sounds/tile_draw.wav', gain: 0.55 },
  reject: { file: 'sounds/move_reject.wav', gain: 0.6 },
  roundEnd: { file: 'sounds/round_end.wav', gain: 0.75 },
};

/**
 * Motifs de vibration, en millisecondes.
 *
 * À la date d'écriture, Safari sur iPhone et iPad n'implémente pas l'API Vibration : sur un
 * iPad ces motifs ne produiront rien. Le code est conservé parce qu'il fonctionne sur Android
 * et sur les navigateurs de bureau qui l'exposent, et parce qu'il coûte trois lignes.
 */
const VIBRATIONS = {
  select: 8,
  place: [12, 18, 12],
  commit: [16, 24, 28],
  draw: 10,
  reject: [30, 40, 30],
  roundEnd: [20, 40, 20, 40, 40],
};

export function createFeedback({ isSoundEnabled, isHapticsEnabled }) {
  let context = null;
  const buffers = new Map();
  let loading = null;

  function ensureContext() {
    if (context === null) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      context = new Ctor();
    }
    if (context.state === 'suspended') context.resume().catch(() => {});
    return context;
  }

  async function loadAll() {
    const ctx = ensureContext();
    if (!ctx) return;
    await Promise.all(
      Object.entries(SOUNDS).map(async ([name, { file }]) => {
        if (buffers.has(name)) return;
        try {
          const response = await fetch(file);
          const bytes = await response.arrayBuffer();
          // Safari n'accepte la forme « promesse » de decodeAudioData que depuis peu ; la
          // forme à rappels reste la plus sûre.
          const buffer = await new Promise((resolve, reject) => {
            ctx.decodeAudioData(bytes, resolve, reject);
          });
          buffers.set(name, buffer);
        } catch (error) {
          console.warn(`Son indisponible : ${file}`, error);
        }
      }),
    );
  }

  /** À appeler sur le premier geste de l'utilisateur : c'est ce qui débloque l'audio sur iOS. */
  function unlock() {
    if (loading === null) loading = loadAll();
    ensureContext();
    return loading;
  }

  function play(name, { haptic = true } = {}) {
    if (isSoundEnabled()) {
      const buffer = buffers.get(name);
      const ctx = context;
      if (buffer && ctx && ctx.state === 'running') {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const volume = ctx.createGain();
        volume.gain.value = SOUNDS[name].gain;
        source.connect(volume).connect(ctx.destination);
        source.start(0);
      }
    }
    if (haptic && isHapticsEnabled() && typeof navigator.vibrate === 'function') {
      navigator.vibrate(VIBRATIONS[name] ?? 10);
    }
  }

  return { unlock, play };
}

/** Indique si l'appareil sait vibrer, pour ne pas proposer un réglage sans effet. */
export function supportsVibration() {
  return typeof navigator.vibrate === 'function';
}
