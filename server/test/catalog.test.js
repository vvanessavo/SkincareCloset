import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { gzipSync } from 'node:zlib';
import request from 'supertest';
import { createApp } from '../src/app.js';
import {
  cleanIngredients,
  detectCategory,
  gunzip,
  parseCatalogRow,
  readCatalogRows,
  replaceCatalog,
} from '../src/catalog.js';
import { openDatabase } from '../src/db.js';
import { MAX_IMAGE_BYTES } from '../src/images.js';

const IMAGE_URL = 'https://images.openbeautyfacts.org/images/products/880/front_en.3.400.jpg';
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);

const HEADER = 'code\turl\tproduct_name\tbrands\tcategories_en\tingredients_text\timage_url';

function exportLine(...values) {
  return values.join('\t');
}

describe('detectCategory', () => {
  it('maps skincare products by keyword', () => {
    const expected = {
      'Aloe Soothing Sun Cream': 'sunscreen',
      'Hydra Gel SPF 50': 'sunscreen',
      'Hydrium Moisturizing Cleanser': 'cleanser',
      'Heartleaf 77 Toner': 'toner',
      'Snail Mucin Essence': 'essence',
      'Vitamin C Serum': 'serum',
      'Sheet Mask': 'mask',
      'Revitalift Eye Cream': 'eye cream',
      'Daily Moisturising Lotion': 'moisturizer',
      'Crème de jour Face Cream': 'moisturizer',
    };

    for (const [name, category] of Object.entries(expected)) {
      assert.equal(detectCategory(name), category, name);
    }
  });

  it('leaves other products without a category', () => {
    for (const name of ['Whitening Toothpaste', 'Repair Hair Mask', 'Lip Mask', 'Mystery Item']) {
      assert.equal(detectCategory(name), null, name);
    }
  });
});

describe('cleanIngredients', () => {
  it('removes leading labels', () => {
    assert.equal(cleanIngredients('Ingredients: Aqua, Glycerin'), 'Aqua, Glycerin');
    assert.equal(cleanIngredients('INCI: Aqua'), 'Aqua');
    assert.equal(cleanIngredients('Ingredients/ Ingrédients: AQUA, GLYCERIN'), 'AQUA, GLYCERIN');
  });

  it('leaves plain lists alone', () => {
    assert.equal(cleanIngredients('Water, Glycerin'), 'Water, Glycerin');
  });
});

describe('parseCatalogRow', () => {
  it('needs a code and a name', () => {
    assert.equal(parseCatalogRow({ code: '1', product_name: ' ' }), null);
    assert.equal(parseCatalogRow({ code: '', product_name: 'Toner' }), null);
  });

  it('uses the first brand and makes search text accent-free', () => {
    const row = parseCatalogRow({ code: '1', product_name: 'Crème', brands: "L'Oréal, Garnier" });

    assert.equal(row.brand, "L'Oréal");
    assert.equal(row.search_text, "l'oreal, garnier creme");
  });

  it('skips names that do not identify a product', () => {
    assert.equal(parseCatalogRow({ code: '1', product_name: '3606000537750' }), null);
    assert.equal(parseCatalogRow({ code: '2', product_name: 'cerave', brands: 'CeraVe' }), null);
  });

  it('searches every listed brand', () => {
    const row = parseCatalogRow({
      code: '1',
      product_name: 'Extraordinary Oil',
      brands: "L'Oréal, Elvive",
    });

    assert.equal(row.brand, "L'Oréal");
    assert.match(row.search_text, /elvive/);
  });

  it('only keeps pictures from the Open Beauty Facts image host', () => {
    const row = (image_url) => parseCatalogRow({ code: '1', product_name: 'A', image_url });

    assert.equal(row(IMAGE_URL).image_url, IMAGE_URL);
    assert.equal(row('https://example.com/a.jpg').image_url, null);
    assert.equal(row('http://169.254.169.254/a.jpg').image_url, null);
    assert.equal(row('').image_url, null);
  });
});

describe('readCatalogRows', () => {
  function gzipped(lines) {
    return gunzip(Readable.from(gzipSync(lines.join('\n'))));
  }

  it('parses a gzipped export and skips unnamed products', async () => {
    const rows = await readCatalogRows(
      gzipped([
        HEADER,
        exportLine('880', 'u', 'Aloe Sun Cream', 'COSRX', '', 'Water, Glycerin', IMAGE_URL),
        exportLine('881', 'u', '', 'COSRX', '', '', ''),
      ]),
    );

    assert.equal(rows.length, 1);
    assert.equal(rows[0].brand, 'COSRX');
    assert.equal(rows[0].category, 'sunscreen');
    assert.equal(rows[0].ingredients, 'Water, Glycerin');
  });

  it('rejects an export without the expected columns', async () => {
    await assert.rejects(readCatalogRows(gzipped(['code\tname'])), /missing the product_name/);
  });
});

describe('replaceCatalog', () => {
  const row = (code) => parseCatalogRow({ code, product_name: 'Toner' });

  it('replaces the old catalog', () => {
    const db = openDatabase(':memory:');
    replaceCatalog(db, [row('1'), row('2')]);

    assert.equal(replaceCatalog(db, [row('3')]), 1);
  });

  it('keeps the old catalog when an export is empty', () => {
    const db = openDatabase(':memory:');
    replaceCatalog(db, [row('1')]);

    assert.throws(() => replaceCatalog(db, []), /no usable products/);
    assert.equal(db.prepare('SELECT COUNT(*) FROM catalog_products').pluck().get(), 1);
  });
});

describe('/api/catalog/search', () => {
  let api;

  beforeEach(() => {
    const db = openDatabase(':memory:');
    api = request(createApp(db));
    replaceCatalog(db, [
      parseCatalogRow({ code: '1', product_name: 'cosrx cream', brands: 'Cosrx' }),
      parseCatalogRow({
        code: '2',
        product_name: 'Aloe Soothing Sun Cream',
        brands: 'COSRX',
        ingredients_text: 'Water, Glycerin',
        image_url: IMAGE_URL,
      }),
      parseCatalogRow({ code: '3', product_name: 'Crème Hydratante', brands: "L'Oréal" }),
      parseCatalogRow({ code: '4', product_name: '100% Pure Oil', brands: 'Acme' }),
    ]);
  });

  async function search(q) {
    const res = await api.get('/api/catalog/search').query({ q }).expect(200);
    return res.body;
  }

  it('matches brand and name terms in any order', async () => {
    const { results } = await search('aloe cosrx');

    assert.deepEqual(
      results.map((item) => item.code),
      ['2'],
    );
  });

  it('puts the most complete entries first', async () => {
    const { results } = await search('cosrx');

    assert.deepEqual(
      results.map((item) => item.code),
      ['2', '1'],
    );
  });

  it('ignores case and accents', async () => {
    const { results } = await search('LOREAL'.replace('LO', "L'O"));
    const { results: accented } = await search('crème');

    assert.equal(results[0].code, '3');
    assert.equal(accented[0].code, '3');
  });

  it('treats wildcards as plain text', async () => {
    assert.equal((await search('%%')).results.length, 0);
    assert.equal((await search('____')).results.length, 0);
    assert.deepEqual(
      (await search('100%')).results.map((item) => item.code),
      ['4'],
    );
  });

  it('needs at least two characters', async () => {
    assert.deepEqual(await search('c'), { total: 4, results: [] });
    assert.deepEqual(await search('   '), { total: 4, results: [] });
  });

  it('reports the catalog size so an empty one can be explained', async () => {
    const empty = request(createApp(openDatabase(':memory:')));

    const res = await empty.get('/api/catalog/search').query({ q: 'cosrx' }).expect(200);

    assert.deepEqual(res.body, { total: 0, results: [] });
  });

  it('does not expose search text', async () => {
    const { results } = await search('aloe');

    assert.deepEqual(Object.keys(results[0]).sort(), [
      'brand',
      'category',
      'code',
      'image_url',
      'ingredients',
      'name',
    ]);
  });
});

describe('adding a product from the catalog', () => {
  let dir;
  let db;
  let api;
  let product;

  function copy(id, code) {
    return api.put(`/api/products/${id}/image/from-catalog`).send({ code });
  }

  function stubDownload(body, status = 200) {
    mock.method(globalThis, 'fetch', async () => new Response(body, { status }));
  }

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'skincare-catalog-'));
    db = openDatabase(':memory:');
    api = request(createApp(db, dir));
    replaceCatalog(db, [
      parseCatalogRow({ code: '880', product_name: 'Toner', image_url: IMAGE_URL }),
      parseCatalogRow({ code: '881', product_name: 'No picture' }),
    ]);
    ({ body: product } = await api
      .post('/api/products')
      .send({ name: 'Toner', catalog_code: '880' }));
  });

  afterEach(() => {
    mock.restoreAll();
    rmSync(dir, { recursive: true, force: true });
  });

  it('keeps the source code, including through edits', async () => {
    assert.equal(product.catalog_code, '880');

    const res = await api.put(`/api/products/${product.id}`).send({ name: 'Renamed' }).expect(200);

    assert.equal(res.body.catalog_code, '880');
  });

  it('stores a local copy of the picture', async () => {
    stubDownload(jpeg);

    const res = await copy(product.id, '880').expect(200);

    assert.equal(globalThis.fetch.mock.calls[0].arguments[0], IMAGE_URL);
    assert.match(res.body.image_url, /^\/api\/uploads\/[\w-]+\.jpg$/);
    assert.equal(readdirSync(dir).length, 1);
  });

  it('only downloads addresses from the catalog', async () => {
    stubDownload(jpeg);

    await api
      .put(`/api/products/${product.id}/image/from-catalog`)
      .send({ code: '880', url: 'http://169.254.169.254/' })
      .expect(200);
    await copy(product.id, 'http://169.254.169.254/').expect(404);
    await copy(product.id, '881').expect(404);

    assert.equal(globalThis.fetch.mock.calls.length, 1);
    assert.equal(globalThis.fetch.mock.calls[0].arguments[0], IMAGE_URL);
  });

  it('rejects a download that is not an image', async () => {
    stubDownload('<svg/>');

    await copy(product.id, '880').expect(502);

    assert.deepEqual(readdirSync(dir), []);
  });

  it('reports a failed download without changing the product', async () => {
    stubDownload('nope', 503);

    await copy(product.id, '880').expect(502);

    const res = await api.get(`/api/products/${product.id}`);
    assert.equal(res.body.image_url, null);
  });

  it('stops reading a download over the size limit', async () => {
    stubDownload(Buffer.concat([jpeg, Buffer.alloc(MAX_IMAGE_BYTES)]));

    await copy(product.id, '880').expect(502);

    assert.deepEqual(readdirSync(dir), []);
  });

  it('returns 404 for an unknown product', async () => {
    await copy(999, '880').expect(404);
  });
});
