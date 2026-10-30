/**
 * The body both bin names run.
 *
 * It lives outside `index.ts` because a bin entry must execute when run and must
 * NOT execute when imported — `sxng.ts` imports this module too, and a top-level
 * `main()` in the same file would run the CLI twice.
 *
 * Exit codes are assigned, never forced. `process.exit()` terminates before
 * Node flushes the stdout write buffer, and when stdout is a pipe the kernel
 * keeps only what fits — 65,536 bytes on Linux — so a piping caller received
 * cut-off, unparseable JSON. Letting the event loop drain writes it all.
 */

import { runCli } from './runCli.js';
import { SearXNGService } from './service.js';

export async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const service = new SearXNGService();

    try {
        const exitCode = await runCli(args, service);
        if (exitCode !== null) {
            process.exitCode = exitCode;
        }
    } catch (error) {
        console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
    }
}
