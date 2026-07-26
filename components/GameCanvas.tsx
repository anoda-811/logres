"use client";
import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import BossBattleConfirm from "./BossBattleConfirm";
import { createRandomFieldMonsters, syncAliveFieldMonsters, MONSTERS, createSecretBossMonster, type FieldMonster } from "../lib/monsters";
import { getSpeechBubble, pushChatMessage } from "../lib/chatStore";
import type { AreaId } from "../lib/locations";
import {
  FIELD_WARP_SHOP,
  SECRET_COLS,
  SECRET_KELPIE_POS,
  SECRET_PORTAL,
  SECRET_ROWS,
} from "../lib/locations";
import {
  FIELD_COLS,
  FIELD_ROWS,
  FIELD_TILE_W,
  FIELD_GROUND_TILE_SRCS,
  FIELD_WATER_TILE_SRCS,
  buildDirtPath,
  buildFieldHeights,
  buildGrassTufts,
  buildWaterCells,
  fieldCellFill,
  getArrivalSpawn,
  getFieldGates,
  hash2,
  isFieldArea,
  mergeGateClearSets,
  pickFieldGroundTile,
  pickFieldWaterTile,
  type FieldGate,
} from "../lib/fieldTerrain";
import {
  buildTownPathSet,
  buildTownProps,
  pickTownGroundTile,
  townBrickFill,
  townCobbleFill,
  TOWN_GROUND_TILE_SRCS,
  type TownProp,
} from "../lib/townTerrain";
import {
  consumeFieldReturnPos,
  saveFieldReturnPos,
} from "../lib/settings";

type Props = {
  areaId?: AreaId;
  onOpenQuestBoard?: () => void;
  onOpenWeaponShop?: () => void;
  onOpenArmorShop?: () => void;
  onOpenWarpShop?: () => void;
  /** フィールド入り口からワールドマップへ。開始できたら true */
  onExitToWorldMap?: () => boolean | void;
  /** 青き境界から別エリアへ。開始できたら true */
  onTravelToArea?: (
    areaId: AreaId,
    entry: { col: number; row: number }
  ) => boolean | void;
};

/** 城下町のクエストボードマス（スポーン付近） */
const QUEST_BOARD = { col: 7, row: 6 };
/** 城下町の武器屋（鍛冶屋）マス */
const WEAPON_SMITH = { col: 4, row: 9 };
/** 城下町の防具屋マス */
const ARMOR_SMITH = { col: 10, row: 9 };

export default function GameCanvasIso({
  areaId = "field",
  onOpenQuestBoard,
  onOpenWeaponShop,
  onOpenArmorShop,
  onOpenWarpShop,
  onExitToWorldMap,
  onTravelToArea,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const isTown = areaId === "town";
  const isField = isFieldArea(areaId);
  const isSecret = areaId === "secret";
  const showWarpShop = areaId === "field";
  const [bossPrompt, setBossPrompt] = useState<{
    name: string;
    monsterId: number;
    instanceId: string;
  } | null>(null);
  const bossConfirmRef = useRef<(() => void) | null>(null);
  const questBoardRef = useRef(onOpenQuestBoard);
  questBoardRef.current = onOpenQuestBoard;
  const weaponShopRef = useRef(onOpenWeaponShop);
  weaponShopRef.current = onOpenWeaponShop;
  const armorShopRef = useRef(onOpenArmorShop);
  armorShopRef.current = onOpenArmorShop;
  const warpShopRef = useRef(onOpenWarpShop);
  warpShopRef.current = onOpenWarpShop;
  const exitWorldMapRef = useRef(onExitToWorldMap);
  exitWorldMapRef.current = onExitToWorldMap;
  const travelAreaRef = useRef(onTravelToArea);
  travelAreaRef.current = onTravelToArea;

  // 本体
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;

    let battleTransition = false;
    let transitionProgress = 0;
    let battleMonsterId: number | null = null;
    let battleInstanceId: string | null = null;
    let isTransitioning = false;

    // --- レイアウト / DPI 管理 ---
    let currentCssW = 0;
    let currentCssH = 0;
    let currentDpr = window.devicePixelRatio || 1;

    function resize() {
      // 画面枠サイズ（スマホは画面いっぱいに収める）
      const isNarrow = window.innerWidth <= 800;
      const cssW = isNarrow
        ? window.innerWidth
        : Math.min(window.innerWidth, 1500);
      const cssH = isNarrow
        ? window.innerHeight
        : Math.min(window.innerHeight, 800);
      currentCssW = cssW;
      currentCssH = cssH;
      currentDpr = window.devicePixelRatio || 1;

      // 見た目サイズ（CSSピクセル）
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;

      // 内部バッファ（物理ピクセル）
      canvas.width = Math.round(cssW * currentDpr);
      canvas.height = Math.round(cssH * currentDpr);

      // 描画座標系を CSS ピクセル単位に合わせ、原点を中央に移動
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(currentDpr, currentDpr);
      ctx.translate(cssW / 2, cssH / 2);
    }

    resize();
    // resize 時のカメラ再クランプは clampCamera 定義後に登録

    // --- プレイ設定（草原は広め＋内部マス、見た目は連続地面） ---
    const cols = isTown ? 15 : isSecret ? SECRET_COLS : FIELD_COLS;
    const rows = isTown ? 15 : isSecret ? SECRET_ROWS : FIELD_ROWS;
    const tileW = isTown ? Math.floor(1300 / 15) : FIELD_TILE_W;
    const tileH = Math.floor(tileW / 2);
    const elevStep = Math.max(10, Math.floor(tileH * 0.62));
    const playArea = {
      x: 170,
      y: 60,
      w: tileW * cols,
      h: tileW * cols,
    };
    const radius = Math.max(12, Math.floor(tileW * 0.18));

    const fieldGates: FieldGate[] = isField
      ? getFieldGates(areaId, cols, rows)
      : [];
    const gateClearSet = mergeGateClearSets(fieldGates);
    const gateByExit = new Map<string, FieldGate>();
    for (const g of fieldGates) {
      for (const p of g.exits) {
        gateByExit.set(`${p.col},${p.row}`, g);
      }
    }
    const defaultSpawn =
      fieldGates.find((g) => g.side === "south")?.spawn ??
      fieldGates[0]?.spawn ?? {
        col: Math.floor(cols / 2),
        row: Math.floor(rows / 2),
      };
    const spawnAvoid = isField
      ? { col: defaultSpawn.col, row: defaultSpawn.row }
      : { col: Math.floor(cols / 2), row: Math.floor(rows / 2) };

    // 高さ・道・水（草原／湖のみ）
    const heights = isTown
      ? Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0))
      : buildFieldHeights(cols, rows, fieldGates);
    const dirtPath =
      isTown || areaId === "lake" || isSecret
        ? []
        : buildDirtPath(cols, rows);
    const pathSet = new Set(dirtPath.map((p) => `${p.col},${p.row}`));
    const townPathSet = isTown ? buildTownPathSet(cols, rows) : new Set<string>();
    const townProps: TownProp[] = isTown ? buildTownProps(cols, rows) : [];
    const waterCells = isTown || isSecret
      ? []
      : buildWaterCells(cols, rows, pathSet, spawnAvoid, {
          style: areaId === "lake" ? "lake" : "normal",
          gateClear: gateClearSet,
        });
    const waterSet = new Set(waterCells.map((p) => `${p.col},${p.row}`));
    // 水は低地に
    for (const w of waterCells) {
      heights[w.row][w.col] = 0;
    }
    const grassTufts = isTown
      ? []
      : buildGrassTufts(cols, rows, pathSet, isSecret ? 40 : 160, waterSet);

    // 岩はいったん全部なし（見た目が異質なため）
    const rockBlocked: { col: number; row: number }[] = [];
    const kelpieFootprint: { col: number; row: number }[] = isSecret
      ? [
          { col: SECRET_KELPIE_POS.col, row: SECRET_KELPIE_POS.row },
          { col: SECRET_KELPIE_POS.col - 1, row: SECRET_KELPIE_POS.row },
          { col: SECRET_KELPIE_POS.col, row: SECRET_KELPIE_POS.row + 1 },
          { col: SECRET_KELPIE_POS.col - 1, row: SECRET_KELPIE_POS.row + 1 },
        ]
      : [];
    const blocked: { col: number; row: number }[] = isTown
      ? [
          ...rockBlocked,
          { col: WEAPON_SMITH.col, row: WEAPON_SMITH.row },
          { col: ARMOR_SMITH.col, row: ARMOR_SMITH.row },
        ]
      : showWarpShop
        ? [
            ...rockBlocked,
            ...waterCells,
            { col: FIELD_WARP_SHOP.col, row: FIELD_WARP_SHOP.row },
          ]
        : isSecret
          ? [
              ...rockBlocked,
              ...kelpieFootprint,
              { col: SECRET_PORTAL.col, row: SECRET_PORTAL.row },
              { col: SECRET_PORTAL.col - 1, row: SECRET_PORTAL.row },
              { col: SECRET_PORTAL.col + 1, row: SECRET_PORTAL.row },
            ]
          : [...rockBlocked, ...waterCells];

    // 入り口帯にはモンスターを出さない（通行は可）
    const monsterBlocked: { col: number; row: number }[] = isField
      ? [
          ...blocked,
          ...[...gateClearSet].map((k) => {
            const [c, r] = k.split(",").map(Number);
            return { col: c, row: r };
          }),
        ]
      : blocked;

    // モンスター設置（位置は isoToScreen 定義後に初期化）
    sessionStorage.removeItem("defeatedMonster");
    sessionStorage.removeItem("defeatedMonsters");
    // spawnAvoid は上で定義済み
    type LiveMonster = FieldMonster & {
      x: number;
      y: number;
      targetCol: number;
      targetRow: number;
      wait: number;
      progress: number;
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
    };

    let monsters: LiveMonster[] = [];
    let lastRespawnCheck = 0;
    let toLive: (m: FieldMonster) => LiveMonster = () => {
      throw new Error("toLive not ready");
    };
    let tryStartMonsterMove: (m: LiveMonster) => void = () => {};
    let updateMonsters: (dt: number) => void = () => {};

    // モンスター画像（種類ごと）
    const monsterImgs = new Map<number, HTMLImageElement>();
    for (const def of Object.values(MONSTERS)) {
      const img = new Image();
      img.src = def.image;
      monsterImgs.set(def.id, img);
    }
    // 草原タイル（5種）＋水タイル
    const fieldTileImgs = FIELD_GROUND_TILE_SRCS.map((src) => {
      const img = new Image();
      img.src = src;
      return img;
    });
    let fieldTilesReady = 0;
    for (const img of fieldTileImgs) {
      if (img.complete && img.naturalWidth > 0) fieldTilesReady += 1;
      else {
        img.onload = () => {
          fieldTilesReady += 1;
        };
      }
    }
    const waterTileImgs = FIELD_WATER_TILE_SRCS.map((src) => {
      const img = new Image();
      img.src = src;
      return img;
    });
    const townTileImgs = TOWN_GROUND_TILE_SRCS.map((src) => {
      const img = new Image();
      img.src = src;
      return img;
    });
    const smithImg = new Image();
    smithImg.src = "/blacksmith.png";
    const armorSmithImg = new Image();
    armorSmithImg.src = "/armorsmith.png";
    const warpKeeperImg = new Image();
    warpKeeperImg.src = "/warp-keeper.png";

    const inBounds = (c: number, r: number) => c >= 0 && c < cols && r >= 0 && r < rows;
    const isBlocked = (c: number, r: number) => blocked.some(b => b.col === c && b.row === r);
    const heightAt = (c: number, r: number) =>
      inBounds(c, r) ? heights[r][c] : 0;

    // --- 中心原点に合わせた iso <-> screen（高さ込み） ---
    const isoToScreen = (col: number, row: number) => {
      // 元の playArea 原点（左上基準）をキャンバス中心基準に変換
      const originX = playArea.x + playArea.w / 2;
      const originY = playArea.y + 20;
      const ox = originX - (currentCssW / 2);
      const oy = originY - (currentCssH / 2);
      const x = ox + (col - row) * (tileW / 2);
      const y =
        oy + (col + row) * (tileH / 2) - heightAt(col, row) * elevStep;
      return { x, y };
    };

    toLive = (m: FieldMonster): LiveMonster => {
      const p = isoToScreen(m.col, m.row);
      return {
        ...m,
        x: p.x,
        y: p.y,
        targetCol: m.col,
        targetRow: m.row,
        wait: 0.6 + Math.random() * 1.4,
        progress: 1,
        fromX: p.x,
        fromY: p.y,
        toX: p.x,
        toY: p.y,
      };
    };

    const occupiedCells = (exceptId?: string) => {
      const cells: { col: number; row: number }[] = [];
      for (const m of monsters) {
        if (m.instanceId === exceptId) continue;
        cells.push({ col: m.col, row: m.row });
        if (m.progress < 1) {
          cells.push({ col: m.targetCol, row: m.targetRow });
        }
      }
      return cells;
    };

    const dirs4 = [
      { col: 1, row: 0 },
      { col: -1, row: 0 },
      { col: 0, row: 1 },
      { col: 0, row: -1 },
    ];

    tryStartMonsterMove = (m: LiveMonster) => {
      const def = MONSTERS[m.id];
      if (def?.immobile) return;
      const fromH = heightAt(m.col, m.row);
      const candidates = dirs4
        .map((d) => ({ col: m.col + d.col, row: m.row + d.row }))
        .filter(
          (c) =>
            inBounds(c.col, c.row) &&
            !isBlocked(c.col, c.row) &&
            Math.abs(heightAt(c.col, c.row) - fromH) <= 1 &&
            !occupiedCells(m.instanceId).some(
              (o) => o.col === c.col && o.row === c.row
            )
        );
      if (candidates.length === 0) {
        m.wait = 0.8 + Math.random() * 1.2;
        return;
      }
      const next = candidates[Math.floor(Math.random() * candidates.length)];
      const from = isoToScreen(m.col, m.row);
      const to = isoToScreen(next.col, next.row);
      m.fromX = from.x;
      m.fromY = from.y;
      m.toX = to.x;
      m.toY = to.y;
      m.targetCol = next.col;
      m.targetRow = next.row;
      m.progress = 0;
    };

    updateMonsters = (dt: number) => {
      if (isTown) return;
      const moveDur = 0.55;
      for (const m of monsters) {
        if (m.progress < 1) {
          m.progress = Math.min(1, m.progress + dt / moveDur);
          const t = m.progress;
          const e = 1 - (1 - t) * (1 - t);
          m.x = m.fromX + (m.toX - m.fromX) * e;
          m.y = m.fromY + (m.toY - m.fromY) * e;
          if (m.progress >= 1) {
            m.col = m.targetCol;
            m.row = m.targetRow;
            m.x = m.toX;
            m.y = m.toY;
            m.wait = 0.9 + Math.random() * 2.2;
          }
          continue;
        }
        m.wait -= dt;
        if (m.wait <= 0) tryStartMonsterMove(m);
      }
    };

    monsters = isTown
      ? []
      : isSecret
        ? createSecretBossMonster(SECRET_KELPIE_POS).map(toLive)
        : createRandomFieldMonsters(cols, rows, monsterBlocked, spawnAvoid).map(
            toLive
          );

    const pointInTileTop = (
      px: number,
      py: number,
      cx: number,
      cy: number
    ) => {
      const dx = Math.abs(px - cx) / (tileW / 2);
      const dy = Math.abs(py - cy) / (tileH / 2);
      return dx + dy <= 1.02;
    };

    // 高さ込みで「見た目のマス」を拾う（段差でのカーソルずれ対策）
    const screenToIso = (sx: number, sy: number) => {
      const originX = playArea.x + playArea.w / 2 - currentCssW / 2;
      const originY = playArea.y + 20 - currentCssH / 2;
      const dx = sx - originX;
      const dy = sy - originY;
      // まず高さ0の近似
      const approxCol = Math.round((dx / (tileW / 2) + dy / (tileH / 2)) / 2);
      const approxRow = Math.round((dy / (tileH / 2) - dx / (tileW / 2)) / 2);

      let best: { col: number; row: number } | null = null;
      let bestScore = -Infinity;
      const radius = 4;
      for (let r = approxRow - radius; r <= approxRow + radius; r++) {
        for (let c = approxCol - radius; c <= approxCol + radius; c++) {
          if (!inBounds(c, r)) continue;
          const p = isoToScreen(c, r);
          if (!pointInTileTop(sx, sy, p.x, p.y)) continue;
          // 手前（奥行きが大きい）かつ高いマスを優先
          const score = c + r + heightAt(c, r) * 0.6;
          if (score >= bestScore) {
            bestScore = score;
            best = { col: c, row: r };
          }
        }
      }
      if (best) return best;

      // ヒットなしなら近似を返す（移動開始セル用）
      if (!inBounds(approxCol, approxRow)) return { col: -1, row: -1 };
      return { col: approxCol, row: approxRow };
    };

    // --- カメラ（スワイプでマップを見る） ---
    let camX = 0;
    let camY = 0;
    const viewToWorld = (vx: number, vy: number) => ({ x: vx - camX, y: vy - camY });

    const mapBounds = () => {
      const pts = [
        isoToScreen(0, 0),
        isoToScreen(cols - 1, 0),
        isoToScreen(0, rows - 1),
        isoToScreen(cols - 1, rows - 1),
      ];
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const elevPad = elevStep * 2;
      return {
        minX: Math.min(...xs) - tileW,
        maxX: Math.max(...xs) + tileW,
        minY: Math.min(...ys) - tileH - elevPad,
        maxY: Math.max(...ys) + tileH * 2 + elevPad,
      };
    };

    const clampCamera = () => {
      const b = mapBounds();
      const halfW = currentCssW / 2;
      const halfH = currentCssH / 2;
      const pad = 28;
      const minCamX = halfW - pad - b.maxX;
      const maxCamX = -halfW + pad - b.minX;
      const minCamY = halfH - pad - b.maxY;
      const maxCamY = -halfH + pad - b.minY;
      if (minCamX > maxCamX) camX = -((b.minX + b.maxX) / 2);
      else camX = Math.max(minCamX, Math.min(maxCamX, camX));
      if (minCamY > maxCamY) camY = -((b.minY + b.maxY) / 2);
      else camY = Math.max(minCamY, Math.min(maxCamY, camY));
    };

    const onWindowResize = () => {
      resize();
      clampCamera();
    };
    window.addEventListener("resize", onWindowResize);

    // --- 画面端クランプ（既存ロジックをそのまま） ---
    const screenCorners = (() => {
      const pts = [
        isoToScreen(0, 0),
        isoToScreen(cols - 1, 0),
        isoToScreen(0, rows - 1),
        isoToScreen(cols - 1, rows - 1)
      ];
      const xs = pts.map(p => p.x);
      const ys = pts.map(p => p.y);
      const elevPad = elevStep * 2;
      return {
        minX: Math.min(...xs) - tileW,
        maxX: Math.max(...xs) + tileW,
        minY: Math.min(...ys) - tileH - elevPad,
        maxY: Math.max(...ys) + tileH * 2 + elevPad
      };
    })();
    const clampToBounds = (x: number, y: number) => ({
      x: Math.max(screenCorners.minX, Math.min(screenCorners.maxX, x)),
      y: Math.max(screenCorners.minY, Math.min(screenCorners.maxY, y))
    });

    // --- A* 等（既存コードをそのまま） ---
    type Node = { col: number; row: number };
    const neighbors = (n: Node) => {
      const dirs = [{ col: 1, row: 0 }, { col: -1, row: 0 }, { col: 0, row: 1 }, { col: 0, row: -1 }];
      const out: Node[] = [];
      const fromH = heightAt(n.col, n.row);
      for (const d of dirs) {
        const nc = n.col + d.col;
        const nr = n.row + d.row;
        if (!inBounds(nc, nr) || isBlocked(nc, nr)) continue;
        // 1段までなら昇降可（崖は通れない）
        if (Math.abs(heightAt(nc, nr) - fromH) > 1) continue;
        out.push({ col: nc, row: nr });
      }
      return out;
    };
    const heuristic = (a: Node, b: Node) => Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
    function findPath(start: Node, goal: Node): Node[] | null {
      const key = (n: Node) => `${n.col},${n.row}`;
      const open = new Map<string, { node: Node; f: number }>();
      const cameFrom = new Map<string, string>();
      const gScore = new Map<string, number>();
      const startKey = key(start);
      open.set(startKey, { node: start, f: heuristic(start, goal) });
      gScore.set(startKey, 0);
      while (open.size > 0) {
        let currentKey: string | null = null;
        let currentF = Infinity;
        for (const [k, v] of open) if (v.f < currentF) { currentF = v.f; currentKey = k; }
        if (!currentKey) break;
        const current = open.get(currentKey)!.node;
        if (current.col === goal.col && current.row === goal.row) {
          const path: Node[] = [];
          let k = currentKey;
          while (k !== startKey) {
            const [c, r] = k.split(",").map(Number);
            path.push({ col: c, row: r });
            k = cameFrom.get(k)!;
          }
          path.reverse();
          return path;
        }
        open.delete(currentKey);
        for (const nb of neighbors(current)) {
          const nbKey = key(nb);
          const tentativeG = (gScore.get(currentKey) ?? Infinity) + 1;
          if (tentativeG < (gScore.get(nbKey) ?? Infinity)) {
            cameFrom.set(nbKey, currentKey);
            gScore.set(nbKey, tentativeG);
            const f = tentativeG + heuristic(nb, goal);
            if (!open.has(nbKey)) open.set(nbKey, { node: nb, f });
            else open.get(nbKey)!.f = f;
          }
        }
      }
      return null;
    }

    // --- 状態変数（既存のものをここで定義） ---
    let path: Node[] = [];
    const hover = { col: -1, row: -1 };
    const active = { col: -1, row: -1 };
    const longActive = { col: -1, row: -1 };
    let flashCell: { col: number; row: number; until: number } | null = null;
    const ARRIVAL_THRESHOLD = Math.max(4, tileW * 0.08);
    const state = {
      current: { x: 0, y: 0, targetX: 0, targetY: 0, moving: false, speed: 120, dragging: false }
    };

    // 初期位置：戦闘後は突入前／草原入場は入り口／それ以外は中央
    let startCol = spawnAvoid.col;
    let startRow = spawnAvoid.row;
    const resumePos = consumeFieldReturnPos();
    if (
      resumePos &&
      resumePos.areaId === areaId &&
      inBounds(resumePos.col, resumePos.row)
    ) {
      // ブロックマスでも隣接へ逃がす（戦闘直前マス優先）
      if (!isBlocked(resumePos.col, resumePos.row)) {
        startCol = resumePos.col;
        startRow = resumePos.row;
      } else {
        const dirs = [
          { col: 0, row: 0 },
          { col: 1, row: 0 },
          { col: -1, row: 0 },
          { col: 0, row: 1 },
          { col: 0, row: -1 },
        ];
        for (const d of dirs) {
          const c = resumePos.col + d.col;
          const r = resumePos.row + d.row;
          if (inBounds(c, r) && !isBlocked(c, r)) {
            startCol = c;
            startRow = r;
            break;
          }
        }
      }
    } else if (isField && fieldGates.length > 0) {
      startCol = defaultSpawn.col;
      startRow = defaultSpawn.row;
    }
    // 出口マス上だと復帰直後に再退場・操作ロックしやすいので内側へ
    if (isField && gateByExit.has(`${startCol},${startRow}`)) {
      const g = gateByExit.get(`${startCol},${startRow}`)!;
      startCol = g.spawn.col;
      startRow = g.spawn.row;
    }
    const startCenter = isoToScreen(startCol, startRow);
    state.current.x = startCenter.x - 3;
    state.current.y = startCenter.y + 8;
    // 論理マス（戦闘復帰用。screenToIso より確実）
    let playerCol = startCol;
    let playerRow = startRow;
    // 復帰直後はゲート判定を少し無効化（誤ってワールドマップ遷移で固まる対策）
    const gateGraceUntil = performance.now() + 750;
    // 最初はキャラが画面中央付近に来るようカメラ合わせ
    camX = -state.current.x;
    camY = -state.current.y;
    clampCamera();

    function persistReturnPos() {
      saveFieldReturnPos({
        areaId,
        col: playerCol,
        row: playerRow,
      });
    }

    function startBattleTransition() {
      if (battleTransition) return;
      persistReturnPos();
      battleTransition = true;
    }

    function askBossFight(m: {
      name: string;
      id: number;
      instanceId: string;
    }) {
      setBossPrompt({
        name: m.name,
        monsterId: m.id,
        instanceId: m.instanceId,
      });
      bossConfirmRef.current = () => {
        battleMonsterId = m.id;
        battleInstanceId = m.instanceId;
        startBattleTransition();
      };
    }

    function beginBattleOrAsk(monsterId: number, instanceId: string | null) {
      const def = MONSTERS[monsterId];
      if (def?.boss && instanceId) {
        askBossFight({
          name: def.name,
          id: monsterId,
          instanceId,
        });
        return;
      }
      battleMonsterId = monsterId;
      battleInstanceId = instanceId;
      startBattleTransition();
    }

    function findBossAtCell(col: number, row: number) {
      return monsters.find((m) => {
        const def = MONSTERS[m.id];
        if (!def?.boss) return false;
        return (
          Math.abs(col - m.col) <= 1 && Math.abs(row - m.row) <= 1
        );
      });
    }

    function pickBossApproachCell(boss: { col: number; row: number }) {
      const cands: { col: number; row: number }[] = [];
      for (let dc = -2; dc <= 2; dc++) {
        for (let dr = -2; dr <= 3; dr++) {
          if (Math.abs(dc) + Math.abs(dr) < 2) continue;
          const c = boss.col + dc;
          const r = boss.row + dr;
          if (!inBounds(c, r) || isBlocked(c, r)) continue;
          if (findBossAtCell(c, r)) continue;
          cands.push({ col: c, row: r });
        }
      }
      if (cands.length === 0) return null;
      cands.sort(
        (a, b) =>
          Math.abs(a.col - playerCol) +
          Math.abs(a.row - playerRow) -
          (Math.abs(b.col - playerCol) + Math.abs(b.row - playerRow))
      );
      return cands[0];
    }

    function isNearBoss(boss: { col: number; row: number }) {
      return (
        Math.max(
          Math.abs(playerCol - boss.col),
          Math.abs(playerRow - boss.row)
        ) <= 2
      );
    }

    let areaExitStarted = false;
    function startWorldMapExit(gate: FieldGate) {
      if (areaExitStarted || !isField || !exitWorldMapRef.current) return;
      if (performance.now() < gateGraceUntil) return;
      saveFieldReturnPos({
        areaId,
        col: gate.spawn.col,
        row: gate.spawn.row,
      });
      const startedOk = exitWorldMapRef.current();
      if (startedOk === false) return;
      areaExitStarted = true;
      state.current.moving = false;
      path = [];
    }

    function startAreaTravel(gate: FieldGate) {
      if (areaExitStarted || !isField || !travelAreaRef.current) return;
      if (performance.now() < gateGraceUntil) return;
      if (gate.destination === "worldmap" || gate.destination === "town") {
        return;
      }
      const entry = getArrivalSpawn(gate.destination, gate.side);
      const startedOk = travelAreaRef.current(gate.destination, entry);
      if (startedOk === false) return;
      areaExitStarted = true;
      state.current.moving = false;
      path = [];
    }

    function checkGateExit(col: number, row: number) {
      if (performance.now() < gateGraceUntil) return false;
      if (!isField) return false;
      const gate = gateByExit.get(`${col},${row}`);
      if (!gate) return false;
      if (gate.destination === "worldmap") {
        startWorldMapExit(gate);
        return areaExitStarted;
      }
      startAreaTravel(gate);
      return areaExitStarted;
    }

    // --- 描画ヘルパー ---
    const tileTopPath = (
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number
    ) => {
      ctx.beginPath();
      ctx.moveTo(x, y - tileH / 2);
      ctx.lineTo(x + tileW / 2, y);
      ctx.lineTo(x, y + tileH / 2);
      ctx.lineTo(x - tileW / 2, y);
      ctx.closePath();
    };

    const drawTile = (
      ctx: CanvasRenderingContext2D,
      col: number,
      row: number,
      fill: string,
      ts = 0
    ) => {
      const p = isoToScreen(col, row);
      const h = heightAt(col, row);
      const drop = h * elevStep;
      const isWater = waterSet.has(`${col},${row}`);
      // わずかに重ねて隙間の黒い線（升目感）を消す
      const grow = isTown ? 0 : 0.6;

      // 段差の崖面（ログレス風の土の壁）— 水は出さない
      if (drop > 0.5 && !isWater) {
        const leftLower = heightAt(col, row + 1) < h;
        const rightLower = heightAt(col + 1, row) < h;
        if (leftLower || !inBounds(col, row + 1)) {
          ctx.beginPath();
          ctx.moveTo(p.x - tileW / 2, p.y);
          ctx.lineTo(p.x, p.y + tileH / 2);
          ctx.lineTo(p.x, p.y + tileH / 2 + drop);
          ctx.lineTo(p.x - tileW / 2, p.y + drop);
          ctx.closePath();
          ctx.fillStyle = "#7a5a32";
          ctx.fill();
          ctx.fillStyle = "rgba(30, 16, 6, 0.28)";
          ctx.fill();
        }
        if (rightLower || !inBounds(col + 1, row)) {
          ctx.beginPath();
          ctx.moveTo(p.x + tileW / 2, p.y);
          ctx.lineTo(p.x, p.y + tileH / 2);
          ctx.lineTo(p.x, p.y + tileH / 2 + drop);
          ctx.lineTo(p.x + tileW / 2, p.y + drop);
          ctx.closePath();
          ctx.fillStyle = "#5c4324";
          ctx.fill();
          ctx.fillStyle = "rgba(16, 8, 2, 0.32)";
          ctx.fill();
        }
      }

      ctx.beginPath();
      ctx.moveTo(p.x, p.y - tileH / 2 - grow);
      ctx.lineTo(p.x + tileW / 2 + grow, p.y);
      ctx.lineTo(p.x, p.y + tileH / 2 + grow);
      ctx.lineTo(p.x - tileW / 2 - grow, p.y);
      ctx.closePath();

      const tileIdx = isTown
        ? pickTownGroundTile(col, row, townPathSet, cols, rows)
        : !isWater
          ? pickFieldGroundTile(col, row, pathSet, waterSet, {
              lakeShore: areaId === "lake" || isSecret,
            })
          : -1;
      const tilePool = isTown ? townTileImgs : fieldTileImgs;
      const tileImg =
        tileIdx >= 0 && tileIdx < tilePool.length ? tilePool[tileIdx] : null;
      const usePhotoTile =
        !!tileImg && tileImg.complete && tileImg.naturalWidth > 0;

      if (usePhotoTile && tileImg) {
        ctx.save();
        ctx.clip();
        // 菱形を覆うように配置＋セルごとにわずかにオフセットして継ぎ目を目立たなく
        const ox = (hash2(col, row, 11) - 0.5) * tileW * 0.08;
        const oy = (hash2(col, row, 22) - 0.5) * tileH * 0.08;
        const dw = tileW * 1.22;
        const dh = tileH * 1.35;
        ctx.drawImage(
          tileImg,
          p.x - dw / 2 + ox,
          p.y - dh / 2 + oy,
          dw,
          dh
        );
        ctx.restore();
      } else {
        ctx.fillStyle = fill;
        ctx.fill();
      }

      // 草地に柔らかい光（北西ハイライト／南東影）
      if (!isTown && !isWater) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - tileH / 2 - grow);
        ctx.lineTo(p.x + tileW / 2 + grow, p.y);
        ctx.lineTo(p.x, p.y + tileH / 2 + grow);
        ctx.lineTo(p.x - tileW / 2 - grow, p.y);
        ctx.closePath();
        const shade = ctx.createLinearGradient(
          p.x - tileW * 0.35,
          p.y - tileH * 0.25,
          p.x + tileW * 0.35,
          p.y + tileH * 0.25
        );
        if (usePhotoTile) {
          shade.addColorStop(0, "rgba(255, 240, 180, 0.05)");
          shade.addColorStop(0.5, "rgba(255, 255, 255, 0)");
          shade.addColorStop(1, "rgba(20, 40, 20, 0.08)");
        } else {
          shade.addColorStop(0, "rgba(255, 240, 180, 0.1)");
          shade.addColorStop(0.45, "rgba(255, 255, 255, 0)");
          shade.addColorStop(1, "rgba(20, 40, 20, 0.12)");
        }
        ctx.fillStyle = shade;
        ctx.fill();
        ctx.restore();
      }

      // 城下町：写真タイル時は薄い暖色、未ロード時は従来の目地
      if (isTown) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - tileH / 2 - grow);
        ctx.lineTo(p.x + tileW / 2 + grow, p.y);
        ctx.lineTo(p.x, p.y + tileH / 2 + grow);
        ctx.lineTo(p.x - tileW / 2 - grow, p.y);
        ctx.closePath();
        if (usePhotoTile) {
          ctx.clip();
          const warm = ctx.createLinearGradient(
            p.x - tileW * 0.3,
            p.y - tileH * 0.2,
            p.x + tileW * 0.3,
            p.y + tileH * 0.2
          );
          warm.addColorStop(0, "rgba(255, 250, 230, 0.08)");
          warm.addColorStop(1, "rgba(60, 40, 20, 0.06)");
          ctx.fillStyle = warm;
          ctx.fillRect(p.x - tileW, p.y - tileH, tileW * 2, tileH * 2);
          ctx.restore();
          ctx.strokeStyle = "rgba(40, 30, 18, 0.12)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y - tileH / 2 - grow);
          ctx.lineTo(p.x + tileW / 2 + grow, p.y);
          ctx.lineTo(p.x, p.y + tileH / 2 + grow);
          ctx.lineTo(p.x - tileW / 2 - grow, p.y);
          ctx.closePath();
          ctx.stroke();
        } else {
          ctx.clip();
          const isPath = townPathSet.has(`${col},${row}`);
          if (isPath) {
            ctx.strokeStyle = "rgba(40, 34, 28, 0.35)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(p.x - tileW * 0.22, p.y - tileH * 0.08);
            ctx.lineTo(p.x + tileW * 0.18, p.y + tileH * 0.12);
            ctx.moveTo(p.x + tileW * 0.08, p.y - tileH * 0.18);
            ctx.lineTo(p.x - tileW * 0.12, p.y + tileH * 0.16);
            ctx.stroke();
            ctx.fillStyle = "rgba(255,255,255,0.06)";
            ctx.beginPath();
            ctx.ellipse(
              p.x - tileW * 0.1,
              p.y - tileH * 0.08,
              tileW * 0.16,
              tileH * 0.08,
              -0.4,
              0,
              Math.PI * 2
            );
            ctx.fill();
          } else {
            ctx.strokeStyle = "rgba(120, 90, 50, 0.22)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(p.x - tileW * 0.28, p.y);
            ctx.lineTo(p.x + tileW * 0.28, p.y);
            ctx.moveTo(p.x, p.y - tileH * 0.22);
            ctx.lineTo(p.x, p.y + tileH * 0.22);
            ctx.stroke();
            const warm = ctx.createLinearGradient(
              p.x - tileW * 0.3,
              p.y - tileH * 0.2,
              p.x + tileW * 0.3,
              p.y + tileH * 0.2
            );
            warm.addColorStop(0, "rgba(255, 250, 230, 0.16)");
            warm.addColorStop(1, "rgba(90, 60, 20, 0.08)");
            ctx.fillStyle = warm;
            ctx.fillRect(p.x - tileW, p.y - tileH, tileW * 2, tileH * 2);
          }
          ctx.restore();
          ctx.strokeStyle = isPath
            ? "rgba(30, 24, 18, 0.28)"
            : "rgba(150, 120, 70, 0.18)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y - tileH / 2 - grow);
          ctx.lineTo(p.x + tileW / 2 + grow, p.y);
          ctx.lineTo(p.x, p.y + tileH / 2 + grow);
          ctx.lineTo(p.x - tileW / 2 - grow, p.y);
          ctx.closePath();
          ctx.stroke();
        }
      }

      // 水：写真タイル＋軽いきらめき
      if (isWater) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - tileH / 2 - grow);
        ctx.lineTo(p.x + tileW / 2 + grow, p.y);
        ctx.lineTo(p.x, p.y + tileH / 2 + grow);
        ctx.lineTo(p.x - tileW / 2 - grow, p.y);
        ctx.closePath();
        ctx.clip();

        const wIdx = pickFieldWaterTile(col, row, waterSet);
        const wImg =
          wIdx >= 0 && wIdx < waterTileImgs.length
            ? waterTileImgs[wIdx]
            : null;
        const useWaterPhoto =
          !!wImg && wImg.complete && wImg.naturalWidth > 0;

        if (useWaterPhoto && wImg) {
          const ox = (hash2(col, row, 91) - 0.5) * tileW * 0.06;
          const oy = (hash2(col, row, 92) - 0.5) * tileH * 0.06;
          const dw = tileW * 1.24;
          const dh = tileH * 1.38;
          ctx.drawImage(
            wImg,
            p.x - dw / 2 + ox,
            p.y - dh / 2 + oy,
            dw,
            dh
          );
        } else {
          ctx.fillStyle = fill;
          ctx.fillRect(p.x - tileW, p.y - tileH, tileW * 2, tileH * 2);
        }

        // 岸影（写真タイル時は控えめ）
        let landN = 0;
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
          if (!waterSet.has(`${col + dc},${row + dr}`)) landN += 1;
        }
        if (landN > 0) {
          const a = useWaterPhoto
            ? Math.min(0.16, 0.02 * landN)
            : Math.min(0.38, 0.045 * landN);
          ctx.fillStyle = `rgba(4, 18, 42, ${a})`;
          ctx.fillRect(p.x - tileW, p.y - tileH, tileW * 2, tileH * 2);
        }

        // ゆるい波紋・きらめき（時間でわずかに動く）
        const phase = ts * 0.0018 + col * 0.55 + row * 0.4;
        if (!useWaterPhoto) {
          ctx.strokeStyle = "rgba(160, 210, 255, 0.14)";
          ctx.lineWidth = 1.1;
          for (let i = 0; i < 2; i++) {
            const yy =
              p.y - tileH * 0.18 + i * tileH * 0.22 + Math.sin(phase + i) * 2.2;
            ctx.beginPath();
            ctx.moveTo(p.x - tileW * 0.32, yy);
            ctx.quadraticCurveTo(
              p.x + Math.cos(phase * 0.7 + i) * 4,
              yy - 2.5,
              p.x + tileW * 0.32,
              yy + 1
            );
            ctx.stroke();
          }
        }

        const hx = p.x - tileW * 0.12 + Math.sin(phase * 0.6) * tileW * 0.05;
        const hy = p.y - tileH * 0.16 + Math.cos(phase * 0.5) * tileH * 0.04;
        const shine = ctx.createRadialGradient(hx, hy, 0, hx, hy, tileW * 0.28);
        if (useWaterPhoto) {
          shine.addColorStop(0, "rgba(230, 245, 255, 0.12)");
          shine.addColorStop(0.4, "rgba(160, 210, 255, 0.04)");
          shine.addColorStop(1, "rgba(160, 210, 255, 0)");
        } else {
          shine.addColorStop(0, "rgba(230, 245, 255, 0.34)");
          shine.addColorStop(0.35, "rgba(160, 210, 255, 0.12)");
          shine.addColorStop(1, "rgba(160, 210, 255, 0)");
        }
        ctx.fillStyle = shine;
        ctx.beginPath();
        ctx.ellipse(hx, hy, tileW * 0.22, tileH * 0.14, -0.4, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }
    };

    /** ホバー／指定マス：白い菱形枠＋外光（地面自体に升目は出さない） */
    const drawCellCursor = (
      ctx: CanvasRenderingContext2D,
      col: number,
      row: number,
      opts?: { rgb?: string; fillAlpha?: number; pulse?: number }
    ) => {
      const p = isoToScreen(col, row);
      const rgb = opts?.rgb ?? "255,255,255";
      const fillA = opts?.fillAlpha ?? 0.14;
      const pulse = opts?.pulse ?? 1;
      ctx.save();
      tileTopPath(ctx, p.x, p.y);
      ctx.fillStyle = `rgba(${rgb},${fillA})`;
      ctx.fill();
      ctx.shadowColor = `rgba(${rgb},${0.85 * pulse})`;
      ctx.shadowBlur = 14 + 4 * pulse;
      ctx.strokeStyle = `rgba(${rgb},${0.55 + 0.4 * pulse})`;
      ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = `rgba(${rgb},0.95)`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();
    };

    const drawGrassTuft = (
      ctx: CanvasRenderingContext2D,
      col: number,
      row: number,
      ox: number,
      oy: number,
      s: number
    ) => {
      const p = isoToScreen(col, row);
      const x = p.x + ox * tileW;
      const y = p.y + oy * tileH;
      const h = 5 * s;
      ctx.save();
      ctx.strokeStyle = "rgba(28, 88, 42, 0.62)";
      ctx.lineWidth = 1.2;
      ctx.lineCap = "round";
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(x + i * 2.2 * s, y + 2);
        ctx.quadraticCurveTo(
          x + i * 2.2 * s + i * 1.2,
          y - h * 0.4,
          x + i * 3 * s,
          y - h
        );
        ctx.stroke();
      }
      // 小さな白い花 / たまに金の花
      if (hash2(col, row, 33) > 0.78) {
        const goldBloom = hash2(col, row, 71) > 0.72;
        ctx.fillStyle = goldBloom
          ? "rgba(240, 210, 120, 0.9)"
          : "rgba(255,255,255,0.85)";
        ctx.beginPath();
        ctx.arc(x + 2, y - h * 0.7, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };

    /** 青き境界の丸 */
    const drawGateMarkers = (ctx: CanvasRenderingContext2D, ts: number) => {
      if (!isField || fieldGates.length === 0) return;
      const pulse = (Math.sin(ts / 420) + 1) / 2;
      for (const gate of fieldGates) {
        for (const m of gate.markers) {
          const p = isoToScreen(m.col, m.row);
          const cx = p.x;
          const cy = p.y + tileH * 0.06;
          const rx = tileW * 0.22;
          const ry = tileH * 0.16;
          ctx.save();
          // 地面の影
          ctx.fillStyle = "rgba(10, 30, 70, 0.28)";
          ctx.beginPath();
          ctx.ellipse(cx, cy + 2, rx * 1.05, ry * 1.05, 0, 0, Math.PI * 2);
          ctx.fill();
          // 外側グロー
          const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx * 1.6);
          glow.addColorStop(0, `rgba(120, 200, 255, ${0.35 + 0.2 * pulse})`);
          glow.addColorStop(0.55, `rgba(60, 140, 230, ${0.18 + 0.1 * pulse})`);
          glow.addColorStop(1, "rgba(40, 100, 200, 0)");
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx * 1.55, ry * 1.55, 0, 0, Math.PI * 2);
          ctx.fill();
          // 本体
          const body = ctx.createRadialGradient(
            cx - rx * 0.25,
            cy - ry * 0.35,
            0,
            cx,
            cy,
            rx
          );
          body.addColorStop(0, "#d8f0ff");
          body.addColorStop(0.35, "#5eb0ff");
          body.addColorStop(0.75, "#2a6fd4");
          body.addColorStop(1, "#1a4a9a");
          ctx.fillStyle = body;
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
          ctx.fill();
          // 縁
          ctx.strokeStyle = `rgba(200, 236, 255, ${0.75 + 0.2 * pulse})`;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
          ctx.stroke();
          // ハイライト
          ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
          ctx.beginPath();
          ctx.ellipse(
            cx - rx * 0.22,
            cy - ry * 0.35,
            rx * 0.28,
            ry * 0.22,
            -0.4,
            0,
            Math.PI * 2
          );
          ctx.fill();
          ctx.restore();
        }
      }
    };

    const drawRock = (ctx: CanvasRenderingContext2D, col: number, row: number) => {
      const p = isoToScreen(col, row);
      const cx = p.x, cy = p.y - tileH * 0.15;
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath();
      ctx.ellipse(cx, cy + radius * 0.9, radius * 1.2, radius * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#7a6f5a";
      ctx.beginPath();
      ctx.moveTo(cx - radius, cy);
      ctx.quadraticCurveTo(cx - radius * 0.6, cy - radius * 1.1, cx, cy - radius * 1.2);
      ctx.quadraticCurveTo(cx + radius * 0.9, cy - radius * 0.6, cx + radius, cy);
      ctx.quadraticCurveTo(cx + radius * 0.2, cy + radius * 0.9, cx - radius, cy);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.beginPath();
      ctx.ellipse(cx - radius * 0.2, cy - radius * 0.6, radius * 0.35, radius * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const drawFloatingLabel = (
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number,
      text: string,
      opts?: { color?: string; fontSize?: number }
    ) => {
      const color = opts?.color ?? "#5ef0ff";
      const fontSize = opts?.fontSize ?? Math.max(11, Math.round(tileW * 0.14));
      ctx.save();
      ctx.font = `bold ${fontSize}px "Segoe UI", "Hiragino Sans", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(3, fontSize * 0.28);
      ctx.strokeStyle = "rgba(0,0,0,0.85)";
      ctx.strokeText(text, x, y);
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
      ctx.restore();
    };

    const drawQuestBoard = (
      ctx: CanvasRenderingContext2D,
      col: number,
      row: number,
      highlight: null | "ok" | "far" = null
    ) => {
      const p = isoToScreen(col, row);
      const cx = p.x;
      const cy = p.y;
      const bw = tileW * 0.92;
      const bh = tileH * 1.85;
      const top = cy - bh * 0.98;
      const left = cx - bw / 2;
      const boardH = bh * 0.7;
      const rr = 5;

      const boardPath = () => {
        ctx.beginPath();
        ctx.moveTo(left + rr, top);
        ctx.lineTo(left + bw - rr, top);
        ctx.quadraticCurveTo(left + bw, top, left + bw, top + rr);
        ctx.lineTo(left + bw, top + boardH - rr);
        ctx.quadraticCurveTo(
          left + bw,
          top + boardH,
          left + bw - rr,
          top + boardH
        );
        ctx.lineTo(left + rr, top + boardH);
        ctx.quadraticCurveTo(left, top + boardH, left, top + boardH - rr);
        ctx.lineTo(left, top + rr);
        ctx.quadraticCurveTo(left, top, left + rr, top);
        ctx.closePath();
      };

      ctx.save();
      // 影
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath();
      ctx.ellipse(cx, cy + 8, bw * 0.48, tileH * 0.24, 0, 0, Math.PI * 2);
      ctx.fill();

      // 二本の支柱
      ctx.fillStyle = "#4a3018";
      ctx.fillRect(cx - bw * 0.28, cy - bh * 0.12, 8, bh * 0.5);
      ctx.fillRect(cx + bw * 0.22, cy - bh * 0.12, 8, bh * 0.5);

      // 外枠（濃い木）
      ctx.fillStyle = "#6b3e1a";
      ctx.strokeStyle = "#2a1508";
      ctx.lineWidth = 2.5;
      boardPath();
      ctx.fill();
      ctx.stroke();

      // 上部の飾りカーブ
      ctx.strokeStyle = "#c9a26a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(left + 8, top + 10);
      ctx.quadraticCurveTo(cx, top - 6, left + bw - 8, top + 10);
      ctx.stroke();
      ctx.fillStyle = "#d4b07a";
      ctx.beginPath();
      ctx.arc(cx, top + 4, 4, 0, Math.PI * 2);
      ctx.fill();

      // コルク面
      const pad = bw * 0.08;
      ctx.fillStyle = "#5c3a22";
      ctx.fillRect(
        left + pad,
        top + boardH * 0.14,
        bw - pad * 2,
        boardH * 0.72
      );
      ctx.fillStyle = "rgba(0,0,0,0.15)";
      for (let i = 0; i < 5; i++) {
        ctx.fillRect(
          left + pad + 4 + i * 7,
          top + boardH * 0.2,
          2,
          boardH * 0.55
        );
      }

      // 貼り紙
      const papers = [
        { x: 0.18, y: 0.22, w: 0.28, h: 0.28, rot: -0.08 },
        { x: 0.48, y: 0.2, w: 0.3, h: 0.32, rot: 0.06 },
        { x: 0.28, y: 0.48, w: 0.26, h: 0.26, rot: 0.04 },
        { x: 0.55, y: 0.5, w: 0.24, h: 0.24, rot: -0.05 },
      ];
      for (const paper of papers) {
        const px = left + bw * paper.x;
        const py = top + boardH * paper.y;
        const pw = bw * paper.w;
        const ph = boardH * paper.h;
        ctx.save();
        ctx.translate(px + pw / 2, py + ph / 2);
        ctx.rotate(paper.rot);
        ctx.fillStyle = "#f7f1e2";
        ctx.strokeStyle = "rgba(60,40,20,0.35)";
        ctx.lineWidth = 1;
        ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
        ctx.strokeRect(-pw / 2, -ph / 2, pw, ph);
        ctx.strokeStyle = "rgba(90,70,40,0.25)";
        ctx.beginPath();
        ctx.moveTo(-pw * 0.3, -ph * 0.15);
        ctx.lineTo(pw * 0.3, -ph * 0.1);
        ctx.moveTo(-pw * 0.28, 0);
        ctx.lineTo(pw * 0.25, 0.05);
        ctx.stroke();
        // ピン
        ctx.fillStyle = "#c04040";
        ctx.beginPath();
        ctx.arc(0, -ph / 2 + 3, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // ホバー枠
      if (highlight) {
        const glow =
          highlight === "ok"
            ? "rgba(90, 220, 120, 0.85)"
            : "rgba(255, 80, 80, 0.85)";
        const soft =
          highlight === "ok"
            ? "rgba(90, 220, 120, 0.18)"
            : "rgba(255, 80, 80, 0.18)";
        boardPath();
        ctx.fillStyle = soft;
        ctx.fill();
        boardPath();
        ctx.strokeStyle = glow;
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      drawFloatingLabel(ctx, cx, top - 4, "クエストボード");
      ctx.restore();
    };

    const drawTownProp = (ctx: CanvasRenderingContext2D, prop: TownProp) => {
      const p = isoToScreen(prop.col, prop.row);
      const ox = (prop.ox ?? 0) * tileW;
      const oy = (prop.oy ?? 0) * tileH;
      const x = p.x + ox;
      const y = p.y + oy;
      ctx.save();
      if (prop.kind === "fence") {
        ctx.fillStyle = "rgba(0,0,0,0.2)";
        ctx.beginPath();
        ctx.ellipse(x, y + 4, 10, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#8b6a3e";
        ctx.fillRect(x - 10, y - 10, 3, 14);
        ctx.fillRect(x + 7, y - 10, 3, 14);
        ctx.fillRect(x - 11, y - 12, 22, 3);
        ctx.fillStyle = "#a88450";
        ctx.fillRect(x - 11, y - 6, 22, 2);
      } else if (prop.kind === "planter") {
        ctx.fillStyle = "rgba(0,0,0,0.22)";
        ctx.beginPath();
        ctx.ellipse(x, y + 5, 14, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#6b4424";
        ctx.fillRect(x - 12, y - 4, 24, 10);
        ctx.fillStyle = "#8a5a30";
        ctx.fillRect(x - 13, y - 6, 26, 4);
        ctx.fillStyle = "#3d8a45";
        ctx.beginPath();
        ctx.ellipse(x, y - 8, 11, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ff6b8a";
        for (const [fx, fy] of [
          [-5, -10],
          [2, -12],
          [6, -8],
        ] as const) {
          ctx.beginPath();
          ctx.arc(x + fx, y + fy, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (prop.kind === "banner") {
        ctx.fillStyle = "#5a4030";
        ctx.fillRect(x - 2, y - 42, 4, 46);
        ctx.fillStyle = "#2a6ec8";
        ctx.beginPath();
        ctx.moveTo(x, y - 40);
        ctx.lineTo(x + 16, y - 34);
        ctx.lineTo(x + 16, y - 14);
        ctx.lineTo(x, y - 20);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.fillRect(x + 3, y - 36, 3, 18);
      } else {
        ctx.fillStyle = "rgba(0,0,0,0.22)";
        ctx.beginPath();
        ctx.ellipse(x, y + 4, 12, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#9a7048";
        ctx.fillRect(x - 10, y - 12, 20, 16);
        ctx.strokeStyle = "#5a3a20";
        ctx.strokeRect(x - 10, y - 12, 20, 16);
        ctx.fillStyle = "#b08050";
        ctx.fillRect(x - 10, y - 12, 20, 4);
      }
      ctx.restore();
    };

    const drawTownNpc = (
      ctx: CanvasRenderingContext2D,
      col: number,
      row: number,
      img: HTMLImageElement,
      label: string,
      highlight: null | "ok" | "far" = null
    ) => {
      const p = isoToScreen(col, row);
      const drawH = Math.round(tileH * 2.35);
      const drawW = Math.round(drawH * 0.85);
      const dx = Math.round(p.x - drawW / 2);
      const dy = Math.round(p.y - drawH * 0.92);

      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 4, drawW * 0.32, tileH * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();

      if (img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, dx, dy, drawW, drawH);
      } else {
        ctx.fillStyle = "#6a5040";
        ctx.fillRect(dx + drawW * 0.25, dy + drawH * 0.2, drawW * 0.5, drawH * 0.7);
      }

      if (highlight) {
        const glow =
          highlight === "ok"
            ? "rgba(90, 220, 120, 0.9)"
            : "rgba(255, 80, 80, 0.9)";
        const soft =
          highlight === "ok"
            ? "rgba(90, 220, 120, 0.18)"
            : "rgba(255, 80, 80, 0.18)";
        const pad = 4;
        const x = dx - pad;
        const y = dy - pad;
        const w = drawW + pad * 2;
        const h = drawH + pad * 2;
        ctx.fillStyle = soft;
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = glow;
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, w, h);
        ctx.strokeStyle =
          highlight === "ok"
            ? "rgba(140, 255, 170, 0.35)"
            : "rgba(255, 160, 160, 0.35)";
        ctx.lineWidth = 7;
        ctx.strokeRect(x, y, w, h);
      }

      drawFloatingLabel(ctx, p.x, dy - 2, label);
      ctx.restore();
    };

    const getNpcBounds = (col: number, row: number) => {
      const p = isoToScreen(col, row);
      const drawH = Math.round(tileH * 2.35);
      const drawW = Math.round(drawH * 0.85);
      return {
        left: p.x - drawW / 2,
        top: p.y - drawH * 0.92,
        right: p.x + drawW / 2,
        bottom: p.y + 8,
      };
    };

    const drawPathPreview = (ctx: CanvasRenderingContext2D, pth: Node[]) => {
      ctx.save();
      for (const n of pth) {
        const pos = isoToScreen(n.col, n.row);
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.beginPath();
        ctx.ellipse(pos.x, pos.y + 4, 5, 2.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(120, 200, 255, 0.35)";
        ctx.beginPath();
        ctx.ellipse(pos.x, pos.y + 4, 3.2, 1.6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };

    // --- キャラ画像はループ外で一度だけ読み込む ---
    let lastTs: number | null = null;
    const charImg = new Image();
    let started = false;
    const startLoop = () => {
      if (started) return;
      started = true;
      lastTs = null;
      raf = requestAnimationFrame(loop);
    };
    charImg.onerror = (e) => {
      console.error("キャラ画像読み込み失敗", e);
    };
    charImg.src = "/chara.png";

    // --- 座標変換ユーティリティ（中心原点対応） ---
    function toCanvasPos(clientX: number, clientY: number) {
      const rect = canvas.getBoundingClientRect();
      const cssX = clientX - rect.left;
      const cssY = clientY - rect.top;
      const localX = cssX - currentCssW / 2;
      const localY = cssY - currentCssH / 2;
      return { x: localX, y: localY };
    }

    // --- pointer イベントハンドラ（タップ=移動 / スワイプ=カメラ） ---
    let longPressTimer: number | null = null;
    let longPressActive = false;
    const LONG_PRESS_MS = 400;
    const PAN_THRESHOLD = 12;
    let pointerDown = false;
    let panMode = false;
    let movedEnough = false;
    let downClientX = 0;
    let downClientY = 0;
    let downCamX = 0;
    let downCamY = 0;
    let pendingTap: { col: number; row: number } | null = null;
    /** 看板の木板そのものを押したときだけ true（マス移動とは別） */
    let pendingBoardTap = false;
    /** マウスが看板の木板の上にあるか */
    let hoverBoard = false;
    /** 武器屋NPCホバー */
    let hoverSmith = false;
    let pendingSmithTap = false;
    /** 防具屋NPC */
    let hoverArmorSmith = false;
    let pendingArmorSmithTap = false;
    /** ワープ屋NPC（始まりの草原） */
    let hoverWarpKeeper = false;
    let pendingWarpTap = false;
    /** ボスホバー */
    let hoverBoss = false;
    let pendingBossTap = false;
    /** ボード操作に必要な距離（マス。同じマス〜隣まで） */
    const QUEST_BOARD_REACH = 1;

    function hitQuestBoardSign(worldX: number, worldY: number): boolean {
      if (!isTown) return false;
      const p = isoToScreen(QUEST_BOARD.col, QUEST_BOARD.row);
      // drawQuestBoard の木板部分だけ（足元マスは含めない）
      const bw = tileW * 0.92;
      const bh = tileH * 1.85;
      const top = p.y - bh * 0.98;
      const left = p.x - bw / 2;
      const boardH = bh * 0.7;
      const pad = 6;
      return (
        worldX >= left - pad &&
        worldX <= left + bw + pad &&
        worldY >= top - pad &&
        worldY <= top + boardH + pad
      );
    }

    function hitNpcAt(
      worldX: number,
      worldY: number,
      col: number,
      row: number
    ): boolean {
      const b = getNpcBounds(col, row);
      const pad = 4;
      return (
        worldX >= b.left - pad &&
        worldX <= b.right + pad &&
        worldY >= b.top - pad &&
        worldY <= b.bottom + pad
      );
    }

    function hitWeaponSmith(worldX: number, worldY: number): boolean {
      if (!isTown) return false;
      return hitNpcAt(worldX, worldY, WEAPON_SMITH.col, WEAPON_SMITH.row);
    }

    function hitArmorSmith(worldX: number, worldY: number): boolean {
      if (!isTown) return false;
      return hitNpcAt(worldX, worldY, ARMOR_SMITH.col, ARMOR_SMITH.row);
    }

    function hitWarpKeeper(worldX: number, worldY: number): boolean {
      if (!showWarpShop) return false;
      return hitNpcAt(
        worldX,
        worldY,
        FIELD_WARP_SHOP.col,
        FIELD_WARP_SHOP.row
      );
    }

    function hitBossSprite(worldX: number, worldY: number): boolean {
      if (!isSecret) return false;
      const boss = monsters.find((m) => MONSTERS[m.id]?.boss);
      if (!boss) return false;
      const def = MONSTERS[boss.id];
      const scale = (tileW / 56) * 1.35;
      const drawW = 96 * scale;
      const drawH = 88 * scale;
      const top = boss.y - drawH * 0.8;
      const left = boss.x - drawW / 2;
      const pad = 8;
      return (
        worldX >= left - pad &&
        worldX <= left + drawW + pad &&
        worldY >= top - pad &&
        worldY <= boss.y + tileH * 0.35 + pad
      );
    }

    function isNearCell(col: number, row: number): boolean {
      const cur = screenToIso(state.current.x, state.current.y);
      if (cur.col < 0) return false;
      const dist = Math.max(
        Math.abs(cur.col - col),
        Math.abs(cur.row - row)
      );
      return dist <= QUEST_BOARD_REACH;
    }

    function isNearQuestBoard(): boolean {
      return isNearCell(QUEST_BOARD.col, QUEST_BOARD.row);
    }

    function isNearWeaponSmith(): boolean {
      return isNearCell(WEAPON_SMITH.col, WEAPON_SMITH.row);
    }

    function isNearArmorSmith(): boolean {
      return isNearCell(ARMOR_SMITH.col, ARMOR_SMITH.row);
    }

    function isNearWarpKeeper(): boolean {
      return isNearCell(FIELD_WARP_SHOP.col, FIELD_WARP_SHOP.row);
    }

    function openQuestBoardNow() {
      if (!isNearQuestBoard()) {
        pushChatMessage("クエストボードにもっと近づいてみよう", "system");
        flashCell = {
          col: QUEST_BOARD.col,
          row: QUEST_BOARD.row,
          until: performance.now() + 400,
        };
        return;
      }
      try {
        questBoardRef.current?.();
      } catch (e) {
        console.error("quest board open failed", e);
      }
    }

    function openWeaponShopNow() {
      if (!isNearWeaponSmith()) {
        pushChatMessage("武器屋にもっと近づいてみよう", "system");
        flashCell = {
          col: WEAPON_SMITH.col,
          row: WEAPON_SMITH.row,
          until: performance.now() + 400,
        };
        return;
      }
      try {
        weaponShopRef.current?.();
      } catch (e) {
        console.error("weapon shop open failed", e);
      }
    }

    function openArmorShopNow() {
      if (!isNearArmorSmith()) {
        pushChatMessage("防具屋にもっと近づいてみよう", "system");
        flashCell = {
          col: ARMOR_SMITH.col,
          row: ARMOR_SMITH.row,
          until: performance.now() + 400,
        };
        return;
      }
      try {
        armorShopRef.current?.();
      } catch (e) {
        console.error("armor shop open failed", e);
      }
    }

    function openWarpShopNow() {
      if (!showWarpShop) return;
      if (!isNearWarpKeeper()) {
        pushChatMessage("ワープ屋にもっと近づいてみよう", "system");
        flashCell = {
          col: FIELD_WARP_SHOP.col,
          row: FIELD_WARP_SHOP.row,
          until: performance.now() + 400,
        };
        return;
      }
      try {
        warpShopRef.current?.();
      } catch (e) {
        console.error("warp shop open failed", e);
      }
    }

    function issueMoveTo(cell: { col: number; row: number }, asLong = false) {
      if (battleTransition || areaExitStarted) return;
      if (cell.col < 0) return;

      const bossHit = findBossAtCell(cell.col, cell.row);
      if (bossHit) {
        if (isNearBoss(bossHit)) {
          askBossFight(bossHit);
          return;
        }
        const approach = pickBossApproachCell(bossHit);
        if (!approach) {
          askBossFight(bossHit);
          return;
        }
        cell = approach;
        battleMonsterId = bossHit.id;
        battleInstanceId = bossHit.instanceId;
      } else if (isBlocked(cell.col, cell.row)) {
        flashCell = { col: cell.col, row: cell.row, until: performance.now() + 300 };
        return;
      }

      // 停止中は見た目位置から論理マスを再同期（戦闘復帰後のずれ対策）
      if (!state.current.moving) {
        const approx = screenToIso(state.current.x, state.current.y);
        if (
          approx.col >= 0 &&
          inBounds(approx.col, approx.row) &&
          !isBlocked(approx.col, approx.row)
        ) {
          playerCol = approx.col;
          playerRow = approx.row;
        }
      }

      const curCell = { col: playerCol, row: playerRow };
      let pathFound = findPath(curCell, { col: cell.col, row: cell.row });
      if (!pathFound) {
        // フォールバック: 画面座標からの推定でもう一度
        const approx = screenToIso(state.current.x, state.current.y);
        if (approx.col >= 0) {
          pathFound = findPath(approx, { col: cell.col, row: cell.row });
        }
      }
      if (!pathFound) {
        flashCell = { col: cell.col, row: cell.row, until: performance.now() + 300 };
        path = [];
        state.current.moving = false;
        return;
      }

      if (!bossHit) {
        battleMonsterId = null;
        battleInstanceId = null;
        // クリック先に敵がいればそれを優先（道中の別敵にすり替わらない）
        const goalMonster = monsters.find(
          (m) => m.col === cell.col && m.row === cell.row
        );
        if (goalMonster) {
          battleMonsterId = goalMonster.id;
          battleInstanceId = goalMonster.instanceId;
          const monsterIndex = pathFound.findIndex(
            (node) =>
              node.col === goalMonster.col && node.row === goalMonster.row
          );
          if (monsterIndex >= 0) pathFound.splice(monsterIndex);
        } else {
          const monsterIndex = pathFound.findIndex((node) =>
            monsters.some((m) => m.col === node.col && m.row === node.row)
          );
          if (monsterIndex >= 0) {
            const monster = monsters.find(
              (m) =>
                m.col === pathFound[monsterIndex].col &&
                m.row === pathFound[monsterIndex].row
            );
            battleMonsterId = monster?.id ?? null;
            battleInstanceId = monster?.instanceId ?? null;
            pathFound.splice(monsterIndex);
          }
        }
      }

      path = pathFound.slice();
      const next = path.shift();
      if (!next) {
        state.current.moving = false;
        playerCol = cell.col;
        playerRow = cell.row;
        if (checkGateExit(playerCol, playerRow)) return;
        if (battleMonsterId != null && battleInstanceId) {
          beginBattleOrAsk(battleMonsterId, battleInstanceId);
        }
        return;
      }
      const center = isoToScreen(next.col, next.row);
      state.current.targetX = center.x;
      state.current.targetY = center.y + 6;
      state.current.moving = true;
      // 到着予定マスを先に保持（途中で戦闘になっても復帰先が分かる）
      playerCol = next.col;
      playerRow = next.row;
      if (checkGateExit(playerCol, playerRow)) {
        state.current.moving = false;
        path = [];
        return;
      }
      if (asLong) {
        longActive.col = cell.col;
        longActive.row = cell.row;
        active.col = -1;
        active.row = -1;
      } else {
        active.col = cell.col;
        active.row = cell.row;
        longActive.col = -1;
        longActive.row = -1;
      }
    }

    const onPointerDown = (ev: PointerEvent) => {
      ev.preventDefault();
      (ev.target as Element).setPointerCapture?.(ev.pointerId);
      pointerDown = true;
      panMode = false;
      movedEnough = false;
      downClientX = ev.clientX;
      downClientY = ev.clientY;
      downCamX = camX;
      downCamY = camY;

      const p = toCanvasPos(ev.clientX, ev.clientY);
      const w = viewToWorld(p.x, p.y);
      const cell = screenToIso(w.x, w.y);
      hover.col = cell.col;
      hover.row = cell.row;
      pendingBoardTap = hitQuestBoardSign(w.x, w.y);
      pendingSmithTap = !pendingBoardTap && hitWeaponSmith(w.x, w.y);
      pendingArmorSmithTap =
        !pendingBoardTap && !pendingSmithTap && hitArmorSmith(w.x, w.y);
      pendingWarpTap =
        !pendingBoardTap &&
        !pendingSmithTap &&
        !pendingArmorSmithTap &&
        hitWarpKeeper(w.x, w.y);
      pendingBossTap =
        !pendingBoardTap &&
        !pendingSmithTap &&
        !pendingArmorSmithTap &&
        !pendingWarpTap &&
        hitBossSprite(w.x, w.y);
      // 看板／NPC押しのときはマス移動にしない
      pendingTap =
        pendingBoardTap ||
        pendingSmithTap ||
        pendingArmorSmithTap ||
        pendingWarpTap ||
        pendingBossTap ||
        cell.col < 0
          ? null
          : { col: cell.col, row: cell.row };

      state.current.dragging = true;
      longPressTimer = window.setTimeout(() => {
        if (!movedEnough && pendingBoardTap) {
          longPressActive = true;
          openQuestBoardNow();
        } else if (!movedEnough && pendingSmithTap) {
          longPressActive = true;
          openWeaponShopNow();
        } else if (!movedEnough && pendingArmorSmithTap) {
          longPressActive = true;
          openArmorShopNow();
        } else if (!movedEnough && pendingWarpTap) {
          longPressActive = true;
          openWarpShopNow();
        } else if (!movedEnough && pendingBossTap) {
          longPressActive = true;
          const boss = monsters.find((m) => MONSTERS[m.id]?.boss);
          if (boss) issueMoveTo({ col: boss.col, row: boss.row }, true);
        } else if (!movedEnough && pendingTap) {
          longPressActive = true;
          issueMoveTo(pendingTap, true);
        }
      }, LONG_PRESS_MS);
    };

    const onPointerMove = (ev: PointerEvent) => {
      const p = toCanvasPos(ev.clientX, ev.clientY);
      const w = viewToWorld(p.x, p.y);
      const cell = screenToIso(w.x, w.y);
      hover.col = cell.col;
      hover.row = cell.row;
      hoverBoard = hitQuestBoardSign(w.x, w.y);
      hoverSmith = !hoverBoard && hitWeaponSmith(w.x, w.y);
      hoverArmorSmith =
        !hoverBoard && !hoverSmith && hitArmorSmith(w.x, w.y);
      hoverWarpKeeper =
        !hoverBoard &&
        !hoverSmith &&
        !hoverArmorSmith &&
        hitWarpKeeper(w.x, w.y);
      hoverBoss =
        !hoverBoard &&
        !hoverSmith &&
        !hoverArmorSmith &&
        !hoverWarpKeeper &&
        hitBossSprite(w.x, w.y);
      canvas.style.cursor =
        hoverBoard ||
        hoverSmith ||
        hoverArmorSmith ||
        hoverWarpKeeper ||
        hoverBoss
          ? "pointer"
          : "";

      if (!pointerDown) return;

      const dx = ev.clientX - downClientX;
      const dy = ev.clientY - downClientY;
      if (!movedEnough && Math.hypot(dx, dy) > PAN_THRESHOLD) {
        // 草原はカメラ追従固定（スワイプパンなし）／城下町のみパン可
        if (isTown) {
          movedEnough = true;
          panMode = true;
          longPressActive = false;
          pendingTap = null;
          pendingBoardTap = false;
          pendingSmithTap = false;
          pendingArmorSmithTap = false;
          pendingWarpTap = false;
          pendingBossTap = false;
          active.col = -1;
          active.row = -1;
          longActive.col = -1;
          longActive.row = -1;
          if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
          }
        }
      }

      if (panMode && isTown) {
        camX = downCamX + dx;
        camY = downCamY + dy;
        clampCamera();
        return;
      }

      if (
        longPressActive &&
        !pendingBoardTap &&
        !pendingSmithTap &&
        !pendingArmorSmithTap &&
        !pendingWarpTap &&
        !pendingBossTap &&
        cell.col >= 0
      ) {
        issueMoveTo(cell, true);
      }
    };

    const endPointer = (ev?: PointerEvent) => {
      if (ev) {
        try {
          (ev.target as Element).releasePointerCapture?.(ev.pointerId);
        } catch {
          /* ignore */
        }
      }
      if (!panMode && !longPressActive && ev?.type === "pointerup") {
        if (pendingBoardTap) {
          openQuestBoardNow();
        } else if (pendingSmithTap) {
          openWeaponShopNow();
        } else if (pendingArmorSmithTap) {
          openArmorShopNow();
        } else if (pendingWarpTap) {
          openWarpShopNow();
        } else if (pendingBossTap) {
          const boss = monsters.find((m) => MONSTERS[m.id]?.boss);
          if (boss) issueMoveTo({ col: boss.col, row: boss.row }, false);
        } else if (pendingTap) {
          issueMoveTo(pendingTap, false);
        }
      }
      pointerDown = false;
      panMode = false;
      movedEnough = false;
      pendingTap = null;
      pendingBoardTap = false;
      pendingSmithTap = false;
      pendingArmorSmithTap = false;
      pendingWarpTap = false;
      pendingBossTap = false;
      state.current.dragging = false;
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      longPressActive = false;
      longActive.col = -1;
      longActive.row = -1;
    };

    const onPointerUp = (ev: PointerEvent) => {
      endPointer(ev);
    };

    const onPointerCancel = (ev: PointerEvent) => {
      // 戦闘遷移などで pointerup が来ないとき用
      endPointer(ev);
    };

    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    const onPointerLeave = () => {
      hoverBoard = false;
      hoverSmith = false;
      hoverArmorSmith = false;
      hoverWarpKeeper = false;
      hoverBoss = false;
      canvas.style.cursor = "";
    };
    canvas.addEventListener("pointerleave", onPointerLeave);

    // キャラクター描画
    function drawCharacter() {
      // デバッグ用: 一時的に有効にして位置確認
      // ctx.fillStyle = 'red';
      // ctx.fillRect(Math.round(state.current.x)-2, Math.round(state.current.y)-2, 4, 4);

      const scaleFactor = 0.11 * (tileW / 56); // 少し小さめ
      const imgW = charImg.naturalWidth || (radius / 2);
      const imgH = charImg.naturalHeight || (radius / 2);
      const drawW = Math.max(1, Math.round(imgW * scaleFactor));
      const drawH = Math.max(1, Math.round(imgH * scaleFactor));

      // 足元アンカー（画像下端を足元と仮定）
      const anchorX = drawW / 2;
      const anchorY = drawH * 0.86; // 調整値: 0.9〜1.0 を試す

      // 描画座標（ワールド座標。カメラ translate 内で描く）
      const dx = Math.round(state.current.x - anchorX);
      const dy = Math.round(state.current.y - anchorY);

      if (charImg.complete && charImg.naturalWidth > 0) {
        ctx.drawImage(charImg, dx, dy, drawW, drawH);
      } else {
        // フォールバック（小さい円）
        ctx.save();
        ctx.fillStyle = '#FFD54F';
        ctx.beginPath();
        ctx.arc(state.current.x, state.current.y - 6, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#B8860B';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }

      // チャット吹き出し
      const bubble = getSpeechBubble();
      if (bubble) {
        drawSpeechBubble(state.current.x, dy - 8, bubble.text);
      }
    }

    function drawSpeechBubble(cx: number, topY: number, text: string) {
      const maxW = 160;
      ctx.save();
      ctx.font = "bold 13px 'Segoe UI', 'Hiragino Sans', sans-serif";
      const metrics = ctx.measureText(text);
      const tw = Math.min(maxW, Math.max(40, metrics.width));
      const padX = 10;
      const padY = 7;
      const bw = tw + padX * 2;
      const bh = 26;
      const bx = Math.round(cx - bw / 2);
      const by = Math.round(topY - bh - 10);

      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.strokeStyle = "rgba(30,30,30,0.75)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      const r = 8;
      ctx.moveTo(bx + r, by);
      ctx.lineTo(bx + bw - r, by);
      ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + r);
      ctx.lineTo(bx + bw, by + bh - r);
      ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - r, by + bh);
      ctx.lineTo(cx + 6, by + bh);
      ctx.lineTo(cx, by + bh + 8);
      ctx.lineTo(cx - 6, by + bh);
      ctx.lineTo(bx + r, by + bh);
      ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - r);
      ctx.lineTo(bx, by + r);
      ctx.quadraticCurveTo(bx, by, bx + r, by);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#222";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const display =
        metrics.width > maxW ? text.slice(0, 12) + "…" : text;
      ctx.fillText(display, cx, by + bh / 2 + 1);
      ctx.restore();
    }

    // 影を描く（ループ内でキャラ描画の前に呼ぶ）
    function drawShadow(x: number, y: number, baseRadius: number, scaleFactor = 1) {
      ctx.save();

      // パラメータ（調整しやすい）
      const shadowScale = 1.3 * Math.max(0.9, scaleFactor * 0.25); // キャラが大きいほど影も大きく
      const offsetY = baseRadius * 0.1; // 足元からの縦オフセット
      const rx = baseRadius * 1.2 * shadowScale;
      const ry = baseRadius * 0.5 * shadowScale;
      const alpha = 0.25; // 不透明度
      const blurPx = 4; // ぼかし量（CSSピクセル）

      // ぼかし（Canvas の filter を使う）
      ctx.filter = `blur(${blurPx}px)`;
      ctx.fillStyle = `rgba(0,0,0,${alpha})`;
      ctx.beginPath();
      ctx.ellipse(x, y + offsetY, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();

      // リセット
      ctx.filter = 'none';
      ctx.restore();
    }

    // --- 描画ループ（統一） ---
    function loop(ts: number) {
      if (!started) { raf = requestAnimationFrame(loop); return; }
      if (lastTs == null) lastTs = ts;
      const dt = (ts - lastTs) / 1000;
      lastTs = ts;

      // 移動ロジック（既存）
      if (state.current.moving) {
        const dx = state.current.targetX - state.current.x;
        const dy = state.current.targetY - state.current.y;
        const dist = Math.hypot(dx, dy);
        if (dist < ARRIVAL_THRESHOLD) {
          state.current.x = state.current.targetX;
          state.current.y = state.current.targetY;
          if (path.length > 0) {
            const next = path.shift();
            if (next) {
              const center = isoToScreen(next.col, next.row);
              state.current.targetX = center.x;
              state.current.targetY = center.y + 6;
              state.current.moving = true;
              playerCol = next.col;
              playerRow = next.row;
              if (checkGateExit(playerCol, playerRow)) {
                state.current.moving = false;
                path = [];
              }
            } else {
              state.current.moving = false;
              if (
                !checkGateExit(playerCol, playerRow) &&
                battleMonsterId != null
              ) {
                beginBattleOrAsk(battleMonsterId, battleInstanceId);
              }
            }
          } else {
            state.current.moving = false;
            if (
              !checkGateExit(playerCol, playerRow) &&
              battleMonsterId != null
            ) {
              beginBattleOrAsk(battleMonsterId, battleInstanceId);
            }
            active.col = -1; active.row = -1;
            longActive.col = -1; longActive.row = -1;
          }
        } else {
          const maxMove = state.current.speed * dt;
          const ratio = Math.min(1, maxMove / dist);
          state.current.x += dx * ratio;
          state.current.y += dy * ratio;
        }
      }

      // clamp
      const cl = clampToBounds(state.current.x, state.current.y);
      state.current.x = cl.x; state.current.y = cl.y;

      // 草原: キャラを常に画面中央に（スムーズ追従）
      if (!isTown) {
        const tx = -state.current.x;
        const ty = -state.current.y;
        const k = Math.min(1, 10 * dt);
        camX += (tx - camX) * k;
        camY += (ty - camY) * k;
        clampCamera();
      }

      // 敵の徘徊
      updateMonsters(dt);

      // 倒した敵の復活チェック（0.5秒ごと）— 復活分だけランダム再配置
      if (ts - lastRespawnCheck > 500) {
        lastRespawnCheck = ts;
        if (isTown) {
          monsters = [];
        } else if (isSecret) {
          const bossList = createSecretBossMonster(SECRET_KELPIE_POS);
          const prev = new Map(monsters.map((m) => [m.instanceId, m]));
          monsters = bossList.map((m) => prev.get(m.instanceId) ?? toLive(m));
        } else {
          const synced = syncAliveFieldMonsters(
            monsters,
            cols,
            rows,
            monsterBlocked,
            spawnAvoid
          );
          const prev = new Map(monsters.map((m) => [m.instanceId, m]));
          monsters = synced.map((m) => prev.get(m.instanceId) ?? toLive(m));
        }
      }

      // clear（画面固定の背景）
      ctx.clearRect(-currentCssW / 2, -currentCssH / 2, currentCssW, currentCssH);
      if (isTown) {
        const sky = ctx.createLinearGradient(
          0,
          -currentCssH / 2,
          0,
          currentCssH / 2
        );
        sky.addColorStop(0, "#9ec8e8");
        sky.addColorStop(0.45, "#c8dff0");
        sky.addColorStop(1, "#e8dcc0");
        ctx.fillStyle = sky;
        ctx.fillRect(-currentCssW / 2, -currentCssH / 2, currentCssW, currentCssH);
      } else {
        const sky = ctx.createLinearGradient(
          0,
          -currentCssH / 2,
          0,
          currentCssH / 2
        );
        sky.addColorStop(0, "#2a3a48");
        sky.addColorStop(0.35, "#1e3228");
        sky.addColorStop(0.72, "#162818");
        sky.addColorStop(1, "#0e1a12");
        ctx.fillStyle = sky;
        ctx.fillRect(-currentCssW / 2, -currentCssH / 2, currentCssW, currentCssH);
      }

      // ワールド（カメラオフセット）
      ctx.save();
      ctx.translate(camX, camY);

      // 画面内だけ描画（広いマップ用カリング）
      const viewPad = tileW * 2.5;
      const viewMinX = -currentCssW / 2 - camX - viewPad;
      const viewMaxX = currentCssW / 2 - camX + viewPad;
      const viewMinY = -currentCssH / 2 - camY - viewPad;
      const viewMaxY = currentCssH / 2 - camY + viewPad;

      // draw tiles（奥から）
      for (let sum = 0; sum <= cols + rows - 2; sum++) {
        for (let c = 0; c < cols; c++) {
          const r = sum - c;
          if (r < 0 || r >= rows) continue;
          const p = isoToScreen(c, r);
          if (
            p.x < viewMinX ||
            p.x > viewMaxX ||
            p.y < viewMinY ||
            p.y > viewMaxY
          ) {
            continue;
          }
          const base = isTown
            ? townPathSet.has(`${c},${r}`)
              ? townCobbleFill(c, r)
              : townBrickFill(c, r)
            : fieldCellFill(c, r, pathSet, waterSet);
          drawTile(ctx, c, r, base, ts);
        }
      }

      // 草むら装飾（写真タイル自体に草があるので控えめ／未ロード時のみ多め）
      if (!isTown && fieldTilesReady < fieldTileImgs.length) {
        for (const t of grassTufts) {
          const p = isoToScreen(t.col, t.row);
          if (
            p.x < viewMinX ||
            p.x > viewMaxX ||
            p.y < viewMinY ||
            p.y > viewMaxY
          ) {
            continue;
          }
          drawGrassTuft(ctx, t.col, t.row, t.ox, t.oy, t.s);
        }
      }

      // ワールドマップ入り口（青い丸）
      if (!isTown) drawGateMarkers(ctx, ts);

      if (path.length > 0) drawPathPreview(ctx, path);

      // hover / 指定マス：白い菱形枠（地面自体にマスは出さない）
      if (hover.col >= 0 && hover.row >= 0 &&
          !(active.col === hover.col && active.row === hover.row) &&
          !(longActive.col === hover.col && longActive.row === hover.row)) {
        drawCellCursor(ctx, hover.col, hover.row, {
          rgb: "255,236,190",
          fillAlpha: 0.1,
          pulse: 0.85,
        });
      }

      // active / longActive
      if (longActive.col >= 0 && longActive.row >= 0) {
        const pulse = (Math.sin(ts / 350) + 1) / 2;
        drawBeam(ctx, longActive.col, longActive.row, ts, "120,255,140");
        drawCellCursor(ctx, longActive.col, longActive.row, {
          rgb: "180,255,200",
          fillAlpha: 0.12,
          pulse,
        });
      }

      if (active.col >= 0 && active.row >= 0) {
        const pulse = (Math.sin(ts / 350) + 1) / 2;
        drawBeam(ctx, active.col, active.row, ts, "120,200,255");
        drawCellCursor(ctx, active.col, active.row, {
          rgb: "180,230,255",
          fillAlpha: 0.12,
          pulse,
        });
      }

      // 岩描画
      for (const b of rockBlocked) drawRock(ctx, b.col, b.row);

      // 城下町の装飾（柵・プランター・旗）
      if (isTown) {
        for (const prop of townProps) drawTownProp(ctx, prop);
      }

      // 城下町クエストボード（マスに乗っても開かない／木板クリックのみ）
      if (isTown) {
        const hl = hoverBoard
          ? isNearQuestBoard()
            ? "ok"
            : "far"
          : null;
        drawQuestBoard(ctx, QUEST_BOARD.col, QUEST_BOARD.row, hl);

        const shl = hoverSmith
          ? isNearWeaponSmith()
            ? "ok"
            : "far"
          : null;
        drawTownNpc(
          ctx,
          WEAPON_SMITH.col,
          WEAPON_SMITH.row,
          smithImg,
          "武器屋",
          shl
        );

        const ahl = hoverArmorSmith
          ? isNearArmorSmith()
            ? "ok"
            : "far"
          : null;
        drawTownNpc(
          ctx,
          ARMOR_SMITH.col,
          ARMOR_SMITH.row,
          armorSmithImg,
          "防具屋",
          ahl
        );
      }

      // 始まりの草原・入り口付近のワープ屋
      if (showWarpShop) {
        const whl = hoverWarpKeeper
          ? isNearWarpKeeper()
            ? "ok"
            : "far"
          : null;
        drawTownNpc(
          ctx,
          FIELD_WARP_SHOP.col,
          FIELD_WARP_SHOP.row,
          warpKeeperImg,
          "ワープ屋",
          whl
        );
      }

      // 秘境の門
      if (isSecret) {
        const p = isoToScreen(SECRET_PORTAL.col, SECRET_PORTAL.row);
        const pulse = (Math.sin(ts / 480) + 1) / 2;
        ctx.save();
        // 台座
        ctx.fillStyle = "rgba(20, 16, 40, 0.45)";
        ctx.beginPath();
        ctx.ellipse(p.x, p.y + 6, tileW * 0.55, tileH * 0.28, 0, 0, Math.PI * 2);
        ctx.fill();
        // 門柱
        ctx.fillStyle = "#4a3a68";
        ctx.fillRect(p.x - tileW * 0.42, p.y - tileH * 1.7, tileW * 0.14, tileH * 1.75);
        ctx.fillRect(p.x + tileW * 0.28, p.y - tileH * 1.7, tileW * 0.14, tileH * 1.75);
        ctx.fillStyle = "#6a58a0";
        ctx.fillRect(p.x - tileW * 0.48, p.y - tileH * 1.85, tileW * 0.96, tileH * 0.22);
        // 門の光
        const glow = ctx.createLinearGradient(
          p.x,
          p.y - tileH * 1.6,
          p.x,
          p.y + 2
        );
        glow.addColorStop(0, `rgba(180, 140, 255, ${0.15 + 0.25 * pulse})`);
        glow.addColorStop(0.55, `rgba(80, 200, 255, ${0.35 + 0.2 * pulse})`);
        glow.addColorStop(1, "rgba(40, 80, 160, 0.05)");
        ctx.fillStyle = glow;
        ctx.fillRect(
          p.x - tileW * 0.28,
          p.y - tileH * 1.65,
          tileW * 0.56,
          tileH * 1.7
        );
        ctx.strokeStyle = `rgba(220, 200, 255, ${0.55 + 0.35 * pulse})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(
          p.x - tileW * 0.28,
          p.y - tileH * 1.65,
          tileW * 0.56,
          tileH * 1.7
        );
        drawFloatingLabel(ctx, p.x, p.y - tileH * 1.95, "秘境への門");
        ctx.restore();
      }
      
      // モンスター描画（徘徊中は補間座標）
      for (const m of monsters) {
        const img = monsterImgs.get(m.id);
        if (!img || !img.complete || img.naturalWidth <= 0) continue;

        const def = MONSTERS[m.id];
        const isCondor = m.id === 2;
        const isBoss = !!def?.boss;
        const span = def?.fieldTileSpan ?? 1;
        // ボスは約2タイル強（以前は大きすぎた）
        const scale = isBoss ? (tileW / 56) * 1.35 : tileW / 56;
        const drawW = (isCondor ? 88 : isBoss ? 96 : 60) * scale;
        const drawH = (isCondor ? 72 : isBoss ? 88 : 48) * scale;
        const topY = m.y - drawH * (isBoss ? 0.8 : 0.72);

        if (isBoss && hoverBoss) {
          ctx.save();
          const gx = m.x;
          const gy = topY + drawH * 0.45;
          const glow = ctx.createRadialGradient(
            gx,
            gy,
            drawW * 0.08,
            gx,
            gy,
            drawW * 0.72
          );
          glow.addColorStop(0, "rgba(200, 230, 255, 0.28)");
          glow.addColorStop(0.45, "rgba(140, 190, 255, 0.12)");
          glow.addColorStop(1, "rgba(120, 180, 255, 0)");
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.ellipse(gx, gy, drawW * 0.55, drawH * 0.42, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        ctx.drawImage(img, m.x - drawW / 2, topY, drawW, drawH);

        // 頭上レベル（Lv n / ???）
        const label = def?.hideLevel ? "Lv ???" : `Lv ${def?.level ?? 1}`;
        const lx = m.x;
        const ly = topY - 4 * scale;
        const fontSize = Math.max(11, Math.round((isBoss ? 14 : 13) * Math.min(scale, 1.4)));
        ctx.save();
        ctx.font = `bold ${fontSize}px "Segoe UI", "Hiragino Sans", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.lineJoin = "round";
        ctx.miterLimit = 2;
        ctx.lineWidth = Math.max(2.5, 3 * Math.min(scale, 1.4));
        ctx.strokeStyle = "rgba(40, 28, 10, 0.9)";
        ctx.strokeText(label, lx, ly);
        ctx.fillStyle = def?.hideLevel ? "#e8d0ff" : "#f0d878";
        ctx.fillText(label, lx, ly);
        ctx.restore();
      }

      if (flashCell && flashCell.until > performance.now()) {
        const p = isoToScreen(flashCell.col, flashCell.row);
        ctx.save();
        ctx.globalAlpha = 0.6 * ((flashCell.until - performance.now()) / 300);
        ctx.fillStyle = "rgba(255,80,80,0.9)";
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - tileH / 2);
        ctx.lineTo(p.x + tileW / 2, p.y);
        ctx.lineTo(p.x, p.y + tileH / 2);
        ctx.lineTo(p.x - tileW / 2, p.y);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        flashCell = null;
      }

      // キャラの影
      drawShadow(state.current.x, state.current.y, radius);

      // キャラ描画
      drawCharacter();

      ctx.restore();

      // フィールド：画面縁のヴィネット＋薄い暖色の空気感
      if (!isTown) {
        const halfW = currentCssW / 2;
        const halfH = currentCssH / 2;
        const vig = ctx.createRadialGradient(0, 0, Math.min(halfW, halfH) * 0.45, 0, 0, Math.max(halfW, halfH) * 1.05);
        vig.addColorStop(0, "rgba(0,0,0,0)");
        vig.addColorStop(0.55, "rgba(0,0,0,0)");
        vig.addColorStop(1, "rgba(6, 10, 8, 0.52)");
        ctx.fillStyle = vig;
        ctx.fillRect(-halfW, -halfH, currentCssW, currentCssH);

        const wash = ctx.createLinearGradient(0, -halfH, 0, halfH * 0.2);
        wash.addColorStop(0, "rgba(255, 220, 150, 0.06)");
        wash.addColorStop(1, "rgba(255, 220, 150, 0)");
        ctx.fillStyle = wash;
        ctx.fillRect(-halfW, -halfH, currentCssW, currentCssH * 0.55);
      }

      if (battleTransition) {

      transitionProgress += 0.02;

      ctx.fillStyle =
        `rgba(0,0,0,${transitionProgress})`;

      ctx.fillRect(
        -currentCssW / 2,
        -currentCssH / 2,
        currentCssW,
        currentCssH
      );

      if (transitionProgress >= 1 && !isTransitioning) {
        isTransitioning = true;
        // 出発時に確保した instanceId を優先（道中の別敵と取り違えない）
        let mid = battleMonsterId;
        let iid = battleInstanceId;
        if (iid) {
          const still = monsters.find((m) => m.instanceId === iid);
          if (still) {
            mid = still.id;
            iid = still.instanceId;
          }
        }
        setTimeout(() => {
          // 念のため直前にもう一度保存
          persistReturnPos();
          const q = new URLSearchParams({
            monsterId: String(mid),
          });
          if (iid) q.set("instanceId", iid);
          routerRef.current.push(`/battle?${q.toString()}`);
        }, 500);
      }
    }

      raf = requestAnimationFrame(loop);
    }

    // ビーム描画（再利用）
    function drawBeam(ctx: CanvasRenderingContext2D, col: number, row: number, ts: number, color = "120,200,255") {
      const c = isoToScreen(col, row);
      const cx = c.x, cy = c.y;
      const beamH = tileW * 1.8;
      const pulse = (Math.sin(ts / 350) + 1) / 2;
      const g = ctx.createLinearGradient(cx, cy - beamH, cx, cy);
      g.addColorStop(0, `rgba(${color},0)`);
      g.addColorStop(0.18, `rgba(${color},${0.06 + 0.18 * pulse})`);
      g.addColorStop(1, `rgba(${color},0)`);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(cx, cy - beamH / 2, tileW * 0.6, beamH / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, tileW);
      grad.addColorStop(0, `rgba(${color},${0.28 + 0.3 * pulse})`);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx, cy, tileW * 0.6, tileH * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // 画像を待たずループ開始（戦闘復帰後の固着防止）
    startLoop();

    // クリーンアップ
    return () => {
      if (isField && !areaExitStarted && !isTransitioning) {
        persistReturnPos();
      }
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", onWindowResize);
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [areaId, isTown, isField, isSecret]);


  return (
    <div className="canvas-wrapper">
      <canvas ref={canvasRef} />
      {bossPrompt ? (
        <BossBattleConfirm
          name={bossPrompt.name}
          onCancel={() => {
            setBossPrompt(null);
            bossConfirmRef.current = null;
          }}
          onConfirm={() => {
            const fn = bossConfirmRef.current;
            setBossPrompt(null);
            bossConfirmRef.current = null;
            fn?.();
          }}
        />
      ) : null}
    </div>
  );
}
