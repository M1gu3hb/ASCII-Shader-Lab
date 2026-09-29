/** Icons of the extras (the studio's line style: 24 px box, 1.6 stroke, currentColor). */
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const base = (p: P): P => ({ width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, ...p });

export const IPoster = (p: P) => <svg {...base(p)}><rect x="5" y="3.5" width="14" height="17" rx="1" /><path d="M8 7h8M8 16.5h5M8 18.5h3" /><rect x="8" y="9" width="8" height="5" /></svg>;
export const IPreset = (p: P) => <svg {...base(p)}><path d="M5 6h9M18 6h1M5 12h3M12 12h7M5 18h11M20 18h-1" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg>;
export const ISequence = (p: P) => <svg {...base(p)}><rect x="3" y="6" width="7" height="9" rx="1" /><rect x="8.5" y="4" width="7" height="9" rx="1" /><rect x="14" y="8" width="7" height="9" rx="1" /><path d="M6 19.5h12" /><path d="m16 18 2 1.5-2 1.5" /></svg>;
export const IDepth = (p: P) => <svg {...base(p)}><path d="M4 16.5 12 20l8-3.5M4 12.5 12 16l8-3.5" /><path d="M12 4 4 7.5 12 11l8-3.5z" /></svg>;
export const IWords = (p: P) => <svg {...base(p)}><path d="M12 3.5c3.5 0 5.5 2.6 5.5 6 0 4.2-2.8 7-5.5 10.5C9.3 16.5 6.5 13.7 6.5 9.5c0-3.4 2-6 5.5-6z" /><path d="M9.5 8.5h5M9 11h6M10 13.5h4" /></svg>;
export const IGuides = (p: P) => <svg {...base(p)}><rect x="3.5" y="3.5" width="17" height="17" rx="1" strokeDasharray="2 2" /><rect x="7" y="7" width="10" height="10" /></svg>;
export const IExtras = (p: P) => <svg {...base(p)}><rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="4" width="7" height="7" rx="1" /><rect x="4" y="13" width="7" height="7" rx="1" /><path d="M16.5 13v7M13 16.5h7" /></svg>;
export const IPlay = (p: P) => <svg {...base(p)}><path d="M7 5l12 7-12 7z" /></svg>;
export const IBack = (p: P) => <svg {...base(p)}><path d="M17 5 5 12l12 7z" /></svg>;
export const IPause = (p: P) => <svg {...base(p)}><path d="M8 5v14M16 5v14" /></svg>;
export const IStop = (p: P) => <svg {...base(p)}><rect x="6" y="6" width="12" height="12" rx="1" /></svg>;
