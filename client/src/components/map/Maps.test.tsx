// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useEffect, type ReactNode } from 'react';
import type { LayerProps, MapProps, MarkerProps, PopupProps, SourceProps } from 'react-map-gl/maplibre';
import type { StyleSpecification } from 'maplibre-gl';
import { AREA_STORAGE_KEY, AreaPreferenceProvider, AreaToggle } from './AreaPreference';
import { fitStations, MonitoringMap, type MapHandle } from './MapBits';
import { basemapStyle } from './basemaps';
import { MapPage } from '@/features/map/pages/MapPage';
import { MapPreview } from '@/features/home/components/MapPreview';
import { AdminStationsPage } from '@/features/stations/pages/AdminStationsPage';
import type { Station } from '@/features/stations/types';
import * as stationsApi from '@/features/stations/api';

const sdk = vi.hoisted(() => ({
  status: 'loaded',
  map: { fitBounds: vi.fn(), panTo: vi.fn(), setZoom: vi.fn(), getZoom: () => 13, getContainer: vi.fn(), getCenter: () => ({ lat: 20.9, lng: 106.5 }), on: vi.fn(), off: vi.fn() },
}));
vi.mock('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url', () => ({ default: '/test-worker.js' }));
vi.mock('react-map-gl/maplibre', () => ({
  useMap: () => ({ current: sdk.map }),
  default: function MockMap({ id, children, mapStyle, interactive, onClick, onLoad, onError }: MapProps) {
    useEffect(() => { if (sdk.status === 'loaded') onLoad?.({} as Parameters<NonNullable<MapProps['onLoad']>>[0]); }, [onLoad]);
    if (sdk.status === 'unsupported') throw new Error('WebGL unavailable');
    const style = mapStyle as StyleSpecification;
    return <div data-testid={id} data-layer={style.layers.find(layer => layer.id.startsWith('basemap-') && layer.layout?.visibility === 'visible')?.id} data-interactive={String(interactive)}>
      <button onClick={() => onClick?.({ lngLat: { lat: 20.8123, lng: 106.6123 } } as Parameters<NonNullable<MapProps['onClick']>>[0])}>Place point</button>
      <button onClick={() => onError?.({ target: sdk.map, error: new Error('tile failed') } as unknown as Parameters<NonNullable<MapProps['onError']>>[0])}>Fail tiles</button>
      <button onClick={() => onError?.({ target: null, error: new Error('WebGL failed') } as unknown as Parameters<NonNullable<MapProps['onError']>>[0])}>Fail engine</button>{children}
    </div>;
  },
  Marker: ({ children, className }: MarkerProps) => <div className={className}>{children}</div>,
  Popup: ({ children, onClose }: PopupProps) => <div data-testid="station-popup"><button onClick={() => onClose?.({} as Parameters<NonNullable<PopupProps['onClose']>>[0])}>Close station popup</button>{children}</div>,
  Source: ({ children, id }: SourceProps) => <div data-testid={id}>{children}</div>,
  Layer: ({ id }: LayerProps) => <span data-testid={id}/>,
  NavigationControl: () => null,
}));
vi.mock('@/features/stations/api', () => ({ listStations: vi.fn(), createStation: vi.fn(), updateStation: vi.fn() }));

const stations: Station[] = [
  { code: 'AKH-01', name: 'First station', lat: 20.8, lng: 106.5, wqi: 80, ph: 7, do: 6, bod: 3, trend: [75, 80], last: null, records: 2, status: 'active' },
  { code: 'AKH-02', name: 'Second station', lat: 20.9, lng: 106.6, wqi: 45, ph: 7, do: 5, bod: 4, trend: [], last: null, records: 1, status: 'active' },
];
function open(children: ReactNode) {
  return render(<MemoryRouter><AreaPreferenceProvider>{children}</AreaPreferenceProvider></MemoryRouter>);
}
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); sdk.status = 'loaded';
  sdk.map.getContainer.mockReturnValue(document.createElement('div'));
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', ''); } },
    close: { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open'); } },
  });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.mocked(stationsApi.listStations).mockResolvedValue(stations);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('shared area preference', () => {
  it('defaults on, synchronizes switches and retains the choice after remount', () => {
    const view = open(<><AreaToggle/><AreaToggle/></>);
    const switches = screen.getAllByRole('switch') as HTMLInputElement[];
    expect(switches.every(input => input.checked)).toBe(true);
    fireEvent.click(switches[0]);
    expect(switches.every(input => !input.checked)).toBe(true);
    expect(localStorage.getItem(AREA_STORAGE_KEY)).toBe('false');
    view.unmount(); open(<AreaToggle/>);
    expect((screen.getByRole('switch') as HTMLInputElement).checked).toBe(false);
  });
  it('works in-session if browser storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    open(<AreaToggle/>);
    const input = screen.getByRole('switch') as HTMLInputElement;
    expect(input.checked).toBe(true); fireEvent.click(input); expect(input.checked).toBe(false);
  });
  it('accepts changes from another tab', () => {
    open(<AreaToggle/>);
    localStorage.setItem(AREA_STORAGE_KEY, 'false');
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: AREA_STORAGE_KEY, newValue: 'false' })));
    expect((screen.getByRole('switch') as HTMLInputElement).checked).toBe(false);
  });
});

describe('map loading and errors', () => {
  it('works without Google credentials and uses local bundled worker', () => {
    open(<MonitoringMap id="test" stations={stations}/>);
    expect(screen.getByTestId('test')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    const style = basemapStyle('map');
    expect(style.sources.map.type).toBe('raster');
    expect(JSON.stringify(style)).not.toMatch(/googleapis|key=/);
  });
  it('keeps markers and station controls available on tile errors and supports retry', () => {
    open(<MonitoringMap id="test" stations={stations}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Fail tiles' }));
    expect(screen.getByRole('alert').textContent).toContain('basemap could not load');
    expect(screen.getAllByTitle(/Station AKH/)).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Retry map' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('times out a hanging load', () => {
    vi.useFakeTimers(); sdk.status = 'loading';
    open(<MonitoringMap id="test" stations={[]}/>);
    expect(screen.getByRole('status').textContent).toContain('Loading map');
    act(() => vi.advanceTimersByTime(20000));
    expect(screen.getByRole('alert').textContent).toContain('timed out');
  });
  it('explains asynchronous WebGL initialization failures and leaves station data available', () => {
    open(<MonitoringMap id="test" stations={stations}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Fail engine' }));
    expect(screen.getByRole('alert').textContent).toContain('WebGL/hardware acceleration');
    expect(screen.getAllByTitle(/Station AKH/)).toHaveLength(2);
  });
  it('isolates WebGL failures from station forms and lists', async () => {
    sdk.status = 'unsupported'; vi.spyOn(console, 'error').mockImplementation(() => {});
    open(<AdminStationsPage/>);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit AKH-01' }));
    const dialog = screen.getByRole('dialog');
    expect((within(dialog).getByLabelText('Latitude') as HTMLInputElement).value).toBe('20.8000');
    expect((within(dialog).getByRole('button', { name: 'Pick on map' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toContain('WebGL');
    expect(within(dialog).getByRole('button', { name: 'Save Station' })).toBeTruthy();
  });
});

describe('region and camera', () => {
  it('removes the full overlay without changing camera, markers or popup', () => {
    open(<><AreaToggle/><MonitoringMap id="test" stations={stations} selectedCode="AKH-01" popupCode="AKH-01"/></>);
    for (const id of ['akh-mask', 'akh-glow-outer', 'akh-glow-inner', 'akh-border']) expect(screen.getByTestId(id)).toBeTruthy();
    expect(screen.getByText('Sông Cấm')).toBeTruthy();
    const fits = sdk.map.fitBounds.mock.calls.length;
    fireEvent.click(screen.getByRole('switch'));
    expect(screen.queryByTestId('akh-outside')).toBeNull();
    expect(screen.queryByTestId('akh-outline')).toBeNull();
    expect(screen.queryByText('Sông Cấm')).toBeNull();
    expect(screen.getAllByTitle(/Station AKH/)).toHaveLength(2);
    expect(screen.getByTestId('station-popup').textContent).toContain('AKH-01');
    expect(sdk.map.fitBounds).toHaveBeenCalledTimes(fits);
    fireEvent.click(screen.getByRole('switch'));
    expect(screen.getByTestId('akh-border')).toBeTruthy();
  });
  it('frames the region without stations and caps a single station at zoom 15', () => {
    fitStations(sdk.map as unknown as MapHandle, []);
    let [bounds, options] = sdk.map.fitBounds.mock.calls.at(-1)!;
    expect(bounds[0][0]).toBeGreaterThan(106.3); expect(bounds[0][1]).toBeGreaterThan(20.7);
    expect(options.maxZoom).toBe(15); expect(options.duration).toBe(0);
    fitStations(sdk.map as unknown as MapHandle, stations.slice(0, 1));
    [bounds, options] = sdk.map.fitBounds.mock.calls.at(-1)!;
    expect(bounds).toEqual([[106.5, 20.8], [106.5, 20.8]]); expect(options.maxZoom).toBe(15);
  });
});

describe('station map screens', () => {
  it('keeps public search, selection, popup, basemap and camera controls', async () => {
    open(<MapPage/>);
    await screen.findByText('All stations (2)');
    await waitFor(() => expect((screen.getByRole('button', { name: 'Zoom in' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('link', { name: /AKH-02 WQI 45/ }));
    expect(sdk.map.panTo).toHaveBeenCalledWith([106.6, 20.9]);
    expect(screen.getByTestId('station-popup').textContent).toContain('AKH-02');
    const fits = sdk.map.fitBounds.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Satellite' }));
    expect(screen.getByTestId('public-stations').getAttribute('data-layer')).toBe('basemap-sat');
    expect(sdk.map.fitBounds).toHaveBeenCalledTimes(fits);
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' })); expect(sdk.map.setZoom).toHaveBeenCalledWith(14);
    fireEvent.click(screen.getByRole('button', { name: 'Show all stations' })); expect(sdk.map.fitBounds).toHaveBeenCalledTimes(fits + 1);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Second' } });
    expect(screen.getByText('Matching stations (1)')).toBeTruthy(); expect(screen.getAllByTitle(/Station AKH/)).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Close station popup' })); expect(screen.queryByTestId('station-popup')).toBeNull();
  });
  it('keeps home preview non-interactive', async () => {
    open(<MapPreview/>); await screen.findByTitle(/Station AKH-01/);
    expect(screen.getByTestId('home-preview').getAttribute('data-interactive')).toBe('false');
    expect((screen.getByTitle(/Station AKH-01/) as HTMLButtonElement).disabled).toBe(true);
  });
  it('keeps an empty map usable', async () => {
    vi.mocked(stationsApi.listStations).mockResolvedValue([]); open(<MapPage/>);
    expect(await screen.findByText('All stations (0)')).toBeTruthy();
    expect(screen.getByText('No monitoring stations have been imported yet.')).toBeTruthy(); expect(screen.getByRole('switch')).toBeTruthy();
  });
  it('picks coordinates, shows the draft and submits the station form', async () => {
    vi.mocked(stationsApi.createStation).mockResolvedValue({ ...stations[0], code: 'AKH-03', lat: 20.8123, lng: 106.6123 });
    open(<AdminStationsPage/>); fireEvent.click(await screen.findByRole('button', { name: 'Add Station' }));
    fireEvent.change(screen.getByLabelText('Location description'), { target: { value: 'New location' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pick on map' })); fireEvent.click(screen.getByRole('button', { name: 'Place point' }));
    expect((screen.getByLabelText('Latitude') as HTMLInputElement).value).toBe('20.8123');
    expect((screen.getByLabelText('Longitude') as HTMLInputElement).value).toBe('106.6123');
    expect(screen.getByTitle('Draft station location')).toBeTruthy(); fireEvent.click(screen.getByRole('button', { name: 'Save Station' }));
    expect(stationsApi.createStation).toHaveBeenCalledWith({ code: 'AKH-03', name: 'New location', status: 'active', lat: 20.8123, lng: 106.6123 });
  });
});
