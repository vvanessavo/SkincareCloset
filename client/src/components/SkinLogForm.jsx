import { useState } from 'react';
import { useUnsavedChanges } from '../unsavedChanges.js';

export const RATINGS = [
  { value: 1, label: 'Rough' },
  { value: 2, label: 'Not great' },
  { value: 3, label: 'Okay' },
  { value: 4, label: 'Good' },
  { value: 5, label: 'Great' },
];

export function SkinLogForm({ entry, onSave }) {
  const initialRating = entry?.skin_rating ?? null;
  const initialNotes = entry?.notes ?? '';
  const [rating, setRating] = useState(initialRating);
  const [notes, setNotes] = useState(initialNotes);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const isChanged = rating !== initialRating || notes !== initialNotes;
  useUnsavedChanges(isChanged);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await onSave({ skin_rating: rating, notes });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <form className="skin-log-form" onSubmit={handleSubmit}>
      <fieldset>
        <legend>How's your skin?</legend>
        <div className="rating-options">
          {RATINGS.map(({ value, label }) => (
            <label key={value} className="rating-option">
              <input
                type="radio"
                name="skin_rating"
                aria-label={`${value} ${label}`}
                checked={rating === value}
                onChange={() => setRating(value)}
              />
              <strong>{value}</strong>
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {rating && (
        <button type="button" className="clear-rating" onClick={() => setRating(null)}>
          Clear rating
        </button>
      )}

      <label>
        Notes
        <textarea
          rows={4}
          placeholder="Breakouts, dryness, anything new"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="form-actions">
        <button type="submit" className="primary" disabled={saving || !isChanged}>
          {saving ? 'Saving…' : entry && !isChanged ? 'Saved' : 'Save'}
        </button>
      </div>
    </form>
  );
}
