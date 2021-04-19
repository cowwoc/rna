import path from 'path';
import { promises } from 'fs';

const { readdir, stat, unlink, rmdir } = promises;

/**
 * Empty a directory (if exists).
 * @param {string} directory
 * @return {Promise<boolean>}
 */
export async function emptyDir(directory) {
    let d;
    try {
        d = await stat(directory);
    } catch (err) {
        //
    }
    if (!d) {
        return false;
    }

    let outputDir = d.isDirectory() ? directory : path.dirname(directory);
    let files = await readdir(outputDir);
    await Promise.all(
        files
            .map((file) => path.join(outputDir, file))
            .map(async (file) => {
                let d = await stat(file);
                if (d.isDirectory()) {
                    return rmdir(file, { recursive: true });
                }

                return unlink(file);
            })
    );

    return true;
}