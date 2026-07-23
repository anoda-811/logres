"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import ChatPanel from "./ChatPanel";
import { getMonster, markMonsterDefeated } from "../lib/monsters";
import { getActiveCharacter } from "../lib/characters";
import { recordMonsterKill } from "../lib/quests";
import { getEquippedWeapon } from "../lib/weapons";
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

const MAX_SP = 3;
/** 1SPたまるまでの秒数（一定ペース） */
const SEC_PER_SP = 2.2;
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
  } | null>(null);

  const playerMaxHp = 40;
  const selectedCmd = COMMANDS.find((c) => c.id === selected) ?? COMMANDS[0];
  const spFloor = Math.floor(playerSp);

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

  const flashDamage = (side: "enemy" | "player", value: number) => {
    setDamagePopup({ side, value });
    if (side === "enemy") {
      setShakeEnemy(true);
      setTimeout(() => setShakeEnemy(false), 280);
    } else {
      setShakePlayer(true);
      setTimeout(() => setShakePlayer(false), 280);
    }
    setTimeout(() => setDamagePopup(null), 600);
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

    const dmg =
      cmd.power +
      getEquippedWeapon().atkBonus +
      Math.floor(Math.random() * 4);
    const nextEnemyHp = Math.max(0, enemyHpRef.current - dmg);
    flashDamage("enemy", dmg);
    pushBattleLog(`${cmd.label}！ ${monster.name} に ${dmg} ダメージ`);
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
    <div className="lr-battle">
      <div className="lr-bg-sky" />
      <div className="lr-bg-grass" />
      <div className="lr-bg-trees" aria-hidden />

      <div className="lr-field">
        {/* 敵（左・草原の上） */}
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
          {damagePopup?.side === "enemy" && (
            <span className="lr-dmg">-{damagePopup.value}</span>
          )}
        </div>

        {/* スキルメニュー */}
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
            <p className="lr-sp-now">
              SP {playerSp.toFixed(1)} / {MAX_SP}
            </p>
            <ul className="lr-skill-list">
              {COMMANDS.map((cmd) => {
                const disabled =
                  acting || (cmd.id !== "flee" && spFloor < cmd.cost);
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
            </ul>
            {selectedCmd && (
              <div className="lr-skill-tip">
                <p className="tip-cost">コスト: {selectedCmd.cost} SP</p>
                <p className="tip-desc">{selectedCmd.desc}</p>
                <p className="tip-fx">
                  {selectedCmd.effect ? `効果: ${selectedCmd.effect}` : "\u00a0"}
                </p>
              </div>
            )}
            <button
              type="button"
              className="lr-skill-close"
              onClick={() => setMenuOpen(false)}
            >
              とじる
            </button>
          </div>
        )}

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
            title="タップでスキル"
          >
            <img src="/chara.png" alt="プレイヤー" draggable={false} />
          </button>
          <div className="lr-player-meta">
            <span className="lr-name">{playerName}</span>
            <div className="lr-hp">
              <div
                className="fill"
                style={{ width: `${(playerHp / playerMaxHp) * 100}%` }}
              />
            </div>
            <div className="lr-gauge-wrap player" title="スキルポイント">
              <span className="lr-gauge-label">SP</span>
              <div className="lr-sp-segs" aria-label={`SP ${spFloor}/${MAX_SP}`}>
                {Array.from({ length: MAX_SP }).map((_, i) => {
                  // 各マスが等しく1SP分。0.0〜1.0 でそのマスの貯まり具合
                  const fill = Math.min(1, Math.max(0, playerSp - i));
                  return (
                    <div key={i} className="lr-sp-seg">
                      <div
                        className="lr-sp-seg-fill"
                        style={{ width: `${fill * 100}%` }}
                      />
                    </div>
                  );
                })}
              </div>
              <span className="lr-sp-num">
                {spFloor}/{MAX_SP}
              </span>
            </div>
          </div>
          {damagePopup?.side === "player" && (
            <span className="lr-dmg player">-{damagePopup.value}</span>
          )}
          {!menuOpen && !result && (
            <p className="lr-hint">キャラをタップ → スキル選択</p>
          )}
        </div>
      </div>

      {/* 下部バー：チャット左 */}
      <div className="lr-dock">
        <ChatPanel className="lr-dock-chat" />
        <div className="lr-dock-portrait">
          <img src="/chara.png" alt="" draggable={false} />
        </div>
        <div className="lr-dock-slots" aria-hidden>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="slot" />
          ))}
        </div>
      </div>

      {result && (
        <div className="lr-result">
          {result === "win" && "勝利！ マップへ…"}
          {result === "flee" && "にげた！ マップへ…"}
          {result === "lose" && "敗北… マップへ…"}
        </div>
      )}
    </div>
  );
}
