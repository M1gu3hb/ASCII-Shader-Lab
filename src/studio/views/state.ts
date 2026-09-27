import { setUI, useStudio } from '../store';
import { viewFor, type ViewId, type ViewOpts } from './views';

/** The destination preview of the current space (null in «Piezas»). */
export const useView = () => useStudio(s => viewFor(s.ui.views, s.space));

export const currentView = () => { const s = useStudio.getState(); return viewFor(s.ui.views, s.space); };

/** Chooses the preview for the current space (remembered per space in the UI preferences). */
export function setView(view: ViewId) {
  const s = useStudio.getState();
  if (s.space === 'componentes') return;
  setUI({ views: { ...s.ui.views, [s.space]: view } });
}

export function setViewOpts(p: Partial<ViewOpts>) {
  setUI({ viewOpts: { ...useStudio.getState().ui.viewOpts, ...p } });
}
