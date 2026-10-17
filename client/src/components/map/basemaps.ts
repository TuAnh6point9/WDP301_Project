import type { StyleSpecification } from 'maplibre-gl';

export type BaseLayer = 'map' | 'sat';
export const BASEMAPS = {
  map: {
    tiles: import.meta.env.VITE_MAP_STREET_TILES?.trim() || 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: import.meta.env.VITE_MAP_STREET_ATTRIBUTION?.trim() || 'Tiles &copy; <a href="https://www.arcgis.com/home/item.html?id=3b93337983e9436f8db950e38a8629af">Esri</a> &mdash; Sources: Esri, HERE, Garmin, USGS, Intermap, INCREMENT P, NRCan, Esri Japan, METI, Esri China (Hong Kong), Esri Korea, Esri (Thailand), NGCC, &copy; OpenStreetMap contributors, and the GIS User Community',
    maxzoom: 19,
  },
  sat: {
    tiles: import.meta.env.VITE_MAP_SATELLITE_TILES?.trim() || 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: import.meta.env.VITE_MAP_SATELLITE_ATTRIBUTION?.trim() || 'Tiles &copy; <a href="https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9">Esri</a> &mdash; Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community',
    maxzoom: 19,
  },
};

// Change raster visibility, not the camera or GeoJSON overlays.
export function basemapStyle(layer: BaseLayer): StyleSpecification {
  return {
    version: 8,
    sources: Object.fromEntries(Object.entries(BASEMAPS).map(([id, source]) => [id, {
      type: 'raster' as const, tiles: [source.tiles], tileSize: 256, maxzoom: source.maxzoom, attribution: source.attribution,
    }])),
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#DCEAEE' } },
      ...(['map', 'sat'] as const).map(id => ({ id: `basemap-${id}`, type: 'raster' as const, source: id,
        layout: { visibility: layer === id ? 'visible' as const : 'none' as const }, paint: { 'raster-fade-duration': 150 } })),
    ],
  };
}
