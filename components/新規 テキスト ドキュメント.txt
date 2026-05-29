"use client";
import React, { useRef, useEffect } from "react";

type Node = { col: number; row: number };

export default function GameCanvasIso() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // --- 調整ポイント ---
  // speed を小さくするとゆっくり歩く（px/秒）
  const state = useRef({
    x: 400, y: 200,
    targetX: 400, targetY: 200,
    moving: false, dragging: false,
    speed: 120 // ← ここを変える
  });

  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const W = 900, H = 600;
    canvas.width = W; canvas.height = H;
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    canvas.style.touchAction = "none";

    // プレイ設定
    const playArea = { x: 50, y: 60, w: 800, h: 480 };
    let cols = 10;
    let rows = 8;
    // タイルを枠いっぱいに拡大
    let tileW = Math.floor(playArea.w / cols);
    let tileH = Math.floor(tileW / 2);
    const radius = Math.max(12, Math.floor(tileW * 0.18));

    // 障害物（岩）: {col,row} を追加/削除して配置
    const blocked: { col: number; row: number }[] = [
      { col: 3, row: 2 },
      { col: 4, row: 2 },
      { col: 6, row: 4 },
      { col: 2, row: 5 }
    ];

    // A* 用ユーティリティ
    const inBounds = (c: number, r: number) => c >= 0 && c < cols && r >= 0 && r < rows;
    const isBlocked = (c: number, r: number) => blocked.some(b => b.col === c && b.row === r);

    // アイソメ変換
    const isoToScreen = (col: number, row: number) => {
      const originX = playArea.x + playArea.w / 2;
      const originY = playArea.y + 20;
      const x = originX + (col - row) * (tileW / 2);
      const y = originY + (col + row) * (tileH / 2);
      return { x, y };
    };
    const screenToIso = (sx: number, sy: number) => {
      const originX = playArea.x + playArea.w / 2;
      const originY = playArea.y + 20;
      const dx = sx - originX;
      const dy = sy - originY;
      const col = Math.round((dx / (tileW / 2) + dy / (tileH / 2)) / 2);
      const row = Math.round((dy / (tileH / 2) - dx / (tileW / 2)) / 2);
      if (!inBounds(col, row)) return { col: -1, row: -1 };
      return { col, row };
    };

    // マップスクリーン端を計算してクランプ
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

    // A* 実装（4方向移動）
    const neighbors = (n: Node) => {
      const dirs = [
        { col: 1, row: 0 },
        { col: -1, row: 0 },
        { col: 0, row: 1 },
        { col: 0, row: -1 }
      ];
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
        // open から f 最小を取り出す
        let currentKey: string | null = null;
        let currentF = Infinity;
        for (const [k, v] of open) {
          if (v.f < currentF) { currentF = v.f; currentKey = k; }
        }
        if (!currentKey) break;
        const current = open.get(currentKey)!.node;
        if (current.col === goal.col && current.row === goal.row) {
          // reconstruct path
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

    // 状態: 現在の経路（マス列）
    let path: Node[] = [];

    // hover/active/longActive/flash
    const hover = { col: -1, row: -1 };
    const active = { col: -1, row: -1 };
    const longActive = { col: -1, row: -1 };
    let flashCell: { col: number; row: number; until: number } | null = null;

    // 到着閾値
    const ARRIVAL_THRESHOLD = Math.max(4, tileW * 0.08);

    // 描画ヘルパー
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

    // 経路上のマスを薄く表示する
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

    // 描画ループ
    const drawFrame = (ts: number) => {
      if (lastTsRef.current == null) lastTsRef.current = ts;
      const dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;

      // 移動は「現在の targetX/Y」へ速度ベースで進む（target は常に次マスの中心）
      if (state.current.moving) {
        const dx = state.current.targetX - state.current.x;
        const dy = state.current.targetY - state.current.y;
        const dist = Math.hypot(dx, dy);
        if (dist < ARRIVAL_THRESHOLD) {
          // マス到着
          state.current.x = state.current.targetX;
          state.current.y = state.current.targetY;
          // 次の経路ノードがあればそれを target にする
          if (path.length > 0) {
            const next = path.shift()!;
            const center = isoToScreen(next.col, next.row);
            state.current.targetX = center.x;
            state.current.targetY = center.y + 6;
            state.current.moving = true;
          } else {
            state.current.moving = false;
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

      // clear
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, W, H);

      // draw tiles
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const base = (c + r) % 2 === 0 ? "#6fbf6f" : "#5fb05f";
          drawTile(ctx, c, r, base);
        }
      }

      // path preview
      if (path.length > 0) drawPathPreview(ctx, path);

      // hover thin highlight
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

      // longActive 緑ハイライト
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

      // active 青ハイライト
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

      // 岩
      for (const b of blocked) drawRock(ctx, b.col, b.row);

      // フラッシュ（赤）
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

      // キャラ（影 + 本体）
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath();
      ctx.ellipse(state.current.x, state.current.y + radius * 0.9, radius * 1.2, radius * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = "#FFD54F";
      ctx.beginPath();
      ctx.arc(state.current.x, state.current.y - 6, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#B8860B";
      ctx.lineWidth = 2;
      ctx.stroke();

      rafRef.current = requestAnimationFrame(drawFrame);
    };

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

    rafRef.current = requestAnimationFrame(drawFrame);

    // pointer handlers: クリックで経路計算、長押しで追従
    let longPressTimer: number | null = null;
    let longPressActive = false;
    const LONG_PRESS_MS = 200;

    const toCanvasPos = (clientX: number, clientY: number) => {
      const r = canvas.getBoundingClientRect();
      return { x: clientX - r.left, y: clientY - r.top };
    };

    const onPointerDown = (ev: PointerEvent) => {
      (ev.target as Element).setPointerCapture?.(ev.pointerId);
      const p = toCanvasPos(ev.clientX, ev.clientY);
      const cell = screenToIso(p.x, p.y);
      hover.col = cell.col; hover.row = cell.row;
      if (cell.col >= 0) {
        if (isBlocked(cell.col, cell.row)) {
          // ブロックなら赤フラッシュ
          flashCell = { col: cell.col, row: cell.row, until: performance.now() + 300 };
        } else {
          // 経路計算: 現在のマスから目的マスへ
          const curCell = screenToIso(state.current.x, state.current.y);
          const pathFound = findPath(curCell, { col: cell.col, row: cell.row });
          if (!pathFound) {
            flashCell = { col: cell.col, row: cell.row, until: performance.now() + 300 };
            path = [];
            state.current.moving = false;
          } else {
            // pathFound は目的マスを含むマス列（start を含まない）
            path = pathFound.slice(); // コピー
            // set first target to first node in path
            const next = path.shift()!;
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
          // 長押し追従: 再計算して path を更新
          const curCell = screenToIso(state.current.x, state.current.y);
          const pathFound = findPath(curCell, { col: cell.col, row: cell.row });
          if (!pathFound) {
            flashCell = { col: cell.col, row: cell.row, until: performance.now() + 300 };
            path = [];
            state.current.moving = false;
          } else {
            path = pathFound.slice();
            const next = path.shift()!;
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

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  return (
    <div style={{ width: 900, height: 600 }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
