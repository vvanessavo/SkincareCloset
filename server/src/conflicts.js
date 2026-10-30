import { normalizeSearchText } from './catalog.js';

// Deliberately specific, because a warning that fires on everything gets ignored.
// Left out on purpose:
// - other salicylates, because ethylhexyl salicylate and homosalate are sunscreen filters
// - plain "BHA", which on a label usually means the preservative butylated hydroxyanisole
// - citric and malic acid, usually there to adjust pH rather than exfoliate
// - retinyl esters, which are weak and mostly appear in everyday creams
// - ascorbyl palmitate and sodium ascorbate, usually trace antioxidants
const ACTIVES = {
  // Retinoids never count as traces: they work at around 0.1%, so they're often listed late.
  retinoid: {
    pattern: /\b(retinol|retinal|retinaldehyde|retinoate|retinoid|tretinoin|adapalene|vitamin a)\b/,
    exclude: /\b(retinyl|palmitate|acetate|linoleate)\b/,
  },
  vitaminC: {
    pattern:
      /\b(ascorbic|vitamin c|ascorbyl glucoside|ascorbyl phosphate|ascorbyl tetraisopalmitate|tetrahexyldecyl ascorbate)\b/,
    exclude: /\b(ascorbyl|vitamin c) palmitat/,
    ignoreTraces: true,
  },
  aha: { pattern: /\b(glycolic|lactic|mandelic|aha|alpha hydroxy)\b/, ignoreTraces: true },
  bha: { pattern: /\b(salicylic|betaine salicylate|beta hydroxy)\b/, ignoreTraces: true },
};

// Labels list ingredients from most to least, so the end of a full list is trace amounts.
// Shorter lists are usually key ingredients only, where position means nothing.
const MIN_LIST_FOR_TRACES = 6;
const TRACE_STARTS_AT = 2 / 3;

function isTrace(index, listLength) {
  return listLength >= MIN_LIST_FOR_TRACES && (index + 1) / listLength > TRACE_STARTS_AT;
}

const RULES = [
  {
    id: 'retinoid-vitamin-c',
    actives: ['retinoid', 'vitaminC'],
    title: 'Retinoid + vitamin C',
    advice: 'Together these can irritate skin. Many people use vitamin C in the morning and retinoids at night.',
  },
  {
    id: 'retinoid-aha',
    actives: ['retinoid', 'aha'],
    title: 'Retinoid + AHA',
    advice: 'Together these can irritate skin and weaken its barrier. Try using them on different nights.',
  },
  {
    id: 'retinoid-bha',
    actives: ['retinoid', 'bha'],
    title: 'Retinoid + BHA',
    advice: 'Together these can dry out and irritate skin. Try using them on different nights.',
  },
];

// Maps each active a product contains to the ingredient that matched it.
export function findActives(ingredients) {
  const found = {};
  ingredients.forEach((ingredient, index) => {
    const normalized = normalizeSearchText(ingredient);
    for (const [active, { pattern, exclude, ignoreTraces }] of Object.entries(ACTIVES)) {
      if (found[active] || !pattern.test(normalized) || exclude?.test(normalized)) continue;
      if (ignoreTraces && isTrace(index, ingredients.length)) continue;
      found[active] = ingredient;
    }
  });
  return found;
}

// Compares different products only: one formula with both actives was made to work together.
export function checkConflicts(products) {
  const unique = [...new Map(products.map((product) => [product.id, product])).values()];
  const scanned = unique.map((product) => ({ product, actives: findActives(product.ingredients) }));

  const conflicts = [];
  for (const { id, actives, title, advice } of RULES) {
    const [first, second] = actives.map((active) =>
      scanned.filter((item) => item.actives[active]),
    );

    const involved = new Map();
    for (const a of first) {
      for (const b of second) {
        if (a.product.id === b.product.id) continue;
        involved.set(a.product.id, { ...a.product, ingredient: a.actives[actives[0]] });
        involved.set(b.product.id, { ...b.product, ingredient: b.actives[actives[1]] });
      }
    }

    if (involved.size) {
      conflicts.push({
        id,
        title,
        advice,
        products: [...involved.values()].map(({ id: productId, name, ingredient }) => ({
          id: productId,
          name,
          ingredient,
        })),
      });
    }
  }

  // No warning for these means nothing was known, not that they're safe together.
  const unchecked = unique
    .filter((product) => product.ingredients.length === 0)
    .map(({ id, name }) => ({ id, name }));

  return { conflicts, unchecked };
}
