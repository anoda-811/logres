"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import GameCanvas from "../components/GameCanvas";
import ChatPanel from "../components/ChatPanel";
import FieldHUD from "../components/FieldHUD";
import FieldBgm from "../components/FieldBgm";
import WorldMapScreen from "../components/WorldMapScreen";
import QuestBoardModal from "../components/QuestBoardModal";
import WeaponShopModal from "../components/WeaponShopModal";
import ArmorShopModal from "../components/ArmorShopModal";
import WarpShopModal from "../components/WarpShopModal";
import WorldSelectScreen, {
  type WorldInfo,
} from "../components/WorldSelectScreen";
import {
  getActiveCharacter,
  type PlayerCharacter,
} from "../lib/characters";
import {
  FIELD_WARP_SHOP,
  getArea,
  type AreaId,
} from "../lib/locations";
import {
  clearFieldReturnPos,
  loadBgmEnabled,
  loadSavedAreaId,
  loadSfxEnabled,
  saveAreaId,
  saveBgmEnabled,
  saveFieldReturnPos,
  saveSfxEnabled,
} from "../lib/settings";
import { setSfxEnabled } from "../lib/sfx";
import { getArrivalSpawn } from "../lib/fieldTerrain";

const FADE_MS = 480;
const HOLD_MS = 160;

type PlayView = "field" | "worldmap";

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function consumeResumeFieldFlag(): boolean {
  try {
    if (sessionStorage.getItem("resumeField") !== "1") return false;
    sessionStorage.removeItem("resumeField");
    return true;
  } catch {
    return false;
  }
}

export default function Page() {
  const [started, setStarted] = useState(false);
  const [world, setWorld] = useState<WorldInfo | null>(null);
  const [character, setCharacter] = useState<PlayerCharacter | null>(null);
  const [areaId, setAreaId] = useState<AreaId>("field");
  const [playView, setPlayView] = useState<PlayView>("field");
  /** 入り口から出てワールドマップ上にいる（エリア内ではない） */
  const [awayOnWorldMap, setAwayOnWorldMap] = useState(false);
  const [questBoardOpen, setQuestBoardOpen] = useState(false);
  const [weaponShopOpen, setWeaponShopOpen] = useState(false);
  const [armorShopOpen, setArmorShopOpen] = useState(false);
  const [warpShopOpen, setWarpShopOpen] = useState(false);
  const [bgmEnabled, setBgmEnabled] = useState(true);
  const [sfxEnabled, setSfxOn] = useState(true);
  /** GameCanvas を戦闘復帰ごとに作り直す */
  const [fieldKey, setFieldKey] = useState(0);
  /** 0=透明 … 1=真っ黒 */
  const [fade, setFade] = useState(0);
  const fadingRef = useRef(false);
  /** 戦闘復帰判定が終わるまでタイトルを出さない（チラつき防止） */
  const [bootReady, setBootReady] = useState(false);
  const resumeFadeInRef = useRef(false);

  const area = getArea(areaId);

  // 描画前に復帰フラグを読む（ワールド選択が一瞬出るのを防ぐ）
  useLayoutEffect(() => {
    const resume = consumeResumeFieldFlag();
    setBgmEnabled(loadBgmEnabled());
    const sfx = loadSfxEnabled();
    setSfxOn(sfx);
    setSfxEnabled(sfx);
    setAreaId(loadSavedAreaId());

    if (resume) {
      setFade(1);
      resumeFadeInRef.current = true;
      fadingRef.current = false;
      setWorld({
        id: "1",
        name: "ワールド 1",
        subtitle: "草原の冒険がはじまる世界",
      });
      setCharacter(getActiveCharacter());
      setAreaId(loadSavedAreaId());
      setPlayView("field");
      setAwayOnWorldMap(false);
      setQuestBoardOpen(false);
      setWeaponShopOpen(false);
      setArmorShopOpen(false);
      setWarpShopOpen(false);
      setFieldKey((k) => k + 1);
      setStarted(true);
    }
    setBootReady(true);
  }, []);

  useEffect(() => {
    if (!bootReady || !started || !resumeFadeInRef.current) return;
    resumeFadeInRef.current = false;
    const t = requestAnimationFrame(() => {
      setFade(0);
    });
    return () => cancelAnimationFrame(t);
  }, [bootReady, started]);

  const runWithFade = useCallback(async (action: () => void) => {
    if (fadingRef.current) return false;
    fadingRef.current = true;
    setFade(1);
    await wait(FADE_MS);
    action();
    await wait(HOLD_MS);
    setFade(0);
    await wait(FADE_MS);
    fadingRef.current = false;
    return true;
  }, []);

  const returnToTitle = () => {
    clearFieldReturnPos();
    setStarted(false);
    setWorld(null);
    setCharacter(null);
    setPlayView("field");
    setAwayOnWorldMap(false);
    setQuestBoardOpen(false);
    setWeaponShopOpen(false);
    setArmorShopOpen(false);
    setWarpShopOpen(false);
    setFade(0);
    fadingRef.current = false;
  };

  /** fromGate: 入り口から出た → 草原は「すでにここ」にしない。開始できたら true */
  const openWorldMap = (fromGate = false): boolean => {
    if (fadingRef.current) return false;
    void runWithFade(() => {
      setQuestBoardOpen(false);
      setWeaponShopOpen(false);
      setArmorShopOpen(false);
      setWarpShopOpen(false);
      setAwayOnWorldMap(fromGate);
      setPlayView("worldmap");
    });
    return true;
  };

  const closeWorldMap = () => {
    void runWithFade(() => {
      setAwayOnWorldMap(false);
      setPlayView("field");
    });
  };

  const travelTo = (id: AreaId, entry?: { col: number; row: number }) => {
    if (fadingRef.current) return false;
    void runWithFade(() => {
      if (entry) {
        saveFieldReturnPos({
          areaId: id,
          col: entry.col,
          row: entry.row,
        });
      } else {
        clearFieldReturnPos();
      }
      setAreaId(id);
      saveAreaId(id);
      setAwayOnWorldMap(false);
      setPlayView("field");
      setWarpShopOpen(false);
      setFieldKey((k) => k + 1);
    });
    return true;
  };

  const warpToArea = (id: AreaId) => {
    if (id === areaId) {
      setWarpShopOpen(false);
      return;
    }
    let entry: { col: number; row: number };
    if (id === "field") {
      entry = {
        col: FIELD_WARP_SHOP.col + 1,
        row: FIELD_WARP_SHOP.row,
      };
    } else if (id === "lake") {
      entry = getArrivalSpawn("lake", "north");
    } else if (id === "secret") {
      entry = getArrivalSpawn("secret", "north");
    } else {
      entry = getArrivalSpawn(id, "south");
    }
    travelTo(id, entry);
  };

  const toggleBgm = () => {
    setBgmEnabled((prev) => {
      const next = !prev;
      saveBgmEnabled(next);
      return next;
    });
  };

  const toggleSfx = () => {
    setSfxOn((prev) => {
      const next = !prev;
      saveSfxEnabled(next);
      setSfxEnabled(next);
      return next;
    });
  };

  const showTitle = bootReady && !started;
  const showPlay = bootReady && started;

  return (
    <main
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        position: "relative",
        background: "#05070a",
      }}
    >
      <FieldBgm
        src={
          !started
            ? "/bgm/world-select.mp3"
            : playView === "worldmap"
              ? "/bgm/world-map.mp3"
              : area.bgm
        }
        playing={
          bootReady &&
          (!started || playView === "field" || playView === "worldmap")
        }
        enabled={bgmEnabled}
        volume={started && playView === "field" ? 0.05 : 0.28}
      />
      {showPlay ? (
        playView === "worldmap" ? (
          <WorldMapScreen
            currentAreaId={awayOnWorldMap ? null : areaId}
            onClose={closeWorldMap}
            onTravel={travelTo}
          />
        ) : (
          <>
            <GameCanvas
              key={`${areaId}-${fieldKey}`}
              areaId={areaId}
              onOpenQuestBoard={() => setQuestBoardOpen(true)}
              onOpenWeaponShop={() => setWeaponShopOpen(true)}
              onOpenArmorShop={() => setArmorShopOpen(true)}
              onOpenWarpShop={() => setWarpShopOpen(true)}
              onExitToWorldMap={() => openWorldMap(true)}
              onTravelToArea={(id, entry) => travelTo(id, entry)}
            />
            <FieldHUD
              onReturnTitle={returnToTitle}
              onOpenWorldMap={() => openWorldMap(false)}
              locationName={area.name}
              playerName={character?.name ?? "ゆうしゃ"}
              bgmEnabled={bgmEnabled}
              onToggleBgm={toggleBgm}
              sfxEnabled={sfxEnabled}
              onToggleSfx={toggleSfx}
            />
            <ChatPanel className="field-chat" />
            <QuestBoardModal
              open={questBoardOpen}
              onClose={() => setQuestBoardOpen(false)}
            />
            <WeaponShopModal
              open={weaponShopOpen}
              onClose={() => setWeaponShopOpen(false)}
            />
            <ArmorShopModal
              open={armorShopOpen}
              onClose={() => setArmorShopOpen(false)}
            />
            <WarpShopModal
              open={warpShopOpen}
              onClose={() => setWarpShopOpen(false)}
              currentAreaId={areaId}
              onWarp={warpToArea}
            />
          </>
        )
      ) : showTitle ? (
        <WorldSelectScreen
          onStart={(w, c) => {
            clearFieldReturnPos();
            setWorld(w);
            setCharacter(c);
            const last = loadSavedAreaId();
            setAreaId(last);
            saveAreaId(last);
            setPlayView("field");
            setStarted(true);
          }}
        />
      ) : null}

      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 20000,
          background: "#000",
          opacity: !bootReady ? 1 : fade,
          pointerEvents: !bootReady || fade > 0.01 ? "auto" : "none",
          transition: bootReady ? `opacity ${FADE_MS}ms ease` : "none",
        }}
      />
    </main>
  );
}
