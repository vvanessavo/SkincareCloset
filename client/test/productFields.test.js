import { describe, expect, it } from 'vitest';
import { parseIngredients, toFormValues, toProductPayload } from '../src/productFields.js';

describe('parseIngredients', () => {
  it('splits on newlines and commas', () => {
    expect(parseIngredients('water, glycerin\nniacinamide')).toEqual([
      'water',
      'glycerin',
      'niacinamide',
    ]);
  });

  it('drops blank entries', () => {
    expect(parseIngredients(' water ,, \n\n')).toEqual(['water']);
    expect(parseIngredients('')).toEqual([]);
  });

  it('keeps commas between digits', () => {
    expect(parseIngredients('water, 1,2-hexanediol')).toEqual(['water', '1,2-hexanediol']);
  });
});

describe('toFormValues', () => {
  it('starts blank for a new product', () => {
    expect(toFormValues(null)).toEqual({
      name: '',
      brand: '',
      category: '',
      ingredients: '',
      opened_on: '',
      expires_on: '',
      notes: '',
    });
  });

  it('turns nulls into empty strings for an existing product', () => {
    const values = toFormValues({ name: 'Toner', brand: null, ingredients: ['water', 'zinc'] });

    expect(values.brand).toBe('');
    expect(values.ingredients).toBe('water\nzinc');
  });
});

describe('toProductPayload', () => {
  it('sends blank dates as null', () => {
    const payload = toProductPayload({ ...toFormValues(null), name: 'Toner' });

    expect(payload.opened_on).toBeNull();
    expect(payload.expires_on).toBeNull();
  });

  it('round-trips an ingredient containing a comma', () => {
    const values = toFormValues({ name: 'Toner', ingredients: ['1,2-hexanediol', 'water'] });

    expect(toProductPayload(values).ingredients).toEqual(['1,2-hexanediol', 'water']);
  });
});
