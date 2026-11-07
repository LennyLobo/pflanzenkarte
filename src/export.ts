import type { Find } from './db';
import { toUtm32 } from './geo';
import { todayIso } from './ui';

const LOC_LABEL: Record<Find['locSource'], string> = { gps: 'GPS', exif: 'Foto-EXIF', manual: 'manuell' };

const COLUMNS = [
  'id', 'datum', 'uhrzeit', 'art', 'phaenologie', 'habitat', 'notiz', 'bearbeiter',
  'breite_wgs84', 'laenge_wgs84', 'ost_utm32', 'nord_utm32', 'genauigkeit_m', 'standort_quelle',
  'anzahl_fotos', 'erstellt', 'geaendert',
] as const;

function row(f: Find): (string | number)[] {
  const [e, n] = toUtm32(f.lat, f.lng);
  return [
    f.id, f.date, f.time, f.species, f.phenology, f.habitat, f.notes, f.observer,
    f.lat.toFixed(7), f.lng.toFixed(7), e.toFixed(1), n.toFixed(1),
    f.accuracy == null ? '' : Math.round(f.accuracy), LOC_LABEL[f.locSource],
    f.photoIds.length, f.createdAt, f.updatedAt,
  ];
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Semicolon separated with BOM: opens correctly in German Excel and reads fine in R (read.csv2 / readr). */
export function toCsv(finds: Find[]): Blob {
  const lines = [COLUMNS.join(';'), ...finds.map((f) => row(f).map(csvCell).join(';'))];
  return new Blob(['﻿' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
}

/** GeoJSON in WGS84 (RFC 7946). QGIS opens it directly; UTM values are kept as attributes. */
export function toGeoJson(finds: Find[]): Blob {
  const fc = {
    type: 'FeatureCollection',
    name: 'pflanzenfunde',
    features: finds.map((f) => {
      const values = row(f);
      const props: Record<string, string | number | null> = {};
      COLUMNS.forEach((c, i) => {
        if (c === 'breite_wgs84' || c === 'laenge_wgs84') return;
        const v = values[i];
        props[c] = v === '' ? null : v;
      });
      props.ost_utm32 = Number(props.ost_utm32);
      props.nord_utm32 = Number(props.nord_utm32);
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [Number(f.lng.toFixed(7)), Number(f.lat.toFixed(7))] },
        properties: props,
      };
    }),
  };
  return new Blob([JSON.stringify(fc, null, 1)], { type: 'application/geo+json' });
}

/** Android: open the share menu (Drive, mail, …); otherwise download. */
export async function deliver(blob: Blob, ext: 'csv' | 'geojson'): Promise<void> {
  const name = `pflanzenfunde_${todayIso()}.${ext}`;
  const type = ext === 'csv' ? 'text/csv' : 'application/geo+json';
  const file = new File([blob], name, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return;
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return;
      // fall through to download
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
