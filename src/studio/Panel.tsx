import { useEffect } from 'react';
import { spaceById } from '../random/spaces';
import { TABS, TabContent } from './panels';
import { presetsFor } from './presets';
import { applyRecipe, currentRecipe, setUI, useStudio } from './store';
import { IClose } from './icons';
import { Guide } from './guide/Guide';
import { useGuide } from './guide/state';

export function Panel() {
  const space = useStudio(s => s.space);
  const tabSel = useStudio(s => s.ui.tab[s.space]);
  const entry = useStudio(s => s.entries[s.cursor]);
  const tabs = TABS[space];
  const tab = tabs.find(t => t[0] === tabSel)?.[0] ?? tabs[0]?.[0];
  const presets = presetsFor(space);
  const guiding = useGuide(s => s.path !== null);
  useEffect(() => { document.querySelector('.pane')?.scrollTo(0, 0); }, [tab, space]);
  // a guided path takes the place of the settings while it lasts
  if (guiding) return <aside className="panel guide-panel" aria-labelledby="guide-title"><Guide /></aside>;
  if (!tabs.length) return null;
  const setTab = (id: string) => setUI({ tab: { ...useStudio.getState().ui.tab, [space]: id } });
  return (
    <aside className="panel" aria-label="Ajustes de la pieza">
      <div className="panel-head">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <p className="eyebrow">Recetas · {spaceById(space).name}</p>
          <button type="button" className="icon-btn mobile-only" aria-label="Cerrar ajustes" onClick={() => setUI({ panel: false })}><IClose /></button>
        </div>
        <div className="recipes" role="group" aria-label="Recetas listas">
          {presets.map(p => (
            <button key={p.id} type="button" className="chip"
              aria-pressed={!!entry && entry.label === p.name && !entry.edited && ['espacio', 'receta', 'inicio'].includes(entry.kind)}
              onClick={() => applyRecipe(p.make(currentRecipe()), 'receta', p.name)}>{p.name}</button>
          ))}
        </div>
      </div>
      <div className="tabs" role="tablist" aria-label="Secciones">
        {tabs.map(([id, name]) => (
          <button key={id} type="button" role="tab" id={'tab-' + id} aria-selected={tab === id} aria-controls="pane" className="tab" onClick={() => setTab(id)}>{name}</button>
        ))}
      </div>
      <div className="pane" id="pane" role="tabpanel" aria-labelledby={'tab-' + tab}>
        {tab && <TabContent tab={tab} space={space} />}
      </div>
    </aside>
  );
}
