/**
 * Monotrama runtime, WebGL 2 only (see api.ts). Without WebGL 2 a piece shows its background colour and
 * the poster. Bundled + minified by scripts/runtime-plugin.ts (virtual:mt-runtime) and inlined into
 * exported code; entry-basic.ts is the same runtime plus the Canvas 2D engine.
 */
import { install } from './api';

install();
