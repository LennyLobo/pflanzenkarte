export function $(sel: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

let toastTimer = 0;
export function toast(msg: string, ms = 3000): void {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (t.hidden = true), ms);
}

export function openSheet(html: string): HTMLElement {
  const s = $('#sheet');
  s.innerHTML = html;
  s.hidden = false;
  s.scrollTop = 0;
  document.body.classList.add('sheet-open');
  return s;
}

export function closeSheet(): void {
  const s = $('#sheet');
  s.hidden = true;
  s.innerHTML = '';
  document.body.classList.remove('sheet-open');
}

export function todayIso(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function nowTime(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}.${m}.${y}` : iso;
}

/** Object URLs for thumbnails, freed when the sheet is redrawn. */
const urls: string[] = [];
export function blobUrl(b: Blob): string {
  const u = URL.createObjectURL(b);
  urls.push(u);
  return u;
}
export function freeUrls(): void {
  while (urls.length) URL.revokeObjectURL(urls.pop()!);
}
