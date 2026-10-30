import { useEffect, useState } from 'react';
import { applyCatalogItem, toFormValues, toProductPayload } from '../productFields.js';
import { useUnsavedChanges } from '../unsavedChanges.js';
import { CatalogSearch } from './CatalogSearch.jsx';
import { ProductImage } from './ProductImage.jsx';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_MB = 5;

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
  const [initialValues] = useState(() => toFormValues(product));
  const [values, setValues] = useState(initialValues);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  // undefined keeps the current picture, a File replaces it, null removes it.
  const [image, setImage] = useState(undefined);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [catalogItem, setCatalogItem] = useState(null);

  const isChanged = Object.keys(values).some((name) => values[name] !== initialValues[name]);
  useUnsavedChanges(isChanged || image !== undefined);

  useEffect(() => {
    if (!image) return undefined;
    const url = URL.createObjectURL(image);
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
      setPreviewUrl(null);
    };
  }, [image]);

  const imageSrc =
    image === null ? null : (previewUrl ?? catalogItem?.image_url ?? product?.image_url);

  function handleChange(event) {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
  }

  function handleCatalogSelect(item) {
    setCatalogItem(item);
    setValues((current) => applyCatalogItem(current, item));
    setImage(undefined);
    setError(null);
  }

  function handleImageChange(event) {
    const [file] = event.target.files;
    event.target.value = '';
    if (!file) return;

    if (!IMAGE_TYPES.includes(file.type)) {
      setError('Picture must be a JPEG, PNG or WebP image');
    } else if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      setError(`Picture must be under ${MAX_IMAGE_MB} MB`);
    } else {
      setError(null);
      setImage(file);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await onSave(
        { ...toProductPayload(values), catalog_code: catalogItem?.code ?? null },
        image,
        image === undefined && catalogItem?.image_url ? catalogItem.code : null,
      );
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <form className="panel product-form" onSubmit={handleSubmit}>
      <h2>{product ? `Edit ${product.name}` : 'Add product'}</h2>

      {!product && <CatalogSearch onSelect={handleCatalogSelect} />}
      {catalogItem && (
        <p className="catalog-notice" role="status">
          Filled in from Open Beauty Facts, which is written by volunteers. Check the details,
          especially the ingredients, before saving.
        </p>
      )}

      <div className="image-field">
        <ProductImage src={imageSrc} name={values.name || '?'} className="medium" />
        <div className="image-controls">
          <label>
            Picture
            <input type="file" accept={IMAGE_TYPES.join(',')} onChange={handleImageChange} />
          </label>
          {imageSrc && (
            <button type="button" onClick={() => setImage(null)}>
              Remove picture
            </button>
          )}
        </div>
      </div>

      <label>
        Name
        <input
          name="name"
          value={values.name}
          onChange={handleChange}
          required
          autoFocus={Boolean(product)}
        />
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

      <div className="form-footer">
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </form>
  );
}
