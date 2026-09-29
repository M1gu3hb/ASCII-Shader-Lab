/**
 * The extras' sheets, loaded together on demand (the first time one of them opens).
 */
import { PosterSheet } from './PosterSheet';
import { PresetsSheet } from './PresetsSheet';

export function ExtrasSheets() {
  return (
    <>
      <PosterSheet />
      <PresetsSheet />
    </>
  );
}
