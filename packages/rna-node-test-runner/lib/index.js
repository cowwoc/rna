import { readConfigFile, mergeConfig, locateConfigFile } from '@chialab/rna-config-loader';

/**
 * @typedef {Object} TestRunnerConfig
 * @property {string[]} [files] A list or a glob of files to test.
 * @property {boolean} [coverage] Should collect coverage data.
 * @property {import('@chialab/rna-config-loader').AliasMap} [alias]
 */

/**
 * Run tests in node environment using mocha.
 * @param {TestRunnerConfig} config
 */
export async function test(config) {
    const { default: os } = await import('os');
    const { promises: fs } = await import('fs');
    const { default: path } = await import('path');
    const { Worker } = await import('worker_threads');
    const { Report } = await import('c8');

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rna-nyc'));
    process.env.NODE_V8_COVERAGE = tmpDir;

    const worker = new Worker(new URL('./worker.js', import.meta.url), {
        workerData: {
            files: config.files || [
                'test/**/*.test.js',
                'test/**/*.spec.js',
            ],
        },
    });

    const failures = await new Promise((resolve) => {
        worker.on('message', async ({ event, data }) => {
            if (event === 'end') {
                await worker.terminate();
                resolve(data);
            }
        });

        worker.postMessage({ event: 'run' });
    });

    const report = new Report({
        include: ['**'],
        exclude: [
            'node_modules/**',
            'coverage/**',
            'packages/*/test{,s}/**',
            '**/*.d.ts',
            'test{,s}/**',
            'test{,s}/**',
            'spec{,s}/**',
            'test{,-*}.{js,jsx,cjs,mjs,ts,tsx}',
            'spec{,-*}.{js,jsx,cjs,mjs,ts,tsx}',
            '**/*{.,-}test.{js,jsx,cjs,mjs,ts,tsx}',
            '**/*{.,-}spec.{js,jsx,cjs,mjs,ts,tsx}',
            '**/__tests__/**',
            '**/{ava,babel,nyc}.config.{js,cjs,mjs}',
            '**/jest.config.{js,cjs,mjs,ts}',
            '**/{karma,rollup,webpack}.config.js',
            '**/.{eslint,mocha}rc.{js,cjs}',
        ],
        excludeAfterRemap: true,
        reporter: ['lcov', 'text-summary'],
        reportsDirectory: './coverage',
        tempDirectory: tmpDir,
    });

    await report.run();

    if (failures) {
        throw new Error('Some tests failed');
    }
}

/**
 * @param {import('commander').Command} program
 */
export function command(program) {
    program
        .command('test:node [specs...]')
        .description('Start a node test runner based on mocha.')
        .option('--coverage', 'collect code coverage')
        .option('-C, --config <path>', 'the rna config file')
        .action(
            /**
             * @param {string[]} specs
             * @param {{ coverage?: boolean, config?: string }} options
             */
            async (specs, { coverage, config: configFile }) => {
                const root = process.cwd();
                configFile = configFile || await locateConfigFile();

                /**
                 * @type {import('@chialab/rna-config-loader').Config}
                 */
                const config = mergeConfig({ root }, configFile ? await readConfigFile(configFile, { root }, 'serve') : {});

                /**
                 * @type {TestRunnerConfig}
                 */
                const testRunnerConfig = {
                    alias: config.alias,
                    coverage,
                };
                if (specs.length) {
                    testRunnerConfig.files = specs;
                }
                await test(testRunnerConfig);
            }
        );
}
