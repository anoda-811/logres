/** 草原フィールド用の地形データ（見た目は連続地面、内部はマス） */

import type { AreaId } from "./locations";
import { SECRET_COLS, SECRET_ROWS } from "./locations";

export const FIELD_COLS = 36;
export const FIELD_ROWS = 36;
/** タイルが大きいほど画面に入るマスが減り、寄り気味になる */
export const FIELD_TILE_W = 78;

/** ワールドマップ境界の青い丸の並び幅（＝通路幅） */
const GATE_WIDTH = 5;

export type GateSide = "north" | "south";
export type GateDestination = "worldmap" | AreaId;

export type FieldGate = {
  id: string;
  side: GateSide;
  /** 踏み出した先 */
  destination: GateDestination;
  /** そのゲートから入場したときの初期位置 */
  spawn: { col: number; row: number };
  /** 青い丸を置くマス */
  markers: { col: number; row: number }[];
  /** ここへ踏み出すと destination へ */
  exits: { col: number; row: number }[];
  /** 障害物を置かないマス（平地通路） */
  clearSet: Set<string>;
  /** 崖で挟む通路の列範囲 */
  passageMinCol: number;
  passageMaxCol: number;
};

export function isFieldArea(id: AreaId): boolean {
  return id === "field" || id === "lake" || id === "secret";
}

export function oppositeGateSide(side: GateSide): GateSide {
  return side === "north" ? "south" : "north";
}

function buildEdgeGate(
  cols: number,
  rows: number,
  side: GateSide,
  destination: GateDestination,
  id: string,
  opts?: {
    /** 通路の中心列（省略時はマップ中央） */
    anchorCol?: number;
    /** 短いフレア（湖を削らない用） */
    shortFlare?: boolean;
  }
): FieldGate {
  const mid = Math.max(
    2,
    Math.min(cols - 3, opts?.anchorCol ?? Math.floor(cols / 2))
  );
  const half = Math.floor(GATE_WIDTH / 2);
  const passageMinCol = Math.max(1, mid - half);
  const passageMaxCol = Math.min(cols - 2, mid + half);
  const markers: { col: number; row: number }[] = [];
  const exits: { col: number; row: number }[] = [];
  const clearSet = new Set<string>();
  const shortFlare = !!opts?.shortFlare;

  const mark = (c: number, r: number) => {
    if (c < 0 || r < 0 || c >= cols || r >= rows) return;
    clearSet.add(`${c},${r}`);
  };

  if (side === "south") {
    const markerRow = rows - 3;
    const exitRow = rows - 2;
    const spawnRow = Math.max(1, rows - 5);
    const cliffRowStart = rows - 7;

    for (let c = passageMinCol; c <= passageMaxCol; c++) {
      markers.push({ col: c, row: markerRow });
      exits.push({ col: c, row: exitRow });
      if (exitRow + 1 < rows) exits.push({ col: c, row: exitRow + 1 });
    }

    for (let r = cliffRowStart; r < rows; r++) {
      for (let c = passageMinCol; c <= passageMaxCol; c++) {
        mark(c, r);
      }
    }

    const flareTop = shortFlare
      ? cliffRowStart - 4
      : Math.floor(rows * 0.5);
    for (let r = flareTop; r < cliffRowStart; r++) {
      const t = (cliffRowStart - r) / Math.max(1, cliffRowStart - flareTop);
      const w = half + Math.floor(t * (shortFlare ? 1 : 3));
      for (let c = mid - w; c <= mid + w; c++) {
        mark(c, r);
      }
    }

    return {
      id,
      side,
      destination,
      spawn: { col: mid, row: spawnRow },
      markers,
      exits,
      clearSet,
      passageMinCol,
      passageMaxCol,
    };
  }

  // north
  const markerRow = 2;
  const exitRow = 1;
  const spawnRow = Math.min(rows - 2, 4);
  const cliffRowEnd = 6;

  for (let c = passageMinCol; c <= passageMaxCol; c++) {
    markers.push({ col: c, row: markerRow });
    exits.push({ col: c, row: exitRow });
    if (exitRow - 1 >= 0) exits.push({ col: c, row: exitRow - 1 });
  }

  for (let r = 0; r <= cliffRowEnd; r++) {
    for (let c = passageMinCol; c <= passageMaxCol; c++) {
      mark(c, r);
    }
  }

  const flareBottom = shortFlare
    ? cliffRowEnd + 4
    : Math.floor(rows * 0.5);
  for (let r = cliffRowEnd + 1; r <= flareBottom; r++) {
    const t = (r - cliffRowEnd) / Math.max(1, flareBottom - cliffRowEnd);
    const w = half + Math.floor(t * (shortFlare ? 1 : 3));
    for (let c = mid - w; c <= mid + w; c++) {
      mark(c, r);
    }
  }

  return {
    id,
    side,
    destination,
    spawn: { col: mid, row: spawnRow },
    markers,
    exits,
    clearSet,
    passageMinCol,
    passageMaxCol,
  };
}

/** エリアごとのゲート一覧 */
export function getFieldGates(
  areaId: AreaId,
  cols: number,
  rows: number
): FieldGate[] {
  if (areaId === "field") {
    return [
      buildEdgeGate(cols, rows, "south", "worldmap", "field-south-world"),
      buildEdgeGate(cols, rows, "north", "lake", "field-north-lake"),
    ];
  }
  if (areaId === "lake") {
    return [
      buildEdgeGate(cols, rows, "south", "field", "lake-south-field"),
      // 左上の奥（北西）へ秘境入り口
      buildEdgeGate(cols, rows, "north", "secret", "lake-north-secret", {
        anchorCol: Math.floor(cols * 0.2),
        shortFlare: true,
      }),
    ];
  }
  if (areaId === "secret") {
    return [
      buildEdgeGate(cols, rows, "south", "lake", "secret-south-lake"),
    ];
  }
  return [];
}

/** 互換: 南ゲート（ワールドマップ側） */
export function getFieldGate(cols: number, rows: number): FieldGate {
  return buildEdgeGate(cols, rows, "south", "worldmap", "field-south-world");
}

export function mergeGateClearSets(gates: FieldGate[]): Set<string> {
  const out = new Set<string>();
  for (const g of gates) {
    for (const k of g.clearSet) out.add(k);
  }
  return out;
}

/** ゲート経由で別エリアへ入るときのスポーン（行き先マップのサイズで計算） */
export function getArrivalSpawn(
  toArea: AreaId,
  fromSide: GateSide
): { col: number; row: number } {
  const size =
    toArea === "secret"
      ? { cols: SECRET_COLS, rows: SECRET_ROWS }
      : toArea === "town"
        ? { cols: 15, rows: 15 }
        : { cols: FIELD_COLS, rows: FIELD_ROWS };
  const arriveSide = oppositeGateSide(fromSide);
  const gates = getFieldGates(toArea, size.cols, size.rows);
  const g = gates.find((x) => x.side === arriveSide) ?? gates[0];
  if (g) return { ...g.spawn };
  return {
    col: Math.floor(size.cols / 2),
    row: Math.floor(size.rows / 2),
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
export function buildFieldHeights(
  cols: number,
  rows: number,
  gates: FieldGate[] = [getFieldGate(cols, rows)]
): number[][] {
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

  // 各ゲート：通路は平地、両脇は崖
  for (const gate of gates) {
    for (const key of gate.clearSet) {
      const [cs, rs] = key.split(",");
      const c = Number(cs);
      const r = Number(rs);
      if (r >= 0 && r < rows && c >= 0 && c < cols) h[r][c] = 0;
    }
    if (gate.side === "south") {
      const cliffRowStart = rows - 7;
      for (let r = cliffRowStart; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (c < gate.passageMinCol || c > gate.passageMaxCol) {
            h[r][c] = 2;
          } else {
            h[r][c] = 0;
          }
        }
      }
    } else {
      const cliffRowEnd = 6;
      for (let r = 0; r <= cliffRowEnd; r++) {
        for (let c = 0; c < cols; c++) {
          if (c < gate.passageMinCol || c > gate.passageMaxCol) {
            h[r][c] = 2;
          } else {
            h[r][c] = 0;
          }
        }
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

/** 草原地面タイル（ユーザー提供の5種） */
export const FIELD_GROUND_TILE_SRCS = [
  "/tiles/field/tile1.png", // 乾いた土＋小石
  "/tiles/field/tile2.png", // 土＋縁の草
  "/tiles/field/tile3.png", // 草地＋花＋土パッチ
  "/tiles/field/tile4.png", // 濃い草地＋花
  "/tiles/field/tile5.png", // 土＋大きな岩
] as const;

/** 水タイル（ユーザー提供） */
export const FIELD_WATER_TILE_SRCS = [
  "/tiles/field/water1.png", // 深い水面＋コースティクス
  "/tiles/field/water2.png", // 岸（砂浜＋水）
  "/tiles/field/water3.png", // 澄んだ水面
  "/tiles/field/water4.png", // 水しぶき
  "/tiles/field/water5.png", // 水中の岩
  "/tiles/field/water6.png", // 睡蓮＋蓮の花
  "/tiles/field/water7.png", // 岩岸の小川
  "/tiles/field/water8.png", // 浅瀬（砂底）
] as const;

/**
 * ノイズで自然に寄せたタイル選択（0..4）。
 * 水マスは -1。
 * lakeShore: 湖の周囲は草地寄り（土パッチを減らす）
 */
export function pickFieldGroundTile(
  col: number,
  row: number,
  pathSet: Set<string>,
  waterSet?: Set<string>,
  opts?: { lakeShore?: boolean }
): number {
  if (waterSet?.has(`${col},${row}`)) return -1;

  const moisture =
    smoothNoise(col * 0.11, row * 0.11, 101) * 0.55 +
    smoothNoise(col * 0.28, row * 0.28, 202) * 0.3 +
    smoothNoise(col * 0.7, row * 0.7, 303) * 0.15;
  const detail = hash2(col, row, 606);
  const clump = smoothNoise(col * 0.09, row * 0.09, 707);

  // 湖畔：草地タイル中心で囲む
  if (opts?.lakeShore) {
    return detail > 0.45 ? 3 : 2;
  }

  const onPath = pathSet.has(`${col},${row}`);
  if (onPath) {
    // 道は土系（岩タイルは使わない）
    if (detail > 0.52) return 1;
    return 0;
  }

  // 湿った草地クラスタ
  if (moisture > 0.55 || (clump > 0.62 && moisture > 0.42)) {
    return detail > 0.42 ? 3 : 2;
  }
  // 遷移帯
  if (moisture > 0.36) {
    if (detail > 0.6) return 2;
    return 1;
  }
  // 乾いたオープンスペース
  return detail > 0.55 ? 1 : 0;
}

/** 隣接する陸マス数（0〜8） */
export function waterShoreScore(
  col: number,
  row: number,
  waterSet: Set<string>
): number {
  let n = 0;
  for (const [dc, dr] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ] as const) {
    if (!waterSet.has(`${col + dc},${row + dr}`)) n += 1;
  }
  return n;
}

/**
 * 水タイル選択（0..7）。
 * 岸寄り＝浅瀬・砂浜、中央＝深い水面のみ（地面っぽい模様を混ぜない）。
 */
export function pickFieldWaterTile(
  col: number,
  row: number,
  waterSet: Set<string>
): number {
  const shore = waterShoreScore(col, row, waterSet);
  const detail = hash2(col, row, 811);
  const accent = hash2(col, row, 822);
  const lily =
    smoothNoise(col * 0.16, row * 0.16, 833) * 0.65 +
    hash2(col, row, 844) * 0.35;

  // 岸際だけ砂浜／浅瀬
  if (shore >= 2) {
    if (detail > 0.5) return 1; // water2 砂浜岸
    return 7; // water8 浅瀬
  }

  // 岸のひとつ内側：澄んだ水面＋たまに睡蓮・しぶき
  if (shore >= 1) {
    if (lily > 0.78) return 5; // water6 睡蓮
    if (accent > 0.86) return 3; // water4 しぶき
    return detail > 0.5 ? 2 : 0;
  }

  // 湖の中央：水面だけ（砂底・岸タイルは使わない）
  if (lily > 0.86) return 5;
  if (accent > 0.92) return 3;
  return detail > 0.5 ? 2 : 0;
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
  spawnAvoid: { col: number; row: number },
  opts?: {
    style?: "normal" | "lake";
    gateClear?: Set<string>;
  }
): { col: number; row: number }[] {
  const out: { col: number; row: number }[] = [];
  const seen = new Set<string>();
  const gateClear =
    opts?.gateClear ?? getFieldGate(cols, rows).clearSet;
  const style = opts?.style ?? "normal";
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

  // キルギム湖：丸く囲まれた一枚の湖（北西の秘境ゲートは岸の外）
  if (style === "lake") {
    const cx = (cols - 1) * 0.56;
    const cy = (rows - 1) * 0.5;
    const rx = cols * 0.3;
    const ry = rows * 0.27;
    const rMax = Math.ceil(Math.max(rx, ry) + 2);
    for (let r = Math.floor(cy - rMax); r <= Math.ceil(cy + rMax); r++) {
      for (let c = Math.floor(cx - rMax); c <= Math.ceil(cx + rMax); c++) {
        const dx = (c - cx) / rx;
        const dy = (r - cy) / ry;
        const dist = dx * dx + dy * dy;
        const edge = 1.0 + (hash2(c, r, 70) - 0.5) * 0.05;
        if (dist <= edge) add(c, r);
      }
    }
    return out;
  }

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
  waterSet?: Set<string>,
  gateClear?: Set<string>
): { col: number; row: number }[] {
  const rocks: { col: number; row: number }[] = [];
  const clear = gateClear ?? getFieldGate(cols, rows).clearSet;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (c === spawnAvoid.col && r === spawnAvoid.row) continue;
      if (pathSet.has(`${c},${r}`)) continue;
      if (waterSet?.has(`${c},${r}`)) continue;
      if (clear.has(`${c},${r}`)) continue;
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
