/**
 * Synthetic signal generators for deterministic accuracy testing.
 *
 * Constitution Principle III requires accuracy to be verified against generated
 * reference signals, including tones with a deliberately weak fundamental, and
 * requires tests to be deterministic — so the noise source is seeded rather
 * than using Math.random.
 */

/** Seeded PRNG (mulberry32). Deterministic across runs and platforms. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ToneOptions {
  readonly frequency: number;
  readonly sampleRate: number;
  readonly length: number;
  readonly amplitude?: number;
  /** Starting phase in radians; varying it proves detection is phase-blind. */
  readonly phase?: number;
}

/** Pure sine — the easiest case, and the accuracy floor. */
export function sine({
  frequency,
  sampleRate,
  length,
  amplitude = 0.8,
  phase = 0,
}: ToneOptions): Float32Array {
  const out = new Float32Array(length);
  const step = (2 * Math.PI * frequency) / sampleRate;
  for (let i = 0; i < length; i += 1) {
    out[i] = amplitude * Math.sin(phase + step * i);
  }
  return out;
}

/**
 * Band-limited sawtooth — harmonically rich, like a real plucked string.
 * Harmonics are summed only up to Nyquist to avoid aliasing, which would
 * otherwise create false partials and make the test lie.
 */
export function sawtooth({
  frequency,
  sampleRate,
  length,
  amplitude = 0.8,
  phase = 0,
  maxHarmonics = 24,
}: ToneOptions & { readonly maxHarmonics?: number }): Float32Array {
  const out = new Float32Array(length);
  // Capped as well as band-limited: a real plucked string has negligible energy
  // above ~24 harmonics, and summing 500+ of them at E1 makes the accuracy
  // sweep take minutes instead of seconds.
  const maxHarmonic = Math.min(maxHarmonics, Math.floor(sampleRate / 2 / frequency));
  for (let h = 1; h <= maxHarmonic; h += 1) {
    const step = (2 * Math.PI * frequency * h) / sampleRate;
    const weight = amplitude / h;
    for (let i = 0; i < length; i += 1) {
      out[i] = out[i]! + weight * Math.sin(phase + step * i);
    }
  }
  return normalize(out, amplitude);
}

/**
 * A tone whose fundamental is much quieter than its harmonics.
 *
 * This is the guitar low-E failure mode: the fundamental is weak, so a naive
 * detector locks onto the second harmonic and reports the note an octave high.
 * Any detector we ship must survive this.
 */
export function weakFundamental({
  frequency,
  sampleRate,
  length,
  amplitude = 0.8,
  phase = 0,
  fundamentalGain = 0.08,
}: ToneOptions & { readonly fundamentalGain?: number }): Float32Array {
  const out = new Float32Array(length);
  const weights = [fundamentalGain, 1, 0.8, 0.55, 0.35, 0.2, 0.12];
  const nyquist = sampleRate / 2;

  weights.forEach((weight, index) => {
    const harmonic = index + 1;
    const harmonicFreq = frequency * harmonic;
    if (harmonicFreq >= nyquist) return;
    const step = (2 * Math.PI * harmonicFreq) / sampleRate;
    for (let i = 0; i < length; i += 1) {
      out[i] = out[i]! + weight * Math.sin(phase + step * i);
    }
  });

  return normalize(out, amplitude);
}

/**
 * Add white noise at a given signal-to-noise ratio in dB.
 * The constitution's accuracy budget is specified at 20 dB SNR or better.
 */
export function withNoise(signal: Float32Array, snrDb: number, seed = 1): Float32Array {
  const random = mulberry32(seed);
  const signalPower = meanSquare(signal);
  const noisePower = signalPower / Math.pow(10, snrDb / 10);
  const noiseAmplitude = Math.sqrt(noisePower * 3); // uniform noise variance = a^2/3

  const out = new Float32Array(signal.length);
  for (let i = 0; i < signal.length; i += 1) {
    out[i] = signal[i]! + (random() * 2 - 1) * noiseAmplitude;
  }
  return out;
}

/** Silence — the "listening" state, and the decay tail after a pluck. */
export function silence(length: number): Float32Array {
  return new Float32Array(length);
}

/**
 * A linear sweep in cents from one frequency to another.
 * Drives the User Story 2 retuning tests (E2 down to D2).
 */
export function sweep({
  fromFrequency,
  toFrequency,
  sampleRate,
  length,
  amplitude = 0.8,
}: {
  readonly fromFrequency: number;
  readonly toFrequency: number;
  readonly sampleRate: number;
  readonly length: number;
  readonly amplitude?: number;
}): Float32Array {
  const out = new Float32Array(length);
  let phase = 0;
  for (let i = 0; i < length; i += 1) {
    const t = length === 1 ? 0 : i / (length - 1);
    // Exponential interpolation keeps the sweep linear in pitch, not in Hz.
    const frequency = fromFrequency * Math.pow(toFrequency / fromFrequency, t);
    phase += (2 * Math.PI * frequency) / sampleRate;
    out[i] = amplitude * Math.sin(phase);
  }
  return out;
}

/**
 * A tone whose pitch alternates between +/-`cents` around a centre frequency.
 *
 * This is what a string parked on a semitone boundary actually does while the
 * player rests a finger on the peg, and it is the signal FR-011 exists for: the
 * displayed name must not flicker between two notes as it wobbles across the
 * midpoint.
 *
 * The alternation is square rather than sinusoidal because a square one is
 * harsher — it presents the detector with the largest possible pitch step at
 * each turn — while phase accumulation keeps the waveform continuous, so there
 * is no click for the detector to mistake for an onset.
 */
export function dither({
  frequency,
  sampleRate,
  length,
  cents = 2,
  rateHz = 4,
  amplitude = 0.8,
}: {
  readonly frequency: number;
  readonly sampleRate: number;
  readonly length: number;
  readonly cents?: number;
  readonly rateHz?: number;
  readonly amplitude?: number;
}): Float32Array {
  const out = new Float32Array(length);
  const halfPeriod = sampleRate / (2 * rateHz);
  const high = frequency * Math.pow(2, cents / 1200);
  const low = frequency * Math.pow(2, -cents / 1200);

  let phase = 0;
  for (let i = 0; i < length; i += 1) {
    const above = Math.floor(i / halfPeriod) % 2 === 0;
    phase += (2 * Math.PI * (above ? high : low)) / sampleRate;
    out[i] = amplitude * Math.sin(phase);
  }
  return out;
}

function meanSquare(signal: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < signal.length; i += 1) sum += signal[i]! * signal[i]!;
  return signal.length === 0 ? 0 : sum / signal.length;
}

function normalize(signal: Float32Array, peak: number): Float32Array {
  let max = 0;
  for (let i = 0; i < signal.length; i += 1) max = Math.max(max, Math.abs(signal[i]!));
  if (max === 0) return signal;
  const scale = peak / max;
  for (let i = 0; i < signal.length; i += 1) signal[i]! *= scale;
  return signal;
}
