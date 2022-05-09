import Dexie, { Table } from 'dexie';

export interface Song {
  id: string;
  blob: Blob;
  lastEditedUtc: number;
  title: string;
  artist?: string;
  album?: string;
  genre?: string;
  year?: string;
  cover?: Blob;
}

export class SongsDB extends Dexie {
  songs!: Table<Song>;

  constructor() {
    super('songsDB');
    this.version(1).stores({
      songs: '&id, title, album',
    });
  }
}

export const db = new SongsDB();
