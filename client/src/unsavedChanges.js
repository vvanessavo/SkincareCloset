import { useEffect } from 'react';

let dirtyForms = 0;

// Forms report here so any navigation can check without props from every parent.
export function useUnsavedChanges(isDirty) {
  useEffect(() => {
    if (!isDirty) return undefined;

    function warnBeforeUnload(event) {
      event.preventDefault();
    }

    dirtyForms += 1;
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => {
      dirtyForms -= 1;
      window.removeEventListener('beforeunload', warnBeforeUnload);
    };
  }, [isDirty]);
}

export function confirmDiscard() {
  return dirtyForms === 0 || window.confirm('Discard unsaved changes?');
}
