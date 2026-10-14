// Capture at router notification time, before replacing content can clamp the document's scroll.
export const navigationPositions = new Map<string, { x: number; y: number }>();
export function captureNavigationScroll(key: string) {
  navigationPositions.set(key, { x: window.scrollX, y: window.scrollY });
}
