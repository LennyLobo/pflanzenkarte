import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { allFinds, db, requestPersistence } from './db';
import { newFromCamera, newFromGallery, openExisting, type EditorHost } from './edit';
import { lastFix, onGps, startGps } from './geo';
import { showList } from './list';
import { PlantMap } from './map';
import { $, toast } from './ui';

registerSW({ immediate: true });

const pm = new PlantMap($('#map'));
let followFirstFix = !pm.hasSavedView();

const host: EditorHost = {
  async refresh() {
    const finds = await allFinds();
    pm.showFinds(finds);
    $('#count').textContent = finds.length === 1 ? '1 Fund' : `${finds.length} Funde`;
  },
  pickOnMap: pickOnMap,
  flyTo: (lat, lng) => pm.flyTo(lat, lng),
};

pm.onFindClick = (id) => openExisting(id, host);

// GPS runs while the app is open so a fix is ready when a photo is taken
startGps((msg) => toast(msg, 5000));
onGps((f) => {
  pm.showMe(f);
  if (followFirstFix) { followFirstFix = false; pm.flyTo(f.lat, f.lng, 17); }
});

$('#btn-locate').onclick = () => {
  const f = lastFix();
  if (f) pm.flyTo(f.lat, f.lng, 18);
  else toast('Noch kein GPS-Signal.');
};

$('#btn-layer').onclick = () => {
  const next = pm.baseName === 'luftbild' ? 'karte' : 'luftbild';
  pm.setBase(next);
  $('#btn-layer').textContent = next === 'luftbild' ? 'Karte' : 'Luftbild';
};

const inCamera = $('#in-camera') as HTMLInputElement;
const inGallery = $('#in-gallery') as HTMLInputElement;

$('#btn-camera').onclick = () => { inCamera.value = ''; inCamera.click(); };
$('#btn-gallery').onclick = () => { inGallery.value = ''; inGallery.click(); };
inCamera.onchange = () => { if (inCamera.files?.[0]) newFromCamera(inCamera.files[0], host); };
inGallery.onchange = () => { if (inGallery.files?.length) newFromGallery([...inGallery.files], host); };

$('#btn-list').onclick = () => showList({ open: (id) => openExisting(id, host) });

/** Crosshair mode: the user moves the map under a fixed cross. */
function pickOnMap(start: { lat: number; lng: number } | null): Promise<{ lat: number; lng: number } | null> {
  const s = start ?? lastFix();
  if (s) pm.map.setView([s.lat, s.lng], Math.max(pm.map.getZoom(), 18));
  document.body.classList.add('picking');
  $('#pinbar').hidden = false;
  $('#crosshair').hidden = false;
  return new Promise((resolve) => {
    const done = (v: { lat: number; lng: number } | null) => {
      document.body.classList.remove('picking');
      $('#pinbar').hidden = true;
      $('#crosshair').hidden = true;
      resolve(v);
    };
    $('#pin-ok').onclick = () => done(pm.center());
    $('#pin-cancel').onclick = () => done(null);
  });
}

(async () => {
  await db.open();
  await host.refresh();
  const persisted = await requestPersistence();
  if (!persisted && (await db.finds.count()) > 0) {
    console.info('Storage not persisted; browser may evict data under pressure.');
  }
})();
