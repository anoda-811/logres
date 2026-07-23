export type PlayerCharacter = {
  id: string;
  name: string;
  worldId: string;
  createdAt: number;
};

const STORAGE_KEY = "logres.characters";
const ACTIVE_KEY = "logres.activeCharacterId";

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function loadCharacters(): PlayerCharacter[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PlayerCharacter[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCharacters(list: PlayerCharacter[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function getActiveCharacterId(): string | null {
  return localStorage.getItem(ACTIVE_KEY);
}

export function setActiveCharacterId(id: string | null) {
  if (id) localStorage.setItem(ACTIVE_KEY, id);
  else localStorage.removeItem(ACTIVE_KEY);
}

export function getCharactersForWorld(worldId: string): PlayerCharacter[] {
  return loadCharacters().filter((c) => c.worldId === worldId);
}

export function ensureDefaultCharacter(worldId: string): PlayerCharacter[] {
  const all = loadCharacters();
  const forWorld = all.filter((c) => c.worldId === worldId);
  if (forWorld.length > 0) return forWorld;
  const created: PlayerCharacter = {
    id: uid(),
    name: "ゆうしゃ",
    worldId,
    createdAt: Date.now(),
  };
  const next = [...all, created];
  saveCharacters(next);
  setActiveCharacterId(created.id);
  return [created];
}

export function addCharacter(worldId: string, name = "しんじん"): PlayerCharacter {
  const all = loadCharacters();
  const created: PlayerCharacter = {
    id: uid(),
    name: name.trim() || "しんじん",
    worldId,
    createdAt: Date.now(),
  };
  saveCharacters([...all, created]);
  setActiveCharacterId(created.id);
  return created;
}

export function renameCharacter(id: string, name: string): PlayerCharacter | null {
  const all = loadCharacters();
  const idx = all.findIndex((c) => c.id === id);
  if (idx < 0) return null;
  const nextName = name.trim().slice(0, 12) || all[idx].name;
  all[idx] = { ...all[idx], name: nextName };
  saveCharacters(all);
  return all[idx];
}

export function deleteCharacter(id: string) {
  const all = loadCharacters().filter((c) => c.id !== id);
  saveCharacters(all);
  if (getActiveCharacterId() === id) {
    setActiveCharacterId(all[0]?.id ?? null);
  }
}

export function getActiveCharacter(): PlayerCharacter | null {
  const id = getActiveCharacterId();
  if (!id) return null;
  return loadCharacters().find((c) => c.id === id) ?? null;
}
