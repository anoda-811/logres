export type QuestDef = {
  id: string;
  title: string;
  description: string;
  /** 討伐対象モンスター ID */
  targetMonsterId: number;
  targetCount: number;
  rewardMoney: number;
};

export type QuestStatus = "active" | "completed";

export type QuestProgress = {
  questId: string;
  status: QuestStatus;
  progress: number;
};

export const QUEST_DEFS: QuestDef[] = [
  {
    id: "red_slime_hunt",
    title: "レッドスライム討伐",
    description: "草原フィールドでレッドスライムを3体たおせ。",
    targetMonsterId: 1,
    targetCount: 3,
    rewardMoney: 100,
  },
];

const QUEST_KEY = "logres.quests";
const MONEY_KEY = "logres.money";
const DEFAULT_MONEY = 164;

type Listener = () => void;
const listeners = new Set<Listener>();

export type QuestSnapshot = {
  money: number;
  quests: QuestProgress[];
};

const SERVER_SNAPSHOT: QuestSnapshot = {
  money: DEFAULT_MONEY,
  quests: [],
};

let cachedSnapshot: QuestSnapshot | null = null;

function readSnapshot(): QuestSnapshot {
  return {
    money: loadMoney(),
    quests: loadQuestProgress(),
  };
}

function invalidateSnapshot() {
  cachedSnapshot = null;
}

function emit() {
  invalidateSnapshot();
  listeners.forEach((l) => l());
}

export function subscribeQuests(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getQuestDef(id: string): QuestDef | undefined {
  return QUEST_DEFS.find((q) => q.id === id);
}

export function loadQuestProgress(): QuestProgress[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(QUEST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QuestProgress[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveQuestProgress(list: QuestProgress[]) {
  localStorage.setItem(QUEST_KEY, JSON.stringify(list));
  emit();
}

export function loadMoney(): number {
  if (typeof window === "undefined") return DEFAULT_MONEY;
  try {
    const raw = localStorage.getItem(MONEY_KEY);
    if (raw == null) return DEFAULT_MONEY;
    const n = Number(raw);
    return Number.isFinite(n) ? n : DEFAULT_MONEY;
  } catch {
    return DEFAULT_MONEY;
  }
}

export function saveMoney(amount: number) {
  localStorage.setItem(MONEY_KEY, String(Math.max(0, Math.floor(amount))));
  emit();
}

export function addMoney(delta: number) {
  saveMoney(loadMoney() + delta);
}

export function getActiveQuests(): QuestProgress[] {
  return loadQuestProgress().filter((q) => q.status === "active");
}

export function getOwnedQuests(): QuestProgress[] {
  return loadQuestProgress();
}

export function isQuestAccepted(questId: string): boolean {
  return loadQuestProgress().some((q) => q.questId === questId);
}

export function acceptQuest(questId: string): boolean {
  const def = getQuestDef(questId);
  if (!def) return false;
  const list = loadQuestProgress();
  if (list.some((q) => q.questId === questId)) return false;
  list.push({ questId, status: "active", progress: 0 });
  saveQuestProgress(list);
  return true;
}

/** バトル勝利時に呼ぶ。該当クエストの進捗を進め、達成なら報酬を付与 */
export function recordMonsterKill(monsterId: number): string[] {
  const list = loadQuestProgress();
  const completedTitles: string[] = [];
  let moneyGain = 0;
  let changed = false;

  for (const entry of list) {
    if (entry.status !== "active") continue;
    const def = getQuestDef(entry.questId);
    if (!def || def.targetMonsterId !== monsterId) continue;
    entry.progress = Math.min(def.targetCount, entry.progress + 1);
    changed = true;
    if (entry.progress >= def.targetCount) {
      entry.status = "completed";
      moneyGain += def.rewardMoney;
      completedTitles.push(def.title);
    }
  }

  if (changed) {
    saveQuestProgress(list);
    if (moneyGain > 0) addMoney(moneyGain);
  }
  return completedTitles;
}

/** useSyncExternalStore 用。同一内容なら同一参照を返す */
export function getQuestSnapshot(): QuestSnapshot {
  if (!cachedSnapshot) cachedSnapshot = readSnapshot();
  return cachedSnapshot;
}

export function getServerQuestSnapshot(): QuestSnapshot {
  return SERVER_SNAPSHOT;
}
