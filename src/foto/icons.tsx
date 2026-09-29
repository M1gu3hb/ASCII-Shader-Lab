/** Icons of the photo studio (24×24, stroke currentColor), in the lab's drawing style (src/studio/icons.tsx). */
import type { ReactElement, SVGProps } from 'react';
import type { LayerKind, MaskPart } from '../project/types';

type P = SVGProps<SVGSVGElement>;
const base = (p: P): P => ({ viewBox: '0 0 24 24', width: 18, height: 18, fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: false, ...p });

export const IHand = (p: P) => <svg {...base(p)}><path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11M11 10.5V5a1.5 1.5 0 0 1 3 0v6M14 10.5V6.5a1.5 1.5 0 0 1 3 0V14c0 3.6-2.4 6.5-6 6.5-2.3 0-3.8-1-5-2.8L4.3 15a1.5 1.5 0 0 1 2.4-1.8L8 14.6" /></svg>;
export const ICompare = (p: P) => <svg {...base(p)}><rect x="3.5" y="4.5" width="17" height="15" rx="1.5" /><path d="M12 3v18" /><path d="M3.5 15.5 8 11l4 4" /></svg>;
export const IFit = (p: P) => <svg {...base(p)}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /><rect x="8" y="8" width="8" height="8" rx="1" /></svg>;
export const IZoomIn = (p: P) => <svg {...base(p)}><circle cx="10.5" cy="10.5" r="6.5" /><path d="m20 20-4.5-4.5M8 10.5h5M10.5 8v5" /></svg>;
export const IZoomOut = (p: P) => <svg {...base(p)}><circle cx="10.5" cy="10.5" r="6.5" /><path d="m20 20-4.5-4.5M8 10.5h5" /></svg>;
export const IScissors = (p: P) => <svg {...base(p)}><circle cx="6.5" cy="7" r="2.5" /><circle cx="6.5" cy="17" r="2.5" /><path d="M8.6 8.4 20 17M8.6 15.6 20 7" /></svg>;
export const IUpload = (p: P) => <svg {...base(p)}><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></svg>;
export const IFolder = (p: P) => <svg {...base(p)}><path d="M3.5 7.5v10a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-7l-2-2.5h-4a2 2 0 0 0-2 2z" /></svg>;
export const IMask = (p: P) => <svg {...base(p)}><rect x="3.5" y="4.5" width="17" height="15" rx="1.5" /><circle cx="12" cy="12" r="4.5" fill="currentColor" fillOpacity={0.35} /></svg>;
export const IDup = (p: P) => <svg {...base(p)}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>;
export const IGrip = (p: P) => <svg {...base(p)}><circle cx="9" cy="7" r=".9" fill="currentColor" /><circle cx="15" cy="7" r=".9" fill="currentColor" /><circle cx="9" cy="12" r=".9" fill="currentColor" /><circle cx="15" cy="12" r=".9" fill="currentColor" /><circle cx="9" cy="17" r=".9" fill="currentColor" /><circle cx="15" cy="17" r=".9" fill="currentColor" /></svg>;
export const ILab = (p: P) => <svg {...base(p)}><path d="M9 3.5h6M10 3.5v5.2L4.8 17.6A2 2 0 0 0 6.5 20.5h11a2 2 0 0 0 1.7-2.9L14 8.7V3.5" /><path d="M7.5 14.5h9" /></svg>;
export const IPhoto = (p: P) => <svg {...base(p)}><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><circle cx="9" cy="10" r="1.8" /><path d="m20 16-5-5-8 8" /></svg>;
export const ITools = (p: P) => <svg {...base(p)}><path d="M4 20 14.5 9.5M13 5l6 6M16 3.5l4.5 4.5-3 3L13 6.5z" /></svg>;
export const ILayers = (p: P) => <svg {...base(p)}><path d="m12 4 8.5 4.3L12 12.6 3.5 8.3z" /><path d="m3.5 12.4 8.5 4.3 8.5-4.3M3.5 16.4 12 20.7l8.5-4.3" /></svg>;
export const ITemplate = (p: P) => <svg {...base(p)}><rect x="3.5" y="3.5" width="17" height="17" rx="1.5" /><path d="M3.5 9h17M9 9v11.5" /></svg>;
export const ISettings = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="3" /><path d="M12 2.8v2.4M12 18.8v2.4M4.2 7.5l2 1.2M17.8 15.3l2 1.2M4.2 16.5l2-1.2M17.8 8.7l2-1.2" /></svg>;
export const IHelp = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.6M12 16.8h.01" /></svg>;
export const IPlusMinus = (p: P) => <svg {...base(p)}><path d="M8 4v8M4 8h8M13 18h7" /></svg>;
export const ISave = (p: P) => <svg {...base(p)}><path d="M5 4h11l3 3v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z" /><path d="M8 4v5h7V4M8 20v-6h8v6" /></svg>;

const KIND_PATH: Record<LayerKind, ReactElement> = {
  photo: <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><circle cx="9" cy="10" r="1.8" /><path d="m20 16-5-5-8 8" /></>,
  ascii: <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M7 9h1M11 9h1M15 9h2M7 12.5h3M13 12.5h1M7 16h1M11 16h5" /></>,
  glyphs: <><path d="M4 18 8.5 6h1L14 18M5.6 14h6.8" /><path d="M16 11.5h4M16 15h4M16 18h3" /></>,
  text: <><path d="M5 6h14M12 6v13M9 19h6" /></>,
  shape: <><rect x="4" y="4" width="10" height="10" rx="1" /><circle cx="15.5" cy="15.5" r="4.5" /></>,
};
export const KindIcon = ({ kind, ...p }: P & { kind: LayerKind }) => <svg {...base(p)}>{KIND_PATH[kind]}</svg>;

const PART_PATH: Record<MaskPart['kind'], ReactElement> = {
  rect: <rect x="4.5" y="6" width="15" height="12" rx="1" />,
  ellipse: <ellipse cx="12" cy="12" rx="8" ry="6.5" />,
  polygon: <path d="M5 17 8 6l7 3 4 8z" />,
  stroke: <path d="M4 17c3-6 5 1 8-4s5-3 8-6" strokeWidth={2.6} />,
  raster: <><rect x="4" y="4" width="16" height="16" rx="1.5" /><path d="M8 8h2v2H8zM12 8h2v2h-2zM10 10h2v2h-2zM14 10h2v2h-2zM8 12h2v2H8zM12 14h2v2h-2z" fill="currentColor" stroke="none" /></>,
  color: <><path d="M12 4s6 6.5 6 10.5a6 6 0 0 1-12 0C6 10.5 12 4 12 4z" /></>,
};
export const PartIcon = ({ kind, ...p }: P & { kind: string }) => <svg {...base(p)}>{PART_PATH[kind as MaskPart['kind']] ?? <circle cx="12" cy="12" r="7" />}</svg>;
