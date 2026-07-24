"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { getMonster, markMonsterDefeated } from "../lib/monsters";
import { getActiveCharacter } from "../lib/characters";
import { recordMonsterKill } from "../lib/quests";
import { getTotalAtkBonus, rollCritical } from "../lib/equipment";
import {
  getServerSpeechBubble,
  getSpeechBubble,
  pushBattleLog,
  subscribeChat,
} from "../lib/chatStore";

type Command = {
  id: string;
  label: string;
  cost: number;
  power: number;
  desc: string;
  effect?: string;
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

const COMMANDS: Command[] = [
  {
    id: "attack",
    label: "通常攻撃",
    cost: 0,
    power: 8,
    desc: "いつでも使える基本攻撃。",
  },
  {
    id: "slash",
    label: "スラッシュ",
    cost: 1,
    power: 14,
    desc: "SPを1消費する攻撃。",
    effect: "小〜中威力",
  },
  {
    id: "heavy",
    label: "ヘヴィスラッシュ",
    cost: 2,
    power: 22,
    desc: "SPを2消費する強攻撃。",
    effect: "中威力",
  },
  {
    id: "power",
    label: "パワーアタック",
    cost: 3,
    power: 32,
    desc: "SPを3消費する最強攻撃。",
    effect: "高威力",
  },
  {
    id: "flee",
    label: "逃げる",
    cost: 0,
    power: 0,
    desc: "戦闘から離脱してマップへ戻る。",
  },
];

type Props = {
  monsterId: string | null;
  instanceId: string | null;
};

function useBubble() {
  return useSyncExternalStore(
    subscribeChat,
    getSpeechBubble,
    getServerSpeechBubble
  );
}

export default function BattleScreen({ monsterId, instanceId }: Props) {
  const router = useRouter();
  const monster = getMonster(monsterId);
  const bubble = useBubble();
  const [playerName] = useState(
    () => getActiveCharacter()?.name ?? "ゆうしゃ"
  );

  const [enemyHp, setEnemyHp] = useState(monster.maxHp);
  const [playerHp, setPlayerHp] = useState(40);
  const [playerSp, setPlayerSp] = useState(0);
  const [enemyGauge, setEnemyGauge] = useState(0);
  const [acting, setActing] = useState(false);
  const [result, setResult] = useState<"win" | "lose" | "flee" | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selected, setSelected] = useState<string>("attack");
  const [shakeEnemy, setShakeEnemy] = useState(false);
  const [shakePlayer, setShakePlayer] = useState(false);
  const [damagePopup, setDamagePopup] = useState<{
    side: "enemy" | "player";
    value: number;
    critical?: boolean;
    label?: string;
  } | null>(null);

  const playerMaxHp = 40;
  const spFloor = Math.min(MAX_SP, Math.floor(playerSp));
  /** 次のSPまでの貯まり具合（満タン時は1） */
  const spFrac = playerSp >= MAX_SP ? 1 : playerSp - Math.floor(playerSp);
  const spTone = SP_COLORS[spFloor] ?? SP_COLORS[0];

  const playerHpRef = useRef(playerHp);
  const enemyHpRef = useRef(enemyHp);
  const resultRef = useRef(result);
  playerHpRef.current = playerHp;
  enemyHpRef.current = enemyHp;
  resultRef.current = result;

  useEffect(() => {
    pushBattleLog(`${monster.name} があらわれた！`);
    pushBattleLog("SPは時間でたまる。ためるほど強い技が使えるが、敵も攻撃してくる！");
  }, [monster.name]);

  useEffect(() => {
    if (!result) return;
    const t = setTimeout(() => {
      sessionStorage.setItem("resumeField", "1");
      router.push("/");
    }, result === "flee" ? 700 : 1200);
    return () => clearTimeout(t);
  }, [result, router]);

  const flashDamage = (
    side: "enemy" | "player",
    value: number,
    opts?: { critical?: boolean; label?: string }
  ) => {
    setDamagePopup({
      side,
      value,
      critical: opts?.critical,
      label: opts?.label,
    });
    if (side === "enemy") {
      setShakeEnemy(true);
      setTimeout(() => setShakeEnemy(false), 280);
    } else {
      setShakePlayer(true);
      setTimeout(() => setShakePlayer(false), 280);
    }
    setTimeout(() => setDamagePopup(null), opts?.critical ? 900 : 700);
  };

  const performEnemyAttack = () => {
    if (resultRef.current || enemyHpRef.current <= 0) return;
    const dmg = monster.atk + Math.floor(Math.random() * 3);
    const nextHp = Math.max(0, playerHpRef.current - dmg);
    flashDamage("player", dmg);
    pushBattleLog(`${monster.name} の攻撃！ ${dmg} ダメージ`);
    setPlayerHp(nextHp);
    if (nextHp <= 0) {
      pushBattleLog("たおれてしまった…");
      setResult("lose");
    }
  };

  // SP・敵ゲージのリアルタイム進行
  useEffect(() => {
    if (result) return;
    let raf = 0;
    let last = performance.now();
    let eg = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      setPlayerSp((s) => Math.min(MAX_SP, s + PLAYER_SP_RATE * dt));

      eg += ENEMY_GAUGE_RATE * dt;
      if (eg >= 1) {
        eg = 0;
        setEnemyGauge(0);
        performEnemyAttack();
      } else {
        setEnemyGauge(eg);
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, monster.atk]);

  const doCommand = (cmd: Command) => {
    if (acting || result) return;

    if (cmd.id === "flee") {
      setActing(true);
      setMenuOpen(false);
      pushBattleLog("戦闘からにげた！");
      setResult("flee");
      return;
    }

    if (spFloor < cmd.cost) {
      pushBattleLog(`SPが足りない！（必要: ${cmd.cost}）`);
      return;
    }

    setActing(true);
    setMenuOpen(false);
    setPlayerSp((s) => Math.max(0, s - cmd.cost));

    let dmg =
      cmd.power +
      getTotalAtkBonus() +
      Math.floor(Math.random() * 4);
    const critical = rollCritical();
    if (critical) {
      dmg = Math.max(dmg + 1, Math.round(dmg * 1.5));
    }
    const nextEnemyHp = Math.max(0, enemyHpRef.current - dmg);
    flashDamage("enemy", dmg, { critical, label: cmd.label });
    pushBattleLog(
      critical
        ? `クリティカル！ ${cmd.label}！ ${monster.name} に ${dmg} ダメージ`
        : `${cmd.label}！ ${monster.name} に ${dmg} ダメージ`
    );
    setEnemyHp(nextEnemyHp);

    if (nextEnemyHp <= 0) {
      pushBattleLog(`${monster.name} をたおした！`);
      if (instanceId) markMonsterDefeated(instanceId);
      const done = recordMonsterKill(monster.id);
      for (const title of done) {
        pushBattleLog(`クエスト「${title}」を達成！報酬を手に入れた`);
      }
      setTimeout(() => setResult("win"), 450);
      return;
    }

    setTimeout(() => setActing(false), 350);
  };

  return (
    <div className="lr-battle-shell">
      <div className="lr-battle">
        <div className="lr-bg-art" aria-hidden />

        <div className="lr-field">
        {/* 敵（左） */}
        <div className={`lr-actor enemy ${shakeEnemy ? "shake" : ""}`}>
          <img
            src={monster.image}
            alt={monster.name}
            draggable={false}
            className="lr-enemy-img"
          />
          <div className="lr-enemy-meta">
            <span className="lr-name enemy">{monster.name}</span>
            <div className="lr-hp-wrap">
              <div className="lr-hp">
                <div
                  className="fill enemy"
                  style={{ width: `${(enemyHp / monster.maxHp) * 100}%` }}
                />
              </div>
            </div>
            <div className="lr-gauge-wrap" title="敵の行動ゲージ">
              <span className="lr-gauge-label">行動</span>
              <div className="lr-gauge enemy">
                <div className="fill" style={{ width: `${enemyGauge * 100}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* プレイヤー（右） */}
        <div className={`lr-actor player ${shakePlayer ? "shake" : ""}`}>
          {bubble && (
            <div className="speech-bubble battle">{bubble.text}</div>
          )}
          <button
            type="button"
            className="lr-char-hit"
            disabled={!!result}
            onClick={() => setMenuOpen((v) => !v)}
            title="スキル"
          >
            <img src="/chara.png" alt="プレイヤー" draggable={false} />
          </button>
          <div className="lr-player-meta">
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

        {/* 中央スキル（キャラタップで開く・オーバーレイ） */}
        {menuOpen && !result && (
          <div className="lr-skill-menu">
            <div className="lr-skill-tabs">
              <button type="button" className="on">
                スキル
              </button>
              <button type="button" disabled>
                アイテム
              </button>
            </div>
            <div className="lr-skill-body">
              <p className="lr-sp-now">
                SP {spFloor}/{MAX_SP}
              </p>
              <ul className="lr-skill-list">
                {COMMANDS.filter((c) => c.id !== "flee").map((cmd) => {
                  const disabled = acting || spFloor < cmd.cost;
                  return (
                    <li key={cmd.id}>
                      <button
                        type="button"
                        className={`lr-skill-item ${selected === cmd.id ? "selected" : ""} ${disabled ? "disabled" : ""}`}
                        disabled={disabled}
                        onMouseEnter={() => setSelected(cmd.id)}
                        onFocus={() => setSelected(cmd.id)}
                        onClick={() => doCommand(cmd)}
                      >
                        <span className="cost">{cmd.cost}</span>
                        <span className="name">{cmd.label}</span>
                      </button>
                    </li>
                  );
                })}
                <li className="lr-skill-spacer" aria-hidden />
                {COMMANDS.filter((c) => c.id === "flee").map((cmd) => (
                  <li key={cmd.id}>
                    <button
                      type="button"
                      className={`lr-skill-item flee ${selected === cmd.id ? "selected" : ""}`}
                      disabled={acting}
                      onMouseEnter={() => setSelected(cmd.id)}
                      onFocus={() => setSelected(cmd.id)}
                      onClick={() => doCommand(cmd)}
                    >
                      <span className="cost">{cmd.cost}</span>
                      <span className="name">{cmd.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div className="lr-skill-foot">
              <button
                type="button"
                className="lr-skill-auto"
                onClick={() => setMenuOpen(false)}
              >
                AUTO OFF
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ダメージは battle 直下（フィールド外）で見切れ防止 */}
      {damagePopup && (
        <div
          className={`lr-dmg-wrap ${damagePopup.side === "player" ? "player" : ""} ${
            damagePopup.critical ? "crit" : ""
          }`}
        >
          {damagePopup.label && (
            <span className="lr-dmg-skill">{damagePopup.label}</span>
          )}
          <span className="lr-dmg-glow">
            <span className="lr-dmg">{damagePopup.value}</span>
          </span>
        </div>
      )}

      {result && (
        <div className="lr-result">
          {result === "win" && "勝利！ マップへ…"}
          {result === "flee" && "にげた！ マップへ…"}
          {result === "lose" && "敗北… マップへ…"}
        </div>
      )}
      </div>
    </div>
  );
}
