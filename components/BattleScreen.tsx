"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { getMonster, markMonsterDefeated, resolveBattleMonster } from "../lib/monsters";
import { getActiveCharacter } from "../lib/characters";
import { addExp, addMoney, recordMonsterKill } from "../lib/quests";
import { getTotalAtkBonus, rollCritical } from "../lib/equipment";
import {
  getServerSpeechBubble,
  getSpeechBubble,
  pushBattleLog,
  subscribeChat,
} from "../lib/chatStore";
import { loadBgmEnabled } from "../lib/settings";
import FieldBgm from "./FieldBgm";

type Command = {
  id: string;
  label: string;
  cost: number;
  power: number;
  /** attack = 敵選択時 / self = 自分選択時 */
  kind: "attack" | "self";
  desc: string;
  effect?: string;
  buff?: "counter" | "revenge" | "powerStance" | "courage" | "charge";
};

const MAX_SP = 5;

/** SP 0〜5 のオーブ／ゲージ色 */
const SP_COLORS: Record<
  number,
  { c1: string; c2: string; glow: string }
> = {
  0: { c1: "#f2f5fa", c2: "#8a96a8", glow: "rgba(200,210,230,0.65)" },
  1: { c1: "#c8f4ff", c2: "#2eb0e8", glow: "rgba(60,190,255,0.75)" },
  2: { c1: "#d4ff9e", c2: "#2aaa48", glow: "rgba(80,220,90,0.7)" },
  3: { c1: "#fff4a8", c2: "#e0a010", glow: "rgba(255,200,40,0.8)" },
  4: { c1: "#ffd690", c2: "#e07010", glow: "rgba(255,150,30,0.8)" },
  5: { c1: "#ffb8d0", c2: "#e02050", glow: "rgba(255,60,110,0.8)" },
};
/** 1SPたまるまでの秒数（一定ペース） */
const SEC_PER_SP = 4.5;
const PLAYER_SP_RATE = 1 / SEC_PER_SP;
/** 1秒あたりの敵ゲージ（満タンまで約3.5秒で攻撃） */
const ENEMY_GAUGE_RATE = 0.28;

/** 敵を選んだときに出す攻撃スキル */
const ATTACK_SKILLS: Command[] = [
  {
    id: "attack",
    label: "通常攻撃",
    cost: 0,
    power: 8,
    kind: "attack",
    desc: "選んだ敵に基本攻撃。",
  },
  {
    id: "slash",
    label: "フルスイング",
    cost: 1,
    power: 14,
    kind: "attack",
    desc: "SPを1消費する攻撃。",
    effect: "小〜中威力",
  },
  {
    id: "heavy",
    label: "キラースマッシュ",
    cost: 2,
    power: 22,
    kind: "attack",
    desc: "SPを2消費する強攻撃。",
    effect: "中威力",
  },
  {
    id: "dark",
    label: "ダークスラッシュ",
    cost: 2,
    power: 24,
    kind: "attack",
    desc: "闇のオーラをまとい、上から切り下ろす。",
    effect: "中威力",
  },
  {
    id: "power",
    label: "バルムンク",
    cost: 3,
    power: 32,
    kind: "attack",
    desc: "SPを3消費する強攻撃。",
    effect: "高威力",
  },
  {
    id: "jaeger",
    label: "ランギィールイェーガー",
    cost: 5,
    power: 55,
    kind: "attack",
    desc: "SPを5消費する必殺技。高く舞い上がり落下斬りを放つ。",
    effect: "必殺",
  },
];

/** 自分を選んだときに出す強化・反撃など */
const SELF_SKILLS: Command[] = [
  {
    id: "counter",
    label: "反撃",
    cost: 2,
    power: 0,
    kind: "self",
    buff: "counter",
    desc: "敵の攻撃に3回まで反撃する。",
  },
  {
    id: "revenge",
    label: "復讐",
    cost: 3,
    power: 0,
    kind: "self",
    buff: "revenge",
    desc: "敵の攻撃に3回まで強い反撃をする。",
  },
  {
    id: "powerStance",
    label: "パワースタンス",
    cost: 0,
    power: 0,
    kind: "self",
    buff: "powerStance",
    desc: "しばらく攻撃力が上がる。",
  },
  {
    id: "courage",
    label: "勇気の剣",
    cost: 0,
    power: 0,
    kind: "self",
    buff: "courage",
    desc: "HPを少し回復する。",
  },
  {
    id: "charge",
    label: "パワーチャージ",
    cost: 1,
    power: 0,
    kind: "self",
    buff: "charge",
    desc: "次の攻撃の威力を上げる。",
  },
  {
    id: "flee",
    label: "逃げる",
    cost: 0,
    power: 0,
    kind: "self",
    desc: "戦闘から離脱してマップへ戻る。",
  },
];

type BattleEnemy = {
  /** バトル内の対象ID（複数敵対応用） */
  battleId: string;
  instanceId: string | null;
  monsterId: number;
  name: string;
  image: string;
  atk: number;
  maxHp: number;
  hp: number;
  /** 縦配置スロット（0=上寄り） */
  slot: number;
};

type Props = {
  monsterId: string | null;
  instanceId: string | null;
};

/** 出現数: コンドルは常に2、それ以外はたまに2 */
function rollEnemyCount(monsterId: number): number {
  if (monsterId === 2) return 2;
  return Math.random() < 0.42 ? 2 : 1;
}

function makeEnemyUnits(
  mon: ReturnType<typeof getMonster>,
  count: number,
  instanceId: string | null
): BattleEnemy[] {
  return Array.from({ length: count }, (_, i) => ({
    battleId: `e${i}`,
    instanceId: i === 0 ? instanceId : null,
    monsterId: mon.id,
    name: mon.name,
    image: mon.image,
    atk: mon.atk,
    maxHp: mon.maxHp,
    hp: mon.maxHp,
    slot: i,
  }));
}

function useBubble() {
  return useSyncExternalStore(
    subscribeChat,
    getSpeechBubble,
    getServerSpeechBubble
  );
}

function formatBattleTime(ms: number) {
  const clamped = Math.max(0, Math.floor(ms));
  const cs = Math.floor((clamped % 1000) / 10);
  const totalSec = Math.floor(clamped / 1000);
  const sec = totalSec % 60;
  const min = Math.floor(totalSec / 60);
  return `${String(min).padStart(2, "0")}' ${String(sec).padStart(2, "0")}" ${String(cs).padStart(2, "0")}`;
}

export default function BattleScreen({ monsterId, instanceId }: Props) {
  const router = useRouter();
  const monster = resolveBattleMonster(monsterId, instanceId);
  const bubble = useBubble();
  const [playerName] = useState(
    () => getActiveCharacter()?.name ?? "ゆうしゃ"
  );

  const [enemyUnits, setEnemyUnits] = useState<BattleEnemy[]>(() => {
    const count = rollEnemyCount(monster.id);
    return makeEnemyUnits(monster, count, instanceId);
  });
  const enemyCount = enemyUnits.length;
  const [playerHp, setPlayerHp] = useState(40);
  const [playerSp, setPlayerSp] = useState(0);
  const [enemyGauge, setEnemyGauge] = useState(0);
  const [acting, setActing] = useState(false);
  const [result, setResult] = useState<"win" | "lose" | "flee" | null>(null);
  const [clearStats, setClearStats] = useState<{
    timeMs: number;
    exp: number;
    money: number;
    levelsGained: number;
    level: number;
  } | null>(null);
  const [fadeOut, setFadeOut] = useState(false);
  const [bgmEnabled] = useState(() =>
    typeof window === "undefined" ? true : loadBgmEnabled()
  );
  /** null=閉 / self=自分強化 / attack=敵への攻撃 */
  const [menuMode, setMenuMode] = useState<"self" | "attack" | null>(null);
  /** 攻撃対象の battleId（複数敵対応） */
  const [targetId, setTargetId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("attack");
  const [shakeEnemyId, setShakeEnemyId] = useState<string | null>(null);
  const [shakePlayer, setShakePlayer] = useState(false);
  /** 複数敵時、攻撃モーションの縦狙い（対象スロット） */
  const [attackAimSlot, setAttackAimSlot] = useState<number | null>(null);
  const [playerMotion, setPlayerMotion] = useState<
    | "idle"
    | "lunge"
    | "lunge-swing"
    | "lunge-smash"
    | "lunge-cleave"
    | "lunge-spin"
    | "lunge-jaeger"
    | "counter"
  >("idle");
  /** 同じ技連続でもアニメを再発火させる */
  const [motionNonce, setMotionNonce] = useState(0);
  /** 接近中の敵 battleId */
  const [nearEnemyId, setNearEnemyId] = useState<string | null>(null);
  /** 反撃の種類（1=反撃 / 2=復讐） */
  const [counterRank, setCounterRank] = useState(0);
  /** 反撃の残り回数 */
  const [counterCharges, setCounterCharges] = useState(0);
  /** 攻撃力バフ（残りヒット数） */
  const [atkBuffHits, setAtkBuffHits] = useState(0);
  const [atkBuffValue, setAtkBuffValue] = useState(0);
  /** 次の攻撃を強化 */
  const [charged, setCharged] = useState(false);
  const [damagePopup, setDamagePopup] = useState<{
    side: "enemy" | "player";
    value: number;
    critical?: boolean;
    /** 反撃時など、敵が近い位置にダメージを出す */
    atNear?: boolean;
    /** 複数敵時の縦位置 */
    slot?: number;
  } | null>(null);
  /** 技名バナー（青=味方 / 赤=敵） */
  const [skillBanner, setSkillBanner] = useState<{
    side: "player" | "enemy";
    name: string;
  } | null>(null);

  const aliveEnemies = enemyUnits.filter((e) => e.hp > 0);
  const enemies = aliveEnemies;

  const playerMaxHp = 40;
  const spFloor = Math.min(MAX_SP, Math.floor(playerSp));
  /** 次のSPまでの貯まり具合（満タン時は1） */
  const spFrac = playerSp >= MAX_SP ? 1 : playerSp - Math.floor(playerSp);
  const spTone = SP_COLORS[spFloor] ?? SP_COLORS[0];
  const menuSkills =
    menuMode === "attack"
      ? ATTACK_SKILLS
      : menuMode === "self"
        ? SELF_SKILLS
        : [];
  const menuOpen = menuMode !== null;

  type BuffIcon = { id: string; tip: string };
  const buffIcons: BuffIcon[] = [];
  if (atkBuffHits > 0) {
    buffIcons.push({
      id: "stance",
      tip: `パワースタンス：攻撃力+${atkBuffValue}（残り${atkBuffHits}回）`,
    });
  }
  if (charged) {
    buffIcons.push({
      id: "charge",
      tip: "パワーチャージ：次の攻撃の威力アップ",
    });
  }
  if (counterCharges > 0) {
    buffIcons.push({
      id: "counter",
      tip:
        counterRank >= 2
          ? `復讐：強い反撃（残り${counterCharges}回）`
          : `反撃：敵が近づいたら反撃（残り${counterCharges}回）`,
    });
  }

  const playerHpRef = useRef(playerHp);
  const enemyUnitsRef = useRef(enemyUnits);
  const targetIdRef = useRef(targetId);
  const nearEnemyIdRef = useRef(nearEnemyId);
  const resultRef = useRef(result);
  const actingRef = useRef(false);
  const enemyBusyRef = useRef(false);
  const counterRankRef = useRef(0);
  const counterChargesRef = useRef(0);
  const pendingAttackRef = useRef<{
    cmd: Command;
    targetId: string;
  } | null>(null);
  const atkBuffHitsRef = useRef(0);
  const atkBuffValueRef = useRef(0);
  const chargedRef = useRef(false);
  const spFloorRef = useRef(0);
  const playerSpLiveRef = useRef(0);
  const spFillRef = useRef<HTMLDivElement | null>(null);
  const enemyGaugeFillRefs = useRef<(HTMLDivElement | null)[]>([]);
  const displayedSpFloorRef = useRef(0);
  const battleStartedAt = useRef(
    typeof performance !== "undefined" ? performance.now() : Date.now()
  );
  playerHpRef.current = playerHp;
  enemyUnitsRef.current = enemyUnits;
  targetIdRef.current = targetId;
  nearEnemyIdRef.current = nearEnemyId;
  resultRef.current = result;
  actingRef.current = acting;
  counterRankRef.current = counterRank;
  counterChargesRef.current = counterCharges;
  atkBuffHitsRef.current = atkBuffHits;
  atkBuffValueRef.current = atkBuffValue;
  chargedRef.current = charged;
  spFloorRef.current = spFloor;

  const livingFrom = (units: BattleEnemy[]) => units.filter((e) => e.hp > 0);
  const anyEnemyAlive = () => livingFrom(enemyUnitsRef.current).length > 0;

  const paintSpFill = (s: number) => {
    const frac = s >= MAX_SP ? 1 : s - Math.floor(s);
    if (spFillRef.current) {
      spFillRef.current.style.width = `${Math.max(frac * 100, frac > 0 ? 4 : 0)}%`;
    }
  };

  const paintEnemyGauge = (g: number) => {
    const w = `${Math.max(0, Math.min(1, g)) * 100}%`;
    for (const el of enemyGaugeFillRefs.current) {
      if (el) el.style.width = w;
    }
  };

  const commitPlayerSp = (next: number) => {
    const clamped = Math.max(0, Math.min(MAX_SP, next));
    playerSpLiveRef.current = clamped;
    const floor = Math.min(MAX_SP, Math.floor(clamped));
    spFloorRef.current = floor;
    displayedSpFloorRef.current = floor;
    paintSpFill(clamped);
    setPlayerSp(clamped);
  };

  useEffect(() => {
    if (enemyCount > 1) {
      pushBattleLog(`${monster.name} が ${enemyCount} 体あらわれた！`);
    } else {
      pushBattleLog(`${monster.name} があらわれた！`);
    }
    pushBattleLog("敵を選んで攻撃、自分を選んで強化・反撃！");
  }, [monster.name, enemyCount]);

  const setMenuOpenMode = (
    mode: "self" | "attack" | null,
    tid: string | null = null
  ) => {
    setMenuMode(mode);
    if (mode === "attack") {
      setTargetId(tid);
      setSelected(ATTACK_SKILLS[0]?.id ?? "attack");
    } else if (mode === "self") {
      setTargetId(null);
      setSelected(SELF_SKILLS[0]?.id ?? "counter");
    } else {
      setTargetId(null);
    }
  };

  const openSelfMenu = () => {
    if (acting || result || clearStats) return;
    if (menuMode === "self") {
      setMenuOpenMode(null);
      return;
    }
    setMenuOpenMode("self");
  };

  const openAttackMenu = (enemyBattleId: string) => {
    if (acting || result || clearStats) return;
    if (menuMode === "attack" && targetId === enemyBattleId) {
      setMenuOpenMode(null);
      return;
    }
    setMenuOpenMode("attack", enemyBattleId);
  };

  const goField = () => {
    sessionStorage.setItem("resumeField", "1");
    router.push("/");
  };

  // 勝利: 戦闘BGM停止 → 勝利曲 → 曲終了で暗転 → マップ
  useEffect(() => {
    if (!clearStats) return;
    const fadeMs = 1600;
    let faded = false;
    let fadeTimer: ReturnType<typeof setTimeout> | null = null;
    let goTimer: ReturnType<typeof setTimeout> | null = null;
    let audio: HTMLAudioElement | null = null;

    const startFade = () => {
      if (faded) return;
      faded = true;
      setFadeOut(true);
      goTimer = setTimeout(goField, fadeMs);
    };

    if (!bgmEnabled) {
      fadeTimer = setTimeout(startFade, 1400);
      return () => {
        if (fadeTimer) clearTimeout(fadeTimer);
        if (goTimer) clearTimeout(goTimer);
      };
    }

    audio = new Audio(encodeURI("/bgm/victory.mp3"));
    audio.loop = false;
    audio.preload = "auto";
    audio.volume = 0.62;

    const onEnded = () => startFade();
    // 再生失敗・duration不明時の保険
    const safety = setTimeout(startFade, 12000);
    audio.addEventListener("ended", onEnded);

    const tryPlay = () => {
      audio!
        .play()
        .catch(() => {
          fadeTimer = setTimeout(startFade, 1400);
        });
    };
    if (audio.readyState >= 2) tryPlay();
    else audio.addEventListener("canplay", tryPlay, { once: true });

    return () => {
      clearTimeout(safety);
      if (fadeTimer) clearTimeout(fadeTimer);
      if (goTimer) clearTimeout(goTimer);
      audio?.removeEventListener("ended", onEnded);
      audio?.pause();
      audio?.removeAttribute("src");
      audio?.load();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearStats, bgmEnabled, router]);

  useEffect(() => {
    if (!result || result === "win") return;
    const t = setTimeout(goField, result === "flee" ? 700 : 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, router]);

  // スキルメニュー外タップで閉じる
  useEffect(() => {
    if (!menuOpen || result || clearStats) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpenMode(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen, result, clearStats]);

  const flashDamage = (
    side: "enemy" | "player",
    value: number,
    opts?: {
      critical?: boolean;
      atNear?: boolean;
      battleId?: string;
      slot?: number;
    }
  ) => {
    setDamagePopup({
      side,
      value,
      critical: opts?.critical,
      atNear: opts?.atNear,
      slot: opts?.slot,
    });
    if (side === "enemy") {
      const id = opts?.battleId ?? null;
      setShakeEnemyId(id);
      setTimeout(() => setShakeEnemyId(null), 280);
    } else {
      setShakePlayer(true);
      setTimeout(() => setShakePlayer(false), 280);
    }
    setTimeout(() => setDamagePopup(null), opts?.critical ? 900 : 700);
  };

  const skillBannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showSkillBanner = (side: "player" | "enemy", name: string) => {
    if (skillBannerTimer.current) clearTimeout(skillBannerTimer.current);
    setSkillBanner({ side, name });
    skillBannerTimer.current = setTimeout(() => {
      setSkillBanner(null);
      skillBannerTimer.current = null;
    }, 2000);
  };

  const pickEnemySkillName = () => {
    const names =
      monster.id === 2
        ? ["急襲", "ウィングクラッシュ", "ついばみ"]
        : ["ボディブロー", "ぷるぷるパンチ", "スライムアタック"];
    return names[Math.floor(Math.random() * names.length)];
  };

  /** 近づいてヒット → 戻る（技ごとに上書き） */
  const LUNGE_HIT_MS = 420;
  const LUNGE_TOTAL_MS = 950;
  /** 攻撃から戻ったあとの硬直 */
  const ATTACK_RECOVER_MS = 2000;
  const ENEMY_APPROACH_MS = 480;
  const COUNTER_STRIKE_MS = 780;
  const COUNTER_HIT_AT_MS = 320;
  const ENEMY_RETREAT_MS = 560;

  const attackAnimFor = (skillId: string) => {
    switch (skillId) {
      case "slash":
        return {
          motion: "lunge-swing" as const,
          hitMs: 800,
          totalMs: 1400,
        };
      case "heavy":
        return {
          motion: "lunge-smash" as const,
          hitMs: 520,
          totalMs: 1120,
        };
      case "dark":
        return {
          motion: "lunge-cleave" as const,
          hitMs: 720,
          totalMs: 1350,
        };
      case "power":
        return {
          motion: "lunge-spin" as const,
          hitMs: 560,
          totalMs: 1250,
        };
      case "jaeger":
        return {
          motion: "lunge-jaeger" as const,
          hitMs: 1080,
          totalMs: 1850,
        };
      default:
        return {
          motion: "lunge" as const,
          hitMs: LUNGE_HIT_MS,
          totalMs: LUNGE_TOTAL_MS,
        };
    }
  };
  const lastAttackTimingRef = useRef({ hitMs: LUNGE_HIT_MS, totalMs: LUNGE_TOTAL_MS });

  const finishEnemyBusy = () => {
    setNearEnemyId(null);
    nearEnemyIdRef.current = null;
    enemyBusyRef.current = false;
    const pending = pendingAttackRef.current;
    if (
      pending &&
      !resultRef.current &&
      playerHpRef.current > 0 &&
      anyEnemyAlive()
    ) {
      pendingAttackRef.current = null;
      executeAttack(pending.cmd, pending.targetId);
    }
  };

  const applyKillRewards = () => {
    pushBattleLog(`${monster.name} をたおした！`);
    if (instanceId) markMonsterDefeated(instanceId);
    const done = recordMonsterKill(monster.id);
    for (const title of done) {
      pushBattleLog(`クエスト「${title}」を達成！報酬を手に入れた`);
    }
    const timeMs = Math.max(
      0,
      (typeof performance !== "undefined" ? performance.now() : Date.now()) -
        battleStartedAt.current
    );
    const expGain = monster.expReward * enemyCount;
    const moneyGain = monster.moneyReward * enemyCount;
    const leveled = addExp(expGain);
    addMoney(moneyGain);
    if (leveled.levelsGained > 0) {
      pushBattleLog(
        `レベルが ${leveled.level} にあがった！`
      );
    }
    setTimeout(() => {
      setPlayerMotion("idle");
      setClearStats({
        timeMs,
        exp: expGain,
        money: moneyGain,
        levelsGained: leveled.levelsGained,
        level: leveled.level,
      });
      setMenuOpenMode(null);
      setDamagePopup(null);
      setResult("win");
    }, Math.max(200, lastAttackTimingRef.current.totalMs - lastAttackTimingRef.current.hitMs));
  };

  const dealDamageToEnemy = (
    dmg: number,
    opts: {
      critical?: boolean;
      label?: string;
      atNear?: boolean;
      battleId?: string;
    }
  ) => {
    const units = enemyUnitsRef.current;
    const living = livingFrom(units);
    const bid =
      opts.battleId ??
      targetIdRef.current ??
      nearEnemyIdRef.current ??
      living[0]?.battleId;
    const target = units.find((e) => e.battleId === bid && e.hp > 0) ?? living[0];
    if (!target) return { leftHp: 0, allDead: true };

    const nextHp = Math.max(0, target.hp - dmg);
    flashDamage("enemy", dmg, {
      critical: opts.critical,
      atNear: opts.atNear,
      battleId: target.battleId,
      slot: target.slot,
    });
    pushBattleLog(
      opts.critical
        ? `クリティカル！ ${opts.label ?? "攻撃"}！ ${target.name} に ${dmg} ダメージ`
        : `${opts.label ?? "攻撃"}！ ${target.name} に ${dmg} ダメージ`
    );

    const nextUnits = units.map((e) =>
      e.battleId === target.battleId ? { ...e, hp: nextHp } : e
    );
    enemyUnitsRef.current = nextUnits;
    setEnemyUnits(nextUnits);

    if (nextHp <= 0 && targetIdRef.current === target.battleId) {
      const nextAlive = livingFrom(nextUnits);
      setTargetId(nextAlive[0]?.battleId ?? null);
    }

    const allDead = livingFrom(nextUnits).length === 0;
    return { leftHp: nextHp, allDead };
  };

  const performEnemyAttack = () => {
    const living = livingFrom(enemyUnitsRef.current);
    if (
      resultRef.current ||
      living.length === 0 ||
      actingRef.current ||
      enemyBusyRef.current
    ) {
      return;
    }
    const attacker = living[Math.floor(Math.random() * living.length)];
    enemyBusyRef.current = true;
    setNearEnemyId(attacker.battleId);
    nearEnemyIdRef.current = attacker.battleId;
    const enemySkill = pickEnemySkillName();
    showSkillBanner("enemy", enemySkill);

    setTimeout(() => {
      if (resultRef.current || !anyEnemyAlive()) {
        setNearEnemyId(null);
        setTimeout(finishEnemyBusy, ENEMY_RETREAT_MS);
        return;
      }

      const dmg = attacker.atk + Math.floor(Math.random() * 3);
      const nextHp = Math.max(0, playerHpRef.current - dmg);
      flashDamage("player", dmg);
      pushBattleLog(`${attacker.name} の攻撃！ ${dmg} ダメージ`);
      setPlayerHp(nextHp);

      if (nextHp <= 0) {
        pushBattleLog("たおれてしまった…");
        setResult("lose");
        pendingAttackRef.current = null;
        setNearEnemyId(null);
        setTimeout(finishEnemyBusy, ENEMY_RETREAT_MS);
        return;
      }

      const charges = counterChargesRef.current;
      const rank = counterRankRef.current;

      if (charges > 0 && rank > 0) {
        const counterName = rank >= 2 ? "復讐" : "反撃";
        const nearSlot =
          enemyCount > 1
            ? enemyUnitsRef.current.find((e) => e.battleId === attacker.battleId)
                ?.slot ?? 0
            : null;
        setAttackAimSlot(nearSlot);
        setPlayerMotion("counter");
        setMotionNonce((n) => n + 1);
        showSkillBanner("player", counterName);
        pushBattleLog(`${counterName}が発動！`);

        setTimeout(() => {
          if (resultRef.current || !anyEnemyAlive()) return;
          const retaliate =
            (rank >= 2 ? attacker.atk * 2 + 6 : attacker.atk + 4) +
            Math.floor(Math.random() * 3);
          const { allDead } = dealDamageToEnemy(retaliate, {
            label: counterName,
            atNear: true,
            battleId: attacker.battleId,
          });
          const remain = Math.max(0, counterChargesRef.current - 1);
          setCounterCharges(remain);
          if (remain <= 0) setCounterRank(0);
          if (allDead) applyKillRewards();
        }, COUNTER_HIT_AT_MS);

        setTimeout(() => {
          setPlayerMotion("idle");
          setAttackAimSlot(null);
          setNearEnemyId(null);
          setTimeout(finishEnemyBusy, ENEMY_RETREAT_MS);
        }, COUNTER_STRIKE_MS);
        return;
      }

      setTimeout(() => {
        setNearEnemyId(null);
        setTimeout(finishEnemyBusy, ENEMY_RETREAT_MS);
      }, 80);
    }, ENEMY_APPROACH_MS);
  };

  // SP・敵ゲージのリアルタイム進行（DOM直書きでカクつき防止）
  useEffect(() => {
    if (result) return;
    let raf = 0;
    let last = performance.now();
    let eg = 0;
    playerSpLiveRef.current = playerSp;
    paintSpFill(playerSp);
    paintEnemyGauge(0);

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      const nextSp = Math.min(
        MAX_SP,
        playerSpLiveRef.current + PLAYER_SP_RATE * dt
      );
      playerSpLiveRef.current = nextSp;
      paintSpFill(nextSp);

      const floor = Math.min(MAX_SP, Math.floor(nextSp));
      spFloorRef.current = floor;
      // オーブ数字／色が変わるときだけ React 更新
      if (floor !== displayedSpFloorRef.current) {
        displayedSpFloorRef.current = floor;
        setPlayerSp(nextSp);
      }

      if (!actingRef.current && !enemyBusyRef.current) {
        eg += ENEMY_GAUGE_RATE * dt;
        if (eg >= 1) {
          eg = 0;
          paintEnemyGauge(0);
          setEnemyGauge(0);
          performEnemyAttack();
        } else {
          paintEnemyGauge(eg);
        }
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, monster.atk]);

  const doSelfCommand = (cmd: Command) => {
    if (acting || result) return;
    if (cmd.id === "flee") {
      setActing(true);
      setMenuOpenMode(null);
      pendingAttackRef.current = null;
      pushBattleLog("戦闘からにげた！");
      setResult("flee");
      return;
    }
    if (spFloorRef.current < cmd.cost) {
      pushBattleLog(`SPが足りない！（必要: ${cmd.cost}）`);
      return;
    }

    setActing(true);
    setMenuOpenMode(null);
    commitPlayerSp(playerSpLiveRef.current - cmd.cost);
    if (cmd.id !== "flee") {
      showSkillBanner("player", cmd.label);
    }

    switch (cmd.buff) {
      case "counter":
        setCounterRank(1);
        setCounterCharges(3);
        pushBattleLog("反撃の構え！（3回）");
        break;
      case "revenge":
        setCounterRank(2);
        setCounterCharges(3);
        pushBattleLog("復讐の構え！（3回）");
        break;
      case "powerStance":
        setAtkBuffValue(5);
        setAtkBuffHits(3);
        pushBattleLog("パワースタンス！ 攻撃力アップ");
        break;
      case "courage": {
        const heal = 8 + Math.floor(Math.random() * 4);
        setPlayerHp((h) => Math.min(playerMaxHp, h + heal));
        pushBattleLog(`勇気の剣！ HPが ${heal} 回復`);
        break;
      }
      case "charge":
        setCharged(true);
        pushBattleLog("パワーチャージ！ 次の攻撃が強化される");
        break;
      default:
        break;
    }

    setTimeout(() => setActing(false), 280);
  };

  const executeAttack = (cmd: Command, attackTargetId: string) => {
    if (resultRef.current || !anyEnemyAlive() || playerHpRef.current <= 0) {
      return;
    }
    const stillAlive = livingFrom(enemyUnitsRef.current).some(
      (e) => e.battleId === attackTargetId
    );
    if (!stillAlive) {
      pushBattleLog("その敵はもういない！");
      return;
    }
    if (spFloorRef.current < cmd.cost) {
      pushBattleLog(`SPが足りない！（必要: ${cmd.cost}）`);
      return;
    }

    const anim = attackAnimFor(cmd.id);
    lastAttackTimingRef.current = { hitMs: anim.hitMs, totalMs: anim.totalMs };

    setActing(true);
    setMenuOpenMode(null);
    setTargetId(attackTargetId);
    const aimTarget = enemyUnitsRef.current.find(
      (e) => e.battleId === attackTargetId
    );
    setAttackAimSlot(enemyCount > 1 ? (aimTarget?.slot ?? 0) : null);
    commitPlayerSp(playerSpLiveRef.current - cmd.cost);
    // idle を挟まず nonce で再マウントし、アニメを確実に発火
    setPlayerMotion(anim.motion);
    setMotionNonce((n) => n + 1);
    showSkillBanner("player", cmd.label);

    let dmg =
      cmd.power +
      getTotalAtkBonus() +
      (atkBuffHitsRef.current > 0 ? atkBuffValueRef.current : 0) +
      Math.floor(Math.random() * 4);
    if (chargedRef.current) {
      dmg = Math.round(dmg * 1.45);
      setCharged(false);
    }
    if (atkBuffHitsRef.current > 0) {
      setAtkBuffHits((n) => Math.max(0, n - 1));
    }
    const critical = rollCritical();
    if (critical) {
      dmg = Math.max(dmg + 1, Math.round(dmg * 1.5));
    }

    setTimeout(() => {
      if (resultRef.current) return;
      const { allDead } = dealDamageToEnemy(dmg, {
        critical,
        label: cmd.label,
        battleId: attackTargetId,
      });
      if (allDead) applyKillRewards();
    }, anim.hitMs);

    setTimeout(() => {
      setPlayerMotion("idle");
      setAttackAimSlot(null);
      // 倒しても行動ロックは必ず解除
      setTimeout(() => setActing(false), ATTACK_RECOVER_MS);
    }, anim.totalMs);
  };

  const doAttackCommand = (cmd: Command) => {
    if (acting || result) return;
    const tid = targetId;
    if (!tid) {
      pushBattleLog("攻撃する敵を選んでください！");
      return;
    }
    if (spFloorRef.current < cmd.cost) {
      pushBattleLog(`SPが足りない！（必要: ${cmd.cost}）`);
      return;
    }

    // 敵の攻撃中 → 内部予約（終わったら実行）
    if (enemyBusyRef.current) {
      pendingAttackRef.current = { cmd, targetId: tid };
      setSelected(cmd.id);
      return;
    }

    executeAttack(cmd, tid);
  };

  const doCommand = (cmd: Command) => {
    if (cmd.kind === "self") doSelfCommand(cmd);
    else doAttackCommand(cmd);
  };

  return (
    <div className="lr-battle-shell">
      <FieldBgm
        src="/bgm/battle.mp3"
        playing={!result && !clearStats}
        enabled={bgmEnabled}
        volume={1}
      />
      <div className="lr-battle">
        <div className="lr-bg-art" aria-hidden />

        <div className="lr-field">
        {/* 敵（左）— 複数時は上下に配置／勝利時は消える */}
        {result !== "win" &&
          !clearStats &&
          enemies.map((en, idx) => (
            <div
              key={en.battleId}
              className={`lr-actor enemy ${
                enemyCount > 1 ? `duo slot-${en.slot}` : "solo"
              } ${nearEnemyId === en.battleId ? "near" : ""} ${
                menuMode === "attack" && targetId === en.battleId
                  ? "targeted"
                  : ""
              }`}
            >
              <button
                type="button"
                className="lr-char-hit lr-enemy-hit"
                disabled={!!result || !!clearStats || acting}
                onClick={(e) => {
                  e.stopPropagation();
                  openAttackMenu(en.battleId);
                }}
                title="攻撃スキル"
              >
                <img
                  src={en.image}
                  alt={en.name}
                  draggable={false}
                  className={`lr-enemy-img${
                    shakeEnemyId === en.battleId ? " shake" : ""
                  }`}
                />
              </button>
              <div className="lr-enemy-meta">
                <span className="lr-name enemy">{en.name}</span>
                <div className="lr-hp-wrap">
                  <div className="lr-hp">
                    <div
                      className="fill enemy"
                      style={{ width: `${(en.hp / en.maxHp) * 100}%` }}
                    />
                  </div>
                </div>
                <div className="lr-gauge-wrap" title="敵の行動ゲージ">
                  <span className="lr-gauge-label">行動</span>
                  <div className="lr-gauge enemy">
                    <div
                      ref={(el) => {
                        enemyGaugeFillRefs.current[idx] = el;
                      }}
                      className="fill"
                      style={{ width: `${enemyGauge * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}

        {/* 勝利リザルト → ゆっくりフェードイン → 曲終了で暗転 */}
        {clearStats && (
          <>
            <div className="lr-clear">
              <div className="lr-clear-row" style={{ animationDelay: "0.15s" }}>
                <span className="lr-clear-label">Time</span>
                <span className="lr-clear-value">
                  {formatBattleTime(clearStats.timeMs)}
                </span>
              </div>
              <div className="lr-clear-row" style={{ animationDelay: "0.55s" }}>
                <span className="lr-clear-label">Exp</span>
                <span className="lr-clear-value">{clearStats.exp}</span>
              </div>
              <div className="lr-clear-row" style={{ animationDelay: "0.95s" }}>
                <span className="lr-clear-label">Poro</span>
                <span className="lr-clear-value">{clearStats.money}</span>
              </div>
              {clearStats.levelsGained > 0 && (
                <div
                  className="lr-clear-row lr-clear-levelup"
                  style={{ animationDelay: "1.35s" }}
                >
                  <span className="lr-clear-label">Level</span>
                  <span className="lr-clear-value">
                    UP! → {clearStats.level}
                  </span>
                </div>
              )}
            </div>
            <div
              className={`lr-fadeout${fadeOut ? " on" : ""}`}
              aria-hidden
            />
          </>
        )}

        {/* プレイヤー（右）— タップで強化・反撃 */}
        <div
          key={`player-motion-${motionNonce}`}
          className={`lr-actor player${
            playerMotion !== "idle" ? ` ${playerMotion}` : ""
          }${menuMode === "self" ? " targeted" : ""}${
            attackAimSlot === 0
              ? " aim-slot-0"
              : attackAimSlot === 1
                ? " aim-slot-1"
                : ""
          }`}
          data-motion={playerMotion}
          data-aim={
            attackAimSlot === null ? undefined : String(attackAimSlot)
          }
          style={
            playerMotion === "lunge-cleave"
              ? { animation: "player-lunge-cleave 1.35s ease-in-out both" }
              : undefined
          }
        >
          {bubble && (
            <div className="speech-bubble battle">{bubble.text}</div>
          )}
          <button
            type="button"
            className="lr-char-hit"
            disabled={!!result || !!clearStats || acting}
            onClick={(e) => {
              e.stopPropagation();
              openSelfMenu();
            }}
            title="強化・反撃"
          >
            <img
              src={clearStats || result === "win" ? "/chara-victory.png" : "/chara-battle.png"}
              alt="プレイヤー"
              draggable={false}
              className={`lr-battle-chara${shakePlayer ? " shake" : ""}${
                clearStats || result === "win" ? " victory" : ""
              }`}
            />
          </button>
          <div className="lr-player-meta">
            <div
              className={`lr-buffs${buffIcons.length ? "" : " empty"}`}
              aria-label={buffIcons.length ? "強化効果" : undefined}
              aria-hidden={buffIcons.length === 0}
            >
              {buffIcons.map((b) => (
                <span key={b.id} className="lr-buff" tabIndex={0}>
                  <span className="lr-buff-icon" aria-hidden />
                  <span className="lr-buff-tip" role="tooltip">
                    {b.tip}
                  </span>
                </span>
              ))}
            </div>
            <span className="lr-name">{playerName}</span>
            <div
              className={`lr-sp-row sp-${spFloor}`}
              title={`スキルポイント ${spFloor}/${MAX_SP}`}
              style={
                {
                  ["--sp-c1" as string]: spTone.c1,
                  ["--sp-c2" as string]: spTone.c2,
                  ["--sp-glow" as string]: spTone.glow,
                } as CSSProperties
              }
            >
              <div
                className="lr-sp-orb"
                aria-label={`SP ${spFloor}`}
                style={{
                  backgroundColor: spTone.c2,
                  backgroundImage: `radial-gradient(circle at 30% 26%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 40%), radial-gradient(circle at 50% 58%, ${spTone.c1} 0%, ${spTone.c2} 70%, #1a2028 100%)`,
                  boxShadow: `0 0 12px ${spTone.glow}, 0 2px 4px rgba(0,0,0,0.35), inset 0 -4px 8px rgba(0,0,0,0.3)`,
                }}
              >
                <span>{spFloor}</span>
              </div>
              <div className="lr-sp-bars">
                <div className="lr-hp">
                  <div
                    className="fill"
                    style={{ width: `${(playerHp / playerMaxHp) * 100}%` }}
                  />
                </div>
                <div className="lr-sp-rail" aria-hidden>
                  <div
                    ref={spFillRef}
                    className="lr-sp-rail-fill"
                    style={{
                      width: `${Math.max(spFrac * 100, spFrac > 0 ? 4 : 0)}%`,
                      background: `linear-gradient(90deg, ${spTone.c1}, ${spTone.c2})`,
                      boxShadow: `0 0 8px ${spTone.glow}`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 対象別スキル（自分＝強化 / 敵＝攻撃） */}
        {menuOpen && !result && !clearStats && (
          <>
            <button
              type="button"
              className="lr-skill-backdrop"
              aria-label="スキルをとじる"
              onClick={() => setMenuOpenMode(null)}
            />
            <div
              className={`lr-skill-menu${menuMode === "self" ? " self" : " attack"}`}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="lr-skill-tabs">
                <button type="button" className="on">
                  {menuMode === "self" ? "スキル" : "攻撃"}
                </button>
                <button type="button" disabled>
                  アイテム
                </button>
              </div>
              <div className="lr-skill-body">
                <p className="lr-sp-now">
                  {menuMode === "attack"
                    ? `${monster.name}${enemyCount > 1 ? ` ×${enemyCount}` : ""} をこうげき`
                    : "じぶんをきょうか"}
                  {" · "}
                  SP {spFloor}/{MAX_SP}
                </p>
                <ul className="lr-skill-list">
                  {menuSkills
                    .filter((c) => c.id !== "flee")
                    .map((cmd) => {
                      // HTML disabled はホバー中に SP が足りてもカーソル/クリックが張り付くため
                      // aria-disabled + クラスで見た目だけ落とす
                      const locked = acting || spFloor < cmd.cost;
                      return (
                        <li key={cmd.id}>
                          <button
                            type="button"
                            className={`lr-skill-item sp-cost-${cmd.cost} ${selected === cmd.id ? "selected" : ""} ${locked ? "disabled" : ""}`}
                            aria-disabled={locked}
                            onMouseEnter={() => setSelected(cmd.id)}
                            onFocus={() => setSelected(cmd.id)}
                            onClick={() => {
                              if (acting || spFloorRef.current < cmd.cost) return;
                              doCommand(cmd);
                            }}
                          >
                            <span className={`cost sp-${cmd.cost}`}>{cmd.cost}</span>
                            <span className="name">{cmd.label}</span>
                          </button>
                        </li>
                      );
                    })}
                  {menuMode === "self" && (
                    <>
                      <li className="lr-skill-spacer" aria-hidden />
                      {menuSkills
                        .filter((c) => c.id === "flee")
                        .map((cmd) => (
                          <li key={cmd.id}>
                            <button
                              type="button"
                              className={`lr-skill-item flee sp-cost-${cmd.cost} ${selected === cmd.id ? "selected" : ""}${acting ? " disabled" : ""}`}
                              aria-disabled={acting}
                              onMouseEnter={() => setSelected(cmd.id)}
                              onFocus={() => setSelected(cmd.id)}
                              onClick={() => {
                                if (acting) return;
                                doCommand(cmd);
                              }}
                            >
                              <span className={`cost sp-${cmd.cost}`}>{cmd.cost}</span>
                              <span className="name">{cmd.label}</span>
                            </button>
                          </li>
                        ))}
                    </>
                  )}
                </ul>
              </div>
              <div className="lr-skill-foot">
                <button
                  type="button"
                  className="lr-skill-auto"
                  onClick={() => setMenuOpenMode(null)}
                >
                  AUTO OFF
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 技名バナー（ログレス風） */}
      {skillBanner && (
        <div
          className={`lr-skill-banner ${skillBanner.side === "enemy" ? "enemy" : "player"}`}
          aria-hidden
        >
          {skillBanner.name}
        </div>
      )}

      {/* ダメージは battle 直下（フィールド外）で見切れ防止 */}
      {damagePopup && (
        <div
          className={`lr-dmg-wrap ${damagePopup.side === "player" ? "player" : ""} ${
            damagePopup.critical ? "crit" : ""
          }${damagePopup.atNear ? " near" : ""}${
            damagePopup.side === "enemy" && damagePopup.slot === 0 && enemyCount > 1
              ? " slot-0"
              : ""
          }${
            damagePopup.side === "enemy" && damagePopup.slot === 1 && enemyCount > 1
              ? " slot-1"
              : ""
          }`}
        >
          <span className="lr-dmg-glow">
            <span className="lr-dmg">{damagePopup.value}</span>
          </span>
        </div>
      )}

      {result && result !== "win" && (
        <div className="lr-result">
          {result === "flee" && "にげた！ マップへ…"}
          {result === "lose" && "敗北… マップへ…"}
        </div>
      )}
      </div>
    </div>
  );
}
