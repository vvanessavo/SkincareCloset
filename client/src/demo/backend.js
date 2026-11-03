// Runs the real server routers in the browser, against SQLite compiled to WebAssembly.
import { Buffer } from 'buffer';
import { replaceCatalog } from '../../../server/src/catalog.js';
import { catalogRouter } from '../../../server/src/routes/catalog.js';
import { checklistRouter } from '../../../server/src/routes/checklist.js';
import { logsRouter } from '../../../server/src/routes/logs.js';
import { productsRouter } from '../../../server/src/routes/products.js';
import { routinesRouter } from '../../../server/src/routes/routines.js';
import schema from '../../../server/src/schema.sql?raw';
import { files } from './shims/fs.js';
import { wrapDatabase } from './sqlite.js';

globalThis.Buffer ??= Buffer;

export const UPLOADS_DIR = '/uploads';

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    finished: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      this.finished = true;
      return this;
    },
    end() {
      this.finished = true;
      return this;
    },
  };
}

// sqlDb is a sql.js Database, either new or restored from a save.
export function createBackend(sqlDb, { catalog = [] } = {}) {
  sqlDb.exec(schema);
  // sql.js resets pragmas when a database is exported, so this runs after every save too.
  const enableForeignKeys = () => sqlDb.exec('PRAGMA foreign_keys = ON');
  enableForeignKeys();

  const db = wrapDatabase(sqlDb);
  if (catalog.length && !db.prepare('SELECT COUNT(*) FROM catalog_products').pluck().get()) {
    replaceCatalog(db, catalog);
  }

  const mounts = [
    ['/api/catalog', catalogRouter(db)],
    ['/api/checklist', checklistRouter(db)],
    ['/api/logs', logsRouter(db)],
    ['/api/products', productsRouter(db, UPLOADS_DIR)],
    ['/api/routines', routinesRouter(db)],
  ];

  async function request(method, url, body) {
    const { pathname, searchParams } = new URL(url, 'http://demo');
    const res = createResponse();
    const mount = mounts.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));

    try {
      const handled =
        mount &&
        (await mount[1].handle(
          { method, query: Object.fromEntries(searchParams), body },
          res,
          pathname.slice(mount[0].length) || '/',
        ));
      if (!handled) res.status(404).json({ error: 'Not found' });
    } catch (err) {
      // Mirrors the error handler in server/src/app.js.
      const status = err.status ?? 500;
      if (status >= 500) console.error(err);
      res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message });
    }

    return { status: res.statusCode, body: res.body };
  }

  function save() {
    const data = sqlDb.export();
    enableForeignKeys();
    return {
      database: data,
      files: [...files].map(([path, contents]) => [path, new Uint8Array(contents)]),
    };
  }

  return { request, save, files };
}

export function restoreFiles(saved) {
  files.clear();
  for (const [path, contents] of saved) files.set(path, Buffer.from(contents));
}
