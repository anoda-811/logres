/** 城下町の床・装飾レイアウト（ログレス風プラザ） */

export type TownCell = { col: number; row: number };

export type TownPropKind = "fence" | "planter" | "banner" | "crate";

export type TownProp = TownCell & {
  kind: TownPropKind;
  /** マス内オフセット (-0.4..0.4) */
  ox?: number;
  oy?: number;
};

/** 石畳タイル（ユーザー提供シートから切り出し） */
export const TOWN_GROUND_TILE_SRCS = [
  "/tiles/town/tile1.png", // 横レンガ
  "/tiles/town/tile2.png", // 小さな同心円
  "/tiles/town/tile3.png", // 斜めダイア
  "/tiles/town/tile4.png", // 不規則丸石
  "/tiles/town/tile5.png", // ヘリンボーン
  "/tiles/town/tile6.png", // 大きな同心円（広場）
] as const;

/** 簡易ハッシュ 0..1 */
function townHash(c: number, r: number, seed = 3): number {
  const n = Math.sin(c * 127.1 + r * 311.7 + seed * 19.3) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * 町の地面タイル選択（0..5）
 * 道＝石畳系、広場中心＝大円、それ以外＝レンガ／ヘリンボーン
 */
export function pickTownGroundTile(
  col: number,
  row: number,
  pathSet: Set<string>,
  cols: number,
  _rows: number
): number {
  const midC = Math.floor(cols / 2);
  const midR = Math.floor(_rows / 2);
  const onPath = pathSet.has(`${col},${row}`);
  const detail = townHash(col, row, 11);

  // 広場中心：大きな同心円
  if (Math.abs(col - midC) <= 1 && Math.abs(row - (midR + 1)) <= 1) {
    return 5;
  }

  if (onPath) {
    // 道：丸石・ヘリンボーン・小さな円を混ぜる
    if (detail > 0.72) return 1;
    if (detail > 0.38) return 4;
    return 3;
  }

  // 道脇・区画：レンガ系
  if (detail > 0.62) return 2;
  if (detail > 0.28) return 0;
  return 4;
}

/** 石畳の道（十字＋広場） */
export function buildTownPathSet(cols: number, rows: number): Set<string> {
  const set = new Set<string>();
  const midC = Math.floor(cols / 2);
  const midR = Math.floor(rows / 2);

  const add = (c: number, r: number) => {
    if (c >= 0 && r >= 0 && c < cols && r < rows) set.add(`${c},${r}`);
  };

  // 縦の幹線
  for (let r = 1; r < rows - 1; r++) {
    add(midC, r);
    add(midC - 1, r);
    if (r >= midR - 2 && r <= midR + 3) add(midC + 1, r);
  }
  // 横の幹線
  for (let c = 1; c < cols - 1; c++) {
    add(c, midR);
    add(c, midR + 1);
    if (c >= midC - 3 && c <= midC + 2) add(c, midR - 1);
  }
  // 入口寄りの広場
  for (let c = midC - 2; c <= midC + 2; c++) {
    for (let r = midR + 2; r <= midR + 4; r++) add(c, r);
  }
  return set;
}

/** レンガ床の色（市松に近い暖色） */
export function townBrickFill(col: number, row: number): string {
  const a = (col + row) % 2 === 0;
  return a ? "#e8d4a8" : "#dcc48e";
}

/** 石畳の色 */
export function townCobbleFill(col: number, row: number): string {
  const n = (col * 3 + row * 7) % 3;
  if (n === 0) return "#8a8074";
  if (n === 1) return "#7a7166";
  return "#6e665c";
}

/**
 * 通行を妨げない装飾（壁際・道の脇）
 * クエストボード(7,6)・鍛冶(4,9)・防具(10,9)は避ける
 */
export function buildTownProps(cols: number, rows: number): TownProp[] {
  const avoid = new Set(["7,6", "4,9", "10,9", "7,7", "7,8"]);
  const props: TownProp[] = [];
  const push = (p: TownProp) => {
    if (avoid.has(`${p.col},${p.row}`)) return;
    if (p.col < 1 || p.row < 1 || p.col >= cols - 1 || p.row >= rows - 1) return;
    props.push(p);
  };

  // プランター列
  for (const [c, r] of [
    [2, 3],
    [3, 3],
    [11, 3],
    [12, 3],
    [2, 11],
    [12, 11],
    [5, 5],
    [9, 5],
  ] as const) {
    push({ col: c, row: r, kind: "planter", ox: 0.15, oy: -0.05 });
  }

  // 低い柵
  for (const [c, r] of [
    [1, 5],
    [1, 6],
    [1, 7],
    [13, 5],
    [13, 6],
    [13, 7],
    [5, 1],
    [6, 1],
    [8, 1],
    [9, 1],
  ] as const) {
    push({ col: c, row: r, kind: "fence", oy: 0.1 });
  }

  // 青バナー
  for (const [c, r] of [
    [3, 6],
    [11, 6],
    [6, 4],
    [8, 10],
  ] as const) {
    push({ col: c, row: r, kind: "banner", ox: -0.2, oy: -0.1 });
  }

  // 木箱・壺っぽいもの（ショップ脇）
  for (const [c, r] of [
    [5, 9],
    [9, 9],
    [6, 8],
  ] as const) {
    push({ col: c, row: r, kind: "crate", ox: 0.2, oy: 0.05 });
  }

  return props;
}
