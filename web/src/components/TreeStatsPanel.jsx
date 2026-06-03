import { useState } from "react";
import { computeTreeStats } from "../utils/treeStats";

function yearLabel(range) {
  if (!range) return "—";
  if (range.min === range.max) return String(range.min);
  return `${range.min}–${range.max}`;
}

function barWidth(count, max) {
  return max > 0 ? `${Math.round((count / max) * 100)}%` : "0%";
}

export default function TreeStatsPanel({ root }) {
  const [open, setOpen] = useState(false);
  const stats = computeTreeStats(root);

  if (!stats) return null;

  const genLabels = Object.keys(stats.nodesByGeneration)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <div className={`treestats ${open ? "treestats--open" : ""}`}>
      <button
        type="button"
        className="treestats-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "hide tree stats" : "show tree stats"}
        title="tree overview"
      >
        <span aria-hidden="true" className="treestats-toggle-icon">
          {open ? "▾" : "▸"}
        </span>
        <span className="treestats-toggle-label">
          {stats.totalNodes} papers
        </span>
      </button>

      {open ? (
        <div className="treestats-body">
          <div className="treestats-stat">
            <span className="treestats-stat-value">{stats.totalNodes}</span>
            <span className="treestats-stat-label">total papers</span>
          </div>

          <div className="treestats-stat">
            <span className="treestats-stat-value">{stats.totalLeaves}</span>
            <span className="treestats-stat-label">leaves</span>
          </div>

          <div className="treestats-stat">
            <span className="treestats-stat-value">{stats.depth}</span>
            <span className="treestats-stat-label">generations</span>
          </div>

          <div className="treestats-stat">
            <span className="treestats-stat-value">
              {yearLabel(stats.yearRange)}
            </span>
            <span className="treestats-stat-label">year range</span>
          </div>

          <div className="treestats-chart">
            <span className="treestats-chart-label">by generation</span>
            <div className="treestats-bars">
              {genLabels.map((g) => (
                <div key={g} className="treestats-bar-group">
                  <div
                    className="treestats-bar"
                    style={{
                      height: barWidth(
                        stats.nodesByGeneration[g],
                        Math.max(
                          ...genLabels.map((l) => stats.nodesByGeneration[l])
                        )
                      ),
                    }}
                  />
                  <span className="treestats-bar-gen">G{g}</span>
                  <span className="treestats-bar-count">
                    {stats.nodesByGeneration[g]}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {stats.topAuthors.length > 0 ? (
            <div className="treestats-list">
              <span className="treestats-list-label">top authors</span>
              <ol className="treestats-items">
                {stats.topAuthors.slice(0, 4).map((a) => (
                  <li key={a.name} className="treestats-item">
                    <span className="treestats-item-name">{a.name}</span>
                    <span className="treestats-item-count">{a.count}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {stats.topVenues.length > 0 ? (
            <div className="treestats-list">
              <span className="treestats-list-label">top venues</span>
              <ol className="treestats-items">
                {stats.topVenues.slice(0, 4).map((v) => (
                  <li key={v.name} className="treestats-item">
                    <span className="treestats-item-name">{v.name}</span>
                    <span className="treestats-item-count">{v.count}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
