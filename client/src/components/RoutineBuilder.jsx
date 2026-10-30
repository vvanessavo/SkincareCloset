import { useCallback, useEffect, useState } from 'react';
import {
  addRoutineStep,
  createRoutine,
  deleteRoutine,
  listProducts,
  listRoutines,
  removeRoutineStep,
  reorderRoutineSteps,
  updateRoutine,
} from '../api.js';
import { RoutineCard } from './RoutineCard.jsx';
import { RoutineForm } from './RoutineForm.jsx';

const PERIODS = [
  { value: 'AM', label: 'Morning' },
  { value: 'PM', label: 'Evening' },
];

export function RoutineBuilder() {
  const [routines, setRoutines] = useState(null);
  const [products, setProducts] = useState([]);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [nextRoutines, nextProducts] = await Promise.all([listRoutines(), listProducts()]);
      setRoutines(nextRoutines);
      setProducts(nextProducts);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Buttons stay disabled until the refetch, so a move never uses a stale order.
  async function run(action) {
    setBusy(true);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate(routine) {
    await createRoutine(routine);
    setCreating(false);
    await load();
  }

  async function handleUpdate(routine, values) {
    await updateRoutine(routine.id, values);
    await load();
  }

  function handleDelete(routine) {
    if (!window.confirm(`Delete ${routine.name} and its steps?`)) return;
    run(() => deleteRoutine(routine.id));
  }

  return (
    <>
      <header className="app-header">
        <h1>Routines</h1>
        <button type="button" className="primary" onClick={() => setCreating(true)}>
          New routine
        </button>
      </header>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <main className="layout">
        {creating && (
          <section className="panel">
            <RoutineForm onSave={handleCreate} onCancel={() => setCreating(false)} />
          </section>
        )}

        {routines ? (
          <div className="period-columns">
            {PERIODS.map(({ value, label }) => {
              const periodRoutines = routines.filter((routine) => routine.period === value);
              return (
                <section key={value}>
                  <h2 className="period-heading">{label}</h2>
                  {periodRoutines.length > 0 ? (
                    <ul className="routine-list">
                      {periodRoutines.map((routine) => (
                        <RoutineCard
                          key={routine.id}
                          routine={routine}
                          products={products}
                          busy={busy}
                          onUpdate={handleUpdate}
                          onDelete={handleDelete}
                          onAddStep={(item, productId) =>
                            run(() => addRoutineStep(item.id, productId))
                          }
                          onRemoveStep={(item, step) =>
                            run(() => removeRoutineStep(item.id, step.id))
                          }
                          onReorderSteps={(item, stepIds) =>
                            run(() => reorderRoutineSteps(item.id, stepIds))
                          }
                        />
                      ))}
                    </ul>
                  ) : (
                    <p className="empty">No {label.toLowerCase()} routines yet.</p>
                  )}
                </section>
              );
            })}
          </div>
        ) : (
          !error && <p className="empty">Loading…</p>
        )}
      </main>
    </>
  );
}
