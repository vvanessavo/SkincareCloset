import { useState } from 'react';
import { ExpiryTag } from './ExpiryTag.jsx';
import { ProductImage } from './ProductImage.jsx';
import { RoutineForm } from './RoutineForm.jsx';

function productLabel(product) {
  return product.brand ? `${product.name} (${product.brand})` : product.name;
}

export function RoutineCard({
  routine,
  products,
  busy,
  onUpdate,
  onDelete,
  onAddStep,
  onRemoveStep,
  onReorderSteps,
}) {
  const [editing, setEditing] = useState(false);
  const [productId, setProductId] = useState('');
  const { steps } = routine;

  function moveStep(index, offset) {
    const stepIds = steps.map((step) => step.id);
    const [stepId] = stepIds.splice(index, 1);
    stepIds.splice(index + offset, 0, stepId);
    onReorderSteps(routine, stepIds);
  }

  async function handleUpdate(values) {
    await onUpdate(routine, values);
    setEditing(false);
  }

  function handleAddStep(event) {
    event.preventDefault();
    onAddStep(routine, Number(productId));
    setProductId('');
  }

  return (
    <li className="panel routine-card">
      {editing ? (
        <RoutineForm routine={routine} onSave={handleUpdate} onCancel={() => setEditing(false)} />
      ) : (
        <div className="routine-heading">
          <h3>{routine.name}</h3>
          <div className="card-actions">
            <button type="button" aria-label={`Rename ${routine.name}`} onClick={() => setEditing(true)}>
              Edit
            </button>
            <button
              type="button"
              aria-label={`Delete ${routine.name}`}
              disabled={busy}
              onClick={() => onDelete(routine)}
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {steps.length > 0 ? (
        <ol className="step-list">
          {steps.map((step, index) => (
            <li key={step.id} className="step">
              <ProductImage src={step.product.image_url} name={step.product.name} className="small" />
              <span className="step-name">{productLabel(step.product)}</span>
              <span className="step-actions">
                <button
                  type="button"
                  aria-label={`Move ${step.product.name} up`}
                  disabled={busy || index === 0}
                  onClick={() => moveStep(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move ${step.product.name} down`}
                  disabled={busy || index === steps.length - 1}
                  onClick={() => moveStep(index, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${step.product.name}`}
                  disabled={busy}
                  onClick={() => onRemoveStep(routine, step)}
                >
                  Remove
                </button>
                <ExpiryTag expiresOn={step.product.expires_on} />
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="step-empty">No steps yet.</p>
      )}

      {routine.conflicts.length > 0 && (
        <ul className="conflict-list">
          {routine.conflicts.map((conflict) => (
            <li key={conflict.id} className="conflict">
              <p className="conflict-title">
                <span aria-hidden="true">⚠</span> Possible conflict: {conflict.title}
              </p>
              <p>
                {conflict.products
                  .map((product) => `${product.name} (${product.ingredient})`)
                  .join(', ')}
              </p>
              <p className="conflict-advice">{conflict.advice}</p>
            </li>
          ))}
        </ul>
      )}

      {routine.unchecked.length > 0 && (
        <p className="step-empty">
          Not checked for conflicts, no ingredient list:{' '}
          {routine.unchecked.map((product) => product.name).join(', ')}
        </p>
      )}

      {products.length > 0 ? (
        <form className="step-form" onSubmit={handleAddStep}>
          <select
            aria-label={`Product to add to ${routine.name}`}
            value={productId}
            onChange={(event) => setProductId(event.target.value)}
          >
            <option value="">Choose a product…</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {productLabel(product)}
              </option>
            ))}
          </select>
          <button type="submit" disabled={busy || !productId}>
            Add step
          </button>
        </form>
      ) : (
        <p className="step-empty">Add a product to your library to build this routine.</p>
      )}
    </li>
  );
}
