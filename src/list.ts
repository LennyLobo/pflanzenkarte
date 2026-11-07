import { allFinds, db } from './db';
import { deliver, toCsv, toGeoJson } from './export';
import { blobUrl, closeSheet, esc, fmtDate, freeUrls, openSheet, toast } from './ui';

export interface ListHost {
  open(id: string): void;
}

let query = '';

export async function showList(host: ListHost): Promise<void> {
  freeUrls();
  const finds = await allFinds();
  const q = query.toLowerCase();
  const shown = q
    ? finds.filter((f) => [f.species, f.habitat, f.notes, f.phenology, f.observer, f.date].join(' ').toLowerCase().includes(q))
    : finds;

  const firstThumbs = new Map<string, string>();
  for (const f of shown.slice(0, 200)) {
    const pid = f.photoIds[0];
    if (!pid) continue;
    const p = await db.photos.get(pid);
    if (p) firstThumbs.set(f.id, blobUrl(p.thumb));
  }

  const items = shown
    .map((f) => {
      const img = firstThumbs.get(f.id);
      return `<li data-id="${f.id}">
        ${img ? `<img src="${img}" alt="">` : '<div class="noimg">–</div>'}
        <div>
          <b>${f.species ? esc(f.species) : '<i class="muted">ohne Artname</i>'}</b>
          <div class="muted">${fmtDate(f.date)}${f.phenology ? ' · ' + esc(f.phenology) : ''}${f.habitat ? ' · ' + esc(f.habitat) : ''}</div>
        </div>
      </li>`;
    })
    .join('');

  const s = openSheet(`
    <div class="sheet-head">
      <h2>Funde <span class="muted">(${finds.length})</span></h2>
      <button type="button" class="link" data-act="close">Schließen</button>
    </div>
    <input class="search" type="search" placeholder="Suchen: Art, Habitat, Notiz …" value="${esc(query)}">
    <ul class="list">${items || '<li class="empty">Noch keine Funde. Unten auf „Foto aufnehmen“ tippen.</li>'}</ul>
    <div class="export">
      <div class="muted">Export${q ? ' (nur gefilterte Funde)' : ''}</div>
      <div class="row">
        <button type="button" data-act="csv">CSV / Excel</button>
        <button type="button" data-act="geojson">GeoJSON / QGIS</button>
      </div>
      <p class="muted small">Die Funde liegen nur auf diesem Handy. Fotos sind im Export noch nicht enthalten.</p>
    </div>
  `);

  const search = s.querySelector<HTMLInputElement>('.search')!;
  let timer = 0;
  search.oninput = () => {
    clearTimeout(timer);
    timer = window.setTimeout(async () => {
      query = search.value;
      await showList(host);
      const again = document.querySelector<HTMLInputElement>('#sheet .search');
      again?.focus();
      again?.setSelectionRange(again.value.length, again.value.length);
    }, 250);
  };

  s.onclick = async (ev) => {
    const t = ev.target as HTMLElement;
    const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    const li = t.closest<HTMLElement>('li[data-id]');
    if (act === 'close') { freeUrls(); closeSheet(); return; }
    if (act === 'csv' || act === 'geojson') {
      if (!shown.length) { toast('Keine Funde zum Exportieren.'); return; }
      await deliver(act === 'csv' ? toCsv(shown) : toGeoJson(shown), act);
      return;
    }
    if (li) host.open(li.dataset.id!);
  };
}
