import { describe, expect, it } from 'vitest';
import { stepWave, type Wave } from './useHomeMotion';

const run = (wave: Wave, seconds: number) => {
  let state = wave;
  for (let frame = 0; frame < seconds * 60; frame++) state = stepWave(state, 1 / 60);
  return state;
};

describe('travelling wave', () => {
  it('drifts left to right even when calm', () => {
    const after = run({ phase: 0, energy: 0 }, 4);
    expect(after.phase).toBeGreaterThan(0.15);
    expect(after.energy).toBe(0);
  });

  it('runs faster after a scroll push, then calms down within 3 s without swinging back', () => {
    const calm = run({ phase: 0, energy: 0 }, 1).phase;
    const pushed = run({ phase: 0, energy: 1 }, 1).phase;
    // Peak speed is 12× calm; averaged over the first second while it fades, about 7.6×.
    expect(pushed).toBeGreaterThan(calm * 6);
    expect(pushed).toBeLessThan(calm * 10);
    let state: Wave = { phase: 0, energy: 1 }, previous = state;
    for (let frame = 0; frame < 3 * 60; frame++) {
      state = stepWave(state, 1 / 60);
      expect(state.phase).toBeGreaterThan(previous.phase); // never travels backwards
      expect(state.energy).toBeLessThanOrEqual(previous.energy); // no bobbing: the swell only fades
      previous = state;
    }
    expect(state.energy).toBeLessThan(0.05);
  });
});
