import { expect, type Page } from '@playwright/test';

/** Browser geometry check: a spotlight must never be hidden behind its explanation. */
export async function expectGuideTargetUncovered(page: Page, targetSelector = '.wqi-guide-spotlight') {
  await expect(async () => {
    if (!(await page.locator(targetSelector).count())) return;
    const target = await page.locator(targetSelector).boundingBox();
    if (!target) return;
    const panel = await page.locator('.wqi-guide-panel').boundingBox();
    expect(panel).not.toBeNull();
    const overlapWidth = Math.min(target.x + target.width, panel!.x + panel!.width) - Math.max(target.x, panel!.x);
    const overlapHeight = Math.min(target.y + target.height, panel!.y + panel!.height) - Math.max(target.y, panel!.y);
    expect(overlapWidth <= 1 || overlapHeight <= 1, `Guide overlaps target by ${overlapWidth.toFixed(0)} × ${overlapHeight.toFixed(0)} px`).toBe(true);
  }).toPass({ timeout: 3000 });
}
