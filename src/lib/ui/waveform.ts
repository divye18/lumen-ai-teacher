/**
 * AUDIO WAVEFORM — pure per-frame bar amplitudes.
 *
 * Extracted from `AudioWaveform` so the "reduced motion means the wobble term
 * is zero and the frame is time-invariant" guarantee is verifiable without a
 * canvas. `AudioWaveform` uses this for both its continuous animation loop
 * (`reduce: false`) and its single static redraw (`reduce: true`) — the same
 * math either way, just whether `t` is allowed to move.
 */
export interface WaveformFrame {
  level: number;
  active: boolean;
  reduce: boolean;
  barCount: number;
  /** Per-bar random phase offset, stable for the component's lifetime. */
  phases: number[];
  t: number;
}

/** One amplitude (0..1) per bar. */
export function computeWaveformBarAmplitudes(input: WaveformFrame): number[] {
  const { level, active, reduce, barCount, phases, t } = input;
  const baseline = active ? level : 0.04;
  const amps: number[] = [];
  for (let i = 0; i < barCount; i += 1) {
    const centre = Math.abs(i - barCount / 2) / (barCount / 2);
    const envelope = 1 - centre * 0.7;
    const wobble = reduce
      ? 0
      : 0.35 * Math.sin(t * 2 + phases[i]) + 0.2 * Math.sin(t * 5 + i * 0.6);
    amps.push(Math.max(0.03, Math.min(1, baseline * envelope * (1 + wobble))));
  }
  return amps;
}
