import { useEffect, useState } from 'react';

/** The studio's phone layout (bottom dock, settings as a sheet): the same breakpoint as its CSS. */
export const PHONE_Q = '(max-width: 900px)';
/** A phone on its side: the settings become a column beside the piece, the dock a single row. */
export const LAND_Q = '(max-width: 900px) and (orientation: landscape) and (max-height: 500px)';

const matches = (q: string) => typeof matchMedia === 'function' && matchMedia(q).matches;

/** Whether a media query matches, kept up to date. */
export function useMatch(q: string): boolean {
  const [on, setOn] = useState(() => matches(q));
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia(q);
    const change = () => setOn(mq.matches);
    change();
    mq.addEventListener('change', change);
    return () => mq.removeEventListener('change', change);
  }, [q]);
  return on;
}

/** True on phone-sized screens (the layout's own breakpoint). */
export const usePhone = () => useMatch(PHONE_Q);
export const isPhone = () => matches(PHONE_Q);
