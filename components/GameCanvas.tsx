"use client";
import React, { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createRandomFieldMonsters, syncAliveFieldMonsters, MONSTERS, type FieldMonster } from "../lib/monsters";
import { getSpeechBubble, pushChatMessage } from "../lib/chatStore";
import type { AreaId } from "../lib/locations";

type Props = {
  areaId?: AreaId;
  onOpenQuestBoard?: () => void;
  onOpenWeaponShop?: () => void;
  onOpenArmorShop?: () => void;
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
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const router = useRouter();
  const isTown = areaId === "town";
  const questBoardRef = useRef(onOpenQuestBoard);
  questBoardRef.current = onOpenQuestBoard;
  const weaponShopRef = useRef(onOpenWeaponShop);
  weaponShopRef.current = onOpenWeaponShop;
  const armorShopRef = useRef(onOpenArmorShop);
  armorShopRef.current = onOpenArmorShop;

  // 本体
  useEffect(() => {
    console.log("effect start", areaId);
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

    // --- プレイ設定（既存値をそのまま） ---
    const playArea = { x: 170, y: 60, w: 1300, h: 1300 }; // xyは始点マスの位置、whは全体のデカさ
    const cols = 15;
    const rows = 15;
    const tileW = Math.floor(playArea.w / cols);
    const tileH = Math.floor(tileW / 2);
    const radius = Math.max(12, Math.floor(tileW * 0.18));

    // 岩設置
    const rockBlocked: { col: number; row: number }[] = [
      { col: 0, row: 0 }, 
      { col: 2, row: 5 },
      { col: 3, row: 2 }, 
      { col: 4, row: 2 }, 
      { col: 5, row: 2 }, 
      { col: 6, row: 2 }, { col: 6, row: 3 }, { col: 6, row: 4 }
    ];
    const blocked: { col: number; row: number }[] = isTown
      ? [
          ...rockBlocked,
          { col: WEAPON_SMITH.col, row: WEAPON_SMITH.row },
          { col: ARMOR_SMITH.col, row: ARMOR_SMITH.row },
        ]
      : rockBlocked;

    // モンスター設置（位置は isoToScreen 定義後に初期化）
    sessionStorage.removeItem("defeatedMonster");
    sessionStorage.removeItem("defeatedMonsters");
    const spawnAvoid = { col: Math.floor(cols / 2), row: Math.floor(rows / 2) };
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
    const smithImg = new Image();
    smithImg.src = "/blacksmith.png";
    const armorSmithImg = new Image();
    armorSmithImg.src = "/armorsmith.png";

    const inBounds = (c: number, r: number) => c >= 0 && c < cols && r >= 0 && r < rows;
    const isBlocked = (c: number, r: number) => blocked.some(b => b.col === c && b.row === r);

    // --- 中心原点に合わせた iso <-> screen ---
    const isoToScreen = (col: number, row: number) => {
      // 元の playArea 原点（左上基準）をキャンバス中心基準に変換
      const originX = playArea.x + playArea.w / 2;
      const originY = playArea.y + 20;
      const ox = originX - (currentCssW / 2);
      const oy = originY - (currentCssH / 2);
      const x = ox + (col - row) * (tileW / 2);
      const y = oy + (col + row) * (tileH / 2);
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
      const candidates = dirs4
        .map((d) => ({ col: m.col + d.col, row: m.row + d.row }))
        .filter(
          (c) =>
            inBounds(c.col, c.row) &&
            !isBlocked(c.col, c.row) &&
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
      : createRandomFieldMonsters(cols, rows, blocked, spawnAvoid).map(toLive);

    const screenToIso = (sx: number, sy: number) => {
      const originX = playArea.x + playArea.w / 2 - (currentCssW / 2);
      const originY = playArea.y + 20 - (currentCssH / 2);
      const dx = sx - originX;
      const dy = sy - originY;
      const col = Math.round((dx / (tileW / 2) + dy / (tileH / 2)) / 2);
      const row = Math.round((dy / (tileH / 2) - dx / (tileW / 2)) / 2);
      if (!inBounds(col, row)) return { col: -1, row: -1 };
      return { col, row };
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
      return {
        minX: Math.min(...xs) - tileW,
        maxX: Math.max(...xs) + tileW,
        minY: Math.min(...ys) - tileH,
        maxY: Math.max(...ys) + tileH * 2,
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
      return {
        minX: Math.min(...xs) - tileW,
        maxX: Math.max(...xs) + tileW,
        minY: Math.min(...ys) - tileH,
        maxY: Math.max(...ys) + tileH * 2
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
      for (const d of dirs) {
        const nc = n.col + d.col;
        const nr = n.row + d.row;
        if (inBounds(nc, nr) && !isBlocked(nc, nr)) out.push({ col: nc, row: nr });
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

    // 初期位置をマップ中央に（例）
    const startCenter = isoToScreen(Math.floor(cols / 2), Math.floor(rows / 2));
    state.current.x = startCenter.x - 3;
    state.current.y = startCenter.y + 8;
    // 最初はキャラが画面中央付近に来るようカメラ合わせ
    camX = -state.current.x;
    camY = -state.current.y;
    clampCamera();

    // --- 描画ヘルパー（既存のものをそのまま） ---
    const drawTile = (ctx: CanvasRenderingContext2D, col: number, row: number, fill: string) => {
      const p = isoToScreen(col, row);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - tileH / 2);
      ctx.lineTo(p.x + tileW / 2, p.y);
      ctx.lineTo(p.x, p.y + tileH / 2);
      ctx.lineTo(p.x - tileW / 2, p.y);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.12)";
      ctx.lineWidth = 1;
      ctx.stroke();
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

    const drawQuestBoard = (
      ctx: CanvasRenderingContext2D,
      col: number,
      row: number,
      highlight: null | "ok" | "far" = null
    ) => {
      const p = isoToScreen(col, row);
      const cx = p.x;
      const cy = p.y;
      const bw = tileW * 0.72;
      const bh = tileH * 1.55;
      const top = cy - bh * 0.95;
      const left = cx - bw / 2;
      const boardH = bh * 0.72;
      const rr = 6;

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
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.beginPath();
      ctx.ellipse(cx, cy + 6, bw * 0.45, tileH * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      // 支柱
      ctx.fillStyle = "#5a3d22";
      ctx.fillRect(cx - 5, cy - bh * 0.15, 10, bh * 0.55);
      // 看板本体
      ctx.fillStyle = "#8b5a2b";
      ctx.strokeStyle = "#3e2410";
      ctx.lineWidth = 2;
      boardPath();
      ctx.fill();
      ctx.stroke();
      // 紙面
      ctx.fillStyle = "#f0e0b8";
      ctx.fillRect(cx - bw * 0.38, top + bh * 0.1, bw * 0.76, bh * 0.48);
      ctx.fillStyle = "#5a3a18";
      ctx.font = `bold ${Math.max(10, Math.floor(tileW * 0.12))}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("クエスト", cx, top + bh * 0.34);

      // ホバー枠（近い=緑 / 遠い=赤）
      if (highlight) {
        const glow =
          highlight === "ok"
            ? "rgba(90, 220, 120, 0.85)"
            : "rgba(255, 80, 80, 0.85)";
        const soft =
          highlight === "ok"
            ? "rgba(90, 220, 120, 0.22)"
            : "rgba(255, 80, 80, 0.22)";
        boardPath();
        ctx.fillStyle = soft;
        ctx.fill();
        boardPath();
        ctx.strokeStyle = glow;
        ctx.lineWidth = 3;
        ctx.stroke();
        // 外側のうっすら光
        boardPath();
        ctx.strokeStyle =
          highlight === "ok"
            ? "rgba(140, 255, 170, 0.35)"
            : "rgba(255, 160, 160, 0.35)";
        ctx.lineWidth = 7;
        ctx.stroke();
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

      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(p.x - 28, p.y + 8, 56, 16);
      ctx.fillStyle = "#ffe7b0";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, p.x, p.y + 16);
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
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = "#88ccff";
      for (const n of pth) {
        const pos = isoToScreen(n.col, n.row);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y - tileH / 2);
        ctx.lineTo(pos.x + tileW / 2, pos.y);
        ctx.lineTo(pos.x, pos.y + tileH / 2);
        ctx.lineTo(pos.x - tileW / 2, pos.y);
        ctx.closePath();
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
    // onload を src より先に付ける（キャッシュ時に onload を取りこぼして固まるのを防ぐ）
    charImg.onload = startLoop;
    charImg.onerror = (e) => {
      console.error("キャラ画像読み込み失敗", e);
      startLoop();
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
    /** ボード操作に必要な距離（マス。同じマス〜隣まで） */
    const QUEST_BOARD_REACH = 1;

    function hitQuestBoardSign(worldX: number, worldY: number): boolean {
      if (!isTown) return false;
      const p = isoToScreen(QUEST_BOARD.col, QUEST_BOARD.row);
      // drawQuestBoard の木板部分だけ（足元マスは含めない）
      const bw = tileW * 0.72;
      const bh = tileH * 1.55;
      const top = p.y - bh * 0.95;
      const left = p.x - bw / 2;
      const boardH = bh * 0.72;
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
      if (!isTown) return false;
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
      return hitNpcAt(worldX, worldY, WEAPON_SMITH.col, WEAPON_SMITH.row);
    }

    function hitArmorSmith(worldX: number, worldY: number): boolean {
      return hitNpcAt(worldX, worldY, ARMOR_SMITH.col, ARMOR_SMITH.row);
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

    function issueMoveTo(cell: { col: number; row: number }, asLong = false) {
      if (cell.col < 0) return;
      if (isBlocked(cell.col, cell.row)) {
        flashCell = { col: cell.col, row: cell.row, until: performance.now() + 300 };
        return;
      }

      const curCell = screenToIso(state.current.x, state.current.y);
      const pathFound = findPath(curCell, { col: cell.col, row: cell.row });
      if (!pathFound) {
        flashCell = { col: cell.col, row: cell.row, until: performance.now() + 300 };
        path = [];
        state.current.moving = false;
        return;
      }

      battleMonsterId = null;
      battleInstanceId = null;
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

      path = pathFound.slice();
      const next = path.shift();
      if (!next) {
        state.current.moving = false;
        if (battleMonsterId) battleTransition = true;
        return;
      }
      const center = isoToScreen(next.col, next.row);
      state.current.targetX = center.x;
      state.current.targetY = center.y + 6;
      state.current.moving = true;
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
      // 看板／NPC押しのときはマス移動にしない
      pendingTap =
        pendingBoardTap ||
        pendingSmithTap ||
        pendingArmorSmithTap ||
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
      canvas.style.cursor =
        hoverBoard || hoverSmith || hoverArmorSmith ? "pointer" : "";

      if (!pointerDown) return;

      const dx = ev.clientX - downClientX;
      const dy = ev.clientY - downClientY;
      if (!movedEnough && Math.hypot(dx, dy) > PAN_THRESHOLD) {
        movedEnough = true;
        panMode = true;
        longPressActive = false;
        pendingTap = null;
        pendingBoardTap = false;
        pendingSmithTap = false;
        pendingArmorSmithTap = false;
        active.col = -1;
        active.row = -1;
        longActive.col = -1;
        longActive.row = -1;
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      }

      if (panMode) {
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
        cell.col >= 0
      ) {
        issueMoveTo(cell, true);
      }
    };

    const onPointerUp = (ev: PointerEvent) => {
      try {
        (ev.target as Element).releasePointerCapture?.(ev.pointerId);
      } catch {}
      if (!panMode && !longPressActive) {
        if (pendingBoardTap) {
          openQuestBoardNow();
        } else if (pendingSmithTap) {
          openWeaponShopNow();
        } else if (pendingArmorSmithTap) {
          openArmorShopNow();
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
      state.current.dragging = false;
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      longPressActive = false;
      longActive.col = -1;
      longActive.row = -1;
    };

    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    const onPointerLeave = () => {
      hoverBoard = false;
      hoverSmith = false;
      hoverArmorSmith = false;
      canvas.style.cursor = "";
    };
    canvas.addEventListener("pointerleave", onPointerLeave);

    // キャラクター描画
    function drawCharacter() {
      // デバッグ用: 一時的に有効にして位置確認
      // ctx.fillStyle = 'red';
      // ctx.fillRect(Math.round(state.current.x)-2, Math.round(state.current.y)-2, 4, 4);

      const scaleFactor = 0.13; // まずは 0.8 や 1 で確認してから上げる
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
            } else {
              state.current.moving = false;
              if (battleMonsterId) battleTransition = true;
            }
          } else {
            state.current.moving = false;
            if (battleMonsterId) {
              battleTransition = true;
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

      // 敵の徘徊
      updateMonsters(dt);

      // 倒した敵の復活チェック（0.5秒ごと）— 復活分だけランダム再配置
      if (ts - lastRespawnCheck > 500) {
        lastRespawnCheck = ts;
        if (isTown) {
          monsters = [];
        } else {
          const synced = syncAliveFieldMonsters(
            monsters,
            cols,
            rows,
            blocked,
            spawnAvoid
          );
          const prev = new Map(monsters.map((m) => [m.instanceId, m]));
          monsters = synced.map((m) => prev.get(m.instanceId) ?? toLive(m));
        }
      }

      // clear（画面固定の背景）
      ctx.clearRect(-currentCssW / 2, -currentCssH / 2, currentCssW, currentCssH);
      ctx.fillStyle = isTown ? "#2a2430" : "#111";
      ctx.fillRect(-currentCssW / 2, -currentCssH / 2, currentCssW, currentCssH);

      // ワールド（カメラオフセット）
      ctx.save();
      ctx.translate(camX, camY);

      // draw tiles
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const base = isTown
            ? (c + r) % 2 === 0
              ? "#c4b49a"
              : "#b39b7a"
            : (c + r) % 2 === 0
              ? "#6fbf6f"
              : "#5fb05f";
          drawTile(ctx, c, r, base);
        }
      }

      if (path.length > 0) drawPathPreview(ctx, path);

      // hover highlight
      if (hover.col >= 0 && hover.row >= 0 &&
          !(active.col === hover.col && active.row === hover.row) &&
          !(longActive.col === hover.col && longActive.row === hover.row)) {
        const p = isoToScreen(hover.col, hover.row);
        ctx.save();
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - tileH / 2);
        ctx.lineTo(p.x + tileW / 2, p.y);
        ctx.lineTo(p.x, p.y + tileH / 2);
        ctx.lineTo(p.x - tileW / 2, p.y);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // active / longActive beams
      if (longActive.col >= 0 && longActive.row >= 0) {
        drawBeam(ctx, longActive.col, longActive.row, ts, "120,255,140");
        const p = isoToScreen(longActive.col, longActive.row);
        ctx.save();
        ctx.strokeStyle = `rgba(120,255,140,0.95)`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - tileH / 2);
        ctx.lineTo(p.x + tileW / 2, p.y);
        ctx.lineTo(p.x, p.y + tileH / 2);
        ctx.lineTo(p.x - tileW / 2, p.y);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }

      if (active.col >= 0 && active.row >= 0) {
        drawBeam(ctx, active.col, active.row, ts, "120,200,255");
        const p = isoToScreen(active.col, active.row);
        ctx.save();
        ctx.strokeStyle = `rgba(120,200,255,0.95)`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - tileH / 2);
        ctx.lineTo(p.x + tileW / 2, p.y);
        ctx.lineTo(p.x, p.y + tileH / 2);
        ctx.lineTo(p.x - tileW / 2, p.y);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }

      // 岩描画
      for (const b of rockBlocked) drawRock(ctx, b.col, b.row);

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
      
      // モンスター描画（徘徊中は補間座標）
      for (const m of monsters) {
        const img = monsterImgs.get(m.id);
        if (!img || !img.complete || img.naturalWidth <= 0) continue;

        const isCondor = m.id === 2;
        const drawW = isCondor ? 88 : 60;
        const drawH = isCondor ? 72 : 48;
        ctx.drawImage(img, m.x - drawW / 2, m.y - drawH * 0.72, drawW, drawH);
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

      console.log(transitionProgress);
      if (transitionProgress >= 1 && !isTransitioning) {
        isTransitioning = true;
        setTimeout(() => {
          const q = new URLSearchParams({
            monsterId: String(battleMonsterId),
          });
          if (battleInstanceId) q.set("instanceId", battleInstanceId);
          router.push(`/battle?${q.toString()}`);
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

    // loop / lastTs 定義後に開始（キャッシュ済み画像でも確実に動く）
    if (charImg.complete) startLoop();

    // クリーンアップ
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", onWindowResize);
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [areaId, isTown, router]);


  return (
    <div className="canvas-wrapper">
      <canvas ref={canvasRef} />
    </div>
  );
}
