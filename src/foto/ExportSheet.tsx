/**
 * «Exportar» (loaded on demand). The sheet itself is src/foto/export/ExportPanel.tsx: destination presets,
 * what goes out (the composition, each layer, masks, originals, cut-outs and mattes, real text, the project
 * file), formats with their honest limits, options, a preview drawn by the same code, progress and cancel.
 */
import { useProject } from '../project/store';
import { Sheet } from '../studio/Sheet';
import { ExportPanel } from './export/ExportPanel';
import { installExportQA } from './export/qa';
import { closeSheet, useFoto } from './ui';

if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('qa')) installExportQA();

export function ExportSheet() {
  const open = useFoto(s => s.sheet === 'export');
  const p = useProject(s => s.project);
  return (
    <Sheet open={open} wide title="Exportar" sub="Todo se hace en tu navegador: nada se sube. La vista previa sale del mismo código que el archivo." onClose={closeSheet}>
      {open && p && <div className="sheet-body xp-body"><ExportPanel p={p} /></div>}
    </Sheet>
  );
}
