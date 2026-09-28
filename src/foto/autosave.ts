/**
 * Autosave of the open project (src/project/store startAutosave: a moment after each change, and when the
 * page is hidden or left). The save never waits for the list's thumbnail: the project is written at once
 * with the last picture made, and a new picture is rendered a little later and written to the list alone.
 */
import { saveThumb } from '../project/persist';
import { refreshSaved, startAutosave, useProject } from '../project/store';
import type { Project } from '../project/types';
import { projectThumb } from './thumbs';
import { setUI } from './ui';

const thumbs = new Map<string, string>();
let timer = 0;

function thumbLater(p: Project) {
  clearTimeout(timer);
  timer = window.setTimeout(async () => {
    const url = await projectThumb(p, 320);
    if (!url) return;
    thumbs.set(p.id, url);
    await saveThumb(p.id, url);
    await refreshSaved();
  }, 1500);
}

/** Starts saving (call once): also keeps ui.saving true from an edit until the save that follows it. */
export function startFotoAutosave(): () => void {
  const stop = startAutosave({ thumb: p => { thumbLater(p); return Promise.resolve(thumbs.get(p.id) ?? null); } });
  const unsub = useProject.subscribe((s, prev) => {
    if (s.project && prev.project && s.project !== prev.project && s.project.id === prev.project.id) setUI({ saving: true });
    if (s.saved !== prev.saved) setUI({ saving: false });
  });
  return () => { unsub(); void stop(); };
}
