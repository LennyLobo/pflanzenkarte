import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Find } from './db';
import type { Fix } from './geo';

const YEAR = new Date().getFullYear();

// Digitale Orthophotos 20 cm, LGLN Niedersachsen. Licence CC BY 4.0 (see GetCapabilities).
const dop = L.tileLayer.wms('https://opendata.lgln.niedersachsen.de/doorman/noauth/dop_wms', {
  layers: 'ni_dop20',
  format: 'image/jpeg',
  version: '1.3.0',
  transparent: false,
  maxZoom: 21,
  maxNativeZoom: 20,
  attribution: `Luftbild: <a href="https://ni-lgln-opengeodata.hub.arcgis.com/" target="_blank" rel="noopener">LGLN (${YEAR})</a>, <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>`,
});

const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 21,
  maxNativeZoom: 19,
  attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
});

export type BaseName = 'luftbild' | 'karte';

export class PlantMap {
  readonly map: L.Map;
  private markers = new Map<string, L.CircleMarker>();
  private me: L.CircleMarker | null = null;
  private meRing: L.Circle | null = null;
  private base: BaseName = 'luftbild';
  onFindClick: (id: string) => void = () => {};

  constructor(el: HTMLElement) {
    // Niedersachsen roughly in view until the first GPS fix arrives
    const saved = readView();
    this.map = L.map(el, {
      zoomControl: false,
      attributionControl: true,
      maxZoom: 21,
    }).setView(saved?.c ?? [52.6, 9.2], saved?.z ?? 8);
    this.map.attributionControl.setPrefix(false);
    dop.addTo(this.map);
    this.map.on('moveend', () => {
      const c = this.map.getCenter();
      try {
        localStorage.setItem('pk-view', JSON.stringify({ c: [c.lat, c.lng], z: this.map.getZoom() }));
      } catch { /* private mode */ }
    });
  }

  setBase(name: BaseName): void {
    if (name === this.base) return;
    this.base = name;
    if (name === 'luftbild') {
      this.map.removeLayer(osm);
      dop.addTo(this.map);
    } else {
      this.map.removeLayer(dop);
      osm.addTo(this.map);
    }
  }

  get baseName(): BaseName {
    return this.base;
  }

  showFinds(finds: Find[]): void {
    const keep = new Set(finds.map((f) => f.id));
    for (const [id, m] of this.markers) if (!keep.has(id)) { m.remove(); this.markers.delete(id); }
    for (const f of finds) {
      let m = this.markers.get(f.id);
      if (!m) {
        m = L.circleMarker([f.lat, f.lng], {
          radius: 9,
          weight: 3,
          color: '#ffffff',
          fillColor: '#e0447a',
          fillOpacity: 1,
        }).addTo(this.map);
        m.on('click', () => this.onFindClick(f.id));
        this.markers.set(f.id, m);
      }
      m.setLatLng([f.lat, f.lng]);
      m.unbindTooltip();
      if (f.species) m.bindTooltip(f.species, { direction: 'top', offset: [0, -8] });
    }
  }

  showMe(f: Fix): void {
    const ll: L.LatLngExpression = [f.lat, f.lng];
    if (!this.me) {
      this.meRing = L.circle(ll, { radius: f.accuracy, weight: 1, color: '#2a7de1', fillColor: '#2a7de1', fillOpacity: 0.12, interactive: false }).addTo(this.map);
      this.me = L.circleMarker(ll, { radius: 7, weight: 3, color: '#ffffff', fillColor: '#2a7de1', fillOpacity: 1, interactive: false }).addTo(this.map);
    } else {
      this.me.setLatLng(ll);
      this.meRing!.setLatLng(ll).setRadius(f.accuracy);
    }
  }

  flyTo(lat: number, lng: number, zoom = 18): void {
    this.map.flyTo([lat, lng], Math.max(zoom, this.map.getZoom()), { duration: 0.6 });
  }

  center(): { lat: number; lng: number } {
    const c = this.map.getCenter();
    return { lat: c.lat, lng: c.lng };
  }

  hasSavedView(): boolean {
    return readView() !== null;
  }
}

function readView(): { c: [number, number]; z: number } | null {
  try {
    const v = JSON.parse(localStorage.getItem('pk-view') ?? 'null');
    if (v && Array.isArray(v.c) && typeof v.z === 'number') return v;
  } catch { /* ignore */ }
  return null;
}
