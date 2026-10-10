import type { Recipe } from '../engine/recipe';
import { familyById } from './registry';

/**
 * What exported code needs from the visual families (pure: the exporter and its tests use it).
 * The families whose code a recipe needs: the models of its simulations and structures (both engines run
 * them) and, with the basic engine, the CPU twins of its analytic families.
 */
export function familyIds(r: Recipe, basic: boolean, available: (id: string) => boolean = () => true): string[] {
  const ids = new Set<string>();
  for (const l of r.layers.filter(x => x.on).slice(0, 4)) {
    const m = familyById(l.pattern);
    if (m && l.fam && (m.kind !== 'analytic' || basic) && available(m.id)) ids.add(m.id);
  }
  return [...ids];
}

/**
 * Takes saved states out of a recipe that leaves the studio as code (they stay in this browser): its
 * simulations start from their seeds. Returns the notes the export shows.
 */
export function familyExportNotes(x: Recipe): string[] {
  const notes: string[] = [];
  if (x.layers.some(l => l.fam?.ck)) {
    for (const l of x.layers) if (l.fam) delete l.fam.ck;
    notes.push('La simulación empieza desde su semilla: el estado que guardaste no viaja en el código.');
  }
  if (x.layers.some(l => l.on && l.fam && familyById(l.pattern)?.kind !== 'analytic')) notes.push('Esta pieza lleva una simulación: corre en el navegador de quien visita y evoluciona desde su semilla.');
  return notes;
}
