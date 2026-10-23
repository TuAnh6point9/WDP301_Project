// @vitest-environment jsdom
// Preserve the original English-copy regression fixtures; bilingual behavior has its own tests.
import { beforeEach as beforeEnglishFixture } from 'vitest';
import { i18n } from '@/i18n';
beforeEnglishFixture(async () => { await i18n.changeLanguage('en'); });
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { useAsync } from '@/lib/useAsync';

afterEach(cleanup);
it('removes the previous result when the requested identity changes', async () => {
  function Result({ id }: { id: string }) {
    const { data } = useAsync(() => id === 'first' ? Promise.resolve('Private result A') : new Promise<string>(() => {}), [id]);
    return <p>{data || 'Loading new result'}</p>;
  }
  const view = render(<Result id="first"/>);
  await screen.findByText('Private result A');
  view.rerender(<Result id="second"/>);
  expect(screen.queryByText('Private result A')).toBeNull();
  expect(screen.getByText('Loading new result')).toBeTruthy();
});
