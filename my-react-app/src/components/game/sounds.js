/**
 * Table sounds, synthesised with Web Audio at runtime: filtered noise for the
 * cards and short tones for the interface. No audio files to download.
 *
 * Browsers won't start an AudioContext before a user gesture, so it's created
 * on the first sound and failures are ignored. Mute is kept in localStorage.
 */

const STORAGE_KEY = 'whist:sound';

let ctx = null;
let master = null;
let muted = readMuted();

function readMuted() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'off';
  } catch {
    return false; // private windows and blocked storage: default to audible
  }
}

export function isMuted() {
  return muted;
}

export function setMuted(next) {
  muted = next;
  try {
    localStorage.setItem(STORAGE_KEY, next ? 'off' : 'on');
  } catch {
    /* storage unavailable; mute just won't persist */
  }
  if (master) master.gain.value = next ? 0 : 0.5;
}

function audio() {
  if (muted) return null;
  if (ctx) return ctx;

  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    ctx = new Ctx();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  } catch {
    return null; // no audio available; the game is fully playable in silence
  }
  return ctx;
}

/** A short band-passed noise burst. Every card sound is built from these. */
function noise({ freq, q = 1, duration = 0.08, gain = 0.5, sweepTo = null }) {
  const c = audio();
  if (!c) return;

  const frames = Math.floor(c.sampleRate * duration);
  const buffer = c.createBuffer(1, frames, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    // fade out across the buffer so it sounds like a flick
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  }

  const src = c.createBufferSource();
  src.buffer = buffer;

  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = q;
  if (sweepTo) {
    filter.frequency.exponentialRampToValueAtTime(sweepTo, c.currentTime + duration);
  }

  const env = c.createGain();
  env.gain.setValueAtTime(gain, c.currentTime);
  env.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);

  src.connect(filter).connect(env).connect(master);
  src.start();
  src.stop(c.currentTime + duration);
}

/** A clean tone, for interface events rather than physical ones. */
function tone({ freq, duration = 0.12, gain = 0.14, type = 'sine', to = null, delay = 0 }) {
  const c = audio();
  if (!c) return;

  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + duration);

  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  osc.connect(env).connect(master);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

/**
 * Recorded samples in `public/sounds/` replace the synthesised sounds:
 *
 *   deal.mp3   one card leaving the deck
 *   play.mp3   a card landing on the felt
 *   trick.mp3  the trick being gathered up
 *   bid.mp3    naming a bid
 *   round.mp3  a round scored
 *   win.mp3    game over
 *
 * `.wav` and `.ogg` work too. Any file that's missing falls back to synthesis.
 */
const SAMPLE_DIR = '/sounds/';
const SAMPLE_FORMATS = ['mp3', 'wav', 'ogg'];
const buffers = new Map(); // name -> AudioBuffer | null (null = checked, absent)

async function loadSample(name) {
  if (buffers.has(name)) return buffers.get(name);

  const c = audio();
  if (!c) return null;

  for (const ext of SAMPLE_FORMATS) {
    try {
      const res = await fetch(`${SAMPLE_DIR}${name}.${ext}`);
      // The dev server answers a missing file with index.html and a 200,
      // so check the content type.
      if (!res.ok) continue;
      if (!(res.headers.get('content-type') ?? '').includes('audio')) continue;

      const buffer = await c.decodeAudioData(await res.arrayBuffer());
      buffers.set(name, buffer);
      return buffer;
    } catch {
      /* try the next extension */
    }
  }

  buffers.set(name, null);
  return null;
}

/**
 * Play a sample if one exists, otherwise the synthesised version. The first
 * call for each name plays the fallback while the sample is fetched.
 */
function sampled(name, fallback, { gain = 0.9, rate = 1 } = {}) {
  const cached = buffers.get(name);

  if (cached === undefined) {
    loadSample(name);
    fallback();
    return;
  }
  if (cached === null) {
    fallback();
    return;
  }

  const c = audio();
  if (!c) return;

  const src = c.createBufferSource();
  src.buffer = cached;
  // Vary the speed slightly so repeats don't sound identical.
  src.playbackRate.value = rate * (0.96 + Math.random() * 0.08);

  const env = c.createGain();
  env.gain.value = gain;

  src.connect(env).connect(master);
  src.start();
}

/**
 * A card hitting cloth: a noise burst over a low sine that drops quickly.
 * The sine gives it weight; noise alone sounds like a click.
 */
function thump({ freq = 170, drop = 70, duration = 0.09, gain = 0.09 }) {
  const c = audio();
  if (!c) return;

  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(drop, c.currentTime + duration);

  const env = c.createGain();
  env.gain.setValueAtTime(gain, c.currentTime);
  env.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration);

  osc.connect(env).connect(master);
  osc.start();
  osc.stop(c.currentTime + duration + 0.02);
}

/**
 * One card leaving the deck. Quiet and slightly re-pitched each time, since a
 * big round deals up to 48 cards in a row.
 */
function synthDeal() {
  const jitter = 0.85 + Math.random() * 0.4;
  noise({ freq: 2600 * jitter, q: 1.1, duration: 0.032, gain: 0.11 });
  thump({ freq: 210 * jitter, drop: 110, duration: 0.045, gain: 0.035 });
}

/**
 * A card landing on the felt: a bright transient, a mid-range slap and a low
 * thump, with a little pitch jitter between cards.
 */
function synthPlay() {
  const jitter = 0.9 + Math.random() * 0.25;
  noise({ freq: 3400 * jitter, q: 1.4, duration: 0.028, gain: 0.16 });
  noise({ freq: 1150 * jitter, q: 0.6, duration: 0.085, gain: 0.26, sweepTo: 600 });
  thump({ freq: 180 * jitter, drop: 72, duration: 0.1, gain: 0.1 });
}

/**
 * The trick being gathered up: a falling noise sweep with a quieter one just
 * behind it, so it sounds like several cards.
 */
function synthTrick() {
  noise({ freq: 2100, q: 0.4, duration: 0.3, gain: 0.17, sweepTo: 380 });
  const c = audio();
  if (c) setTimeout(() => noise({ freq: 1500, q: 0.5, duration: 0.22, gain: 0.1, sweepTo: 320 }), 70);
  thump({ freq: 120, drop: 60, duration: 0.14, gain: 0.05 });
}

/** Naming a bid. */
const synthBid = () => tone({ freq: 620, to: 880, duration: 0.09, gain: 0.07 });

/** Round scored: a soft two-note chime. */
function synthRoundEnd() {
  // A falling third, each note doubled quietly an octave up so the triangle
  // wave sounds less bare.
  tone({ freq: 587.33, duration: 0.24, gain: 0.06, type: 'triangle' });
  tone({ freq: 1174.66, duration: 0.2, gain: 0.014, type: 'sine' });
  tone({ freq: 440, duration: 0.4, gain: 0.05, type: 'triangle', delay: 0.2 });
  tone({ freq: 880, duration: 0.3, gain: 0.012, type: 'sine', delay: 0.2 });
}

/** Game over. */
function synthGameEnd() {
  // A slow major arpeggio with a soft octave on top.
  [440, 554.37, 659.25, 880].forEach((f, i) => {
    tone({ freq: f, duration: 0.42, gain: 0.055, type: 'triangle', delay: i * 0.15 });
    tone({ freq: f * 2, duration: 0.3, gain: 0.012, type: 'sine', delay: i * 0.15 });
  });
}

/** Something you tried was not legal. */
export const sfxDenied = () =>
  tone({ freq: 200, to: 140, duration: 0.14, gain: 0.08, type: 'triangle' });

// Each prefers a sample from public/sounds/ and falls back to synthesis.
export const sfxDeal = () => sampled('deal', synthDeal, { gain: 0.55 });
export const sfxPlay = () => sampled('play', synthPlay, { gain: 0.8 });
export const sfxTrick = () => sampled('trick', synthTrick, { gain: 0.7 });
export const sfxBid = () => sampled('bid', synthBid, { gain: 0.7 });
export const sfxRoundEnd = () => sampled('round', synthRoundEnd, { gain: 0.7 });
export const sfxGameEnd = () => sampled('win', synthGameEnd, { gain: 0.8 });
