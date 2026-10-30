import { useState } from 'react';
import { useUnsavedChanges } from '../unsavedChanges.js';

export function RoutineForm({ routine, onSave, onCancel }) {
  const initialName = routine?.name ?? '';
  const initialPeriod = routine?.period ?? 'AM';
  const [name, setName] = useState(initialName);
  const [period, setPeriod] = useState(initialPeriod);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useUnsavedChanges(name !== initialName || period !== initialPeriod);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await onSave({ name, period });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <form className="routine-form" onSubmit={handleSubmit}>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="routine-form-fields">
        <label>
          Routine name
          <input value={name} onChange={(event) => setName(event.target.value)} required autoFocus />
        </label>
        <label>
          Time of day
          <select value={period} onChange={(event) => setPeriod(event.target.value)}>
            <option value="AM">AM</option>
            <option value="PM">PM</option>
          </select>
        </label>
      </div>
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
