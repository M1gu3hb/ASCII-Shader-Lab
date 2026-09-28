/**
 * Monotrama runtime with the basic engine (Canvas 2D) for browsers without WebGL 2 (see api.ts).
 * Bundled by scripts/runtime-plugin.ts (virtual:mt-runtime-basic) with the basic engine's pattern table
 * replaced by a registry (basic-patterns.ts): the exported code appends only the CPU patterns its piece
 * uses, each registering itself through Monotrama.__basic.add with the shared helpers of `core`.
 */
import { BasicEngine } from '../engine/basic/engine';
import * as core from '../engine/basic/core';
import { install, type BasicSupport } from './api';
import { BASIC_PATTERNS, addPattern } from './basic-patterns';

const basic: BasicSupport = {
  Engine: BasicEngine,
  core: { ...core },
  add: addPattern,
  has: id => id in BASIC_PATTERNS,
};

install(basic);
