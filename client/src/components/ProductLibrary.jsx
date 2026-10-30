import { useCallback, useEffect, useState } from 'react';
import {
  copyCatalogImage,
  createProduct,
  deleteProduct,
  deleteProductImage,
  listProducts,
  updateProduct,
  uploadProductImage,
} from '../api.js';
import { localDate } from '../dates.js';
import { expiryStatus } from '../expiry.js';
import { confirmDiscard } from '../unsavedChanges.js';
import { ProductForm } from './ProductForm.jsx';
import { ProductList } from './ProductList.jsx';

export function ProductLibrary() {
  const [products, setProducts] = useState(null);
  const [error, setError] = useState(null);
  // null when the form is closed, {} when adding, or the product being edited.
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    try {
      setProducts(await listProducts());
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openForm(target) {
    if (editing?.id === target.id && editing) return;
    if (!confirmDiscard()) return;
    setError(null);
    setEditing(target);
  }

  async function handleSave(product, image, catalogImageCode) {
    const saved = editing.id
      ? await updateProduct(editing.id, product)
      : await createProduct(product);
    // The product exists now, so a retry from the open form could create it twice.
    setEditing(null);

    let imageError = null;
    try {
      if (image) await uploadProductImage(saved.id, image);
      if (image === null) await deleteProductImage(saved.id);
      if (catalogImageCode) await copyCatalogImage(saved.id, catalogImageCode);
    } catch (err) {
      imageError = `${saved.name} was saved, but its picture wasn't: ${err.message}`;
    }
    await load();
    if (imageError) setError(imageError);
  }

  async function handleDelete(product) {
    if (!window.confirm(`Delete ${product.name}?`)) return;
    try {
      await deleteProduct(product.id);
      if (editing?.id === product.id) setEditing(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  const statuses = (products ?? []).map((product) =>
    expiryStatus(product.expires_on, localDate()),
  );
  const expiredCount = statuses.filter((status) => status?.level === 'expired').length;
  const soonCount = statuses.filter((status) => status?.level === 'soon').length;

  return (
    <>
      <header className="app-header">
        <h1>Product library</h1>
        <button type="button" className="primary" onClick={() => openForm({})}>
          Add product
        </button>
      </header>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {(expiredCount > 0 || soonCount > 0) && (
        <p className="expiry-summary">
          <span aria-hidden="true">⚠</span>{' '}
          {[
            expiredCount > 0 && `${expiredCount} expired`,
            soonCount > 0 && `${soonCount} expiring within 30 days`,
          ]
            .filter(Boolean)
            .join(', ')}
        </p>
      )}

      <main className={editing ? 'layout with-form' : 'layout'}>
        {editing && (
          <ProductForm
            key={editing.id ?? 'new'}
            product={editing.id ? editing : null}
            onSave={handleSave}
            onCancel={() => setEditing(null)}
          />
        )}
        <section>
          {products ? (
            <ProductList products={products} onEdit={openForm} onDelete={handleDelete} />
          ) : (
            !error && <p className="empty">Loading…</p>
          )}
        </section>
      </main>
    </>
  );
}
