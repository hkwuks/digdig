/**
 * Everything that keeps the pre-rename names working, in one module.
 *
 * Two rules hold this file together, and both exist so that 0.5.0 can delete it
 * with three deletions instead of a hunt:
 *
 * 1. It only ever READS the old world. No directory is moved, no config file is
 *    rewritten, no session record is migrated. Old and new binaries point at the
 *    same code during the transition, so moving a state directory would make a
 *    user's sessions disappear the moment they invoked the other bin name.
 *    Because nothing on disk is transformed, downgrading to 1.3.2 is always safe.
 *
 * 2. "Where a name comes from" lives here; "what the value means" stays at the
 *    call site. That is why config.ts can keep its empty-string and invalid-value
 *    semantics untouched across all ten variables.
 *
 * Nothing here writes to stdout: stdout carries the JSON envelope an Agent parses.
 */

import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export type DeprecationKind = 'command' | 'state' | 'config' | 'env';

/** Name of the state directory this version writes. */
export const STATE_DIR_NAME = '.digdig';
/** Name it wrote before the rename. */
export const LEGACY_STATE_DIR_NAME = '.sxng';

const announced = new Set<DeprecationKind>();

/** `DIGDIG_NO_DEPRECATION=1` silences the notices without changing behaviour. */
function suppressed(): boolean {
    const value = process.env.DIGDIG_NO_DEPRECATION;
    return value === '1' || value === 'true';
}

/**
 * Report one use of a pre-rename name, at most once per kind per process.
 *
 * Never throws and never changes the exit code: a deprecation notice is not
 * worth failing a search over. A closed stderr is swallowed for the same reason.
 */
export function deprecate(kind: DeprecationKind, message: string): void {
    if (suppressed() || announced.has(kind)) return;
    announced.add(kind);
    try {
        process.stderr.write(`[deprecation] ${message}\n`);
    } catch {
        // stderr is unavailable; saying so would be the only error here.
    }
}

/**
 * The state root in effect: `./.digdig` if it exists, else an existing `./.sxng`,
 * else `./.digdig` for the caller to create.
 *
 * Claiming the legacy directory in place is deliberate — see rule 1 above. The
 * legacy branch is what makes this a one-line reversal at the cut.
 */
export function resolveStateRoot(): string {
    const cwd = process.cwd();
    const current = join(cwd, STATE_DIR_NAME);
    if (existsSync(current)) return current;

    const legacy = join(cwd, LEGACY_STATE_DIR_NAME);
    if (existsSync(legacy)) {
        deprecate(
            'state',
            `${LEGACY_STATE_DIR_NAME}/ is still in use; rename it to ${STATE_DIR_NAME}/ (${LEGACY_STATE_DIR_NAME}/ support is removed in 0.5.0)`,
        );
        return legacy;
    }
    return current;
}

/** `resolveStateRoot()` joined with `segments`, so no caller re-implements it. */
export function resolveStatePath(...segments: string[]): string {
    return join(resolveStateRoot(), ...segments);
}

/**
 * The config file in effect, or `null` when none exists.
 *
 * New name wins in both scopes and does so silently: both files existing is the
 * normal shape of a transition, not a conflict to report.
 */
export function resolveConfigPath(): string | null {
    const cwdConfig = join(process.cwd(), 'digdig.config.json');
    if (existsSync(cwdConfig)) return cwdConfig;

    const cwdLegacy = join(process.cwd(), 'sxng.config.json');
    if (existsSync(cwdLegacy)) {
        deprecate('config', `sxng.config.json is still in use; rename it to digdig.config.json (support is removed in 0.5.0)`);
        return cwdLegacy;
    }

    const homeConfig = join(homedir(), 'digdig', 'digdig.config.json');
    if (existsSync(homeConfig)) return homeConfig;

    const homeLegacy = join(homedir(), 'sxng-cli', 'sxng.config.json');
    if (existsSync(homeLegacy)) {
        deprecate('config', `~/sxng-cli/sxng.config.json is still in use; move it to ~/digdig/digdig.config.json (support is removed in 0.5.0)`);
        return homeLegacy;
    }

    return null;
}

/**
 * One environment variable, raw and unparsed, under either prefix.
 *
 * `DIGDIG_<name>` wins silently when set — including when it is set to an empty
 * string, because callers already distinguish "" from undefined differently and
 * this must not change that. Returns the raw string; trimming and validation are
 * the caller's, exactly as before the rename.
 *
 * Not used for `SEARXNG_SETTINGS_PATH`: that variable belongs to the SearXNG
 * server process, which this CLI never reads.
 */
export function envRaw(name: string): string | undefined {
    const current = process.env[`DIGDIG_${name}`];
    if (current !== undefined) return current;

    const legacy = process.env[`SEARXNG_${name}`];
    if (legacy !== undefined) {
        deprecate('env', `SEARXNG_${name} is read for compatibility; use DIGDIG_${name} (SEARXNG_* support is removed in 0.5.0)`);
        return legacy;
    }
    return undefined;
}
