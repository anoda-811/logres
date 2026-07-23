export type WeaponDef = {
  id: string;
  name: string;
  desc: string;
  atkBonus: number;
  price: number;
};

export const WEAPONS: WeaponDef[] = [
  {
    id: "wood",
    name: "木の剣",
    desc: "冒険のはじめの一本。",
    atkBonus: 0,
    price: 0,
  },
  {
    id: "iron",
    name: "鉄の剣",
    desc: "普通の鉄剣。安定した切れ味。",
    atkBonus: 3,
    price: 50,
  },
  {
    id: "steel",
    name: "鋼の剣",
    desc: "よく研がれた鋼の剣。",
    atkBonus: 6,
    price: 120,
  },
  {
    id: "hammer",
    name: "大槌",
    desc: "鍛冶屋自慢の重いハンマー。",
    atkBonus: 5,
    price: 80,
  },
];

const OWNED_KEY = "logres.weaponsOwned";
const EQUIP_KEY = "logres.weaponEquipped";
const DEFAULT_OWNED = ["wood"];
const DEFAULT_EQUIP = "wood";

type Listener = () => void;
const listeners = new Set<Listener>();

export type WeaponSnapshot = {
  owned: string[];
  equippedId: string;
};

const SERVER_SNAPSHOT: WeaponSnapshot = {
  owned: DEFAULT_OWNED,
  equippedId: DEFAULT_EQUIP,
};

let cachedSnapshot: WeaponSnapshot | null = null;

function emit() {
  cachedSnapshot = null;
  listeners.forEach((l) => l());
}

export function subscribeWeapons(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getWeapon(id: string): WeaponDef {
  return WEAPONS.find((w) => w.id === id) ?? WEAPONS[0];
}

export function loadOwnedWeapons(): string[] {
  if (typeof window === "undefined") return [...DEFAULT_OWNED];
  try {
    const raw = localStorage.getItem(OWNED_KEY);
    if (!raw) return [...DEFAULT_OWNED];
    const parsed = JSON.parse(raw) as string[];
    if (!Array.isArray(parsed) || parsed.length === 0) return [...DEFAULT_OWNED];
    return Array.from(new Set(["wood", ...parsed]));
  } catch {
    return [...DEFAULT_OWNED];
  }
}

export function loadEquippedWeaponId(): string {
  if (typeof window === "undefined") return DEFAULT_EQUIP;
  try {
    const id = localStorage.getItem(EQUIP_KEY) ?? DEFAULT_EQUIP;
    const owned = loadOwnedWeapons();
    return owned.includes(id) ? id : owned[0] ?? DEFAULT_EQUIP;
  } catch {
    return DEFAULT_EQUIP;
  }
}

export function getEquippedWeapon(): WeaponDef {
  return getWeapon(loadEquippedWeaponId());
}

export function equipWeapon(id: string): boolean {
  const owned = loadOwnedWeapons();
  if (!owned.includes(id)) return false;
  localStorage.setItem(EQUIP_KEY, id);
  emit();
  return true;
}

export function ownWeapon(id: string) {
  const owned = loadOwnedWeapons();
  if (owned.includes(id)) return;
  localStorage.setItem(OWNED_KEY, JSON.stringify([...owned, id]));
  emit();
}

/** 購入して装備。所持金は quests の money を使う */
export function buyWeapon(
  id: string,
  money: number,
  spend: (amount: number) => boolean
): { ok: boolean; message: string } {
  const def = getWeapon(id);
  const owned = loadOwnedWeapons();
  if (owned.includes(id)) {
    return { ok: false, message: "すでに持っている武器だ" };
  }
  if (def.price > 0 && money < def.price) {
    return { ok: false, message: "お金が足りない…" };
  }
  if (def.price > 0 && !spend(def.price)) {
    return { ok: false, message: "お金が足りない…" };
  }
  ownWeapon(id);
  equipWeapon(id);
  return { ok: true, message: `${def.name} を手に入れた！` };
}

function readSnapshot(): WeaponSnapshot {
  return {
    owned: loadOwnedWeapons(),
    equippedId: loadEquippedWeaponId(),
  };
}

export function getWeaponSnapshot(): WeaponSnapshot {
  if (!cachedSnapshot) cachedSnapshot = readSnapshot();
  return cachedSnapshot;
}

export function getServerWeaponSnapshot(): WeaponSnapshot {
  return SERVER_SNAPSHOT;
}
