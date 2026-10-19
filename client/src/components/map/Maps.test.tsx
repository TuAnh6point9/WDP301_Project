// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useImperativeHandle, type ReactNode, type Ref } from 'react';
import { AreaPreferenceProvider } from './AreaPreference';
import { MapPage } from '@/features/map/pages/MapPage';
import { MapPreview } from '@/features/home/components/MapPreview';
import { AdminStationsPage } from '@/features/stations/pages/AdminStationsPage';
import type { Station } from '@/features/stations/types';
import * as stationsApi from '@/features/stations/api';

const sdk = vi.hoisted(() => ({
  map: { fitBounds: vi.fn(), flyTo: vi.fn(), zoomIn: vi.fn(), zoomOut: vi.fn(), getZoom: () => 13,
    getContainer: vi.fn(), getCenter: () => ({ lat: 20.9, lng: 106.5 }), on: vi.fn(), off: vi.fn() },
  marker: { openPopup: vi.fn() },
  pick: undefined as undefined | ((event: { latlng: { lat: number; lng: number } }) => void),
}));
vi.mock('maplibre-gl', () => ({ setWorkerUrl: vi.fn() }));
vi.mock('maplibre-gl/dist/maplibre-gl-worker.mjs?url', () => ({ default: '/test-worker.js' }));
vi.mock('@maplibre/maplibre-gl-leaflet', () => ({ maplibreGL: vi.fn() }));
vi.mock('react-leaflet', () => ({
  useMap: () => sdk.map,
  useMapEvents: (events: { click: typeof sdk.pick }) => { sdk.pick = events.click; return sdk.map; },
  MapContainer: ({ children, dragging }: { children: ReactNode; dragging?: boolean }) =>
    <div data-testid="leaflet-map" data-interactive={String(dragging !== false)}>
      <button onClick={() => sdk.pick?.({ latlng: { lat: 20.8123, lng: 106.6123 } })}>Place point</button>{children}
    </div>,
  TileLayer: ({ url }: { url: string }) => <span data-testid="tiles" data-url={url}/>,
  Polygon: () => <span data-testid="area-polygon"/>,
  Polyline: ({ children }: { children: ReactNode }) => <span data-testid="area-river">{children}</span>,
  Tooltip: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Popup: ({ children }: { children: ReactNode }) => <div data-testid="station-popup">{children}</div>,
  Marker: function MockMarker({ children, title, interactive, eventHandlers, icon, ref }: {
    children?: ReactNode; title?: string; interactive?: boolean; icon: { options: { html?: string } };
    eventHandlers?: { click?: () => void }; ref?: Ref<typeof sdk.marker>;
  }) {
    useImperativeHandle(ref, () => sdk.marker, []);
    return <div data-testid={String(icon.options.html).includes('draft') ? 'draft-marker' : 'station-marker'}>
      {title && <button title={title} disabled={interactive === false} onClick={eventHandlers?.click}>{title}</button>}{children}
    </div>;
  },
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
  vi.clearAllMocks(); localStorage.clear(); sdk.pick = undefined;
  sdk.map.getContainer.mockReturnValue(document.createElement('div'));
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', ''); } },
    close: { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open'); } },
  });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.mocked(stationsApi.listStations).mockResolvedValue(stations);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Leaflet map screens with the unchanged shared Goong patch', () => {
  it('toggles all region layers without changing camera, markers, or station search', async () => {
    open(<MapPage/>); await screen.findByText('All stations (2)');
    await waitFor(() => expect(sdk.map.fitBounds).toHaveBeenCalled());
    expect(screen.getAllByTestId('area-polygon')).toHaveLength(4);
    expect(screen.getAllByTestId('area-river')).toHaveLength(5);
    const fits = sdk.map.fitBounds.mock.calls.length;
    fireEvent.click(screen.getByRole('switch'));
    expect(screen.queryByTestId('area-polygon')).toBeNull();
    expect(screen.queryByTestId('area-river')).toBeNull();
    expect(screen.getAllByTestId('station-marker')).toHaveLength(2);
    expect(sdk.map.fitBounds).toHaveBeenCalledTimes(fits);
    expect(sdk.map.flyTo).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Second' } });
    expect(screen.getByText('Matching stations (1)')).toBeTruthy();
    fireEvent.click(screen.getByRole('switch'));
    expect(screen.getAllByTestId('area-polygon')).toHaveLength(4);
  });
  it('retains the off choice in home preview and admin, with no switch on the preview', async () => {
    let view = open(<MapPage/>); await screen.findByText('All stations (2)');
    fireEvent.click(screen.getByRole('switch')); view.unmount();
    view = open(<MapPreview/>);
    await waitFor(() => expect(screen.getAllByTestId('station-marker')).toHaveLength(2));
    expect(screen.queryByTestId('area-polygon')).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.getByTestId('leaflet-map').getAttribute('data-interactive')).toBe('false');
    view.unmount(); open(<AdminStationsPage/>);
    await screen.findByRole('button', { name: 'Edit AKH-01' });
    expect((screen.getByRole('switch') as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByTestId('area-polygon')).toBeNull();
    fireEvent.click(screen.getByRole('switch'));
    expect(screen.getAllByTestId('area-polygon')).toHaveLength(4);
  });
  it('retains Leaflet camera controls, selection, popups and Esri satellite', async () => {
    open(<MapPage/>); await screen.findByText('All stations (2)');
    await waitFor(() => expect(sdk.map.fitBounds).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('link', { name: /AKH-02 WQI 45/ }));
    expect(sdk.map.flyTo).toHaveBeenCalledWith([20.9, 106.6], 15, { duration: .6 });
    expect(sdk.marker.openPopup).toHaveBeenCalled();
    const fits = sdk.map.fitBounds.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Satellite' }));
    expect(screen.getByTestId('tiles').getAttribute('data-url')).toContain('World_Imagery');
    expect(sdk.map.fitBounds).toHaveBeenCalledTimes(fits);
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' })); expect(sdk.map.zoomIn).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' })); expect(sdk.map.zoomOut).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Show all stations' }));
    expect(sdk.map.fitBounds).toHaveBeenCalledTimes(fits + 1);
  });
  it('keeps an empty station list and the region control usable', async () => {
    vi.mocked(stationsApi.listStations).mockResolvedValue([]); open(<MapPage/>);
    expect(await screen.findByText('All stations (0)')).toBeTruthy();
    expect(screen.getByText('No monitoring stations have been imported yet.')).toBeTruthy();
    expect(screen.getByRole('switch')).toBeTruthy();
  });
  it('shows placeholders for missing pH, DO and BOD5 as required by the patch', async () => {
    vi.mocked(stationsApi.listStations).mockResolvedValue([{ ...stations[0], ph: null, do: null, bod: null } as unknown as Station]);
    open(<MapPage/>); await screen.findByText('All stations (1)');
    expect(document.querySelectorAll('.tile-value')).toHaveLength(3);
    expect([...document.querySelectorAll('.tile-value')].map(node => node.textContent)).toEqual(['—', '—', '—']);
  });
  it('picks coordinates and submits through the existing station form without a real database', async () => {
    vi.mocked(stationsApi.createStation).mockResolvedValue({ ...stations[0], code: 'AKH-03', lat: 20.8123, lng: 106.6123 });
    open(<AdminStationsPage/>); fireEvent.click(await screen.findByRole('button', { name: 'Add Station' }));
    fireEvent.change(screen.getByLabelText('Location description'), { target: { value: 'New location' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pick on map' }));
    fireEvent.click(screen.getByRole('button', { name: 'Place point' }));
    expect((screen.getByLabelText('Latitude') as HTMLInputElement).value).toBe('20.8123');
    expect((screen.getByLabelText('Longitude') as HTMLInputElement).value).toBe('106.6123');
    expect(screen.getByTestId('draft-marker')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save Station' }));
    expect(stationsApi.createStation).toHaveBeenCalledWith({ code: 'AKH-03', name: 'New location', status: 'active', lat: 20.8123, lng: 106.6123 });
  });
});
