// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AREA_STORAGE_KEY, AreaPreferenceProvider, AreaToggle } from './AreaPreference';

const open = () => render(<AreaPreferenceProvider><AreaToggle/><AreaToggle/></AreaPreferenceProvider>);
beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('shared area preference independent of the map engine', () => {
  it('defaults on', () => {
    open();
    expect((screen.getAllByRole('switch') as HTMLInputElement[]).every(input => input.checked)).toBe(true);
  });
  it('synchronizes switches and persists the off choice after remount', () => {
    const view = open();
    fireEvent.click(screen.getAllByRole('switch')[0]);
    expect((screen.getAllByRole('switch') as HTMLInputElement[]).every(input => !input.checked)).toBe(true);
    expect(localStorage.getItem(AREA_STORAGE_KEY)).toBe('false');
    view.unmount(); open();
    expect((screen.getAllByRole('switch') as HTMLInputElement[]).every(input => !input.checked)).toBe(true);
  });
  it('works in-session when storage access throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    open(); fireEvent.click(screen.getAllByRole('switch')[0]);
    expect((screen.getAllByRole('switch')[0] as HTMLInputElement).checked).toBe(false);
  });
  it('works when localStorage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined);
    open(); fireEvent.click(screen.getAllByRole('switch')[0]);
    expect((screen.getAllByRole('switch')[0] as HTMLInputElement).checked).toBe(false);
  });
  it('synchronizes a change and storage clear from another tab', () => {
    open(); localStorage.setItem(AREA_STORAGE_KEY, 'false');
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: AREA_STORAGE_KEY, newValue: 'false' })));
    expect((screen.getAllByRole('switch')[0] as HTMLInputElement).checked).toBe(false);
    localStorage.clear();
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: null })));
    expect((screen.getAllByRole('switch')[0] as HTMLInputElement).checked).toBe(true);
  });
});
