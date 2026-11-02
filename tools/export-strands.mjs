// Writes the blob's strands to press/blob/strands.json so a Blender artist works from the exact
// data the live model draws. Run from anywhere: node site/tools/export-strands.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateBlob, packStrands, exportStrands, coreMesh } from '../blob-geometry.js';

const here = dirname(fileURLToPath(import.meta.url));
const model = JSON.parse(await readFile(join(here, '..', 'model.json'), 'utf8'));
const blob = generateBlob();
const { stats } = packStrands(blob);  // assigns each strand its row and its u
const data = exportStrands(blob, { model });
const core = coreMesh();
data.core = { position: Array.from(core.position, (x) => +x.toFixed(5)), index: Array.from(core.index) };
const out = join(here, '..', '..', 'press', 'blob');
await mkdir(out, { recursive: true });
const path = join(out, 'strands.json');
const text = JSON.stringify(data);
await writeFile(path, text);
console.log(path, `${(text.length / 1048576).toFixed(1)} MB`, stats);
