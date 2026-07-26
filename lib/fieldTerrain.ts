/** 草原フィールド用の地形データ（見た目は連続地面、内部はマス） */

export const FIELD_COLS = 36;
export const FIELD_ROWS = 36;
/** タイルが大きいほど画面に入るマスが減り、寄り気味になる */
export const FIELD_TILE_W = 78;

/** ワールドマップ境界の青い丸の並び幅（＝通路幅） */
const GATE_WIDTH = 5;

export type FieldGate = {
  /** 草原入場時の初期位置（境界の内側） */
  spawn: { col: number; row: number };
  /** 青い丸を置くマス */
  markers: { col: number; row: number }[];
  /** ここへ踏み出すとワールドマップへ */
  exits: { col: number; row: number }[];
  /** 障害物を置かないマス（平地通路） */
  clearSet: Set<string>;
  /** 崖で挟む通路の列範囲 */
  passageMinCol: number;
  passageMaxCol: number;
  /** この行以降を入り口の崖帯にする */
  cliffRowStart: number;
};

/** マップ手前（画面下）端のワールドマップ入り口 */
export function getFieldGate(cols: number, rows: number): FieldGate {
  const mid = Math.floor(cols / 2);
  const half = Math.floor(GATE_WIDTH / 2);
  const passageMinCol = Math.max(1, mid - half);
  const passageMaxCol = Math.min(cols - 2, mid + half);
  const markerRow = rows - 3;
  const exitRow = rows - 2;
  const spawnRow = Math.max(1, rows - 5);
  const cliffRowStart = rows - 7;
  const markers: { col: number; row: number }[] = [];
  const exits: { col: number; row: number }[] = [];
  const clearSet = new Set<string>();

  const mark = (c: number, r: number) => {
    if (c < 0 || r < 0 || c >= cols || r >= rows) return;
    clearSet.add(`${c},${r}`);
  };

  for (let c = passageMinCol; c <= passageMaxCol; c++) {
    markers.push({ col: c, row: markerRow });
    exits.push({ col: c, row: exitRow });
    if (exitRow + 1 < rows) exits.push({ col: c, row: exitRow + 1 });
  }

  // 崖帯内は青い丸と同じ幅だけの通路
  for (let r = cliffRowStart; r < rows; r++) {
    for (let c = passageMinCol; c <= passageMaxCol; c++) {
      mark(c, r);
    }
  }

  // 崖帯の先は少しずつ広がってフィールドへ出られる
  const flareTop = Math.floor(rows * 0.5);
  for (let r = flareTop; r < cliffRowStart; r++) {
    const t = (cliffRowStart - r) / Math.max(1, cliffRowStart - flareTop);
    const w = half + Math.floor(t * 3);
    for (let c = mid - w; c <= mid + w; c++) {
      mark(c, r);
    }
  }

  return {
    spawn: { col: mid, row: spawnRow },
    markers,
    exits,
    clearSet,
    passageMinCol,
    passageMaxCol,
    cliffRowStart,
  };
}

/** 簡易ハッシュノイズ 0..1 */
export function hash2(c: number, r: number, seed = 7): number {
  const n = Math.sin(c * 127.1 + r * 311.7 + seed * 19.3) * 43758.5453;
  return n - Math.floor(n);
}

function smoothNoise(c: number, r: number, seed: number): number {
  const x0 = Math.floor(c);
  const y0 = Math.floor(r);
  const fx = c - x0;
  const fy = r - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const d = hash2(x0, y0 + 1, seed);
  const e = hash2(x0 + 1, y0 + 1, seed);
  const u = a + (b - a) * sx;
  const v = d + (e - d) * sx;
  return u + (v - u) * sy;
}

/** 0〜2 の高さマップを生成 */
export function buildFieldHeights(cols: number, rows: number): number[][] {
  const h: number[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => 0)
  );

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const n =
        smoothNoise(c * 0.18, r * 0.18, 3) * 0.55 +
        smoothNoise(c * 0.07, r * 0.07, 11) * 0.45;
      // 外周寄りをやや高く、中央は低地
      const cx = (c - (cols - 1) / 2) / (cols / 2);
      const cy = (r - (rows - 1) / 2) / (rows / 2);
      const rim = Math.max(Math.abs(cx), Math.abs(cy));
      let v = n + rim * 0.35;
      if (v > 0.72) h[r][c] = 2;
      else if (v > 0.48) h[r][c] = 1;
      else h[r][c] = 0;
    }
  }

  // 中央付近は歩きやすい平地に均す
  const midC = Math.floor(cols / 2);
  const midR = Math.floor(rows / 2);
  for (let r = midR - 3; r <= midR + 3; r++) {
    for (let c = midC - 3; c <= midC + 3; c++) {
      if (r >= 0 && r < rows && c >= 0 && c < cols) h[r][c] = 0;
    }
  }

  // 道沿いを高さ0に
  for (const p of buildDirtPath(cols, rows)) {
    h[p.row][p.col] = 0;
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nc = p.col + dc;
      const nr = p.row + dr;
      if (nc >= 0 && nc < cols && nr >= 0 && nr < rows && h[nr][nc] > 1) {
        h[nr][nc] = 1;
      }
    }
  }

  // 入り口：通路は平地、両脇は崖で幅いっぱいに挟む
  const gate = getFieldGate(cols, rows);
  for (const key of gate.clearSet) {
    const [cs, rs] = key.split(",");
    const c = Number(cs);
    const r = Number(rs);
    if (r >= 0 && r < rows && c >= 0 && c < cols) h[r][c] = 0;
  }
  for (let r = gate.cliffRowStart; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (c < gate.passageMinCol || c > gate.passageMaxCol) {
        h[r][c] = 2;
      } else {
        h[r][c] = 0;
      }
    }
  }

  return h;
}

/** ゆるい道のマス一覧 */
export function buildDirtPath(
  cols: number,
  rows: number
): { col: number; row: number }[] {
  const out: { col: number; row: number }[] = [];
  const key = (c: number, r: number) => `${c},${r}`;
  const seen = new Set<string>();
  const add = (c: number, r: number) => {
    if (c < 0 || r < 0 || c >= cols || r >= rows) return;
    const k = key(c, r);
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ col: c, row: r });
  };

  let c = 2;
  let r = Math.floor(rows * 0.55);
  add(c, r);
  while (c < cols - 2) {
    const n = hash2(c, r, 42);
    if (n < 0.28) r = Math.max(2, r - 1);
    else if (n > 0.72) r = Math.min(rows - 3, r + 1);
    c += 1;
    add(c, r);
    if (hash2(c, r, 99) > 0.55) add(c, r + (hash2(c, r, 5) > 0.5 ? 1 : -1));
  }

  // 縦に短い支線
  const branchC = Math.floor(cols * 0.45);
  let br = Math.floor(rows * 0.35);
  for (let i = 0; i < 8; i++) {
    add(branchC + (i % 3) - 1, br);
    br = Math.min(rows - 3, br + 1);
  }

  return out;
}

export function isDirtPathCell(
  pathSet: Set<string>,
  col: number,
  row: number
): boolean {
  return pathSet.has(`${col},${row}`);
}

/** 草の色（連続ノイズで升目感を消す／深めの翡翠トーン） */
export function grassFill(col: number, row: number, isPath: boolean): string {
  if (isPath) {
    const n =
      smoothNoise(col * 0.4, row * 0.4, 21) * 0.65 +
      smoothNoise(col * 0.9, row * 0.9, 44) * 0.35;
    // 温かい黄土の道（タイトルの金寄り）
    const r = Math.round(168 + n * 32);
    const g = Math.round(138 + n * 24);
    const b = Math.round(78 + n * 16);
    return `rgb(${r},${g},${b})`;
  }
  const n =
    smoothNoise(col * 0.22, row * 0.22, 8) * 0.55 +
    smoothNoise(col * 0.55, row * 0.55, 19) * 0.35 +
    smoothNoise(col * 1.1, row * 1.1, 31) * 0.1;
  // 深めの翡翠〜苔緑（隣マスと色が急に変わらない）
  const r = Math.round(42 + n * 38);
  const g = Math.round(118 + n * 52);
  const b = Math.round(68 + n * 32);
  return `rgb(${r},${g},${b})`;
}

/** 道の縁を少し混ぜて境界をぼかす */
export function fieldCellFill(
  col: number,
  row: number,
  pathSet: Set<string>,
  waterSet?: Set<string>
): string {
  if (waterSet?.has(`${col},${row}`)) return waterFill(col, row);
  const onPath = pathSet.has(`${col},${row}`);
  if (!onPath) return grassFill(col, row, false);
  // 道マスでも周囲が草ならわずかに緑を混ぜる（升目っぽい切り替わり軽減）
  let grassN = 0;
  for (const [dc, dr] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    if (!pathSet.has(`${col + dc},${row + dr}`)) grassN += 1;
  }
  if (grassN === 0) return grassFill(col, row, true);
  const dirt = grassFill(col, row, true);
  const grass = grassFill(col, row, false);
  // 簡易ブレンド: 縁は道色を少し暗めに
  if (grassN >= 2) {
    const n = smoothNoise(col * 0.5, row * 0.5, 55);
    const r = Math.round(142 + n * 28);
    const g = Math.round(128 + n * 22);
    const b = Math.round(68 + n * 16);
    return `rgb(${r},${g},${b})`;
  }
  return dirt || grass;
}

/** 水の色（池・みずうみ／濃いめの青） */
export function waterFill(col: number, row: number): string {
  const n =
    smoothNoise(col * 0.28, row * 0.28, 61) * 0.55 +
    smoothNoise(col * 0.85, row * 0.85, 88) * 0.35 +
    smoothNoise(col * 1.6, row * 1.6, 17) * 0.1;
  // 深い紺碧〜青（やや濃いめ）
  const r = Math.round(14 + n * 20);
  const g = Math.round(48 + n * 34);
  const b = Math.round(108 + n * 48);
  return `rgb(${r},${g},${b})`;
}

/**
 * 入れない水マス（池・みずうみ）
 * スポーン付近・道は避ける
 */
export function buildWaterCells(
  cols: number,
  rows: number,
  pathSet: Set<string>,
  spawnAvoid: { col: number; row: number }
): { col: number; row: number }[] {
  const out: { col: number; row: number }[] = [];
  const seen = new Set<string>();
  const gateClear = getFieldGate(cols, rows).clearSet;
  const add = (c: number, r: number) => {
    if (c < 1 || r < 1 || c >= cols - 1 || r >= rows - 1) return;
    if (pathSet.has(`${c},${r}`)) return;
    if (gateClear.has(`${c},${r}`)) return;
    if (Math.abs(c - spawnAvoid.col) + Math.abs(r - spawnAvoid.row) < 5) return;
    const k = `${c},${r}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ col: c, row: r });
  };

  // 楕円っぽい水たまり（入り口回廊は避ける）
  const ponds: { cx: number; cy: number; rx: number; ry: number }[] = [
    {
      cx: cols * 0.22,
      cy: rows * 0.28,
      rx: 3.2 + hash2(1, 1, 2) * 1.4,
      ry: 2.4 + hash2(2, 1, 3) * 1.2,
    },
    {
      cx: cols * 0.78,
      cy: rows * 0.32,
      rx: 4.0 + hash2(3, 2, 4) * 1.6,
      ry: 3.0 + hash2(4, 2, 5) * 1.3,
    },
    {
      cx: cols * 0.28,
      cy: rows * 0.62,
      rx: 3.4 + hash2(5, 3, 6) * 1.4,
      ry: 2.6 + hash2(6, 3, 7) * 1.1,
    },
  ];

  for (const pond of ponds) {
    const rMax = Math.ceil(Math.max(pond.rx, pond.ry) + 2);
    for (let r = Math.floor(pond.cy - rMax); r <= Math.ceil(pond.cy + rMax); r++) {
      for (let c = Math.floor(pond.cx - rMax); c <= Math.ceil(pond.cx + rMax); c++) {
        const dx = (c - pond.cx) / pond.rx;
        const dy = (r - pond.cy) / pond.ry;
        const dist = dx * dx + dy * dy;
        // 縁をノイズでボコボコに
        const edge = 0.82 + (hash2(c, r, 70) - 0.5) * 0.35;
        if (dist <= edge) add(c, r);
      }
    }
  }

  return out;
}

/** 岩マス（平地・道・水以外に散らす） */
export function buildFieldRocks(
  cols: number,
  rows: number,
  heights: number[][],
  pathSet: Set<string>,
  spawnAvoid: { col: number; row: number },
  waterSet?: Set<string>
): { col: number; row: number }[] {
  const rocks: { col: number; row: number }[] = [];
  const gateClear = getFieldGate(cols, rows).clearSet;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (c === spawnAvoid.col && r === spawnAvoid.row) continue;
      if (pathSet.has(`${c},${r}`)) continue;
      if (waterSet?.has(`${c},${r}`)) continue;
      if (gateClear.has(`${c},${r}`)) continue;
      if (Math.abs(c - spawnAvoid.col) + Math.abs(r - spawnAvoid.row) < 3) continue;
      const n = hash2(c, r, 77);
      const preferCliff = heights[r][c] >= 1 ? 0.18 : 0.06;
      if (n < preferCliff) rocks.push({ col: c, row: r });
    }
  }
  return rocks;
}

/** 装飾用の草むら位置（マスに縛られない見た目用） */
export function buildGrassTufts(
  cols: number,
  rows: number,
  pathSet: Set<string>,
  count = 90,
  waterSet?: Set<string>
): { col: number; row: number; ox: number; oy: number; s: number }[] {
  const tufts: {
    col: number;
    row: number;
    ox: number;
    oy: number;
    s: number;
  }[] = [];
  for (let i = 0; i < count; i++) {
    const col = Math.floor(hash2(i, 1, 3) * cols);
    const row = Math.floor(hash2(i, 2, 5) * rows);
    if (pathSet.has(`${col},${row}`)) continue;
    if (waterSet?.has(`${col},${row}`)) continue;
    tufts.push({
      col,
      row,
      ox: (hash2(i, 4, 9) - 0.5) * 0.7,
      oy: (hash2(i, 6, 11) - 0.5) * 0.45,
      s: 0.55 + hash2(i, 8, 13) * 0.7,
    });
  }
  return tufts;
}
