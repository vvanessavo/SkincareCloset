import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { gunzip, readCatalogRows, replaceCatalog } from './catalog.js';
import { databasePath, openDatabase } from './db.js';

const EXPORT_URL =
  'https://static.openbeautyfacts.org/data/en.openbeautyfacts.org.products.csv.gz';

async function openExport(path) {
  if (path) return createReadStream(path);

  const res = await fetch(EXPORT_URL, {
    headers: { 'User-Agent': 'SkincareTracker/1.0 (personal project)' },
  });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  return Readable.fromWeb(res.body);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rows = await readCatalogRows(gunzip(await openExport(process.argv[2])));
  const count = replaceCatalog(openDatabase(databasePath), rows);
  console.log(`Imported ${count} Open Beauty Facts products`);
}
