/**
 * The editor's actions on the selection (Duplicar, Eliminar, Reflejar, Rotar, Escalar, path operations…)
 * as one undoable edit each, on the document as it is when the action runs.
 */
import type { StoreApi } from 'zustand';
import { useGlifos } from '../../state';
import {
  deleteSelection, duplicateSelection, mirrorSelection, moveSelection, pathOpSelection, PATH_OP_NAMES, removeOverlaps, reverseSelection,
  rotateSelection, scaleSelection, setClosed,
} from './actions';
import { componentContours } from './components';
import type { ActionName, EdState, EditorApi } from './editorStore';
import { EMPTY_SEL, selIsEmpty, selectAll, selectionBox, type GlyphPart } from './selection';

export function actionsFor(api: EditorApi, store: StoreApi<EdState>): Pick<EditorApi, 'run' | 'rotate' | 'scale' | 'nudge'> {
  const current = () => {
    const doc = useGlifos.getState().doc;
    const g = doc?.glyphs[api.ch];
    if (!doc || !g) return null;
    const part: GlyphPart = { contours: g.contours, components: g.components, anchors: g.anchors };
    const sel = store.getState().sel;
    const box = selectionBox(part, sel, i => (g.components[i] ? componentContours(doc, g.components[i]) : []));
    return { doc, g, part, sel, box };
  };
  const apply = (p: GlyphPart, label: string, key?: string) =>
    api.editPart(gg => { gg.contours = p.contours; gg.components = p.components; gg.anchors = p.anchors; }, label, key);
  const blocked = () => {
    if (api.editable) return false;
    api.say(api.docEditable ? 'Este glifo está bloqueado: desbloquéalo para editar.' : 'Solo lectura: no se puede editar.');
    return true;
  };

  const run = (a: ActionName) => {
    const c = current();
    if (!c) return;
    if (a === 'todo') { store.setState({ sel: selectAll(c.part) }); return; }
    if (a === 'nada') { store.setState({ sel: EMPTY_SEL }); return; }
    if (blocked()) return;
    if (a === 'solapamientos') {
      if (apply(removeOverlaps(c.part), 'Quitar solapamientos')) { store.setState({ sel: EMPTY_SEL }); api.say('Solapamientos quitados'); }
      return;
    }
    if (selIsEmpty(c.sel)) { api.say('Selecciona algo primero.'); return; }
    switch (a) {
      case 'duplicar': {
        const r = duplicateSelection(c.part, c.sel);
        if (apply(r.part, 'Duplicar')) { store.setState({ sel: r.sel }); api.say('Duplicado: la copia queda seleccionada'); }
        return;
      }
      case 'eliminar': {
        const r = deleteSelection(c.part, c.sel);
        if (apply(r.part, 'Eliminar')) { store.setState({ sel: r.sel }); api.say('Eliminado'); }
        return;
      }
      case 'reflejar-h': case 'reflejar-v':
        if (c.box && apply(mirrorSelection(c.part, c.sel, a === 'reflejar-h' ? 'h' : 'v', c.box), a === 'reflejar-h' ? 'Reflejar horizontal' : 'Reflejar vertical')) api.say('Reflejado');
        return;
      case 'cerrar': case 'abrir':
        if (apply(setClosed(c.part, c.sel, a === 'cerrar'), a === 'cerrar' ? 'Cerrar trazo' : 'Abrir trazo')) api.say(a === 'cerrar' ? 'Trazo cerrado' : 'Trazo abierto');
        return;
      case 'invertir': {
        const r = reverseSelection(c.part, c.sel);
        if (apply(r.part, 'Invertir dirección')) { store.setState({ sel: r.sel }); api.say('Dirección invertida'); }
        return;
      }
      case 'unir': case 'restar': case 'intersecar': case 'excluir': {
        const r = pathOpSelection(c.part, c.sel, a);
        if (!r) { api.say(`${PATH_OP_NAMES[a]}: selecciona al menos dos contornos cerrados.`); return; }
        if (apply(r.part, PATH_OP_NAMES[a])) { store.setState({ sel: r.sel }); api.say(`${PATH_OP_NAMES[a]}: ${r.sel.contours.length} ${r.sel.contours.length === 1 ? 'contorno' : 'contornos'}`); }
        return;
      }
    }
  };

  return {
    run,
    rotate: deg => {
      const c = current();
      if (!c || blocked() || !c.box || !Number.isFinite(deg)) return;
      if (apply(rotateSelection(c.part, c.sel, deg, c.box), 'Rotar')) api.say(`Rotado ${deg}°`);
    },
    scale: (sx, sy) => {
      const c = current();
      if (!c || blocked() || !c.box || !(sx > 0) || !(sy > 0)) return;
      if (apply(scaleSelection(c.part, c.sel, sx, sy, c.box), 'Escalar')) api.say(`Escalado al ${Math.round(sx * 100)} %`);
    },
    nudge: (dx, dy) => {
      const c = current();
      if (!c || blocked() || selIsEmpty(c.sel)) return;
      // a run of presses is one undo step (same key within the coalescing window)
      if (apply(moveSelection(c.part, c.sel, dx, dy), 'Mover', 'nudge') && c.box) {
        const r = (v: number) => Math.round(v * 10) / 10;
        api.say(`Movido a x ${r(c.box.x0 + dx)}, y ${r(c.box.y0 + dy)}`);
      }
    },
  };
}
