// @vitest-environment jsdom
// Preserve the original English-copy regression fixtures; bilingual behavior has its own tests.
import { beforeEach as beforeEnglishFixture } from 'vitest';
import { i18n } from '@/i18n';
beforeEnglishFixture(async () => { await i18n.changeLanguage('en'); });
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { LanguageSwitcher } from '@/i18n/LanguageSwitcher';
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
  ZoomControl: ({ zoomInTitle, zoomOutTitle }: { zoomInTitle?: string; zoomOutTitle?: string }) => <span data-testid="zoom-control" data-in={zoomInTitle} data-out={zoomOutTitle}/>,
  Polygon: () => <span data-testid="area-polygon"/>,
  Polyline: ({ children }: { children: ReactNode }) => <span data-testid="area-river">{children}</span>,
  Tooltip: ({ children }: { children: ReactNode }) => <span data-testid="map-tooltip">{children}</span>,
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
  { id: 'st-1', code: 'AKH-01', name: 'First station', administrativeArea: 'Hải Dương', lat: 20.8, lng: 106.5, status: 'active',
    latest: { batchCode: 'D12-2027', batchRow: 8, wqi: 73, qualityClass: 'Trung bình', parameters: { coliform: 4600, nh4: 0.2, ph: 7.1, po4: 0.1, do: 6, cod: 12 }, reviewedAt: null, batches: 2 } },
  { id: 'st-2', code: 'AKH-02', name: 'Second station', administrativeArea: 'Hải Phòng', lat: 20.9, lng: 106.6, status: 'active', latest: null },
];
const withWqi = (wqi: number | null): Station => ({ ...stations[0], latest: wqi === null ? null : { ...stations[0].latest!, wqi } });
// Station copy keeps "WQI 73" and "Batch D12-2027" whole with non-breaking spaces; compare words, not space characters.
const words = (node: Element | null | undefined) => (node?.textContent ?? '').replace(/\s+/g, ' ');
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

  it.each([[null, 'none'], [95, 'exc'], [80, 'good'], [60, 'fair'], [45, 'poor'], [15, 'vpoor'], [5, 'heavy']] as const)(
    'colours an active pin with newest WQI %s by its official class and keeps the pulse', (wqi, colour) => {
      const marker = pin(withWqi(wqi));
      expect(marker.classList.contains('pulsing')).toBe(true);
      expect(marker.classList.contains(colour)).toBe(true);
    },
  );

  it('reuses one icon per look, so a re-render never rebuilds the pin', () => {
    expect(stationIcon(stations[0])).toBe(stationIcon({ ...stations[0] }));
    expect(stationIcon(stations[0])).not.toBe(stationIcon(stations[0], { selected: true }));
    expect(stationIcon(stations[0])).not.toBe(stationIcon(stations[1]));
  });

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
    fireEvent.click(screen.getByRole('link', { name: /AKH-02.*No data yet/ }));
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
  it('keeps the panel short and shows the six parameters of the newest approved row in a dialog, in model order, with units', async () => {
    open(<MapPage/>); await screen.findByText('All stations (2)');
    expect(document.querySelectorAll('.map-side .tile')).toHaveLength(0);
    fireEvent.click(within(document.querySelector<HTMLElement>('.map-detail')!).getByRole('button', { name: 'View the 6 parameters' }), { detail: 1 });
    const dialog = screen.getByRole('dialog', { name: 'First station' });
    expect(dialog.classList.contains('animated')).toBe(true); // opened by pointer
    expect(words(dialog)).toMatch(/AKH-01.*WQI.*73.*Medium.*Batch D12-2027/); expect(words(dialog)).not.toMatch(/row/);
    const panel = dialog.querySelector('.map-params')!;
    expect([...panel.querySelectorAll('.tile-label')].map(node => node.textContent)).toEqual(['Coliform', 'Amoni', 'pH', 'Phosphat', 'DO', 'COD']);
    expect([...panel.querySelectorAll('.tile-value')].map(node => node.textContent)).toEqual(['4,600', '0.2', '7.1', '0.1', '6', '12']);
    expect([...panel.querySelectorAll('.tile-unit')].map(node => node.textContent)).toEqual(['MPN/100 mL', 'mg/L as N', 'mg/L as P', 'mg/L', 'mg/L']);
    expect(within(dialog).getByRole('link', { name: 'View Historical Data for This Station' }).getAttribute('href')).toBe('/historical-data?station=AKH-01');
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Close' })[0]);
    expect(screen.queryByRole('dialog')).toBeNull();
    // The popup opens the same dialog; from the keyboard it opens without motion.
    fireEvent.click(within(screen.getAllByTestId('station-popup')[0]).getByRole('button', { name: 'View the 6 parameters' }), { detail: 0 });
    expect(screen.getByRole('dialog', { name: 'First station' }).classList.contains('animated')).toBe(false);
  });
  it('explains an unmeasured station in one sentence instead of empty tiles, and links straight to its data', async () => {
    vi.mocked(stationsApi.listStations).mockResolvedValue([stations[1]]);
    open(<MapPage/>); await screen.findByText('All stations (1)');
    expect(document.querySelectorAll('.map-side .tile')).toHaveLength(0);
    expect(screen.getAllByText(/No measurements for this station yet/)).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'View the 6 parameters' })).toBeNull();
    expect(screen.getByRole('link', { name: 'View Historical Data for This Station' })).toBeTruthy();
  });
  it('shows the newest approved batch on the admin Stations page and the public map', async () => {
    open(<AdminStationsPage/>);
    expect(await screen.findByText(/AKH-01 · Active.*WQI 73 · Medium · Batch D12-2027 · row 8/)).toBeTruthy(); // map tooltip
    expect(screen.getByText('WQI 73 · Medium')).toBeTruthy(); expect(screen.getByText('Batch D12-2027 · row 8')).toBeTruthy(); // table cell
    expect(screen.getAllByText(/No approved batch yet/)).toHaveLength(2);
    expect(screen.getByRole('columnheader', { name: 'On the map' })).toBeTruthy();
    // Each station, with or without an approved batch, links to its own details page of approved rows.
    expect(screen.getByRole('link', { name: 'View approved data of AKH-01' }).getAttribute('href')).toBe('/admin/stations/details?station=AKH-01');
    expect(screen.getByRole('link', { name: 'View approved data of AKH-02' }).getAttribute('href')).toBe('/admin/stations/details?station=AKH-02');
    const pins = screen.getAllByTestId('station-marker').map(node => node.getAttribute('data-icon-html'));
    expect(pins[0]).toContain('pin fair'); expect(pins[1]).toContain('pin none');
    cleanup(); open(<MapPage/>); await screen.findByText('All stations (2)');
    const [first, second] = screen.getAllByTestId('station-popup').map(words);
    // The glass popup reads code, name, then the WQI figure with its class and batch; the Excel row stays on the admin pages.
    expect(first).toMatch(/AKH-01.*First station.*WQI.*73.*Medium.*Batch D12-2027/); expect(first).not.toMatch(/row/);
    expect(document.querySelector('[data-testid="station-popup"] .pop-wqi-value')?.textContent).toBe('WQI73');
    expect(second).toMatch(/AKH-02.*Second station.*No measurements yet/);
    const side = words(document.querySelector('.map-detail'));
    expect(side).toContain('73'); expect(side).toContain('Medium'); expect(side).toContain('Batch D12-2027'); expect(side).not.toContain('row');
    const publicPins = screen.getAllByTestId('station-marker').map(node => node.getAttribute('data-icon-html'));
    expect(publicPins[0]).toContain('pin fair'); expect(publicPins[1]).toContain('pin none');
    // Hovering a pin names the station, as on the admin map; the chosen pin's open popup already names it.
    const tooltips = screen.getAllByTestId('station-marker').map(node => within(node).queryByTestId('map-tooltip')?.textContent ?? null);
    expect(tooltips).toEqual([null, 'Second station']);
  });
  it('folds the station list away and back, and opens it again when the guest searches', async () => {
    open(<MapPage/>);
    const head = await screen.findByRole('button', { name: 'All stations (2)' });
    expect(head.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('link', { name: /AKH-02/ })).toBeTruthy();
    fireEvent.click(head);
    expect(head.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('link', { name: /AKH-02/ })).toBeNull();
    fireEvent.click(head);
    expect(screen.getByRole('link', { name: /AKH-02/ })).toBeTruthy();
    fireEvent.click(head);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search monitoring points' }), { target: { value: 'AKH-02' } });
    expect(screen.getByRole('button', { name: 'Matching stations (1)' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('link', { name: /AKH-02/ })).toBeTruthy();
  });
  it('lands the chosen pin with a ripple for a pointer, and without motion from the keyboard', async () => {
    open(<MapPage/>); await screen.findByText('All stations (2)');
    const second = () => screen.getAllByTestId('station-marker')[1].getAttribute('data-icon-html');
    fireEvent.click(screen.getByRole('link', { name: /AKH-02/ }), { detail: 1 });
    expect(second()).toContain('selected'); expect(second()).toContain('drop');
    expect(document.querySelector('.map-layout')!.getAttribute('data-motion')).toBe('on');
    fireEvent.click(screen.getByRole('link', { name: /AKH-01/ }), { detail: 0 }); // Enter on a link
    fireEvent.click(screen.getByRole('link', { name: /AKH-02/ }), { detail: 0 });
    expect(second()).toContain('selected'); expect(second()).not.toContain('drop');
    expect(document.querySelector('.map-layout')!.getAttribute('data-motion')).toBe('off');
  });
  it('sets a measured station apart in the list with a WQI and class chip, and an unmeasured one back with plain copy', async () => {
    open(<MapPage/>); await screen.findByText('All stations (2)');
    const measured = screen.getByRole('link', { name: /AKH-01/ }), unmeasured = screen.getByRole('link', { name: /AKH-02/ });
    const chip = measured.querySelector('.station-chip')!;
    expect(words(chip)).toBe('WQI 73 Medium'); expect(chip.classList.contains('fair')).toBe(true);
    expect(measured.classList.contains('unmeasured')).toBe(false);
    expect(unmeasured.classList.contains('unmeasured')).toBe(true);
    expect(unmeasured.querySelector('.station-chip')).toBeNull();
    expect(unmeasured.querySelector('.station-wqi')?.textContent).toBe('No data yet');
  });
  it('reopens the popup when the guest picks the current station in the list again after a map click closed it', async () => {
    open(<MapPage/>); await screen.findByText('All stations (2)');
    await waitFor(() => expect(sdk.map.fitBounds).toHaveBeenCalled()); // the map is ready and its popup open
    const opened = sdk.marker.openPopup.mock.calls.length;
    expect(opened).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('link', { name: /AKH-01/ }), { detail: 1 }); // already the chosen station
    expect(sdk.marker.openPopup).toHaveBeenCalledTimes(opened + 1);
  });
  it('lets a popup closed by a pointer fade before removal, and one closed by a key go at once', async () => {
    open(<MapPage/>); await screen.findByText('All stations (2)');
    await waitFor(() => expect(sdk.map.on).toHaveBeenCalledWith('popupclose', expect.any(Function)));
    const handler = (name: string) => sdk.map.on.mock.calls.find(([event]) => event === name)![1] as (event: unknown) => void;
    const popup = () => {
      const element = document.body.appendChild(document.createElement('div'));
      const leafletRemove = vi.fn(() => element.remove());
      return { element, leafletRemove, event: { popup: { getElement: () => element, _removeTimeout: window.setTimeout(leafletRemove, 200) } } };
    };
    const byPointer = popup();
    fireEvent.pointerDown(window); handler('popupclose')(byPointer.event);
    expect(byPointer.element.classList.contains('closing')).toBe(true);
    await new Promise(resolve => setTimeout(resolve, 240));
    expect(byPointer.leafletRemove).not.toHaveBeenCalled(); expect(byPointer.element.isConnected).toBe(true); // still fading
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(byPointer.element.isConnected).toBe(false);
    // Reopened while fading, the same element comes back whole.
    const reopened = popup();
    handler('popupclose')(reopened.event); handler('popupopen')(reopened.event);
    expect(reopened.element.classList.contains('closing')).toBe(false);
    const byKey = popup();
    fireEvent.keyDown(window, { key: 'Escape' }); handler('popupclose')(byKey.event);
    expect(byKey.element.classList.contains('closing')).toBe(false);
    await new Promise(resolve => setTimeout(resolve, 240));
    expect(byKey.leafletRemove).toHaveBeenCalled(); // Leaflet's own removal, untouched
  });
  it('explains the six official classes and grey in the public legend, beside the area switch', async () => {
    open(<MapPage/>); await screen.findByText('All stations (2)');
    const legend = document.querySelector('.legend')!.textContent ?? '';
    for (const band of ['Very good (91–100)', 'Good (76–90)', 'Medium (51–75)', 'Poor (26–50)', 'Bad (10–25)', 'Heavily polluted (0–9)', 'No measurements yet']) expect(legend).toContain(band);
    expect(document.querySelectorAll('.legend .dot')).toHaveLength(7);
    expect(screen.getByRole('switch')).toBeTruthy();
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
  it('switches map labels without moving the camera, resetting search or revealing a hidden area', async () => {
    await act(async () => { await i18n.changeLanguage('vi'); });
    open(<><LanguageSwitcher/><MapPage/></>);
    await screen.findByText('Tất cả trạm (2)');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'AKH-02' } });
    fireEvent.click(screen.getByRole('switch'));
    const map = screen.getByTestId('leaflet-map');
    const fits = sdk.map.fitBounds.mock.calls.length, flights = sdk.map.flyTo.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByText('Matching stations (1)')).toBeTruthy();
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('AKH-02');
    expect(screen.getByTestId('leaflet-map')).toBe(map);
    expect(screen.queryByTestId('area-polygon')).toBeNull();
    expect(sdk.map.fitBounds).toHaveBeenCalledTimes(fits);
    expect(sdk.map.flyTo).toHaveBeenCalledTimes(flights);
    expect(screen.getAllByTestId('station-marker')).toHaveLength(2);
  });
  it('retains the same station form and exact draft coordinates while switching language', async () => {
    await act(async () => { await i18n.changeLanguage('vi'); });
    open(<><LanguageSwitcher/><AdminStationsPage/></>);
    fireEvent.click(await screen.findByRole('button', { name: 'Thêm trạm' }));
    const dialog = screen.getByRole('dialog');
    const latitude = screen.getByLabelText('Vĩ độ') as HTMLInputElement;
    fireEvent.change(latitude, { target: { value: '20.93261429' } });
    fireEvent.change(screen.getByLabelText('Mô tả vị trí'), { target: { value: 'Vị trí do người dùng nhập' } });
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(screen.getByLabelText('Latitude')).toBe(latitude);
    expect(latitude.value).toBe('20.93261429');
    expect((screen.getByLabelText('Location description') as HTMLInputElement).value).toBe('Vị trí do người dùng nhập');
    expect(stationsApi.createStation).not.toHaveBeenCalled();
    expect(stationsApi.updateStation).not.toHaveBeenCalled();
  });
  it('names the station map zoom buttons in the chosen language', async () => {
    await act(async () => { await i18n.changeLanguage('vi'); });
    open(<><LanguageSwitcher/><AdminStationsPage/></>);
    const zoom = await screen.findByTestId('zoom-control');
    expect([zoom.dataset.in, zoom.dataset.out]).toEqual(['Phóng to', 'Thu nhỏ']);
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect([screen.getByTestId('zoom-control').dataset.in, screen.getByTestId('zoom-control').dataset.out]).toEqual(['Zoom in', 'Zoom out']);
  });
});
