import { useCallback, useEffect, useState } from 'react';
import { createProduct, deleteProduct, listProducts, updateProduct } from '../api.js';
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

  async function handleSave(product) {
    if (editing.id) {
      await updateProduct(editing.id, product);
    } else {
      await createProduct(product);
    }
    setEditing(null);
    await load();
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

  return (
    <>
      <header className="app-header">
        <h1>Product library</h1>
        <button type="button" className="primary" onClick={() => setEditing({})}>
          Add product
        </button>
      </header>

      {error && (
        <p className="error" role="alert">
          {error}
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
            <ProductList products={products} onEdit={setEditing} onDelete={handleDelete} />
          ) : (
            !error && <p className="empty">Loading…</p>
          )}
        </section>
      </main>
    </>
  );
}
