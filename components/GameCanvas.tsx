"use client";
import React, { useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function GameCanvasIso() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const router = useRouter();

  // 本体
  useEffect(() => {
    console.log("effect start");
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;

    let battleTransition = false;
    let transitionProgress = 0;
    let battleMonsterId: number | null = null;
    let isTransitioning = false;

    // --- レイアウト / DPI 管理 ---
    let currentCssW = 0;
    let currentCssH = 0;
    let currentDpr = window.devicePixelRatio || 1;

    function resize() {
      // 画面枠サイズ
      const cssW = Math.min(window.innerWidth, 1500);
      const cssH = Math.min(window.innerHeight, 800);
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
    window.addEventListener("resize", resize);

    // --- プレイ設定（既存値をそのまま） ---
    const playArea = { x: 170, y: 60, w: 1300, h: 1300 }; // xyは始点マスの位置、whは全体のデカさ
    const cols = 15;
    const rows = 15;
    const tileW = Math.floor(playArea.w / cols);
    const tileH = Math.floor(tileW / 2);
    const radius = Math.max(12, Math.floor(tileW * 0.18));

    // 岩設置
    const blocked: { col: number; row: number }[] = [
      { col: 0, row: 0 }, 
      { col: 2, row: 5 },
      { col: 3, row: 2 }, 
      { col: 4, row: 2 }, 
      { col: 5, row: 2 }, 
      { col: 6, row: 2 }, { col: 6, row: 3 }, { col: 6, row: 4 }
    ];

    // モンスター設置
    const monsters = [
      {
        id: 1,
        name: "スライム",
        col: 7,
        row: 4
      },
      {
        id: 1,
        name: "スライム",
        col: 7,
        row: 10
      },

    ];

    // スライム画像読み込み
    const slimeImg = new Image();
    slimeImg.src = "/slime.png";

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
    const charImg = new Image();
    charImg.src = '/chara.png'; // public直下ならこれでOK
    let started = false;
    charImg.onload = () => { started = true; lastTs = null; raf = requestAnimationFrame(loop); };
    charImg.onerror = (e) => { console.error('キャラ画像読み込み失敗', e); started = true; raf = requestAnimationFrame(loop); };

    // --- 座標変換ユーティリティ（中心原点対応） ---
    function toCanvasPos(clientX: number, clientY: number) {
      const rect = canvas.getBoundingClientRect();
      const cssX = clientX - rect.left;
      const cssY = clientY - rect.top;
      const localX = cssX - currentCssW / 2;
      const localY = cssY - currentCssH / 2;
      return { x: localX, y: localY };
    }

    // --- pointer イベントハンドラ（中心原点対応） ---
    let longPressTimer: number | null = null;
    let longPressActive = false;
    const LONG_PRESS_MS = 400;
    let lastTs: number | null = null;

    const onPointerDown = (ev: PointerEvent) => {
      (ev.target as Element).setPointerCapture?.(ev.pointerId);
      const p = toCanvasPos(ev.clientX, ev.clientY);
      const cell = screenToIso(p.x, p.y);
      hover.col = cell.col; hover.row = cell.row;
      if (cell.col >= 0) {
        if (isBlocked(cell.col, cell.row)) {
          flashCell = { col: cell.col, row: cell.row, until: performance.now() + 300 };
        } else {
          const curCell = screenToIso(state.current.x, state.current.y);
          const pathFound = findPath(curCell, { col: cell.col, row: cell.row });
          if (!pathFound) {
            flashCell = { col: cell.col, row: cell.row, until: performance.now() + 300 };
            path = [];
            state.current.moving = false;
          } else {
            const monsterIndex =
              pathFound.findIndex(node =>
                monsters.some(
                  m =>
                    m.col === node.col &&
                    m.row === node.row
                )
              );
            if (monsterIndex >= 0) {
              const monster =
                monsters.find(
                  m =>
                    m.col === pathFound[monsterIndex].col &&
                    m.row === pathFound[monsterIndex].row
                );
              battleMonsterId = monster?.id ?? null;
              pathFound.splice(monsterIndex);
            }

            path = pathFound.slice();
            const next = path.shift();
            if (!next) {
              state.current.moving = false;
              return;
            }
            const center = isoToScreen(next.col, next.row);
            state.current.targetX = center.x;
            state.current.targetY = center.y + 6;
            state.current.moving = true;
            active.col = cell.col; active.row = cell.row;
            longActive.col = -1; longActive.row = -1;
          }
        }
      }
      state.current.dragging = true;
      longPressTimer = window.setTimeout(() => { longPressActive = true; }, LONG_PRESS_MS);
    };

    const onPointerMove = (ev: PointerEvent) => {
      const p = toCanvasPos(ev.clientX, ev.clientY);
      const cell = screenToIso(p.x, p.y);
      hover.col = cell.col; hover.row = cell.row;
      if (state.current.dragging && longPressActive && cell.col >= 0) {
        if (isBlocked(cell.col, cell.row)) {
          flashCell = { col: cell.col, row: cell.row, until: performance.now() + 300 };
        } else {
          const curCell = screenToIso(state.current.x, state.current.y);
          const pathFound = findPath(curCell, { col: cell.col, row: cell.row });
          if (!pathFound) {
            flashCell = { col: cell.col, row: cell.row, until: performance.now() + 300 };
            path = [];
            state.current.moving = false;
          } else {
            const monsterIndex =
              pathFound.findIndex(node =>
                monsters.some(
                  m =>
                    m.col === node.col &&
                    m.row === node.row
                )
              );
            if (monsterIndex >= 0) {
              const monster =
                monsters.find(
                  m =>
                    m.col === pathFound[monsterIndex].col &&
                    m.row === pathFound[monsterIndex].row
                );
              battleMonsterId = monster?.id ?? null;
              pathFound.splice(monsterIndex);
            }

            path = pathFound.slice();
            const next = path.shift();
            if (!next) {
              state.current.moving = false;
              return;
            }
            const center = isoToScreen(next.col, next.row);
            state.current.targetX = center.x;
            state.current.targetY = center.y + 6;
            state.current.moving = true;
            longActive.col = cell.col; longActive.row = cell.row;
            active.col = -1; active.row = -1;
          }
        }
      }
    };

    const onPointerUp = (ev: PointerEvent) => {
      try { (ev.target as Element).releasePointerCapture?.(ev.pointerId); } catch {}
      state.current.dragging = false;
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
      longPressActive = false;
      longActive.col = -1; longActive.row = -1;
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

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

      // 描画座標（中心原点の state.current をそのまま使う）
      let dx = Math.round(state.current.x - anchorX);
      let dy = Math.round(state.current.y - anchorY);

      // 画面外に出ないように簡易クランプ（currentCssW/currentCssH がある前提）
      // currentCssW/currentCssH は resize() で更新されている想定
      const halfW = (typeof currentCssW === 'number') ? currentCssW / 2 : 600;
      const halfH = (typeof currentCssH === 'number') ? currentCssH / 2 : 400;
      dx = Math.max(Math.round(-halfW), Math.min(Math.round(halfW - drawW), dx));
      dy = Math.max(Math.round(-halfH), Math.min(Math.round(halfH - drawH), dy));

      // ログ（デバッグ時のみ）
      // console.log({ drawW, drawH, anchorY, dx, dy, imgComplete: charImg.complete, naturalW: charImg.naturalWidth });

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
            const next = path.shift()!;
            if (!next) {
              state.current.moving = false;
              return;
            }
            const center = isoToScreen(next.col, next.row);
            state.current.targetX = center.x;
            state.current.targetY = center.y + 6;
            state.current.moving = true;
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

      // clear（注意: ctx は既に translate されているので中心基準）
      ctx.clearRect(-currentCssW / 2, -currentCssH / 2, currentCssW, currentCssH);
      ctx.fillStyle = "#111";
      ctx.fillRect(-currentCssW / 2, -currentCssH / 2, currentCssW, currentCssH);

      // draw tiles
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const base = (c + r) % 2 === 0 ? "#6fbf6f" : "#5fb05f";
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
      for (const b of blocked) drawRock(ctx, b.col, b.row);
      
      // モンスター描画
      for (const m of monsters) {
        const p = isoToScreen(m.col, m.row);

        ctx.drawImage(
          slimeImg,
          p.x - 30,
          p.y - 30,
          60,
          48
        );
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
          router.push(
            `/battle?monsterId=${battleMonsterId}`
          );
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

    // クリーンアップ
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, []);


  return (
    <div className="canvas-wrapper">
      <canvas ref={canvasRef} />
    </div>
  );
}
