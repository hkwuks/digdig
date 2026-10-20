/**
 * digdig - Interactive Configuration Setup
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';
import readline from 'readline';
import { resolveConfigPath } from './legacy.js';

export interface SearXNGConfig {
    baseUrl: string;
    defaultEngine: string;
    allowedEngines: string[];
    defaultLimit: number;
    useProxy: boolean;
    proxyUrl: string;
    timeout: number;
    ollamaApiKey: string;
    deepseekApiKey: string;
}

const DEFAULT_CONFIG: SearXNGConfig = {
    baseUrl: 'http://localhost:8080',
    defaultEngine: '',
    allowedEngines: [],
    defaultLimit: 10,
    useProxy: false,
    proxyUrl: '',
    // Same default as config.ts, so `init` does not write a value the README
    // would then have to contradict.
    timeout: 10000,
    ollamaApiKey: '',
    deepseekApiKey: ''
};

class ConfiguratorInterface {
    private rl: readline.Interface;

    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    async question(prompt: string, defaultValue?: string): Promise<string> {
        return new Promise((resolve) => {
            const displayPrompt = defaultValue ? `${prompt} [${defaultValue}]: ` : `${prompt}: `;
            this.rl.question(displayPrompt, (answer) => {
                resolve(answer.trim() || defaultValue || '');
            });
        });
    }

    async confirm(prompt: string, defaultValue: boolean = true): Promise<boolean> {
        const answer = await this.question(
            `${prompt} (${defaultValue ? 'Y/n' : 'y/N'})`,
            defaultValue ? 'y' : 'n'
        );
        return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
    }

    async multilineInput(prompt: string): Promise<string[]> {
        console.log(prompt);
        console.log('(Enter items separated by commas, or press Enter to skip)');
        const input = await this.question('> ');
        return input
            .split(',')
            .map(item => item.trim())
            .filter(item => item.length > 0);
    }

    close(): void {
        this.rl.close();
    }
}

export async function initConfig(): Promise<number> {
    // Only the new location is written. An existing config under the old name is
    // still read (via `resolveConfigPath`), but `init` never creates `~/sxng-cli/`.
    const configDir = resolve(homedir(), 'digdig');
    const configPath = resolve(configDir, 'digdig.config.json');
    const configurator = new ConfiguratorInterface();

    console.log('\n📝 digdig Configuration Setup\n');
    console.log('This will guide you through setting up your SearXNG configuration.\n');

    let config: SearXNGConfig = { ...DEFAULT_CONFIG };

    // Load existing config if available
    const existingPath = existsSync(configPath) ? configPath : resolveConfigPath();
    if (existingPath) {
        const useExisting = await configurator.confirm(`Found existing config (${existingPath}). Use it as base`);
        if (useExisting) {
            try {
                const existing = JSON.parse(readFileSync(existingPath, 'utf-8'));
                config = { ...DEFAULT_CONFIG, ...existing };
                console.log('✓ Loaded existing configuration\n');
            } catch (error) {
                console.log('⚠ Failed to parse existing config, starting fresh\n');
            }
        }
    }

    // Configure baseUrl
    console.log('--- SearXNG Server Configuration ---');
    config.baseUrl = await configurator.question(
        'SearXNG server URL',
        config.baseUrl
    );

    // Configure default engine
    const engineChoice = await configurator.question(
        'Default search engine (leave blank for none)',
        config.defaultEngine
    );
    config.defaultEngine = engineChoice;

    // Configure allowed engines
    const allowedEnginesInput = await configurator.multilineInput(
        'Allowed engines (leave blank to allow all)'
    );
    if (allowedEnginesInput.length > 0) {
        config.allowedEngines = allowedEnginesInput;
    }

    // Configure default limit
    console.log('\n--- Result Settings ---');
    const limitStr = await configurator.question(
        'Default result limit',
        String(config.defaultLimit)
    );
    config.defaultLimit = Math.max(1, parseInt(limitStr, 10) || 10);

    // Configure timeout
    const timeoutStr = await configurator.question(
        'Request timeout (milliseconds)',
        String(config.timeout)
    );
    config.timeout = Math.max(1000, parseInt(timeoutStr, 10) || 10000);

    // Configure proxy
    console.log('\n--- Proxy Configuration ---');
    const useProxy = await configurator.confirm('Use HTTP proxy', config.useProxy);
    config.useProxy = useProxy;

    if (useProxy) {
        config.proxyUrl = await configurator.question(
            'Proxy URL',
            config.proxyUrl
        );
    } else {
        config.proxyUrl = '';
    }

    // Ollama and DeepSeek are extra backends the user picks explicitly with -e.
    // Neither is an automatic fallback: an unreachable SearXNG fails the search.
    console.log('\n--- Ollama Web Search (optional) ---');
    console.log('Optional: searched with -e ollama. Not a fallback for an unreachable SearXNG.');
    config.ollamaApiKey = await configurator.question(
        'Ollama API key (leave blank to skip)',
        config.ollamaApiKey
    );

    console.log('\n--- DeepSeek Search (optional) ---');
    console.log('Optional: searched with -e deepseek. Billed per successful request.');
    config.deepseekApiKey = await configurator.question(
        'DeepSeek API key (leave blank to skip)',
        config.deepseekApiKey
    );

    // Review and confirm
    console.log('\n--- Configuration Summary ---');
    console.log(JSON.stringify(config, null, 2));

    const confirm = await configurator.confirm('\nSave this configuration');
    configurator.close();

    if (confirm) {
        try {
            // Ensure config directory exists
            if (!existsSync(configDir)) {
                mkdirSync(configDir, { recursive: true });
            }
            writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
            console.log(`\n✓ Configuration saved to ${configPath}`);
            console.log('\n✨ Setup complete! You can now use digdig to search.\n');
            console.log('Try it out:');
            console.log('  dg "TypeScript tutorial"\n');
            return 0;
        } catch (error) {
            console.error(`\n✗ Failed to save configuration: ${error instanceof Error ? error.message : String(error)}`);
            return 1;
        }
    } else {
        console.log('\n❌ Configuration not saved.');
        return 1;
    }
}
