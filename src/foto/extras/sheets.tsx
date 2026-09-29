/**
 * The extras' sheets, loaded together on demand (the first time one of them opens).
 */
import { PosterSheet } from './PosterSheet';
import { PresetsSheet } from './PresetsSheet';
import { ParallaxSheet } from './ParallaxSheet';
import { SequenceSheet } from './SequenceSheet';
import { WordsSheet } from './WordsSheet';

export function ExtrasSheets() {
  return (
    <>
      <PosterSheet />
      <PresetsSheet />
      <SequenceSheet />
      <ParallaxSheet />
      <WordsSheet />
    </>
  );
}
