import { useState } from 'react';

/**
 * Runs a save that answers with words (null when saved), keeping the saving flag and the words for its form. `run` says
 * whether it saved, so a form can clear itself only then; a second tap while saving does nothing.
 */
export function useSave() {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const run = async (save: () => Promise<string | null>): Promise<boolean> => {
    if (saving) return false;
    setSaving(true);
    setError(null);
    try {
      const answer = await save();
      setError(answer);
      return answer === null;
    } finally {
      setSaving(false);
    }
  };
  return { error, saving, run };
}
