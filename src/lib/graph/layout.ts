/**
 * DETERMINISTIC GRAPH LAYOUT.
 *
 * A layered ("Sugiyama-lite") layout: x-position = prerequisite depth, so
 * arrows flow left→right from foundations to advanced concepts. Within a layer
 * concepts are ordered by importance (desc) then key, and the whole layer is
 * vertically centred. No physics, no randomness — the same graph always draws
 * the same way, which keeps the map readable and diff-able.
 */

export interface LayoutNodeInput {
  key: string;
  depth: number;
  importance: number;
}

export interface LayoutPosition {
  key: string;
  /** Column (0-based prerequisite depth). */
  layer: number;
  /** Row within the column (0-based). */
  row: number;
  /** Normalised 0..1 coordinates for a simple renderer. */
  x: number;
  y: number;
}

export interface GraphLayout {
  positions: Map<string, LayoutPosition>;
  layerCount: number;
  maxRows: number;
}

export function layoutGraph(nodes: LayoutNodeInput[]): GraphLayout {
  if (nodes.length === 0) {
    return { positions: new Map(), layerCount: 0, maxRows: 0 };
  }

  const byLayer = new Map<number, LayoutNodeInput[]>();
  for (const node of nodes) {
    const layer = Math.max(0, Math.round(node.depth));
    const list = byLayer.get(layer) ?? [];
    list.push(node);
    byLayer.set(layer, list);
  }

  const layers = [...byLayer.keys()].sort((a, b) => a - b);
  const layerCount = layers.length;
  const maxRows = Math.max(...[...byLayer.values()].map((l) => l.length));

  const positions = new Map<string, LayoutPosition>();
  layers.forEach((layer, layerIndex) => {
    const list = (byLayer.get(layer) ?? []).sort((a, b) => {
      if (b.importance !== a.importance) return b.importance - a.importance;
      return a.key < b.key ? -1 : 1;
    });
    const offset = (maxRows - list.length) / 2;
    list.forEach((node, i) => {
      const row = i;
      positions.set(node.key, {
        key: node.key,
        layer: layerIndex,
        row,
        x: layerCount === 1 ? 0.5 : layerIndex / (layerCount - 1),
        y: maxRows === 1 ? 0.5 : (offset + i) / Math.max(1, maxRows - 1),
      });
    });
  });

  return { positions, layerCount, maxRows };
}
