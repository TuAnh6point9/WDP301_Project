// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useImperativeHandle, type ReactNode, type Ref } from 'react';
import { AreaPreferenceProvider } from './AreaPreference';
import { stationIcon } from './MapBits';
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
    return <div data-testid={String(icon.options.html).includes('draft') ? 'draft-marker' : 'station-marker'} data-icon-html={String(icon.options.html)}>
      {title && <button title={title} disabled={interactive === false} onClick={eventHandlers?.click}>{title}</button>}{children}
    </div>;
  },
}));
vi.mock('@/features/stations/api', () => ({ listStations: vi.fn(), listAdminStations: vi.fn(), createStation: vi.fn(), updateStation: vi.fn() }));

const stations: Station[] = [
  { id: 'st-1', code: 'AKH-01', name: 'First station', administrativeArea: 'Hải Dương', lat: 20.8, lng: 106.5, wqi: 80, ph: 7, do: 6, bod: 3, trend: [75, 80], last: null, records: 2, status: 'active' },
  { id: 'st-2', code: 'AKH-02', name: 'Second station', administrativeArea: 'Hải Phòng', lat: 20.9, lng: 106.6, wqi: 45, ph: 7, do: 5, bod: 4, trend: [], last: null, records: 1, status: 'active' },
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
  vi.mocked(stationsApi.listAdminStations).mockResolvedValue(stations);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('station marker halos', () => {
  function pin(station: Station | null, options = {}) {
    const container = document.createElement('div');
    container.innerHTML = String(stationIcon(station, options).options.html);
    return container.querySelector('span')!;
  }

  it.each([[null, 'exc'], [95, 'exc'], [80, 'good'], [60, 'fair'], [45, 'poor'], [15, 'vpoor']] as const)(
    'pulses active markers with WQI %s without changing their colour class', (wqi, colour) => {
      const marker = pin({ ...stations[0], wqi });
      expect(marker.classList.contains('pulsing')).toBe(true);
      expect(marker.classList.contains(colour)).toBe(true);
    },
  );

  it('includes the active test station and preserves selected size and popup anchor', () => {
    const station = { ...stations[0], code: 'AKH-CHART-TEST' };
    const selected = pin(station, { selected: true });
    expect(selected.classList.contains('selected')).toBe(true);
    expect(selected.classList.contains('pulsing')).toBe(true);
    expect(stationIcon(station).options.iconSize).toEqual([18, 18]);
    expect(stationIcon(station, { selected: true }).options.iconSize).toEqual([24, 24]);
    expect(stationIcon(station, { selected: true }).options.popupAnchor).toEqual([0, -16]);
  });

  it.each(['maint', 'off'] as const)('does not pulse %s stations and keeps their dimming', status => {
    const marker = pin({ ...stations[0], status });
    expect(marker.classList.contains('pulsing')).toBe(false);
    expect(marker.style.opacity).toBe('0.45');
  });

  it('never pulses draft or empty pins, even when an active station is supplied', () => {
    expect(pin(null, { draft: true }).classList.contains('pulsing')).toBe(false);
    expect(pin(stations[0], { draft: true, selected: true }).classList.contains('pulsing')).toBe(false);
    expect(pin(null).classList.contains('pulsing')).toBe(false);
  });

  it('uses the shared pulsing icon on public, home and admin maps', async () => {
    for (const page of [<MapPage/>, <MapPreview/>, <AdminStationsPage/>]) {
      const view = open(page);
      await waitFor(() => expect(screen.getAllByTestId('station-marker')).toHaveLength(2));
      for (const marker of screen.getAllByTestId('station-marker')) {
        expect(marker.getAttribute('data-icon-html')).toContain('pulsing');
      }
      view.unmount();
    }
  });
});

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
    expect(Number((screen.getByLabelText('Latitude') as HTMLInputElement).value)).toBe(20.8123);
    expect(Number((screen.getByLabelText('Longitude') as HTMLInputElement).value)).toBe(106.6123);
    expect(screen.getByTestId('draft-marker')).toBeTruthy();
    expect(screen.getByTestId('draft-marker').getAttribute('data-icon-html')).not.toContain('pulsing');
    fireEvent.click(screen.getByRole('button', { name: 'Save Station' }));
    expect(stationsApi.createStation).toHaveBeenCalledWith({ code: 'AKH-03', name: 'New location', administrativeArea: 'Hải Phòng', status: 'active', lat: 20.8123, lng: 106.6123 });
  });
  it('edits AH codes by id, preserves full coordinates and can reactivate an inactive station', async () => {
    const inactive: Station = { ...stations[0], code: 'AH1', status: 'off', lat: 20.93261429, lng: 106.48548944 };
    vi.mocked(stationsApi.listAdminStations).mockResolvedValue([inactive]);
    vi.mocked(stationsApi.updateStation).mockResolvedValue({ ...inactive, status: 'active', name: 'Updated station' });
    open(<AdminStationsPage/>); fireEvent.click(await screen.findByRole('button', { name: 'Edit AH1' }));
    expect((screen.getByLabelText('Latitude') as HTMLInputElement).value).toBe('20.93261429');
    expect((screen.getByLabelText('Longitude') as HTMLInputElement).value).toBe('106.48548944');
    expect((screen.getByLabelText('Administrative area') as HTMLSelectElement).value).toBe('Hải Dương');
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'active' } });
    fireEvent.change(screen.getByLabelText('Location description'), { target: { value: 'Updated station' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Station' }));
    expect(stationsApi.updateStation).toHaveBeenCalledWith(inactive.id, { code: 'AH1', name: 'Updated station', administrativeArea: 'Hải Dương', status: 'active', lat: inactive.lat, lng: inactive.lng });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByTestId('station-marker').getAttribute('data-icon-html')).toContain('pulsing');
  });
  it('prevents duplicate submission and keeps the draft when saving fails', async () => {
    let fail!: (reason: Error) => void;
    vi.mocked(stationsApi.createStation).mockReturnValue(new Promise((_resolve, reject) => { fail = reject; }));
    open(<AdminStationsPage/>); fireEvent.click(await screen.findByRole('button', { name: 'Add Station' }));
    fireEvent.change(screen.getByLabelText('Location description'), { target: { value: 'Retry location' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Station' }));
    fireEvent.click(screen.getByRole('button', { name: 'Saving…' }));
    expect(stationsApi.createStation).toHaveBeenCalledTimes(1);
    fail(new Error('Network failed'));
    await screen.findByRole('button', { name: 'Save Station' });
    expect(screen.getByRole('alert').textContent).toBeTruthy();
    expect((screen.getByLabelText('Location description') as HTMLInputElement).value).toBe('Retry location');
  });
});
