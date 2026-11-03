// @vitest-environment node
import initSqlJs from 'sql.js';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createBackend, restoreFiles } from '../src/demo/backend.js';
import { seedDemo } from '../src/demo/seed.js';
import { Router } from '../src/demo/shims/express.js';
import { wrapDatabase } from '../src/demo/sqlite.js';

const TODAY = '2026-11-03';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const catalog = [
  {
    code: '1',
    name: 'Foaming Cleanser',
    brand: 'CeraVe',
    category: 'cleanser',
    ingredients: 'Water, Glycerin',
    image_url: null,
    search_text: 'cerave foaming cleanser',
  },
];

let SQL;

beforeAll(async () => {
  SQL = await initSqlJs();
});

describe('the better-sqlite3 stand-in', () => {
  let db;

  beforeEach(() => {
    db = wrapDatabase(new SQL.Database());
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT, size INTEGER)');
  });

  it('runs inserts and reports the new id and change count', () => {
    const insert = db.prepare('INSERT INTO t (name, size) VALUES (@name, @size)');

    expect(insert.run({ name: 'a', size: 1 })).toEqual({ changes: 1, lastInsertRowid: 1 });
    expect(insert.run({ name: 'b', size: undefined }).lastInsertRowid).toBe(2);
  });

  it('gets one row, all rows, or plucked values', () => {
    db.exec("INSERT INTO t (name, size) VALUES ('a', 1), ('b', 2)");

    expect(db.prepare('SELECT * FROM t WHERE id = ?').get(2)).toEqual({ id: 2, name: 'b', size: 2 });
    expect(db.prepare('SELECT * FROM t WHERE id = ?').get(9)).toBeUndefined();
    expect(db.prepare('SELECT name FROM t ORDER BY id').pluck().all()).toEqual(['a', 'b']);
    expect(db.prepare('SELECT name FROM t WHERE size > ? AND size < ?').pluck().all(0, 3)).toEqual([
      'a',
      'b',
    ]);
    expect(db.prepare('SELECT name FROM t WHERE name LIKE ?').pluck().all(['%b%'])).toEqual(['b']);
  });

  it('can reuse a statement many times', () => {
    const select = db.prepare('SELECT COUNT(*) FROM t').pluck();
    const insert = db.prepare('INSERT INTO t (name) VALUES (?)');

    for (let i = 0; i < 3; i += 1) insert.run(`n${i}`);

    expect(select.get()).toBe(3);
  });

  it('rolls back a failed transaction', () => {
    const insert = db.prepare('INSERT INTO t (name) VALUES (?)');
    const both = db.transaction(() => {
      insert.run('kept?');
      throw new Error('stop');
    });

    expect(() => both()).toThrow('stop');
    expect(db.prepare('SELECT COUNT(*) FROM t').pluck().get()).toBe(0);
  });

  it('tags foreign key failures like better-sqlite3', () => {
    const sqlDb = new SQL.Database();
    sqlDb.exec('PRAGMA foreign_keys = ON');
    const fk = wrapDatabase(sqlDb);
    fk.exec('CREATE TABLE a (id INTEGER PRIMARY KEY); CREATE TABLE b (a_id INTEGER REFERENCES a (id))');
    fk.exec('INSERT INTO a (id) VALUES (1); INSERT INTO b (a_id) VALUES (1)');

    let error;
    try {
      fk.prepare('DELETE FROM a WHERE id = 1').run();
    } catch (err) {
      error = err;
    }

    expect(error.code).toBe('SQLITE_CONSTRAINT_FOREIGNKEY');
  });
});

describe('the Express stand-in', () => {
  function response() {
    return {
      statusCode: 200,
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
    };
  }

  it('matches methods and paths, and decodes parameters', async () => {
    const router = Router();
    router.get('/:id/steps/:stepId', (req, res) => res.json(req.params));
    router.put('/:id', (req, res) => res.json({ put: req.params.id }));

    const res = response();
    await router.handle({ method: 'GET' }, res, '/5/steps/a%20b');
    expect(res.body).toEqual({ id: '5', stepId: 'a b' });

    expect(await router.handle({ method: 'DELETE' }, response(), '/5')).toBe(false);
    expect(await router.handle({ method: 'GET' }, response(), '/5/other')).toBe(false);
  });

  it('runs param handlers first and lets them stop the request', async () => {
    const router = Router();
    let reached = false;
    router.param('id', (req, res, next, id) => (id === '1' ? next() : res.status(404).json({})));
    router.get('/:id', (req, res) => {
      reached = true;
      res.json({});
    });

    const missing = response();
    await router.handle({ method: 'GET' }, missing, '/2');
    expect(missing.statusCode).toBe(404);
    expect(reached).toBe(false);

    await router.handle({ method: 'GET' }, response(), '/1');
    expect(reached).toBe(true);
  });

  it('prefers the route registered first, as Express does', async () => {
    const router = Router();
    router.get('/calendar', (req, res) => res.json('calendar'));
    router.get('/:date', (req, res) => res.json('date'));

    const res = response();
    await router.handle({ method: 'GET' }, res, '/calendar');

    expect(res.body).toBe('calendar');
  });
});

describe('the demo backend', () => {
  let backend;

  beforeEach(() => {
    restoreFiles([]);
    backend = createBackend(new SQL.Database(), { catalog });
  });

  it('serves the real API', async () => {
    const created = await backend.request('POST', '/api/products', { name: 'Toner' });
    expect(created.status).toBe(201);

    const list = await backend.request('GET', '/api/products');
    expect(list.body.map((product) => product.name)).toEqual(['Toner']);
  });

  it('answers unknown paths and bad input like the server', async () => {
    expect((await backend.request('GET', '/api/nope')).status).toBe(404);
    expect((await backend.request('POST', '/api/products', {})).status).toBe(400);
    expect((await backend.request('GET', '/api/checklist?date=soon')).status).toBe(400);
  });

  it('searches the bundled catalog', async () => {
    const res = await backend.request('GET', '/api/catalog/search?q=cerave');

    expect(res.body.total).toBe(1);
    expect(res.body.results[0].name).toBe('Foaming Cleanser');
  });

  it('stores pictures in memory with the real upload checks', async () => {
    const { body: product } = await backend.request('POST', '/api/products', { name: 'Toner' });

    const res = await backend.request('PUT', `/api/products/${product.id}/image`, PNG);
    expect(res.body.image_url).toMatch(/^\/api\/uploads\/[\w-]+\.png$/);
    expect(backend.files.size).toBe(1);

    const rejected = await backend.request(
      'PUT',
      `/api/products/${product.id}/image`,
      Buffer.from('<svg/>'),
    );
    expect(rejected.status).toBe(415);
  });

  it('keeps products in a routine undeletable after being saved and restored', async () => {
    const { body: product } = await backend.request('POST', '/api/products', { name: 'Toner' });
    const { body: routine } = await backend.request('POST', '/api/routines', { name: 'AM', period: 'AM' });
    await backend.request('POST', `/api/routines/${routine.id}/steps`, { product_id: product.id });

    const saved = backend.save();
    expect((await backend.request('DELETE', `/api/products/${product.id}`)).status).toBe(409);

    restoreFiles(saved.files);
    const restored = createBackend(new SQL.Database(saved.database), { catalog });
    expect((await restored.request('DELETE', `/api/products/${product.id}`)).status).toBe(409);
    expect((await restored.request('GET', '/api/products')).body).toHaveLength(1);
  });

  it('restores uploaded pictures with the database', async () => {
    const { body: product } = await backend.request('POST', '/api/products', { name: 'Toner' });
    await backend.request('PUT', `/api/products/${product.id}/image`, PNG);

    const saved = backend.save();
    restoreFiles([]);
    restoreFiles(saved.files);

    expect([...backend.files.values()][0]).toEqual(PNG);
  });

  it('does not load the catalog twice into a restored database', async () => {
    const restored = createBackend(new SQL.Database(backend.save().database), { catalog });

    expect((await restored.request('GET', '/api/catalog/search?q=cerave')).body.total).toBe(1);
  });
});

describe('seedDemo', () => {
  let backend;

  beforeAll(async () => {
    restoreFiles([]);
    backend = createBackend(new SQL.Database(), { catalog });
    await seedDemo(backend.request, { pictures: false, today: TODAY });
  });

  it('adds the sample products and routines', async () => {
    expect((await backend.request('GET', '/api/products')).body).toHaveLength(10);
    expect((await backend.request('GET', '/api/routines')).body.map((r) => r.name)).toEqual([
      'Morning',
      'Exfoliating night',
      'Retinol night',
      'Weekend experiment',
    ]);
  });

  it('shows the conflict checker at work', async () => {
    const routines = (await backend.request('GET', '/api/routines')).body;

    expect(routines.flatMap((routine) => routine.conflicts.map((conflict) => conflict.id))).toEqual([
      'retinoid-vitamin-c',
    ]);
  });

  it('starts today part done, with a streak', async () => {
    const { body } = await backend.request('GET', `/api/checklist?date=${TODAY}&today=1`);

    expect(body.steps_done).toBe(4);
    expect(body.day_complete).toBe(false);
    expect(body.streak).toBeGreaterThan(0);
  });

  it('fills the last month with ratings and finished days', async () => {
    const { body } = await backend.request('GET', `/api/logs/history?from=2026-10-05&to=${TODAY}`);

    expect(body.filter((day) => day.skin_rating).length).toBeGreaterThan(10);
    expect(body.filter((day) => day.complete).length).toBeGreaterThan(15);
  });

  it('dates expiry relative to today', async () => {
    const products = (await backend.request('GET', '/api/products')).body;

    expect(products.find((product) => product.name.includes('Relief Sun')).expires_on).toBe(
      '2026-11-15',
    );
    expect(products.find((product) => product.name.includes('Heartleaf')).expires_on).toBe(
      '2026-10-21',
    );
  });
});
