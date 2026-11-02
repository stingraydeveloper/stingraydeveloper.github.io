// Generates and packs strands off the main thread, so a page load never stalls on them.
import { generateBlob, packStrands } from './blob-geometry.js';
import { RECIPES } from './blob-props.js';

// What a recipe returns besides strands goes back as plain data.
function build(options, pack) {
  if (options.recipe) {
    const res = RECIPES[options.recipe](...(options.args || []));
    const p = packStrands(res, pack);
    const info = {};
    for (const k of Object.keys(res)) if (k !== 'strands') info[k] = res[k];
    return { ...p, info };
  }
  return packStrands(generateBlob(options), pack);
}

self.onmessage = (e) => {
  const { id, options, pack } = e.data;
  const t0 = performance.now();
  const p = build(options, pack);
  const stats = { ...p.stats, genMs: Math.round(performance.now() - t0) };
  const { position, tangent, a, b, c, index, info } = p;
  self.postMessage({ id, position, tangent, a, b, c, index, stats, info }, [position.buffer, tangent.buffer, a.buffer, b.buffer, c.buffer, index.buffer]);
};
