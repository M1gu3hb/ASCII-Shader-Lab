/** The editor's line icons (18 px grid, currentColor). */
import type { ReactNode } from 'react';

const I = ({ children }: { children: ReactNode }) => (
  <svg className="ge-ic" viewBox="0 0 18 18" aria-hidden="true" focusable="false">{children}</svg>
);

export const ICONS: Record<string, ReactNode> = {
  seleccionar: <I><path d="M4 2.5l9.5 7-4.2.6 2.6 5-1.9.9-2.5-5-3.5 2.7z" /></I>,
  pluma: <I><path d="M9 2.5l4.5 6.5-2 5.5h-5l-2-5.5z" /><path d="M9 2.5v6" /><circle cx="9" cy="9.6" r="1.1" /><path d="M6.5 16h5" /></I>,
  lapiz: <I><path d="M3 15l1-3.6 8-8 2.6 2.6-8 8z" /><path d="M10.6 4.8l2.6 2.6" /></I>,
  rectangulo: <I><rect x="3" y="4" width="12" height="10" rx="0.5" /></I>,
  elipse: <I><ellipse cx="9" cy="9" rx="6.2" ry="5.2" /></I>,
  guia: <I><path d="M2 6h14" strokeDasharray="2 2" /><path d="M6 2v14" strokeDasharray="2 2" /><path d="M10 10h5v5h-5z" /></I>,
  unir: <I><path d="M3 3h7v4h5v8H8v-4H3z" className="f" /></I>,
  restar: <I><path d="M3 3h7v4H8v4H3z" className="f" /><rect x="8" y="7" width="7" height="8" strokeDasharray="2 1.6" /></I>,
  intersecar: <I><rect x="3" y="3" width="7" height="8" strokeDasharray="2 1.6" /><rect x="8" y="7" width="7" height="8" strokeDasharray="2 1.6" /><rect x="8" y="7" width="2" height="4" className="f" /></I>,
  excluir: <I><path d="M3 3h7v4H8v4H3z" className="f" /><path d="M10 7h5v8H8v-4h2z" className="f" /></I>,
  solapamientos: <I><circle cx="7" cy="9" r="4.5" /><circle cx="11" cy="9" r="4.5" /><path d="M9 5.6v6.8" strokeDasharray="1.4 1.4" /></I>,
  menos: <I><path d="M4 9h10" /></I>,
  mas: <I><path d="M4 9h10M9 4v10" /></I>,
  ajustar: <I><path d="M3 7V3h4M11 3h4v4M15 11v4h-4M7 15H3v-4" /></I>,
  duplicar: <I><rect x="6" y="6" width="9" height="9" rx="1" /><path d="M3 12V3h9" /></I>,
  eliminar: <I><path d="M4 5h10M7 5V3h4v2M5.5 5l.8 10h5.4l.8-10" /></I>,
  'reflejar-h': <I><path d="M9 2v14" strokeDasharray="2 1.6" /><path d="M7 4L2.5 13H7z" /><path d="M11 4l4.5 9H11z" className="f" /></I>,
  'reflejar-v': <I><path d="M2 9h14" strokeDasharray="2 1.6" /><path d="M4 7L13 2.5V7z" /><path d="M4 11l9 4.5V11z" className="f" /></I>,
  invertir: <I><path d="M4 7a5 5 0 0 1 9-2.5M14 11a5 5 0 0 1-9 2.5" /><path d="M13.5 2v3h-3M4.5 16v-3h3" /></I>,
  cerrar: <I><path d="M5 13a5 5 0 1 1 8 0" /><circle cx="5" cy="13" r="1.4" className="f" /><circle cx="13" cy="13" r="1.4" className="f" /><path d="M6.4 13h5.2" /></I>,
  abrir: <I><path d="M5 13a5 5 0 1 1 8 0" /><circle cx="5" cy="13" r="1.4" className="f" /><circle cx="13" cy="13" r="1.4" className="f" /></I>,
  candado: <I><rect x="4" y="8" width="10" height="7.5" rx="1.2" /><path d="M6 8V6a3 3 0 0 1 6 0v2" /></I>,
};
