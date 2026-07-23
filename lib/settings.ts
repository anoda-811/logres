import type { AreaId } from "./locations";

const AREA_KEY = "logres.currentArea";
const BGM_KEY = "logres.bgmEnabled";

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
