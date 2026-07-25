import type { AreaId } from "./locations";

const AREA_KEY = "logres.currentArea";
const BGM_KEY = "logres.bgmEnabled";
const FIELD_RETURN_POS_KEY = "logres.fieldReturnPos";

export type FieldReturnPos = {
  areaId: AreaId;
  col: number;
  row: number;
};

/** Strict Mode の二重マウントでも消えないよう、一度読んだ位置を保持 */
let fieldReturnPosMemory: FieldReturnPos | null | undefined = undefined;

export function loadSavedAreaId(): AreaId {
  if (typeof window === "undefined") return "field";
  try {
    const v =
      localStorage.getItem(AREA_KEY) ?? sessionStorage.getItem(AREA_KEY);
    if (v === "field" || v === "town") return v;
  } catch {
    /* ignore */
  }
  return "field";
}

export function saveAreaId(id: AreaId) {
  try {
    localStorage.setItem(AREA_KEY, id);
    sessionStorage.setItem(AREA_KEY, id);
  } catch {
    /* ignore */
  }
}

export function loadBgmEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const v = localStorage.getItem(BGM_KEY);
    if (v === null) return true;
    return v !== "0";
  } catch {
    return true;
  }
}

export function saveBgmEnabled(enabled: boolean) {
  try {
    localStorage.setItem(BGM_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/** 戦闘突入直前のフィールド位置を保存 */
export function saveFieldReturnPos(pos: FieldReturnPos) {
  try {
    sessionStorage.setItem(FIELD_RETURN_POS_KEY, JSON.stringify(pos));
  } catch {
    /* ignore */
  }
  // 次回フィールド入場で必ず session から読み直す
  fieldReturnPosMemory = undefined;
}

/** 戦闘後にフィールドへ戻す位置（Strict Mode 対応でメモリにも残す） */
export function consumeFieldReturnPos(): FieldReturnPos | null {
  if (typeof window === "undefined") return null;
  if (fieldReturnPosMemory !== undefined) {
    return fieldReturnPosMemory;
  }
  try {
    const raw = sessionStorage.getItem(FIELD_RETURN_POS_KEY);
    if (!raw) {
      fieldReturnPosMemory = null;
      return null;
    }
    sessionStorage.removeItem(FIELD_RETURN_POS_KEY);
    const parsed = JSON.parse(raw) as Partial<FieldReturnPos>;
    if (
      (parsed.areaId === "field" || parsed.areaId === "town") &&
      typeof parsed.col === "number" &&
      typeof parsed.row === "number" &&
      Number.isFinite(parsed.col) &&
      Number.isFinite(parsed.row)
    ) {
      fieldReturnPosMemory = {
        areaId: parsed.areaId,
        col: Math.floor(parsed.col),
        row: Math.floor(parsed.row),
      };
      return fieldReturnPosMemory;
    }
  } catch {
    /* ignore */
  }
  fieldReturnPosMemory = null;
  return null;
}

/** タイトルへ戻る・新規開始時に破棄 */
export function clearFieldReturnPos() {
  fieldReturnPosMemory = undefined;
  try {
    sessionStorage.removeItem(FIELD_RETURN_POS_KEY);
  } catch {
    /* ignore */
  }
}
