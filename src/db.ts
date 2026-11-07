import Dexie, { type Table } from 'dexie';

/** Where the coordinates of a find came from. */
export type LocSource = 'gps' | 'exif' | 'manual';

export interface Find {
  id: string;
  createdAt: string;   // ISO
  updatedAt: string;   // ISO
  date: string;        // YYYY-MM-DD, day of the observation
  time: string;        // HH:MM or ''
  lat: number;
  lng: number;
  accuracy: number | null; // metres, null if unknown (manual / exif)
  locSource: LocSource;
  species: string;
  phenology: string;
  habitat: string;
  notes: string;
  observer: string;
  photoIds: string[];
}

export interface Photo {
  id: string;
  findId: string;
  blob: Blob;    // compressed JPEG, long side max 2048 px
  thumb: Blob;   // long side 320 px
  takenAt: string | null; // ISO from EXIF if present
  name: string;  // original file name
}

class PlantDb extends Dexie {
  finds!: Table<Find, string>;
  photos!: Table<Photo, string>;
  constructor() {
    super('pflanzenkarte');
    this.version(1).stores({
      finds: 'id, date, species, updatedAt',
      photos: 'id, findId',
    });
  }
}

export const db = new PlantDb();

export function newId(): string {
  return crypto.randomUUID();
}

export async function saveFind(find: Find, photos: Photo[], removedPhotoIds: string[] = []): Promise<void> {
  await db.transaction('rw', db.finds, db.photos, async () => {
    if (removedPhotoIds.length) await db.photos.bulkDelete(removedPhotoIds);
    if (photos.length) await db.photos.bulkPut(photos);
    await db.finds.put(find);
  });
}

export async function deleteFind(id: string): Promise<void> {
  await db.transaction('rw', db.finds, db.photos, async () => {
    await db.photos.where('findId').equals(id).delete();
    await db.finds.delete(id);
  });
}

export async function allFinds(): Promise<Find[]> {
  const list = await db.finds.toArray();
  return list.sort((a, b) => (b.date + b.time + b.createdAt).localeCompare(a.date + a.time + a.createdAt));
}

/** Ask the browser not to evict our data when storage runs low. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
