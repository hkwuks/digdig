/** Report what a session has looked at, as counted facts. */

import { createErrorEnvelope, createSuccessEnvelope } from '../protocol.js';
import { resolveSessionPath, loadSessionResults, loadSessionRounds } from '../deep/session.js';
import { buildCoverage } from '../deep/coverage.js';

export interface CoverageOptions {
    session: string;
    format?: 'json' | 'md';
}

function formatAsMarkdown(report: ReturnType<typeof buildCoverage>): string {
    const lines: string[] = [];
    lines.push(`## Coverage — ${report.rounds} rounds, ${report.uniqueResults} results`);
    lines.push('');

    lines.push('### Rounds');
    lines.push('');
    lines.push('| Round | Queries | Engines | New | Already seen |');
    lines.push('|-------|---------|---------|-----|--------------|');
    for (const round of report.byRound) {
        const repeated = round.repeatedFromEarlier > 0 ? String(round.repeatedFromEarlier) : '-';
        lines.push(`| ${round.round} | ${round.queries.join(' · ') || '-'} | ${round.engines.join(',') || '-'} | ${round.newResults} | ${repeated} |`);
    }
    lines.push('');

    for (const round of report.byRound) {
        if (!round.titles.length) continue;
        lines.push(`**Round ${round.round} titles**`);
        lines.push('');
        for (const title of round.titles) lines.push(`- ${title}`);
        lines.push('');
    }

    if (report.repeated.length) {
        lines.push('### Seen in more than one round');
        lines.push('');
        for (const item of report.repeated.slice(0, 20)) {
            lines.push(`- ${item.url} (rounds ${item.rounds.join(', ')})`);
        }
        lines.push('');
    }

    if (report.distinctiveTerms.length) {
        lines.push('### Distinctive terms');
        lines.push('');
        lines.push('Terms used only inside one round, listed per round.');
        lines.push('');
        const rounds = [...new Set(report.distinctiveTerms.map(t => t.round))].sort((a, b) => a - b);
        for (const round of rounds) {
            const terms = report.distinctiveTerms.filter(t => t.round === round);
            lines.push(`**Round ${round}**: ${terms.map(t => `${t.term}(${t.docFreq})`).join(' · ')}`);
            lines.push('');
        }
    }

    if (report.domainsSeen.length) {
        lines.push('### Domains used');
        lines.push('');
        lines.push(report.domainsSeen.slice(0, 15)
            .map(d => `${d.domain}(${d.results})`).join(' · '));
        lines.push('');
    }

    if (report.untouchedSpecialized.length) {
        lines.push('### Specialized sources not yet used');
        lines.push('');
        lines.push(report.untouchedSpecialized.join(' · '));
        lines.push('');
    }

    return lines.join('\n');
}

export async function runCoverage(options: CoverageOptions): Promise<number> {
    const sessionDir = resolveSessionPath(options.session);
    const results = loadSessionResults(sessionDir);
    if (results.length === 0) {
        console.log(JSON.stringify(createErrorEnvelope(
            'EMPTY_SESSION',
            'This session has no stored results to report on',
            { retryable: false, hint: 'Run a search with --session before asking for coverage' }
        ), null, 2));
        return 1;
    }

    const report = buildCoverage(results, loadSessionRounds(sessionDir));

    if (options.format === 'md') {
        console.log(formatAsMarkdown(report));
    } else {
        console.log(JSON.stringify(createSuccessEnvelope(report), null, 2));
    }
    return 0;
}
