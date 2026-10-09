import { edit, useGlifos } from '../state';
import { MetricsPanel } from './editor/MetricsPanel';

/**
 * The document: its metrics (shared by every glyph), what it is for, and the authorship and licence that go
 * into the font's names and the project file.
 */
export function DocPanel() {
  const doc = useGlifos(s => s.doc);
  const readOnly = useGlifos(s => !!s.readOnly);
  if (!doc) return null;
  const lic = (k: keyof typeof doc.license, v: string) => edit(d => { d.license = { ...d.license, [k]: v.slice(0, k === 'author' ? 120 : 200) }; }, 'Licencia', { key: 'lic-' + k });
  return (
    <div className="gl-docpanel">
      <p className="note">{doc.mode === 'ascii'
        ? 'Símbolos ASCII: cada uno ocupa una celda del mismo ancho y su tinta decide qué tono representa (rampa). En el laboratorio sustituyen a los caracteres de la pieza.'
        : 'Alfabeto: letras con su propio ancho, márgenes y kerning, como una fuente. En el laboratorio dibujan las letras que tengas; las demás salen con la tipografía de la pieza.'}</p>
      <h3 className="sub">Métricas</h3>
      <MetricsPanel doc={doc} />
      <h3 className="sub">Autoría y licencia</h3>
      <p className="note">Van en los nombres de la fuente OTF y en el proyecto. Lo que diseñas es tuyo: elige tú la licencia.</p>
      <div className="ctl"><label className="lbl" htmlFor="lic-a">Autoría</label><input id="lic-a" type="text" disabled={readOnly} value={doc.license.author} onChange={e => lic('author', e.target.value)} /></div>
      <div className="ctl"><label className="lbl" htmlFor="lic-c">Copyright</label><input id="lic-c" type="text" disabled={readOnly} placeholder={`© ${new Date().getFullYear()} Tu nombre`} value={doc.license.copyright} onChange={e => lic('copyright', e.target.value)} /></div>
      <div className="ctl"><label className="lbl" htmlFor="lic-l">Licencia</label><input id="lic-l" type="text" disabled={readOnly} value={doc.license.license} onChange={e => lic('license', e.target.value)} /></div>
      <h3 className="sub">Revisiones</h3>
      <p className="note">Revisión {doc.rev}. {doc.published.length ? `Usado en el laboratorio ${doc.published.length} ${doc.published.length === 1 ? 'vez' : 'veces'}; la última, en la revisión ${doc.published[doc.published.length - 1].rev}.` : 'Todavía no se usó en el laboratorio.'}</p>
    </div>
  );
}
