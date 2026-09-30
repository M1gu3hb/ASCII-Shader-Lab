import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const base = (p: P) => ({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, ...p });

export const IDice = (p: P) => <svg {...base(p)}><rect x="3.5" y="3.5" width="17" height="17" rx="3.5" /><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" stroke="none" /><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" /><circle cx="15.5" cy="8.5" r="1.2" fill="currentColor" stroke="none" /><circle cx="8.5" cy="15.5" r="1.2" fill="currentColor" stroke="none" /></svg>;
export const IPrev = (p: P) => <svg {...base(p)}><path d="M15 5 8 12l7 7" /></svg>;
export const INext = (p: P) => <svg {...base(p)}><path d="m9 5 7 7-7 7" /></svg>;
export const IStar = (p: P & { filled?: boolean }) => { const { filled, ...rest } = p; return <svg {...base(rest)}><path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" fill={filled ? 'currentColor' : 'none'} /></svg>; };
export const ISpark = (p: P) => <svg {...base(p)}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" /></svg>;
export const IPause = (p: P) => <svg {...base(p)}><path d="M8 5v14M16 5v14" strokeWidth={2.4} /></svg>;
export const IPlay = (p: P) => <svg {...base(p)}><path d="M7 5v14l12-7z" fill="currentColor" /></svg>;
export const IFull = (p: P) => <svg {...base(p)}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>;
export const IDownload = (p: P) => <svg {...base(p)}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>;
export const IGrid = (p: P) => <svg {...base(p)}><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></svg>;
export const ILock = (p: P) => <svg {...base(p)}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>;
export const IUnlock = (p: P) => <svg {...base(p)}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 7.5-2" /></svg>;
export const IClose = (p: P) => <svg {...base(p)}><path d="M6 6l12 12M18 6 6 18" /></svg>;
export const IPlus = (p: P) => <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>;
export const ITrash = (p: P) => <svg {...base(p)}><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" /></svg>;
export const IUp = (p: P) => <svg {...base(p)}><path d="m6 14 6-6 6 6" /></svg>;
export const IDown = (p: P) => <svg {...base(p)}><path d="m6 10 6 6 6-6" /></svg>;
export const IEye = (p: P) => <svg {...base(p)}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.8" /></svg>;
export const IEyeOff = (p: P) => <svg {...base(p)}><path d="M4 4l16 16M9.9 5.8A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.7 3.5M6.2 7.4A15.6 15.6 0 0 0 2.5 12S6 18.5 12 18.5c1.4 0 2.6-.3 3.7-.8" /></svg>;
export const ILink = (p: P) => <svg {...base(p)}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1" /></svg>;
export const ICopy = (p: P) => <svg {...base(p)}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>;
export const IUndo = (p: P) => <svg {...base(p)}><path d="M9 7 4 12l5 5M4 12h11a5 5 0 0 1 0 10h-2" /></svg>;
export const IRedo = (p: P) => <svg {...base(p)}><path d="m15 7 5 5-5 5M20 12H9a5 5 0 0 0 0 10h2" /></svg>;
export const IKeys = (p: P) => <svg {...base(p)}><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" /></svg>;
export const ISliders = (p: P) => <svg {...base(p)}><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg>;
export const ICamera = (p: P) => <svg {...base(p)}><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>;
export const IImage = (p: P) => <svg {...base(p)}><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><circle cx="9" cy="10" r="1.8" /><path d="m20 16-5-5-8 8" /></svg>;
export const IRefresh = (p: P) => <svg {...base(p)}><path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" /></svg>;
export const IExplore = (p: P) => <svg {...base(p)}><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /><path d="M17 14v6M14 17h6" /></svg>;
export const IMore = (p: P) => <svg {...base(p)}><circle cx="5" cy="12" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="19" cy="12" r="1.3" fill="currentColor" /></svg>;
export const ITerminal = (p: P) => <svg {...base(p)}><rect x="3" y="4.5" width="18" height="15" rx="2" /><path d="m7 9 3 3-3 3M12 15h5" /></svg>;
export const ITune = (p: P) => <svg {...base(p)}><path d="M5 4v16M12 4v16M19 4v16" /><rect x="3" y="13" width="4" height="3" rx="1" fill="currentColor" /><rect x="10" y="7" width="4" height="3" rx="1" fill="currentColor" /><rect x="17" y="15" width="4" height="3" rx="1" fill="currentColor" /></svg>;
/** A seed: the number that repeats a piece. */
export const ISeed = (p: P) => <svg {...base(p)}><path d="M12 20.5c-4.4 0-7-3.3-7-7.2C5 8.4 9 5 12 3.5c3 1.5 7 4.9 7 9.8 0 3.9-2.6 7.2-7 7.2Z" /><path d="M12 9v11.5" /></svg>;
/** Recipes: starting points, a small stack of cards. */
export const IRecipes = (p: P) => <svg {...base(p)}><rect x="4" y="7.5" width="13" height="12.5" rx="1.5" /><path d="M7.5 4.5h11a1.5 1.5 0 0 1 1.5 1.5v10.5" /><path d="M7 12h7M7 15.5h4.5" /></svg>;
/** Hide the settings column: the column steps aside to the right. */
export const IPanelOff = (p: P) => <svg {...base(p)}><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M14.5 4.5v15M8.5 9.5 11 12l-2.5 2.5" /></svg>;
/** Switch between the front and the rear camera. */
export const IFlip = (p: P) => <svg {...base(p)}><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><path d="M9.3 12.2a3 3 0 0 1 5.2-1.4M14.7 13.8a3 3 0 0 1-5.2 1.4" /><path d="M14.7 9.4v1.6h-1.6M9.3 16.6V15h1.6" /></svg>;

/* ---------- spaces, settings groups and destination views: one small set, drawn on the same 24 px grid ---------- */

export const IFondos = (p: P) => <svg {...base(p)}><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M3.5 14c2.8-2.3 5.7-2.3 8.5 0s5.7 2.3 8.5 0M7 8.5h5" /></svg>;
export const IArte = (p: P) => <svg {...base(p)}><circle cx="9" cy="9.5" r="5" /><rect x="10.5" y="10.5" width="9.5" height="9.5" rx="1.5" /></svg>;
export const ITipo = (p: P) => <svg {...base(p)}><path d="M3.5 18.5 8 6h1.4l4.5 12.5M5.1 14.3h7.2" /><circle cx="17.6" cy="15.6" r="2.9" /><path d="M20.5 12.6v5.9" /></svg>;
export const IPiezas = (p: P) => <svg {...base(p)}><path d="m8 7-4.5 5L8 17M16 7l4.5 5-4.5 5M13.5 4.5l-3 15" /></svg>;

export const IForma = (p: P) => <svg {...base(p)}><path d="m12 4 8.5 4.3L12 12.6 3.5 8.3z" /><path d="m3.5 12.4 8.5 4.3 8.5-4.3M3.5 16.4 12 20.7l8.5-4.3" /></svg>;
export const IColor = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none" /></svg>;
export const IGlifos = (p: P) => <svg {...base(p)}><path d="M10 4 8 20M16 4l-2 16M5 9h15M4 15h15" /></svg>;
export const IMov = (p: P) => <svg {...base(p)}><path d="M3 12c1.5-4 3-6 4.5-6s3 4 4.5 6 3 6 4.5 6 3-2 4.5-6" /></svg>;
export const IFx = (p: P) => <svg {...base(p)}><path d="M10.5 3.5c.7 4.2 3.3 6.8 7.5 7.5-4.2.7-6.8 3.3-7.5 7.5-.7-4.2-3.3-6.8-7.5-7.5 4.2-.7 6.8-3.3 7.5-7.5zM19 15.5v5M16.5 18h5" /></svg>;
export const IFuente = (p: P) => <svg {...base(p)}><path d="M12 3.5v9M8.5 9 12 12.5 15.5 9M4 13.5v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" /></svg>;
/** Transformar: a square of cells that turns into a circle of dots. */
export const IXform = (p: P) => <svg {...base(p)}><rect x="3.5" y="3.5" width="8" height="8" rx="1" /><path d="M7.5 3.5v8M3.5 7.5h8M13.5 6.5h4a2 2 0 0 1 2 2v2.5M17.5 9l2 2 2-2" /><circle cx="15.5" cy="17" r="3.5" /><circle cx="15.5" cy="17" r=".9" fill="currentColor" stroke="none" /></svg>;
export const IMsg = (p: P) => <svg {...base(p)}><path d="M3.5 8h11M3.5 12h7M3.5 16h9" /><rect x="15.5" y="12.5" width="4" height="6" rx=".6" fill="currentColor" stroke="none" /></svg>;

export const IVLibre = (p: P) => <svg {...base(p)}><rect x="3.5" y="5.5" width="17" height="13" rx="1.5" /></svg>;
export const IVWeb = (p: P) => <svg {...base(p)}><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M3.5 8.5h17M6.2 6.5h.01M8.4 6.5h.01" /></svg>;
export const IVMovil = (p: P) => <svg {...base(p)}><rect x="7" y="3" width="10" height="18" rx="2.2" /><path d="M11 5.6h2" /></svg>;
export const IVTarjeta = (p: P) => <svg {...base(p)}><rect x="3.5" y="5" width="17" height="14" rx="2" /><path d="M3.5 13h17M6.5 16h6" /></svg>;
export const IVVertical = (p: P) => <svg {...base(p)}><rect x="7.5" y="3" width="9" height="18" rx="1.5" /><path d="m11 10 2.8 2-2.8 2z" fill="currentColor" /></svg>;
export const IVReadme = (p: P) => <svg {...base(p)}><path d="M6.5 3.5H14l3.5 3.5v13.5h-11z" /><path d="M14 3.5V7h3.5M9 11.5h6M9 14.5h6M9 17.5h4" /></svg>;

type Icon = (p: P) => React.JSX.Element;

/** Each creative space (the top bar, its picker on narrow screens). */
export const SPACE_ICON: Record<string, Icon> = { fondos: IFondos, arte: IArte, media: IImage, tipo: ITipo, terminal: ITerminal, componentes: IPiezas };
/** Each settings group, by its id (the same group has a different name in some spaces). */
export const TAB_ICON: Record<string, Icon> = { forma: IForma, color: IColor, glifos: IGlifos, mov: IMov, fx: IFx, fuente: IFuente, msg: IMsg, term: ITerminal, xform: IXform, recetas: IRecipes };
/** Each destination view. */
export const VIEW_ICON: Record<string, Icon> = { libre: IVLibre, web: IVWeb, movil: IVMovil, tarjeta: IVTarjeta, vertical: IVVertical, readme: IVReadme, terminal: ITerminal };
