export function ProductList({ products, onEdit, onDelete }) {
  if (!products.length) {
    return <p className="empty">No products yet. Add the first one to start your library.</p>;
  }

  return (
    <ul className="product-list">
      {products.map((product) => (
        <li key={product.id} className="panel product-card">
          <div className="product-heading">
            <h2>{product.name}</h2>
            {product.category && <span className="tag">{product.category}</span>}
          </div>
          {product.brand && <p className="brand">{product.brand}</p>}
          {product.ingredients.length > 0 && (
            <p className="ingredients">{product.ingredients.join(', ')}</p>
          )}
          {(product.opened_on || product.expires_on) && (
            <p className="dates">
              {product.opened_on && <span>Opened {product.opened_on}</span>}
              {product.expires_on && <span>Expires {product.expires_on}</span>}
            </p>
          )}
          {product.notes && <p className="notes">{product.notes}</p>}
          <div className="card-actions">
            <button type="button" aria-label={`Edit ${product.name}`} onClick={() => onEdit(product)}>
              Edit
            </button>
            <button
              type="button"
              aria-label={`Delete ${product.name}`}
              onClick={() => onDelete(product)}
            >
              Delete
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
