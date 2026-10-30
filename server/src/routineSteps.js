import { imageUrl } from './images.js';

export function createStepReader(db) {
  const selectSteps = db.prepare(`
    SELECT s.id, p.id AS product_id, p.name, p.brand, p.category, p.image, p.ingredients
    FROM routine_steps s
    JOIN products p ON p.id = s.product_id
    WHERE s.routine_id = ?
    ORDER BY s.position, s.id
  `);

  // Array order is the step order, so positions stay internal.
  return (routineId) =>
    selectSteps.all(routineId).map((step) => ({
      id: step.id,
      product: {
        id: step.product_id,
        name: step.name,
        brand: step.brand,
        category: step.category,
        ingredients: JSON.parse(step.ingredients),
        image_url: imageUrl(step.image),
      },
    }));
}
