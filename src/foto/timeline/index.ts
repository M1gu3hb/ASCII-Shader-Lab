/**
 * The timeline of the photo and video studio (lane «anim»): mount <Timeline /> under the viewport; it
 * reads and edits the core store (src/project/store.ts). Importing it registers the whole animation
 * library (src/anim).
 *
 *   <Timeline clock={studioClock} previewPicture={() => smallPhoto} compact={isPhone} onSay={status} />
 *
 * Without `clock` it plays with its own (clock.ts) on the store's time; the studio can pass lane «video»'s
 * playback clock through the same PlaybackClock interface.
 */
export { Timeline, type TimelineProps } from './Timeline';
export { LibraryPicker } from './LibraryPicker';
export { EasePicker, CurveEditor, EaseIcon } from './EasePicker';
export { createClock, type PlaybackClock, type PlaybackState, type ClockOptions } from './clock';
export { PreviewScheduler, type PreviewItem } from './previews';
export { sampleProject, sampleProvider, samplePhoto, bestKind } from './samples';
export * from './math';
