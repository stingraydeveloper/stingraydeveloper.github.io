// Same arithmetic as intent-router's export_browser.py: word 1-2 grams, sublinear TF-IDF,
// L2 normalised, then softmax over pruned logistic regression weights.
export function tokenize(text) {
  const words = text.toLowerCase().match(/\b[\p{L}\p{N}_]{2,}\b/gu) ?? [];
  const grams = [...words];
  for (let i = 0; i + 1 < words.length; i++) grams.push(`${words[i]} ${words[i + 1]}`);
  return grams;
}

export function classify(model, text) {
  const counts = new Map();
  for (const gram of tokenize(text)) {
    const id = model.vocab[gram];
    if (id !== undefined) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const features = new Map();
  let norm = 0;
  for (const [id, tf] of counts) {
    const value = (1 + Math.log(tf)) * model.idf[id];
    features.set(id, value);
    norm += value * value;
  }
  norm = Math.sqrt(norm) || 1;
  const scores = model.weights.map((row, c) => {
    let score = model.intercept[c];
    for (const [id, weight] of row) {
      const value = features.get(id);
      if (value !== undefined) score += (value / norm) * weight;
    }
    return score;
  });
  const top = Math.max(...scores);
  const exps = scores.map((s) => Math.exp(s - top));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps
    .map((p, i) => ({ label: model.labels[i], p: p / sum }))
    .sort((a, b) => b.p - a.p);
}
