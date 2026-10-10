import { useEffect, useState } from 'react';
import { familyDocNow, loadFamilyDoc } from '../families/docs';
import type { FamilyDoc } from '../families/types';

/** A family's prose for its panel: there at once when loaded before, a moment later otherwise. */
export function useFamilyDoc(id: string | undefined): FamilyDoc | undefined {
  const [doc, setDoc] = useState<FamilyDoc | undefined>(() => (id ? familyDocNow(id) : undefined));
  useEffect(() => {
    if (!id) { setDoc(undefined); return; }
    let live = true;
    setDoc(familyDocNow(id));
    void loadFamilyDoc(id).then(d => { if (live && d) setDoc(d); });
    return () => { live = false; };
  }, [id]);
  return doc;
}
