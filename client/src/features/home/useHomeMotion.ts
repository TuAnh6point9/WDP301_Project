import { useEffect, useLayoutEffect, type RefObject } from 'react';
import 'lenis/dist/lenis.css';

/** phase counts loops of one tile (half the wave strip); energy is the scroll swell, 0 = calm, 1 = max. */
export type Wave = { phase: number; energy: number };

// Calm water drifts one tile every 20 s; full energy runs 12× that (adds 0.55 tile/s) and fades with a 0.9 s time constant.
const DRIFT = 0.05, BOOST = 0.55, FADE_S = 0.9;

/** Advances the travelling wave: it always moves left to right, faster and taller while scroll energy lasts. */
export function stepWave({ phase, energy }: Wave, dt: number): Wave {
  return { phase: phase + (DRIFT + BOOST * energy) * dt, energy: energy * Math.exp(-dt / FADE_S) };
}

// Back layer: slower and offset, so the two crests slide past each other like real water; it also sits taller.
const LAYERS = [{ speed: 0.6, offset: 0.37, rest: 1.35, swell: 0.6 }, { speed: 1, offset: 0, rest: 1, swell: 0.5 }];

// shortcut: reduced motion is read once at mount; a reload or route change picks up a changed setting.
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true;

/** Home page only: inertia wheel scroll (Lenis), sections that reveal each time they scroll into view and a wave that travels left to right, pushed by scroll. */
export function useHomeMotion(root: RefObject<HTMLElement | null>, wave: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const main = root.current;
    if (!main || reducedMotion() || typeof IntersectionObserver === 'undefined') return;
    main.classList.add('motion-on');
    // Shows at 25% visible, resets only once fully off screen, so it replays from either scroll direction without flicker at the edge.
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.intersectionRatio >= 0.25) entry.target.setAttribute('data-shown', '');
        else if (!entry.isIntersecting) entry.target.removeAttribute('data-shown');
      }
    }, { threshold: [0, 0.25] });
    main.querySelectorAll('[data-reveal]').forEach(element => observer.observe(element));
    return () => { observer.disconnect(); main.classList.remove('motion-on'); };
  }, [root]);

  useEffect(() => {
    const strip = wave.current;
    if (!strip || reducedMotion() || typeof IntersectionObserver === 'undefined') return;
    const layers = [...strip.children] as HTMLElement[];
    let cancelled = false, visible = false, frame = 0, last = 0;
    let lenis: { destroy(): void } | undefined;
    let state: Wave = { phase: 0, energy: 0 };
    const tick = (now: number) => {
      state = stepWave(state, Math.min((now - last) / 1000, 1 / 30));
      last = now;
      layers.forEach((layer, i) => {
        const { speed, offset, rest, swell } = LAYERS[i] ?? LAYERS[1];
        const loop = (state.phase * speed + offset) % 1;
        // Each strip is two tiles wide, so sliding it -50% → 0 and jumping back is seamless.
        layer.style.transform = `translate3d(${(loop - 1) * 50}%, 0, 0) scaleY(${rest + swell * state.energy})`;
      });
      frame = visible ? requestAnimationFrame(tick) : 0;
    };
    // The loop only runs while the water line is on screen.
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !frame) { last = performance.now(); frame = requestAnimationFrame(tick); }
    });
    observer.observe(strip);
    // Loaded after mount so the hero video and poster keep the network first.
    void import('lenis').then(({ default: Lenis }) => {
      if (cancelled) return;
      const instance = new Lenis({ autoRaf: true, prevent: node => node.nodeName === 'DIALOG' });
      // Scroll speed (px per frame) feeds the swell; a calm wheel scroll fills it in about a second.
      instance.on('scroll', ({ velocity }) => { state.energy = Math.min(1, state.energy + Math.min(40, Math.abs(velocity)) * 0.002); });
      lenis = instance;
    });
    return () => { cancelled = true; observer.disconnect(); cancelAnimationFrame(frame); lenis?.destroy(); };
  }, [wave]);
}
