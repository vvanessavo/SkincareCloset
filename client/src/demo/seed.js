// Sample data relative to the visitor's today, so the streak and calendar look lived in.
import { KBEAUTY_PRODUCTS } from '../../../server/src/sampleProducts.js';
import { addDays, localDate } from '../dates.js';

const PICTURES = {
  'Low pH': new URL('./bottles/cleanser.png', import.meta.url).href,
  'Freshly Juiced': new URL('./bottles/vitamin-c.png', import.meta.url).href,
  'Relief Sun': new URL('./bottles/sunscreen.png', import.meta.url).href,
  'Retinol 0.1': new URL('./bottles/retinol.png', import.meta.url).href,
  'Advanced Snail': new URL('./bottles/essence.png', import.meta.url).href,
  'AHA/BHA': new URL('./bottles/exfoliant.png', import.meta.url).href,
  Heartleaf: new URL('./bottles/toner.png', import.meta.url).href,
};

const NOTES = {
  33: 'Dry patches on cheeks',
  26: 'Started the retinol, a little flaky',
  19: 'Calmer, less redness',
  12: 'One breakout on chin',
  5: 'Smoothest it has felt in ages',
};

const RATINGS = [
  [34, 2], [31, 2], [29, 3], [26, 2], [24, 3], [21, 3], [19, 4], [16, 3],
  [14, 4], [12, 3], [9, 4], [7, 4], [5, 5], [3, 4], [1, 5],
];

export async function seedDemo(request, { pictures = true, today = localDate() } = {}) {
  const call = async (method, url, body) => {
    const res = await request(method, url, body);
    if (res.status >= 400) throw new Error(`${method} ${url}: ${res.body?.error}`);
    return res.body;
  };

  const products = [];
  for (const product of KBEAUTY_PRODUCTS) products.push(await call('POST', '/api/products', product));
  const find = (text) => products.find((product) => product.name.includes(text));

  if (pictures) {
    for (const [name, url] of Object.entries(PICTURES)) {
      const data = new Uint8Array(await (await fetch(url)).arrayBuffer());
      await call('PUT', `/api/products/${find(name).id}/image`, globalThis.Buffer.from(data));
    }
  }

  const dated = { 'Relief Sun': [-171, 12], Heartleaf: [-378, -13], 'Freshly Juiced': [-32, 91] };
  for (const [name, [opened, expires]] of Object.entries(dated)) {
    const product = find(name);
    await call('PUT', `/api/products/${product.id}`, {
      ...product,
      opened_on: addDays(today, opened),
      expires_on: addDays(today, expires),
    });
  }

  const routine = async (name, period, names) => {
    let created = await call('POST', '/api/routines', { name, period });
    for (const productName of names) {
      created = await call('POST', `/api/routines/${created.id}/steps`, {
        product_id: find(productName).id,
      });
    }
    return created;
  };
  const morning = await routine('Morning', 'AM', ['Low pH', 'Freshly Juiced', 'Relief Sun']);
  const retinol = await routine('Retinol night', 'PM', ['Low pH', 'Retinol 0.1', 'Advanced Snail']);
  const acid = await routine('Exfoliating night', 'PM', ['Low pH', 'AHA/BHA', 'Heartleaf']);

  const tick = async (date, steps) => {
    for (const step of steps) await call('PUT', `/api/checklist/${date}/steps/${step.id}`, { done: true });
  };
  for (let daysAgo = 36; daysAgo >= 1; daysAgo -= 1) {
    if (daysAgo % 9 === 5) continue;
    const date = addDays(today, -daysAgo);
    await tick(date, daysAgo % 6 === 2 && daysAgo > 12 ? morning.steps.slice(0, 2) : morning.steps);
    if (daysAgo % 7 !== 3 || daysAgo < 5) await tick(date, daysAgo % 3 === 0 ? acid.steps : retinol.steps);
  }
  await tick(today, morning.steps);
  await tick(today, acid.steps.slice(0, 1));

  for (const [daysAgo, rating] of RATINGS) {
    await call('PUT', `/api/logs/${addDays(today, -daysAgo)}`, {
      skin_rating: rating,
      notes: NOTES[daysAgo] ?? null,
    });
  }

  // Shows the conflict checker at work.
  await routine('Weekend experiment', 'PM', ['Retinol 0.1', 'Freshly Juiced']);
}
