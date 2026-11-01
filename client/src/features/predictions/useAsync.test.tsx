// @vitest-environment jsdom
// Preserve the original English-copy regression fixtures; bilingual behavior has its own tests.
import { beforeEach as beforeEnglishFixture } from 'vitest';
import { i18n } from '@/i18n';
beforeEnglishFixture(async () => { await i18n.changeLanguage('en'); });
import { afterEach, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
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
it('can keep the previous rows on screen while the next page loads', async () => {
  let finish: (value: string) => void = () => {};
  function Rows({ page }: { page: number }) {
    const { data, loading } = useAsync(() => page === 1 ? Promise.resolve('Page 1') : new Promise<string>(done => { finish = done; }), [page], { keepPrevious: true });
    return <p>{data}{loading ? ' (updating)' : ''}</p>;
  }
  const view = render(<Rows page={1}/>);
  await screen.findByText('Page 1');
  view.rerender(<Rows page={2}/>);
  expect(screen.getByText('Page 1 (updating)')).toBeTruthy();
  await act(async () => { finish('Page 2'); });
  expect(screen.getByText('Page 2')).toBeTruthy();
});
