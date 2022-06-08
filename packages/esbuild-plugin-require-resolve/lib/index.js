import path from 'path';
import { TokenType, parse, walk } from '@chialab/estransform';
import { useRna } from '@chialab/esbuild-rna';

/**
 * A file loader plugin for esbuild for `require.resolve` statements.
 * @returns An esbuild plugin.
 */
export default function() {

    /**
     * @type {import('esbuild').Plugin}
     */
    const plugin = {
        name: 'require-resolve',
        setup(build) {
            const { sourcesContent, sourcemap } = build.initialOptions;
            const { onTransform, emitFile } = useRna(build);

            onTransform({ loaders: ['tsx', 'ts', 'jsx', 'js'] }, async (args) => {
                if (!args.code.includes('require.resolve')) {
                    return;
                }

                /**
                 * @type {Promise<void>[]}
                 */
                const promises = [];

                const { helpers, processor } = await parse(args.code, args.path);
                await walk(processor, () => {
                    if (!processor.matches5(TokenType.name, TokenType.dot, TokenType.name, TokenType.parenL, TokenType.string)) {
                        return;
                    }

                    const nsName = processor.identifierNameForToken(processor.currentToken());
                    if (nsName !== 'require') {
                        return;
                    }

                    processor.nextToken();
                    processor.nextToken();

                    const fnName = processor.identifierNameForToken(processor.currentToken());
                    if (fnName !== 'resolve') {
                        return;
                    }

                    processor.nextToken();
                    processor.nextToken();

                    const stringToken = processor.currentToken();
                    const fileName = processor.stringValueForToken(stringToken);
                    promises.push((async () => {
                        const { path: resolvedFilePath } = await build.resolve(fileName, {
                            importer: args.path,
                            resolveDir: path.dirname(args.path),
                        });

                        const emittedFile = await emitFile(resolvedFilePath);
                        helpers.overwrite(stringToken.start, stringToken.end, `'./${emittedFile.path}'`);
                    })());
                });

                await Promise.all(promises);

                if (!helpers.isDirty()) {
                    return;
                }

                return helpers.generate({
                    sourcemap: !!sourcemap,
                    sourcesContent,
                });
            });
        },
    };

    return plugin;
}
