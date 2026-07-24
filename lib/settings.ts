import type { AreaId } from "./locations";

const AREA_KEY = "logres.currentArea";
const BGM_KEY = "logres.bgmEnabled";
const FIELD_RETURN_POS_KEY = "logres.fieldReturnPos";

export type FieldReturnPos = {
  areaId: AreaId;
  col: number;
  row: number;
};

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
}

/** 戦闘後にフィールドへ戻す位置（取得したら消す） */
export function consumeFieldReturnPos(): FieldReturnPos | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(FIELD_RETURN_POS_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(FIELD_RETURN_POS_KEY);
    const parsed = JSON.parse(raw) as Partial<FieldReturnPos>;
    if (
      (parsed.areaId === "field" || parsed.areaId === "town") &&
      typeof parsed.col === "number" &&
      typeof parsed.row === "number"
    ) {
      return {
        areaId: parsed.areaId,
        col: parsed.col,
        row: parsed.row,
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}
