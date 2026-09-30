/**
 * Tool icons: inline SVG, 24 × 24, drawn with currentColor (the palette sets the colour), 1.5 px strokes to sit
 * with the studio's hairline icons.
 */
const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

export const ICONS = {
  rect: svg('<rect x="4" y="5.5" width="16" height="13" stroke-dasharray="3 2.2"/>'),
  ellipse: svg('<ellipse cx="12" cy="12" rx="8.5" ry="6.5" stroke-dasharray="3 2.2"/>'),
  polygon: svg('<path d="M5 17.5 7.5 6l9 2.5L19 16l-6.5 3.5z"/><rect x="6.5" y="5" width="2" height="2" fill="currentColor" stroke="none"/><rect x="18" y="15" width="2" height="2" fill="currentColor" stroke="none"/><rect x="4" y="16.5" width="2" height="2" fill="currentColor" stroke="none"/>'),
  lasso: svg('<path d="M9.5 16.5c-4-.5-6.5-2.8-6-5.6C4.1 7.2 8.6 4.8 13.4 5.2c4.6.4 7.6 3.1 7 6-.5 2.6-4 4.6-8.4 4.8"/><path d="M10.2 15.5c-1.6.7-1.9 2.4-.5 3.1 1.1.6 1.4 1.6.6 2.4"/>'),
  contour: svg('<path d="M4 18c3-1 4.5-4 6-8s3.5-5.5 7-6"/><rect x="2.8" y="16.8" width="2.4" height="2.4"/><rect x="8.8" y="8.8" width="2.4" height="2.4"/><rect x="16" y="2.8" width="2.4" height="2.4"/><path d="M15 20h5M17.5 17.5v5" stroke-width="1.2"/>'),
  brushAscii: svg('<path d="M14.5 4.5 19.5 9.5 11 18l-5 1 1-5z"/><path d="M13 6l5 5"/><path d="M3.5 21h2M8 21h1.5" /><text x="15" y="21.5" font-size="6.5" font-family="ui-monospace,monospace" fill="currentColor" stroke="none">A</text>'),
  erase: svg('<path d="M9 19.5h11"/><path d="M4.6 14.9 13.7 5.8a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8L12 19.5H8.9l-4.3-4.3a.4.4 0 0 1 0-.3z"/><path d="M9 10.5l5 5"/>'),
  restore: svg('<path d="M4 12a8 8 0 1 0 2.3-5.6"/><path d="M4 4v4h4"/><circle cx="12" cy="12" r="2.4"/>'),
  color: svg('<path d="M15.5 3.8a2 2 0 0 1 2.8 0l1.9 1.9a2 2 0 0 1 0 2.8L18 10.7 13.3 6z"/><path d="M14.4 7.1 5 16.5 4 20l3.5-1 9.4-9.4"/><path d="M8.5 13 11 15.5"/>'),
  object: svg('<path d="M7.5 18.5c-2.5-1-3.8-3.6-3.2-6.4.7-3.3 3.8-5.8 7.4-5.9 3.3-.1 6.1 1.8 6.6 4.5" stroke-dasharray="2.6 2"/><path d="M13 11.5l7.5 3-3.2 1.2-1.3 3.3z" fill="currentColor"/>'),
  gradient: svg('<rect x="4" y="4" width="16" height="16"/><path d="M8 4v16" stroke-dasharray="1 1.6"/><path d="M12 4v16" stroke-dasharray="1 2.6"/><path d="M16 4v16" stroke-dasharray="1 4"/>'),
  edit: svg('<path d="M5 3.5 5.2 17l3.4-3.3 2.6 5.8 2.4-1.1-2.6-5.7 4.8-.1z"/><rect x="16.5" y="16.5" width="4" height="4"/>'),
} as const;
