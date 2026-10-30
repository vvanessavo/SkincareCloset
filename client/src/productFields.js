export function parseIngredients(text) {
  // Commas between digits stay, so 1,2-hexanediol remains one ingredient.
  return text
    .split(/\n|,(?!\d)|(?<!\d),/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function toFormValues(product) {
  return {
    name: product?.name ?? '',
    brand: product?.brand ?? '',
    category: product?.category ?? '',
    ingredients: product?.ingredients.join('\n') ?? '',
    opened_on: product?.opened_on ?? '',
    expires_on: product?.expires_on ?? '',
    notes: product?.notes ?? '',
  };
}

export function toProductPayload(values) {
  return {
    ...values,
    ingredients: parseIngredients(values.ingredients),
    // The API rejects empty strings for dates.
    opened_on: values.opened_on || null,
    expires_on: values.expires_on || null,
  };
}
