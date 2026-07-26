/** 装備スロット（画面上の枠） */
export type EquipSlot =
  | "weapon"
  | "head"
  | "body"
  | "arms"
  | "waist"
  | "feet"
  | "acc1"
  | "acc2"
  | "acc3";

/** アイテム側の部位種別 */
export type GearKind =
  | "weapon"
  | "head"
  | "body"
  | "arms"
  | "waist"
  | "feet"
  | "accessory";

export const EQUIP_SLOTS: {
  id: EquipSlot;
  label: string;
  group: "main" | "acc";
  kind: GearKind;
}[] = [
  { id: "weapon", label: "武器", group: "main", kind: "weapon" },
  { id: "head", label: "頭", group: "main", kind: "head" },
  { id: "body", label: "上半身", group: "main", kind: "body" },
  { id: "arms", label: "手", group: "main", kind: "arms" },
  { id: "waist", label: "下半身", group: "main", kind: "waist" },
  { id: "feet", label: "足", group: "main", kind: "feet" },
  { id: "acc1", label: "装飾品", group: "acc", kind: "accessory" },
  { id: "acc2", label: "装飾品", group: "acc", kind: "accessory" },
  { id: "acc3", label: "装飾品", group: "acc", kind: "accessory" },
];

/** レア度: R=青 / SR=紫 / UR=金 / LR=赤 */
export type GearRarity = "R" | "SR" | "UR" | "LR";

export const GEAR_RARITY_META: Record<
  GearRarity,
  { label: string; color: string }
> = {
  R: { label: "R", color: "#5b9fff" },
  SR: { label: "SR", color: "#c084fc" },
  UR: { label: "UR", color: "#f0d878" },
  LR: { label: "LR", color: "#ff6b6b" },
};

export function formatGearName(
  gear: Pick<GearDef, "name" | "rarity">
): string {
  return `${gear.rarity} ${gear.name}`;
}

/** 武器の系統 */
export type WeaponGenre = "sword" | "hammer" | "dagger" | "spear";

export const WEAPON_GENRES: { id: WeaponGenre | "all"; label: string }[] = [
  { id: "all", label: "すべて" },
  { id: "sword", label: "剣" },
  { id: "hammer", label: "槌" },
  { id: "dagger", label: "短剣" },
  { id: "spear", label: "槍" },
];

/** 防具屋の部位タブ */
export const ARMOR_SHOP_TABS: { id: GearKind | "all"; label: string }[] = [
  { id: "all", label: "すべて" },
  { id: "head", label: "頭" },
  { id: "body", label: "上半身" },
  { id: "arms", label: "手" },
  { id: "waist", label: "下半身" },
  { id: "feet", label: "足" },
  { id: "accessory", label: "装飾" },
];

export type GearDef = {
  id: string;
  name: string;
  desc: string;
  slot: GearKind;
  rarity: GearRarity;
  atkBonus: number;
  defBonus: number;
  /** クリティカル率への加算（％ポイント） */
  critBonus: number;
  price: number;
  /** 武器ジャンル（武器屋タブ用） */
  weaponGenre?: WeaponGenre;
};

/** 裸のときの基本クリティカル率（％） */
export const BASE_CRIT_RATE = 3;

/** 武器（既存IDを維持） */
export const WEAPONS: GearDef[] = [
  {
    id: "wood",
    name: "木の剣",
    desc: "冒険のはじめの一本。",
    slot: "weapon",
    weaponGenre: "sword",
    rarity: "R",
    atkBonus: 0,
    defBonus: 0,
    critBonus: 0,
    price: 0,
  },
  {
    id: "iron",
    name: "鉄の剣",
    desc: "普通の鉄剣。安定した切れ味。",
    slot: "weapon",
    weaponGenre: "sword",
    rarity: "R",
    atkBonus: 3,
    defBonus: 0,
    critBonus: 1,
    price: 50,
  },
  {
    id: "steel",
    name: "鋼の剣",
    desc: "よく研がれた鋼の剣。",
    slot: "weapon",
    weaponGenre: "sword",
    rarity: "UR",
    atkBonus: 6,
    defBonus: 0,
    critBonus: 2,
    price: 120,
  },
  {
    id: "hakugeki",
    name: "白撃の剣",
    desc: "白き蹄の気配を宿すUR剣。秘境のボスが落とすという。",
    slot: "weapon",
    weaponGenre: "sword",
    rarity: "UR",
    atkBonus: 14,
    defBonus: 0,
    critBonus: 4,
    price: 0,
  },
  {
    id: "hammer",
    name: "大槌",
    desc: "鍛冶屋自慢の重いハンマー。",
    slot: "weapon",
    weaponGenre: "hammer",
    rarity: "SR",
    atkBonus: 5,
    defBonus: 0,
    critBonus: 3,
    price: 80,
  },
  {
    id: "dagger_iron",
    name: "鉄の短剣",
    desc: "素早い一撃向けの短剣。",
    slot: "weapon",
    weaponGenre: "dagger",
    rarity: "R",
    atkBonus: 2,
    defBonus: 0,
    critBonus: 4,
    price: 45,
  },
  {
    id: "spear_wood",
    name: "木の槍",
    desc: "リーチのある木製の槍。",
    slot: "weapon",
    weaponGenre: "spear",
    rarity: "SR",
    atkBonus: 4,
    defBonus: 0,
    critBonus: 1,
    price: 65,
  },
  {
    id: "blade_legend",
    name: "伝説の剣",
    desc: "語り継がれる一振り。",
    slot: "weapon",
    weaponGenre: "sword",
    rarity: "LR",
    atkBonus: 12,
    defBonus: 0,
    critBonus: 5,
    price: 500,
  },
];

/** 防具・装飾 */
export const ARMORS: GearDef[] = [
  {
    id: "cap_cloth",
    name: "布の帽子",
    desc: "やわらかい布の帽子。",
    slot: "head",
    rarity: "R",
    atkBonus: 0,
    defBonus: 1,
    critBonus: 0,
    price: 0,
  },
  {
    id: "helm_leather",
    name: "皮の帽子",
    desc: "少し硬い皮製の帽子。",
    slot: "head",
    rarity: "SR",
    atkBonus: 0,
    defBonus: 3,
    critBonus: 0,
    price: 40,
  },
  {
    id: "shirt_cloth",
    name: "旅人の服",
    desc: "動きやすい普段着。",
    slot: "body",
    rarity: "R",
    atkBonus: 0,
    defBonus: 1,
    critBonus: 0,
    price: 0,
  },
  {
    id: "armor_leather",
    name: "皮の胴当て",
    desc: "軽い皮の防具。",
    slot: "body",
    rarity: "SR",
    atkBonus: 0,
    defBonus: 4,
    critBonus: 0,
    price: 60,
  },
  {
    id: "gloves_cloth",
    name: "布の腕巻き",
    desc: "手首を守る布。",
    slot: "arms",
    rarity: "R",
    atkBonus: 0,
    defBonus: 1,
    critBonus: 0,
    price: 0,
  },
  {
    id: "gloves_leather",
    name: "皮の手袋",
    desc: "握りやすい皮手袋。",
    slot: "arms",
    rarity: "R",
    atkBonus: 0,
    defBonus: 2,
    critBonus: 1,
    price: 35,
  },
  {
    id: "belt_rope",
    name: "旅人のツボン",
    desc: "動きやすい下半身装備。",
    slot: "waist",
    rarity: "R",
    atkBonus: 0,
    defBonus: 1,
    critBonus: 0,
    price: 0,
  },
  {
    id: "belt_leather",
    name: "皮のツボン",
    desc: "少し硬い皮のツボン。",
    slot: "waist",
    rarity: "R",
    atkBonus: 0,
    defBonus: 2,
    critBonus: 0,
    price: 30,
  },
  {
    id: "boots_cloth",
    name: "布の靴",
    desc: "歩きやすい靴。",
    slot: "feet",
    rarity: "R",
    atkBonus: 0,
    defBonus: 1,
    critBonus: 0,
    price: 0,
  },
  {
    id: "boots_leather",
    name: "皮のブーツ",
    desc: "硬い皮のブーツ。",
    slot: "feet",
    rarity: "SR",
    atkBonus: 0,
    defBonus: 3,
    critBonus: 0,
    price: 45,
  },
  {
    id: "ring_copper",
    name: "銅の指輪",
    desc: "ごく普通の指輪。",
    slot: "accessory",
    rarity: "R",
    atkBonus: 0,
    defBonus: 1,
    critBonus: 0,
    price: 25,
  },
  {
    id: "ring_power",
    name: "力の指輪",
    desc: "わずかに攻撃力が上がる。",
    slot: "accessory",
    rarity: "UR",
    atkBonus: 2,
    defBonus: 0,
    critBonus: 2,
    price: 70,
  },
  {
    id: "amulet_wood",
    name: "木のアミュレット",
    desc: "護符の一種。",
    slot: "accessory",
    rarity: "R",
    atkBonus: 0,
    defBonus: 1,
    critBonus: 1,
    price: 20,
  },
  {
    id: "charm_lucky",
    name: "しあわせのお守り",
    desc: "クリティカルが出やすくなるお守り。",
    slot: "accessory",
    rarity: "SR",
    atkBonus: 0,
    defBonus: 0,
    critBonus: 5,
    price: 15,
  },
  {
    id: "crown_hero",
    name: "英雄の冠",
    desc: "古の英雄が身につけたといわれる冠。",
    slot: "head",
    rarity: "LR",
    atkBonus: 2,
    defBonus: 8,
    critBonus: 3,
    price: 480,
  },
];

export const ALL_GEAR: GearDef[] = [...WEAPONS, ...ARMORS];

export type EquippedMap = Record<EquipSlot, string | null>;

const OWNED_KEY = "logres.gearOwned";
const EQUIP_KEY = "logres.gearEquipped";
const OLD_OWNED_KEY = "logres.weaponsOwned";
const OLD_EQUIP_KEY = "logres.weaponEquipped";

const DEFAULT_OWNED = [
  "wood",
  "cap_cloth",
  "shirt_cloth",
  "gloves_cloth",
  "belt_rope",
  "boots_cloth",
  "ring_copper",
];

const DEFAULT_EQUIPPED: EquippedMap = {
  weapon: "wood",
  head: "cap_cloth",
  body: "shirt_cloth",
  arms: "gloves_cloth",
  waist: "belt_rope",
  feet: "boots_cloth",
  acc1: "ring_copper",
  acc2: null,
  acc3: null,
};

type Listener = () => void;
const listeners = new Set<Listener>();

export type GearSnapshot = {
  owned: string[];
  equipped: EquippedMap;
};

export type WeaponSnapshot = {
  owned: string[];
  equippedId: string;
};

const SERVER_SNAPSHOT: GearSnapshot = {
  owned: [...DEFAULT_OWNED],
  equipped: { ...DEFAULT_EQUIPPED },
};

const SERVER_WEAPON_SNAPSHOT: WeaponSnapshot = {
  owned: ["wood"],
  equippedId: "wood",
};

let cachedSnapshot: GearSnapshot | null = null;
let cachedWeaponSnapshot: WeaponSnapshot | null = null;

function emit() {
  cachedSnapshot = null;
  cachedWeaponSnapshot = null;
  listeners.forEach((l) => l());
}

export function subscribeGear(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const subscribeWeapons = subscribeGear;

export function getGear(id: string): GearDef | undefined {
  return ALL_GEAR.find((g) => g.id === id);
}

export function getWeapon(id: string): GearDef {
  return WEAPONS.find((w) => w.id === id) ?? WEAPONS[0];
}

export function gearMatchesSlot(gear: GearDef, slot: EquipSlot): boolean {
  const meta = EQUIP_SLOTS.find((s) => s.id === slot);
  return !!meta && gear.slot === meta.kind;
}

function migrateFromOldWeapons(): { owned: string[]; equippedWeapon: string } | null {
  try {
    const rawOwned = localStorage.getItem(OLD_OWNED_KEY);
    const oldEquip = localStorage.getItem(OLD_EQUIP_KEY);
    if (!rawOwned && !oldEquip) return null;
    const parsed = rawOwned ? (JSON.parse(rawOwned) as string[]) : ["wood"];
    const ownedWeapons = Array.isArray(parsed) ? parsed : ["wood"];
    return {
      owned: Array.from(new Set(["wood", ...ownedWeapons])),
      equippedWeapon: oldEquip || "wood",
    };
  } catch {
    return null;
  }
}

export function loadOwnedGear(): string[] {
  if (typeof window === "undefined") return [...DEFAULT_OWNED];
  try {
    const raw = localStorage.getItem(OWNED_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as string[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return Array.from(new Set([...DEFAULT_OWNED, ...parsed]));
      }
    }
    const migrated = migrateFromOldWeapons();
    if (migrated) {
      const next = Array.from(new Set([...DEFAULT_OWNED, ...migrated.owned]));
      localStorage.setItem(OWNED_KEY, JSON.stringify(next));
      return next;
    }
    return [...DEFAULT_OWNED];
  } catch {
    return [...DEFAULT_OWNED];
  }
}

export function loadEquippedMap(): EquippedMap {
  if (typeof window === "undefined") return { ...DEFAULT_EQUIPPED };
  try {
    const raw = localStorage.getItem(EQUIP_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<EquippedMap>;
      const next: EquippedMap = { ...DEFAULT_EQUIPPED, ...parsed };
      const owned = loadOwnedGear();
      for (const slot of Object.keys(next) as EquipSlot[]) {
        const id = next[slot];
        if (id && !owned.includes(id)) next[slot] = DEFAULT_EQUIPPED[slot];
      }
      return next;
    }
    const migrated = migrateFromOldWeapons();
    const next = { ...DEFAULT_EQUIPPED };
    if (migrated) next.weapon = migrated.equippedWeapon;
    localStorage.setItem(EQUIP_KEY, JSON.stringify(next));
    return next;
  } catch {
    return { ...DEFAULT_EQUIPPED };
  }
}

export function loadOwnedWeapons(): string[] {
  return loadOwnedGear().filter((id) => getGear(id)?.slot === "weapon");
}

export function loadEquippedWeaponId(): string {
  return loadEquippedMap().weapon ?? "wood";
}

export function getEquippedWeapon(): GearDef {
  return getWeapon(loadEquippedWeaponId());
}

export function getTotalAtkBonus(): number {
  const eq = loadEquippedMap();
  let n = 0;
  for (const id of Object.values(eq)) {
    if (!id) continue;
    n += getGear(id)?.atkBonus ?? 0;
  }
  return n;
}

export function getTotalDefBonus(): number {
  const eq = loadEquippedMap();
  let n = 0;
  for (const id of Object.values(eq)) {
    if (!id) continue;
    n += getGear(id)?.defBonus ?? 0;
  }
  return n;
}

/** 装備込みのクリティカル率（％） */
export function getTotalCritRate(): number {
  const eq = loadEquippedMap();
  let n = BASE_CRIT_RATE;
  for (const id of Object.values(eq)) {
    if (!id) continue;
    n += getGear(id)?.critBonus ?? 0;
  }
  return n;
}

/** 現在のクリ率で判定 */
export function rollCritical(rate = getTotalCritRate()): boolean {
  return Math.random() * 100 < rate;
}

/** 戦闘力っぽい表示用 */
export function getCombatPower(): number {
  const base = 100;
  return (
    base +
    getTotalAtkBonus() * 12 +
    getTotalDefBonus() * 10 +
    getTotalCritRate() * 4
  );
}

export function equipGear(id: string, targetSlot?: EquipSlot): boolean {
  const def = getGear(id);
  if (!def) return false;
  const owned = loadOwnedGear();
  if (!owned.includes(id)) return false;

  let slot: EquipSlot | undefined = targetSlot;
  if (!slot) {
    slot = EQUIP_SLOTS.find((s) => s.kind === def.slot)?.id;
  }
  if (!slot || !gearMatchesSlot(def, slot)) return false;

  const map = loadEquippedMap();
  // 同じ装飾を別枠へ移す場合、元枠を空に
  for (const key of Object.keys(map) as EquipSlot[]) {
    if (map[key] === id) map[key] = null;
  }
  map[slot] = id;
  localStorage.setItem(EQUIP_KEY, JSON.stringify(map));
  emit();
  return true;
}

export function unequipSlot(slot: EquipSlot): boolean {
  if (slot === "weapon") return false;
  const map = loadEquippedMap();
  map[slot] = null;
  localStorage.setItem(EQUIP_KEY, JSON.stringify(map));
  emit();
  return true;
}

export function equipWeapon(id: string): boolean {
  return equipGear(id, "weapon");
}

export function ownGear(id: string) {
  const owned = loadOwnedGear();
  if (owned.includes(id)) return;
  localStorage.setItem(OWNED_KEY, JSON.stringify([...owned, id]));
  emit();
}

export function ownWeapon(id: string) {
  ownGear(id);
}

export function buyWeapon(
  id: string,
  money: number,
  spend: (amount: number) => boolean
): { ok: boolean; message: string } {
  return buyGear(id, money, spend, "weapon");
}

export function buyArmor(
  id: string,
  money: number,
  spend: (amount: number) => boolean
): { ok: boolean; message: string } {
  return buyGear(id, money, spend);
}

export function buyGear(
  id: string,
  money: number,
  spend: (amount: number) => boolean,
  forceSlot?: EquipSlot
): { ok: boolean; message: string } {
  const def = getGear(id);
  if (!def) return { ok: false, message: "その品物は扱っていない" };
  const owned = loadOwnedGear();
  if (owned.includes(id)) {
    return { ok: false, message: "すでに持っている装備だ" };
  }
  if (def.price > 0 && money < def.price) {
    return { ok: false, message: "お金が足りない…" };
  }
  if (def.price > 0 && !spend(def.price)) {
    return { ok: false, message: "お金が足りない…" };
  }
  ownGear(id);
  equipGear(id, forceSlot);
  return { ok: true, message: `${def.name} を手に入れた！` };
}

function readSnapshot(): GearSnapshot {
  return {
    owned: loadOwnedGear(),
    equipped: loadEquippedMap(),
  };
}

function readWeaponSnapshot(): WeaponSnapshot {
  const s = getGearSnapshot();
  return {
    owned: s.owned.filter((id) => getGear(id)?.slot === "weapon"),
    equippedId: s.equipped.weapon ?? "wood",
  };
}

export function getGearSnapshot(): GearSnapshot {
  if (!cachedSnapshot) cachedSnapshot = readSnapshot();
  return cachedSnapshot;
}

export function getServerGearSnapshot(): GearSnapshot {
  return SERVER_SNAPSHOT;
}

export function getWeaponSnapshot(): WeaponSnapshot {
  if (!cachedWeaponSnapshot) cachedWeaponSnapshot = readWeaponSnapshot();
  return cachedWeaponSnapshot;
}

export function getServerWeaponSnapshot(): WeaponSnapshot {
  return SERVER_WEAPON_SNAPSHOT;
}
