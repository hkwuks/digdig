#!/usr/bin/env node
/**
 * The pre-rename bin name. Removed in 0.5.0 along with the `sxng` entry in
 * package.json and `legacy.ts`.
 *
 * A separate entry file is the only reliable way to notice the old name: npm
 * generates a shim for each bin entry, so `process.argv[1]` is the real path of
 * dist/index.js either way and cannot tell the two names apart.
 */

import { main } from './entry.js';
import { deprecate } from './legacy.js';

deprecate('command', 'the `sxng` command is deprecated; use `digdig` (`sxng` is removed in 0.5.0)');

main();
