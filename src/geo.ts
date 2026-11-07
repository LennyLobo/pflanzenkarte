import proj4 from 'proj4';

export interface Fix {
  lat: number;
  lng: number;
  accuracy: number; // metres
  at: number;       // ms timestamp
}

let watchId: number | null = null;
let best: Fix | null = null;
let last: Fix | null = null;
const listeners = new Set<(f: Fix) => void>();

/** Start continuous GPS. Keeps the latest fix; listeners get every update. */
export function startGps(onError?: (msg: string) => void): void {
  if (watchId !== null || !('geolocation' in navigator)) {
    if (!('geolocation' in navigator)) onError?.('Dieses Gerät liefert keinen Standort.');
    return;
  }
  watchId = navigator.geolocation.watchPosition(
    (p) => {
      const f: Fix = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, at: Date.now() };
      last = f;
      // a fix older than 60 s is not "best" any more, people walk on
      if (!best || f.accuracy <= best.accuracy || Date.now() - best.at > 60_000) best = f;
      listeners.forEach((l) => l(f));
    },
    (e) => {
      const msg =
        e.code === e.PERMISSION_DENIED
          ? 'Standortzugriff ist blockiert. Bitte in den Browser-Einstellungen erlauben.'
          : 'Kein GPS-Signal. Bitte kurz warten oder den Punkt auf der Karte setzen.';
      onError?.(msg);
    },
    { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 },
  );
}

export function onGps(l: (f: Fix) => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function lastFix(): Fix | null {
  return last;
}

/** The most accurate fix of the last minute, else the latest one. */
export function bestRecentFix(): Fix | null {
  if (best && Date.now() - best.at <= 60_000) return best;
  return last;
}

// ETRS89 / UTM zone 32N, the official grid in Niedersachsen
proj4.defs('EPSG:25832', '+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs');

export function toUtm32(lat: number, lng: number): [number, number] {
  const [e, n] = proj4('EPSG:4326', 'EPSG:25832', [lng, lat]);
  return [Math.round(e * 10) / 10, Math.round(n * 10) / 10];
}

export function fmtCoord(lat: number, lng: number): string {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}
