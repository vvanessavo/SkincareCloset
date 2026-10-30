import { useState } from 'react';
import { toFormValues, toProductPayload } from '../productFields.js';

const CATEGORIES = [
  'cleanser',
  'toner',
  'essence',
  'serum',
  'treatment',
  'moisturizer',
  'sunscreen',
  'eye cream',
  'mask',
  'oil',
];

export function ProductForm({ product, onSave, onCancel }) {
  const [values, setValues] = useState(() => toFormValues(product));
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  function handleChange(event) {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await onSave(toProductPayload(values));
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <form className="panel product-form" onSubmit={handleSubmit}>
      <h2>{product ? `Edit ${product.name}` : 'Add product'}</h2>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <label>
        Name
        <input name="name" value={values.name} onChange={handleChange} required autoFocus />
      </label>
      <label>
        Brand
        <input name="brand" value={values.brand} onChange={handleChange} />
      </label>
      <label>
        Category
        <input
          name="category"
          list="product-categories"
          value={values.category}
          onChange={handleChange}
        />
        <datalist id="product-categories">
          {CATEGORIES.map((category) => (
            <option key={category} value={category} />
          ))}
        </datalist>
      </label>
      <label>
        Ingredients
        <textarea
          name="ingredients"
          rows={5}
          placeholder="One per line, or separated by commas"
          value={values.ingredients}
          onChange={handleChange}
        />
      </label>
      <div className="form-row">
        <label>
          Opened
          <input type="date" name="opened_on" value={values.opened_on} onChange={handleChange} />
        </label>
        <label>
          Expires
          <input type="date" name="expires_on" value={values.expires_on} onChange={handleChange} />
        </label>
      </div>
      <label>
        Notes
        <textarea name="notes" rows={3} value={values.notes} onChange={handleChange} />
      </label>

      <div className="form-actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}
