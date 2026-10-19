// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';

const sdk = vi.hoisted(() => ({
  add: vi.fn(), once: vi.fn(), remove: vi.fn(), removeAttribution: vi.fn(),
  fail: undefined as undefined | ((event: { error: Error }) => void),
}));
vi.mock('maplibre-gl', () => ({ setWorkerUrl: vi.fn() }));
vi.mock('maplibre-gl/dist/maplibre-gl-worker.mjs?url', () => ({ default: '/test-worker.js' }));
vi.mock('@maplibre/maplibre-gl-leaflet', () => ({ maplibreGL: sdk.add }));
vi.mock('react-leaflet', () => ({
  useMap: () => ({ attributionControl: { removeAttribution: sdk.removeAttribution } }),
  TileLayer: ({ url }: { url: string }) => <span data-testid="tiles" data-url={url}/>,
  Polygon: () => null, Polyline: () => null, Tooltip: () => null,
}));
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); vi.stubEnv('VITE_GOONG_MAPTILES_KEY', 'test-maptiles-key');
  sdk.fail = undefined;
  const layer = { addTo: () => layer, getMaplibreMap: () => ({ once: sdk.once }), getAttribution: () => 'Goong credit', remove: sdk.remove };
  sdk.add.mockReturnValue(layer);
  sdk.once.mockImplementation((_event, listener) => { sdk.fail = listener; });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('unchanged leader Goong patch', () => {
  it('uses Goong vector street style with a configured Maptiles Key', async () => {
    const { BaseTiles } = await import('./MapBits'); render(<BaseTiles layer="map"/>);
    expect(sdk.add).toHaveBeenCalledWith({ style: 'https://tiles.goong.io/assets/goong_map_web.json?api_key=test-maptiles-key', maxZoom: 19 });
    expect(screen.queryByTestId('tiles')).toBeNull();
  });
  it('uses Esri Topo without a key', async () => {
    vi.stubEnv('VITE_GOONG_MAPTILES_KEY', '');
    const { BaseTiles } = await import('./MapBits'); render(<BaseTiles layer="map"/>);
    expect(screen.getByTestId('tiles').getAttribute('data-url')).toContain('World_Topo_Map');
    expect(sdk.add).not.toHaveBeenCalled();
  });
  it('falls back to Esri after a Goong error and keeps that fallback after remount', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { BaseTiles } = await import('./MapBits');
    const view = render(<BaseTiles layer="map"/>);
    act(() => sdk.fail?.({ error: new Error('key denied') }));
    expect(screen.getByTestId('tiles').getAttribute('data-url')).toContain('World_Topo_Map');
    expect(sdk.remove).toHaveBeenCalled();
    expect(sdk.removeAttribution).toHaveBeenCalledWith('Goong credit');
    view.unmount(); render(<BaseTiles layer="map"/>);
    expect(screen.getByTestId('tiles').getAttribute('data-url')).toContain('World_Topo_Map');
    expect(sdk.add).toHaveBeenCalledTimes(1);
  });
  it('keeps Esri satellite and cleans up the Goong layer on switching', async () => {
    const { BaseTiles } = await import('./MapBits');
    const view = render(<BaseTiles layer="map"/>); view.rerender(<BaseTiles layer="sat"/>);
    expect(screen.getByTestId('tiles').getAttribute('data-url')).toContain('World_Imagery');
    expect(sdk.remove).toHaveBeenCalled();
    expect(sdk.removeAttribution).toHaveBeenCalledWith('Goong credit');
  });
});
