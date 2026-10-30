import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkConflicts, findActives } from '../src/conflicts.js';

const WATER = ['water', 'glycerin', 'butylene glycol', 'niacinamide', 'panthenol'];

function product(id, ingredients) {
  return { id, name: `Product ${id}`, ingredients };
}

function conflictIds(products) {
  return checkConflicts(products).conflicts.map((conflict) => conflict.id);
}

// A full-length label with the ingredient at a given position.
function labelWith(ingredient, position, length) {
  const label = Array.from({ length }, (_, index) => `filler ${index}`);
  label[position - 1] = ingredient;
  return label;
}

describe('findActives', () => {
  const cases = {
    retinoid: [
      'retinol',
      'Retinol 0.1%',
      'RETINOL',
      'retinal',
      'retinaldehyde',
      'hydroxypinacolone retinoate',
      'granactive retinoid',
      'tretinoin',
      'adapalene',
      'vitamin a',
    ],
    vitaminC: [
      'ascorbic acid',
      'L-Ascorbic Acid',
      '3-O-ethyl ascorbic acid',
      'sodium ascorbyl phosphate',
      'magnesium ascorbyl phosphate',
      'ascorbyl glucoside',
      'ascorbyl tetraisopalmitate',
      'tetrahexyldecyl ascorbate',
      'vitamin c',
      'Vitamin C (ascorbic acid)',
    ],
    aha: ['glycolic acid', 'Lactic Acid', 'mandelic acid', 'AHA', 'alpha hydroxy acid'],
    bha: ['salicylic acid', 'Salicylic Acid 2%', 'betaine salicylate', 'capryloyl salicylic acid'],
  };

  for (const [active, names] of Object.entries(cases)) {
    for (const name of names) {
      it(`finds ${active} in "${name}"`, () => {
        assert.equal(findActives([name])[active], name);
      });
    }
  }

  const lookalikes = [
    // Sunscreen filters and emollients, not exfoliants.
    'ethylhexyl salicylate',
    'homosalate',
    'butyloctyl salicylate',
    'tridecyl salicylate',
    // The preservative butylated hydroxyanisole.
    'BHA',
    'butylated hydroxyanisole',
    // pH adjusters and humectants.
    'citric acid',
    'malic acid',
    'sodium lactate',
    'lactobacillus ferment',
    'galactomyces ferment filtrate',
    'polyglycolic',
    // Trace antioxidants and weak esters.
    'ascorbyl palmitate',
    'ascorbyl palmitate (vitamin c derivate)',
    'sodium ascorbate',
    'retinyl palmitate',
    'retinyl palmitate (vitamin a)',
    'retinyl acetate',
    'vitamin a acetate',
    // Unrelated.
    'water',
    'niacinamide',
    'hyaluronic acid',
    'vitamin e',
    'bakuchiol',
  ];

  for (const name of lookalikes) {
    it(`finds nothing in "${name}"`, () => {
      assert.deepEqual(findActives([name]), {});
    });
  }

  it('reports the first matching ingredient', () => {
    assert.equal(findActives(['glycolic acid', 'lactic acid']).aha, 'glycolic acid');
  });

  it('handles an empty list', () => {
    assert.deepEqual(findActives([]), {});
  });
});

describe('trace amounts', () => {
  it('ignores acids and vitamin C in the last third of a full list', () => {
    assert.deepEqual(findActives(labelWith('salicylic acid', 34, 35)), {});
    assert.deepEqual(findActives(labelWith('lactic acid', 20, 24)), {});
    assert.deepEqual(findActives(labelWith('ascorbic acid', 38, 38)), {});
  });

  it('counts them earlier in the list', () => {
    assert.ok(findActives(labelWith('glycolic acid', 2, 34)).aha);
    assert.ok(findActives(labelWith('salicylic acid', 4, 9)).bha);
    assert.ok(findActives(labelWith('ascorbic acid', 3, 47)).vitaminC);
  });

  it('counts the last place before the cut-off', () => {
    assert.ok(findActives(labelWith('lactic acid', 20, 30)).aha);
    assert.equal(findActives(labelWith('lactic acid', 21, 30)).aha, undefined);
  });

  it('never treats a retinoid as a trace', () => {
    assert.ok(findActives(labelWith('retinol', 39, 40)).retinoid);
    assert.ok(findActives(labelWith('tretinoin', 5, 5)).retinoid);
  });

  it('keeps every position in a short key-ingredient list', () => {
    assert.ok(findActives(['water', 'niacinamide', 'salicylic acid']).bha);
    assert.ok(findActives(['a', 'b', 'c', 'd', 'glycolic acid']).aha);
  });
});

describe('checkConflicts', () => {
  it('flags retinoid with vitamin C', () => {
    assert.deepEqual(
      conflictIds([product(1, ['retinol']), product(2, ['ascorbic acid'])]),
      ['retinoid-vitamin-c'],
    );
  });

  it('flags retinoid with an AHA', () => {
    assert.deepEqual(
      conflictIds([product(1, ['retinol']), product(2, ['glycolic acid'])]),
      ['retinoid-aha'],
    );
  });

  it('flags retinoid with a BHA', () => {
    assert.deepEqual(
      conflictIds([product(1, ['tretinoin']), product(2, ['salicylic acid'])]),
      ['retinoid-bha'],
    );
  });

  it('flags several conflicts from one product', () => {
    assert.deepEqual(
      conflictIds([product(1, ['retinol']), product(2, ['glycolic acid', 'salicylic acid'])]),
      ['retinoid-aha', 'retinoid-bha'],
    );
  });

  it('allows combinations without a retinoid', () => {
    assert.deepEqual(
      conflictIds([
        product(1, ['ascorbic acid']),
        product(2, ['glycolic acid']),
        product(3, ['salicylic acid']),
        product(4, WATER),
      ]),
      [],
    );
  });

  it('allows a retinoid with gentle products', () => {
    assert.deepEqual(conflictIds([product(1, ['retinol']), product(2, WATER)]), []);
  });

  it('does not flag sunscreen filters with a retinoid', () => {
    assert.deepEqual(
      conflictIds([product(1, ['retinol']), product(2, ['homosalate', 'ethylhexyl salicylate'])]),
      [],
    );
  });

  it('does not flag one formula containing both actives', () => {
    assert.deepEqual(conflictIds([product(1, ['retinol', 'ascorbic acid'])]), []);
  });

  it('does not flag the same product used twice', () => {
    const both = product(1, ['retinol', 'ascorbic acid']);

    assert.deepEqual(conflictIds([both, both]), []);
  });

  it('flags a combined formula against another product', () => {
    assert.deepEqual(
      conflictIds([product(1, ['retinol', 'ascorbic acid']), product(2, ['ascorbic acid'])]),
      ['retinoid-vitamin-c'],
    );
  });

  it('names the products and the ingredient behind a conflict', () => {
    const [conflict] = checkConflicts([
      product(1, ['Retinol 0.1%']),
      product(2, WATER),
      product(3, ['Ascorbic Acid']),
    ]).conflicts;

    assert.equal(conflict.title, 'Retinoid + vitamin C');
    assert.ok(conflict.advice);
    assert.deepEqual(conflict.products, [
      { id: 1, name: 'Product 1', ingredient: 'Retinol 0.1%' },
      { id: 3, name: 'Product 3', ingredient: 'Ascorbic Acid' },
    ]);
  });

  it('lists each product once', () => {
    const [conflict] = checkConflicts([
      product(1, ['retinol']),
      product(2, ['ascorbic acid']),
      product(3, ['vitamin c']),
    ]).conflicts;

    assert.deepEqual(
      conflict.products.map((item) => item.id),
      [1, 2, 3],
    );
  });

  it('does not expose full product details', () => {
    const [conflict] = checkConflicts([
      { ...product(1, ['retinol']), brand: 'Acme', image_url: '/x.png' },
      product(2, ['ascorbic acid']),
    ]).conflicts;

    assert.deepEqual(Object.keys(conflict.products[0]), ['id', 'name', 'ingredient']);
  });

  it('reports products it could not check', () => {
    const { unchecked } = checkConflicts([
      product(1, ['retinol']),
      product(2, []),
      product(2, []),
    ]);

    assert.deepEqual(unchecked, [{ id: 2, name: 'Product 2' }]);
  });

  it('handles an empty routine', () => {
    assert.deepEqual(checkConflicts([]), { conflicts: [], unchecked: [] });
  });
});
