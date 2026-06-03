import { walk, countNodes, countLeaves, maxDepth } from "./treeHelpers";

export function computeTreeStats(root) {
  if (!root) return null;

  const total = countNodes(root);
  const leaves = countLeaves(root);
  const depth = maxDepth(root);

  const nodesByGeneration = {};
  const years = [];
  const authorCounts = {};
  const venueCounts = {};
  const importanceCounts = {};

  walk(root, (n, d) => {
    nodesByGeneration[d] = (nodesByGeneration[d] || 0) + 1;

    if (n.year) years.push(n.year);

    if (n.authors?.length) {
      for (const a of n.authors) {
        const key = a.trim();
        if (key) authorCounts[key] = (authorCounts[key] || 0) + 1;
      }
    }

    const v = n.venue?.trim();
    if (v) venueCounts[v] = (venueCounts[v] || 0) + 1;

    const imp = n.importance;
    if (imp >= 1 && imp <= 5) {
      importanceCounts[imp] = (importanceCounts[imp] || 0) + 1;
    }
  });

  const sortedYears = years.filter(Boolean).sort((a, b) => a - b);

  const yearTimeline = {};
  for (const y of sortedYears) {
    yearTimeline[y] = (yearTimeline[y] || 0) + 1;
  }

  const topAuthors = Object.entries(authorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }));

  const topVenues = Object.entries(venueCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }));

  return {
    totalNodes: total,
    totalLeaves: leaves,
    depth,
    nodesByGeneration,
    yearRange: sortedYears.length > 0
      ? { min: sortedYears[0], max: sortedYears[sortedYears.length - 1] }
      : null,
    yearTimeline: Object.entries(yearTimeline)
      .map(([year, count]) => ({ year: Number(year), count }))
      .sort((a, b) => a.year - b.year),
    topAuthors,
    topVenues,
    importanceDistribution: Object.fromEntries(
      [1, 2, 3, 4, 5].map((i) => [i, importanceCounts[i] || 0])
    ),
  };
}
