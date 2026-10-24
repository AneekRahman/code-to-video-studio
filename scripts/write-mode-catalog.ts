import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {modeCatalog} from '../src/modes/registry.ts';

export const modeCatalogUrl = new URL('../catalog/modes.json', import.meta.url);
export const renderModeCatalog = (): string => `${JSON.stringify(modeCatalog(), null, 2)}\n`;

if (process.argv[1] === fileURLToPath(import.meta.url)) await writeFile(modeCatalogUrl, renderModeCatalog());
