/** モンスター種族（キラーパッシブ用） */
export type MonsterRace = "slime" | "bird" | "beast";

export const MONSTER_RACE_META: Record<
  MonsterRace,
  { label: string; color: string }
> = {
  slime: { label: "スライム", color: "#6fdc8c" },
  bird: { label: "バード", color: "#6eb6ff" },
  beast: { label: "ビースト", color: "#f0b060" },
};

export type SkillKind = "active" | "passive";

/** 戦闘スキルメニューのコスト色（SP 0〜5） */
export const SP_COST_COLORS: Record<number, string> = {
  0: "#d0d8e4",
  1: "#3ec8ff",
  2: "#7dff5c",
  3: "#ffd24a",
  4: "#ff9a3a",
  5: "#ff5a90",
};

export function spCostColor(cost: number): string {
  const c = Math.max(0, Math.min(5, Math.floor(cost)));
  return SP_COST_COLORS[c] ?? SP_COST_COLORS[0];
}

/** 戦闘メニュー用（active） */
export type ActiveBattleMeta = {
  cost: number;
  power: number;
  /** attack = 敵選択時 / self = 自分選択時 */
  target: "attack" | "self";
  effect?: string;
  buff?: "counter" | "revenge" | "powerStance" | "courage" | "charge";
};

export type PassiveEffect =
  | { type: "atk"; value: number }
  | { type: "hit"; value: number }
  | { type: "crit"; value: number }
  | { type: "killer"; race: MonsterRace; pct: number };

export type SkillDef = {
  id: string;
  name: string;
  kind: SkillKind;
  icon: string;
  desc: string;
  /** 右リストの色付き数値（コストや%） */
  badge?: string;
  badgeColor?: string;
  active?: ActiveBattleMeta;
  passive?: PassiveEffect;
};

export const ACTIVE_SLOT_COUNT = 8;
export const PASSIVE_SLOT_COUNT = 3;

export const SKILLS: SkillDef[] = [
  // —— アクティブ（攻撃） ——
  {
    id: "attack",
    name: "通常攻撃",
    kind: "active",
    icon: "剣",
    desc: "選んだ敵に基本攻撃。",
    badge: "0",
    badgeColor: "#d0d8e4",
    active: { cost: 0, power: 8, target: "attack" },
  },
  {
    id: "slash",
    name: "フルスイング",
    kind: "active",
    icon: "斬",
    desc: "SPを1消費する攻撃。",
    badge: "1",
    badgeColor: "#3ec8ff",
    active: {
      cost: 1,
      power: 14,
      target: "attack",
      effect: "小〜中威力",
    },
  },
  {
    id: "heavy",
    name: "キラースマッシュ",
    kind: "active",
    icon: "砕",
    desc: "SPを2消費する強攻撃。",
    badge: "2",
    badgeColor: "#7dff5c",
    active: { cost: 2, power: 22, target: "attack", effect: "中威力" },
  },
  {
    id: "dark",
    name: "ダークスラッシュ",
    kind: "active",
    icon: "闇",
    desc: "闇のオーラをまとい、上から切り下ろす。",
    badge: "2",
    badgeColor: "#7dff5c",
    active: { cost: 2, power: 24, target: "attack", effect: "中威力" },
  },
  {
    id: "power",
    name: "バルムンク",
    kind: "active",
    icon: "剣",
    desc: "SPを3消費する強攻撃。",
    badge: "3",
    badgeColor: "#ffd24a",
    active: { cost: 3, power: 32, target: "attack", effect: "高威力" },
  },
  {
    id: "jaeger",
    name: "ランギィールイェーガー",
    kind: "active",
    icon: "必",
    desc: "SPを5消費する必殺技。高く舞い上がり落下斬りを放つ。",
    badge: "5",
    badgeColor: "#ff5a90",
    active: { cost: 5, power: 55, target: "attack", effect: "必殺" },
  },
  // —— アクティブ（自己） ——
  {
    id: "counter",
    name: "反撃",
    kind: "active",
    icon: "盾",
    desc: "敵の攻撃に3回まで反撃する。",
    badge: "2",
    badgeColor: "#7dff5c",
    active: { cost: 2, power: 0, target: "self", buff: "counter" },
  },
  {
    id: "revenge",
    name: "復讐",
    kind: "active",
    icon: "怒",
    desc: "敵の攻撃に3回まで強い反撃をする。",
    badge: "3",
    badgeColor: "#ffd24a",
    active: { cost: 3, power: 0, target: "self", buff: "revenge" },
  },
  {
    id: "powerStance",
    name: "パワースタンス",
    kind: "active",
    icon: "力",
    desc: "しばらく攻撃力が上がる。",
    badge: "0",
    badgeColor: "#d0d8e4",
    active: { cost: 0, power: 0, target: "self", buff: "powerStance" },
  },
  {
    id: "courage",
    name: "勇気の剣",
    kind: "active",
    icon: "癒",
    desc: "HPを少し回復する。",
    badge: "0",
    badgeColor: "#d0d8e4",
    active: { cost: 0, power: 0, target: "self", buff: "courage" },
  },
  {
    id: "charge",
    name: "パワーチャージ",
    kind: "active",
    icon: "蓄",
    desc: "次の攻撃の威力を上げる。",
    badge: "1",
    badgeColor: "#3ec8ff",
    active: { cost: 1, power: 0, target: "self", buff: "charge" },
  },
  {
    id: "flee",
    name: "逃げる",
    kind: "active",
    icon: "逃",
    desc: "戦闘から離脱してマップへ戻る。",
    badge: "0",
    badgeColor: "#d0d8e4",
    active: { cost: 0, power: 0, target: "self" },
  },
  // —— パッシブ ——
  {
    id: "pas_hit5",
    name: "命中+5",
    kind: "passive",
    icon: "的",
    desc: "命中が少し上がる。",
    badge: "+5",
    badgeColor: "#9ad0ff",
    passive: { type: "hit", value: 5 },
  },
  {
    id: "pas_atk3",
    name: "攻撃+3",
    kind: "passive",
    icon: "攻",
    desc: "攻撃力が上がる。",
    badge: "+3",
    badgeColor: "#ffb04a",
    passive: { type: "atk", value: 3 },
  },
  {
    id: "pas_crit2",
    name: "クリティカル+2%",
    kind: "passive",
    icon: "必",
    desc: "クリティカル率が上がる。",
    badge: "+2%",
    badgeColor: "#ffe066",
    passive: { type: "crit", value: 2 },
  },
  {
    id: "pas_killer_slime",
    name: "スライムキラー+10%",
    kind: "passive",
    icon: "殺",
    desc: "スライム族へのダメージが上がる。",
    badge: "+10%",
    badgeColor: "#6fdc8c",
    passive: { type: "killer", race: "slime", pct: 10 },
  },
  {
    id: "pas_killer_bird",
    name: "バードキラー+10%",
    kind: "passive",
    icon: "殺",
    desc: "バード族へのダメージが上がる。",
    badge: "+10%",
    badgeColor: "#6eb6ff",
    passive: { type: "killer", race: "bird", pct: 10 },
  },
  {
    id: "pas_killer_beast",
    name: "ビーストキラー+8%",
    kind: "passive",
    icon: "殺",
    desc: "ビースト族へのダメージが上がる。",
    badge: "+8%",
    badgeColor: "#f0b060",
    passive: { type: "killer", race: "beast", pct: 8 },
  },
];

export type SkillDeck = {
  active: (string | null)[];
  passive: (string | null)[];
};

const STORAGE_KEY = "logres.skillDeck";

const DEFAULT_ACTIVE = [
  "attack",
  "slash",
  "heavy",
  "dark",
  "power",
  "counter",
  "revenge",
  "powerStance",
];

const DEFAULT_PASSIVE = ["pas_hit5", "pas_atk3", "pas_killer_slime"];

function emptyActive(): (string | null)[] {
  return Array.from({ length: ACTIVE_SLOT_COUNT }, () => null);
}

function emptyPassive(): (string | null)[] {
  return Array.from({ length: PASSIVE_SLOT_COUNT }, () => null);
}

export function defaultSkillDeck(): SkillDeck {
  const active = emptyActive();
  DEFAULT_ACTIVE.forEach((id, i) => {
    if (i < ACTIVE_SLOT_COUNT) active[i] = id;
  });
  const passive = emptyPassive();
  DEFAULT_PASSIVE.forEach((id, i) => {
    if (i < PASSIVE_SLOT_COUNT) passive[i] = id;
  });
  return { active, passive };
}

type Listener = () => void;
const listeners = new Set<Listener>();

export type SkillSnapshot = {
  deck: SkillDeck;
  owned: string[];
};

const SERVER_SNAPSHOT: SkillSnapshot = {
  deck: defaultSkillDeck(),
  owned: SKILLS.map((s) => s.id),
};

let cached: SkillSnapshot | null = null;

function emit() {
  cached = null;
  listeners.forEach((l) => l());
}

export function subscribeSkills(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSkill(id: string): SkillDef | undefined {
  return SKILLS.find((s) => s.id === id);
}

export function getOwnedSkills(): string[] {
  return SKILLS.map((s) => s.id);
}

function normalizeDeck(raw: unknown): SkillDeck {
  const base = defaultSkillDeck();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as { active?: unknown; passive?: unknown };
  const active = emptyActive();
  const passive = emptyPassive();
  if (Array.isArray(o.active)) {
    for (let i = 0; i < ACTIVE_SLOT_COUNT; i++) {
      const id = o.active[i];
      active[i] =
        typeof id === "string" && getSkill(id)?.kind === "active" ? id : null;
    }
  } else {
    return base;
  }
  if (Array.isArray(o.passive)) {
    for (let i = 0; i < PASSIVE_SLOT_COUNT; i++) {
      const id = o.passive[i];
      passive[i] =
        typeof id === "string" && getSkill(id)?.kind === "passive" ? id : null;
    }
  }
  return { active, passive };
}

export function loadSkillDeck(): SkillDeck {
  if (typeof window === "undefined") return defaultSkillDeck();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSkillDeck();
    return normalizeDeck(JSON.parse(raw));
  } catch {
    return defaultSkillDeck();
  }
}

export function saveSkillDeck(deck: SkillDeck) {
  const next = normalizeDeck(deck);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  emit();
}

export function setDeckSlot(
  kind: SkillKind,
  index: number,
  skillId: string | null
): boolean {
  const deck = loadSkillDeck();
  const slots = kind === "active" ? deck.active : deck.passive;
  const max = kind === "active" ? ACTIVE_SLOT_COUNT : PASSIVE_SLOT_COUNT;
  if (index < 0 || index >= max) return false;
  if (skillId != null) {
    const def = getSkill(skillId);
    if (!def || def.kind !== kind) return false;
    // 重複不可：他枠にあれば外す
    for (let i = 0; i < slots.length; i++) {
      if (slots[i] === skillId) slots[i] = null;
    }
  }
  slots[index] = skillId;
  saveSkillDeck(deck);
  return true;
}

export function clearDeckSlot(kind: SkillKind, index: number): boolean {
  return setDeckSlot(kind, index, null);
}

/** 右から左へ：空き枠へセット（なければ先頭を上書きしない／空き優先） */
export function equipSkillToDeck(skillId: string): boolean {
  const def = getSkill(skillId);
  if (!def) return false;
  const deck = loadSkillDeck();
  const slots = def.kind === "active" ? deck.active : deck.passive;
  if (slots.includes(skillId)) return false;
  const empty = slots.findIndex((s) => s == null);
  if (empty < 0) return false;
  return setDeckSlot(def.kind, empty, skillId);
}

export function getSkillSnapshot(): SkillSnapshot {
  if (cached) return cached;
  cached = {
    deck: loadSkillDeck(),
    owned: getOwnedSkills(),
  };
  return cached;
}

export function getServerSkillSnapshot(): SkillSnapshot {
  return SERVER_SNAPSHOT;
}

export type PassiveBonuses = {
  atk: number;
  hit: number;
  crit: number;
  killers: Partial<Record<MonsterRace, number>>;
};

export function getPassiveBonuses(deck?: SkillDeck): PassiveBonuses {
  const d = deck ?? loadSkillDeck();
  const out: PassiveBonuses = { atk: 0, hit: 0, crit: 0, killers: {} };
  for (const id of d.passive) {
    if (!id) continue;
    const def = getSkill(id);
    const p = def?.passive;
    if (!p) continue;
    if (p.type === "atk") out.atk += p.value;
    else if (p.type === "hit") out.hit += p.value;
    else if (p.type === "crit") out.crit += p.value;
    else if (p.type === "killer") {
      out.killers[p.race] = (out.killers[p.race] ?? 0) + p.pct;
    }
  }
  return out;
}

/** 戦闘メニュー用コマンド行 */
export type BattleSkillCommand = {
  id: string;
  label: string;
  cost: number;
  power: number;
  kind: "attack" | "self";
  desc: string;
  effect?: string;
  buff?: ActiveBattleMeta["buff"];
};

export function getEquippedActiveCommands(
  target: "attack" | "self"
): BattleSkillCommand[] {
  const deck = loadSkillDeck();
  const list: BattleSkillCommand[] = [];
  const seen = new Set<string>();
  for (const id of deck.active) {
    if (!id || seen.has(id)) continue;
    const def = getSkill(id);
    if (!def?.active || def.active.target !== target) continue;
    seen.add(id);
    list.push({
      id: def.id,
      label: def.name,
      cost: def.active.cost,
      power: def.active.power,
      kind: def.active.target,
      desc: def.desc,
      effect: def.active.effect,
      buff: def.active.buff,
    });
  }
  // フォールバック: 攻撃側に通常攻撃が無い場合
  if (target === "attack" && !list.some((c) => c.id === "attack")) {
    const atk = getSkill("attack");
    if (atk?.active) {
      list.unshift({
        id: atk.id,
        label: atk.name,
        cost: atk.active.cost,
        power: atk.active.power,
        kind: "attack",
        desc: atk.desc,
      });
    }
  }
  // 逃げるは自己側に常時末尾
  if (target === "self" && !list.some((c) => c.id === "flee")) {
    const flee = getSkill("flee");
    if (flee?.active) {
      list.push({
        id: flee.id,
        label: flee.name,
        cost: 0,
        power: 0,
        kind: "self",
        desc: flee.desc,
      });
    }
  }
  return list;
}

export function skillsOfKind(kind: SkillKind): SkillDef[] {
  return SKILLS.filter((s) => s.kind === kind);
}
