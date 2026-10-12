/** One more try after a moment (a dropped connection); if that fails too, LoadBoundary (Boundary.tsx) says so. */
export const retry = <T,>(load: () => Promise<T>) => (): Promise<T> =>
  load().catch(() => new Promise<void>(r => setTimeout(r, 1000)).then(load));
