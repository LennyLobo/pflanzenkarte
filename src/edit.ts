import { db, deleteFind, newId, saveFind, type Find, type LocSource, type Photo } from './db';
import { bestRecentFix, fmtCoord, onGps } from './geo';
import { makePhoto, readMeta } from './photos';
import { blobUrl, closeSheet, esc, freeUrls, nowTime, openSheet, toast, todayIso } from './ui';

export const PHENOLOGY = [
  'vegetativ',
  'Knospe',
  'beginnende Blüte',
  'Vollblüte',
  'abblühend',
  'fruchtend',
  'Samen reif',
  'abgestorben / vergilbt',
];

/** A find being created or edited. Photos are kept in memory until "Speichern". */
interface Draft {
  find: Find;
  isNew: boolean;
  photos: Photo[];         // all photos currently attached
  added: Photo[];          // new ones to write
  removed: string[];       // ids to delete
  liveGps: boolean;        // location follows GPS while the form is open
}

export interface EditorHost {
  refresh(): Promise<void>;
  pickOnMap(start: { lat: number; lng: number } | null): Promise<{ lat: number; lng: number } | null>;
  flyTo(lat: number, lng: number): void;
}

let draft: Draft | null = null;
let stopGps: (() => void) | null = null;

function blankFind(): Find {
  const now = new Date();
  return {
    id: newId(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    date: todayIso(now),
    time: nowTime(now),
    lat: NaN,
    lng: NaN,
    accuracy: null,
    locSource: 'manual',
    species: '',
    phenology: '',
    habitat: '',
    notes: '',
    observer: localStorage.getItem('pk-observer') ?? '',
    photoIds: [],
  };
}

function setLoc(lat: number, lng: number, src: LocSource, acc: number | null): void {
  if (!draft) return;
  draft.find.lat = lat;
  draft.find.lng = lng;
  draft.find.locSource = src;
  draft.find.accuracy = acc;
}

/** New find from the in-app camera: location is the live GPS position. */
export async function newFromCamera(file: File, host: EditorHost): Promise<void> {
  const find = blankFind();
  draft = { find, isNew: true, photos: [], added: [], removed: [], liveGps: true };
  const fix = bestRecentFix();
  if (fix) setLoc(fix.lat, fix.lng, 'gps', fix.accuracy);
  await addFiles([file], false);
  if (!fix) {
    // no GPS yet: maybe the camera wrote coordinates
    const meta = await readMeta(file);
    if (meta.gps) { setLoc(meta.gps.lat, meta.gps.lng, 'exif', null); draft.liveGps = false; }
  }
  render(host);
}

/** New find from gallery photos: location from EXIF if Android kept it, else ask. */
export async function newFromGallery(files: File[], host: EditorHost): Promise<void> {
  const find = blankFind();
  draft = { find, isNew: true, photos: [], added: [], removed: [], liveGps: false };
  let gpsFound = false;
  let taken: string | null = null;
  for (const f of files) {
    const meta = await readMeta(f);
    if (!gpsFound && meta.gps) { setLoc(meta.gps.lat, meta.gps.lng, 'exif', null); gpsFound = true; }
    if (!taken && meta.takenAt) taken = meta.takenAt;
  }
  if (taken) {
    const d = new Date(taken);
    find.date = todayIso(d);
    find.time = nowTime(d);
  }
  await addFiles(files, false);
  render(host);
  if (!gpsFound) toast('Im Foto steht kein Standort. Bitte Standort wählen.', 4500);
}

export async function openExisting(id: string, host: EditorHost): Promise<void> {
  const find = await db.finds.get(id);
  if (!find) return;
  const photos = (await db.photos.where('findId').equals(id).toArray())
    .sort((a, b) => find.photoIds.indexOf(a.id) - find.photoIds.indexOf(b.id));
  draft = { find: { ...find }, isNew: false, photos, added: [], removed: [], liveGps: false };
  render(host);
}

async function addFiles(files: File[], rerender: boolean, host?: EditorHost): Promise<void> {
  if (!draft) return;
  for (const f of files) {
    try {
      const meta = await readMeta(f);
      const p = await makePhoto(f, draft.find.id, meta.takenAt);
      draft.photos.push(p);
      draft.added.push(p);
    } catch {
      toast(`Foto „${f.name}“ konnte nicht gelesen werden.`);
    }
  }
  if (rerender && host) render(host);
}

function readForm(s: HTMLElement): void {
  if (!draft) return;
  const v = (n: string) => (s.querySelector<HTMLInputElement>(`[name="${n}"]`)?.value ?? '').trim();
  Object.assign(draft.find, {
    species: v('species'),
    date: v('date') || draft.find.date,
    time: v('time'),
    phenology: v('phenology'),
    habitat: v('habitat'),
    notes: v('notes'),
    observer: v('observer'),
  });
}

function locText(f: Find): string {
  if (!Number.isFinite(f.lat)) return '<b class="warn">Noch kein Standort</b>';
  const src = f.locSource === 'gps' ? 'GPS' : f.locSource === 'exif' ? 'aus dem Foto' : 'auf der Karte gesetzt';
  const acc = f.accuracy != null ? ` · ± ${Math.round(f.accuracy)} m` : '';
  const live = draft?.liveGps ? ' · wird genauer' : '';
  return `${esc(fmtCoord(f.lat, f.lng))}<br><span class="muted">${src}${acc}${live}</span>`;
}

async function habitatSuggestions(): Promise<string[]> {
  const all = await db.finds.toArray();
  return [...new Set(all.map((f) => f.habitat).filter(Boolean))].sort().slice(0, 50);
}

async function render(host: EditorHost): Promise<void> {
  if (!draft) return;
  freeUrls();
  const f = draft.find;
  const habitats = await habitatSuggestions();
  const thumbs = draft.photos
    .map((p) => `<div class="thumb"><img src="${blobUrl(p.thumb)}" data-full="${p.id}" alt=""><button type="button" class="x" data-del="${p.id}" aria-label="Foto entfernen">×</button></div>`)
    .join('');
  const s = openSheet(`
    <div class="sheet-head">
      <h2>${draft.isNew ? 'Neuer Fund' : 'Fund bearbeiten'}</h2>
      <button type="button" class="link" data-act="close">Schließen</button>
    </div>
    <div class="thumbs">${thumbs}<button type="button" class="thumb add" data-act="addphoto">+ Foto</button></div>

    <div class="field loc">
      <label>Standort</label>
      <div id="loc-text">${locText(f)}</div>
      <div class="row">
        <button type="button" data-act="gps">Aktueller Standort</button>
        <button type="button" data-act="pin">Auf Karte setzen</button>
      </div>
    </div>

    <label class="field">Art<input name="species" value="${esc(f.species)}" placeholder="z. B. Pulsatilla vulgaris" autocomplete="off" autocapitalize="sentences"></label>
    <div class="row2">
      <label class="field">Datum<input name="date" type="date" value="${esc(f.date)}"></label>
      <label class="field">Uhrzeit<input name="time" type="time" value="${esc(f.time)}"></label>
    </div>
    <label class="field">Phänologie
      <select name="phenology">
        <option value="">–</option>
        ${PHENOLOGY.map((p) => `<option${p === f.phenology ? ' selected' : ''}>${esc(p)}</option>`).join('')}
      </select>
    </label>
    <label class="field">Habitat<input name="habitat" value="${esc(f.habitat)}" list="dl-habitat" placeholder="z. B. Kalkmagerrasen, Südhang"></label>
    <datalist id="dl-habitat">${habitats.map((h) => `<option value="${esc(h)}">`).join('')}</datalist>
    <label class="field">Notiz<textarea name="notes" rows="3" placeholder="Anzahl, Begleitarten, Besonderheiten …">${esc(f.notes)}</textarea></label>
    <label class="field">Bearbeiter:in<input name="observer" value="${esc(f.observer)}" autocomplete="name"></label>

    <div class="actions">
      ${draft.isNew ? '' : '<button type="button" class="danger" data-act="delete">Löschen</button>'}
      <button type="button" class="primary" data-act="save">Speichern</button>
    </div>
  `);

  // live GPS improves the location while the form is open (camera finds only)
  stopGps?.();
  stopGps = null;
  if (draft.liveGps) {
    stopGps = onGps((fix) => {
      if (!draft?.liveGps) return;
      const cur = draft.find.accuracy;
      if (cur == null || !Number.isFinite(draft.find.lat) || fix.accuracy < cur) {
        setLoc(fix.lat, fix.lng, 'gps', fix.accuracy);
        const el = s.querySelector('#loc-text');
        if (el) el.innerHTML = locText(draft.find);
      }
    });
  }

  s.onclick = async (ev) => {
    const t = ev.target as HTMLElement;
    const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    const del = t.dataset.del;
    const full = t.dataset.full;
    if (!draft) return;
    if (del) {
      readForm(s);
      draft.photos = draft.photos.filter((p) => p.id !== del);
      if (draft.added.some((p) => p.id === del)) draft.added = draft.added.filter((p) => p.id !== del);
      else draft.removed.push(del);
      render(host);
      return;
    }
    if (full) {
      const p = draft.photos.find((x) => x.id === full);
      if (p) showFull(p.blob);
      return;
    }
    switch (act) {
      case 'close':
        if (draft.isNew && !confirm('Fund verwerfen?')) return;
        finish();
        break;
      case 'addphoto': {
        readForm(s);
        const inp = document.querySelector<HTMLInputElement>('#in-addphoto')!;
        inp.value = '';
        inp.onchange = async () => {
          if (inp.files?.length) await addFiles([...inp.files], true, host);
        };
        inp.click();
        break;
      }
      case 'gps': {
        readForm(s);
        const fix = bestRecentFix();
        if (!fix) { toast('Noch kein GPS-Signal. Bitte kurz warten.'); return; }
        setLoc(fix.lat, fix.lng, 'gps', fix.accuracy);
        draft.liveGps = true;
        render(host);
        break;
      }
      case 'pin': {
        readForm(s);
        const keep = draft;
        const start = Number.isFinite(keep.find.lat) ? { lat: keep.find.lat, lng: keep.find.lng } : null;
        stopGps?.();
        closeSheet();
        const ll = await host.pickOnMap(start);
        draft = keep;
        if (ll) { setLoc(ll.lat, ll.lng, 'manual', null); draft.liveGps = false; }
        render(host);
        break;
      }
      case 'delete':
        if (!confirm('Diesen Fund mit allen Fotos löschen? Das lässt sich nicht rückgängig machen.')) return;
        await deleteFind(draft.find.id);
        finish();
        await host.refresh();
        toast('Fund gelöscht.');
        break;
      case 'save': {
        readForm(s);
        const fd = draft.find;
        if (!Number.isFinite(fd.lat)) { toast('Bitte zuerst einen Standort wählen.'); return; }
        if (!draft.photos.length && !fd.species) { toast('Bitte ein Foto oder einen Artnamen angeben.'); return; }
        fd.photoIds = draft.photos.map((p) => p.id);
        fd.updatedAt = new Date().toISOString();
        if (fd.observer) localStorage.setItem('pk-observer', fd.observer);
        try {
          await saveFind(fd, draft.added, draft.removed);
        } catch (e) {
          toast('Speichern fehlgeschlagen: ' + ((e as Error).message || 'Speicher voll?'), 6000);
          return;
        }
        const { lat, lng } = fd;
        const wasNew = draft.isNew;
        finish();
        await host.refresh();
        host.flyTo(lat, lng);
        toast(wasNew ? 'Fund gespeichert.' : 'Änderungen gespeichert.');
        break;
      }
    }
  };
}

function finish(): void {
  stopGps?.();
  stopGps = null;
  draft = null;
  freeUrls();
  closeSheet();
}

function showFull(b: Blob): void {
  const url = URL.createObjectURL(b);
  const o = document.createElement('div');
  o.className = 'viewer';
  o.innerHTML = `<img src="${url}" alt="">`;
  o.onclick = () => { o.remove(); URL.revokeObjectURL(url); };
  document.body.appendChild(o);
}
