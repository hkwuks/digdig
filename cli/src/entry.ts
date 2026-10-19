/**
 * The body both bin names run.
 *
 * It lives outside `index.ts` because a bin entry must execute when run and must
 * NOT execute when imported — `sxng.ts` imports this module too, and a top-level
 * `main()` in the same file would run the CLI twice.
 */

import { runCli } from './runCli.js';
import { SearXNGService } from './service.js';

export async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const service = new SearXNGService();

    try {
        const exitCode = await runCli(args, service);
        if (exitCode !== null) {
            process.exit(exitCode);
        }
    } catch (error) {
        console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    }
}
