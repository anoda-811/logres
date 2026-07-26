"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import GameCanvas from "../components/GameCanvas";
import ChatPanel from "../components/ChatPanel";
import FieldHUD from "../components/FieldHUD";
import FieldBgm from "../components/FieldBgm";
import WorldMapScreen from "../components/WorldMapScreen";
import QuestBoardModal from "../components/QuestBoardModal";
import WeaponShopModal from "../components/WeaponShopModal";
import ArmorShopModal from "../components/ArmorShopModal";
import WorldSelectScreen, {
  type WorldInfo,
} from "../components/WorldSelectScreen";
import {
  getActiveCharacter,
  type PlayerCharacter,
} from "../lib/characters";
import { getArea, type AreaId } from "../lib/locations";
import {
  clearFieldReturnPos,
  loadBgmEnabled,
  loadSavedAreaId,
  saveAreaId,
  saveBgmEnabled,
} from "../lib/settings";

const FADE_MS = 480;
const HOLD_MS = 160;

type PlayView = "field" | "worldmap";

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
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
  const [bgmEnabled, setBgmEnabled] = useState(true);
  /** 0=透明 … 1=真っ黒 */
  const [fade, setFade] = useState(0);
  const fadingRef = useRef(false);

  const area = getArea(areaId);

  useEffect(() => {
    setBgmEnabled(loadBgmEnabled());
    setAreaId(loadSavedAreaId());

    if (sessionStorage.getItem("resumeField") === "1") {
      sessionStorage.removeItem("resumeField");
      setWorld({
        id: "1",
        name: "ワールド 1",
        subtitle: "草原の冒険がはじまる世界",
      });
      setCharacter(getActiveCharacter());
      setAreaId(loadSavedAreaId());
      setPlayView("field");
      setStarted(true);
    }
  }, []);

  const runWithFade = useCallback(async (action: () => void) => {
    if (fadingRef.current) return;
    fadingRef.current = true;
    setFade(1);
    await wait(FADE_MS);
    action();
    await wait(HOLD_MS);
    setFade(0);
    await wait(FADE_MS);
    fadingRef.current = false;
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
    setFade(0);
    fadingRef.current = false;
  };

  /** fromGate: 入り口から出た → 草原は「すでにここ」にしない */
  const openWorldMap = (fromGate = false) => {
    void runWithFade(() => {
      setQuestBoardOpen(false);
      setWeaponShopOpen(false);
      setArmorShopOpen(false);
      setAwayOnWorldMap(fromGate);
      setPlayView("worldmap");
    });
  };

  const closeWorldMap = () => {
    void runWithFade(() => {
      setAwayOnWorldMap(false);
      setPlayView("field");
    });
  };

  const travelTo = (id: AreaId) => {
    void runWithFade(() => {
      clearFieldReturnPos();
      setAreaId(id);
      saveAreaId(id);
      setAwayOnWorldMap(false);
      setPlayView("field");
    });
  };

  const toggleBgm = () => {
    setBgmEnabled((prev) => {
      const next = !prev;
      saveBgmEnabled(next);
      return next;
    });
  };

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
        src={area.bgm}
        playing={started && playView === "field"}
        enabled={bgmEnabled}
        volume={0.05}
      />
      {started ? (
        playView === "worldmap" ? (
          <WorldMapScreen
            currentAreaId={awayOnWorldMap ? null : areaId}
            onClose={closeWorldMap}
            onTravel={travelTo}
          />
        ) : (
          <>
            <GameCanvas
              key={areaId}
              areaId={areaId}
              onOpenQuestBoard={() => setQuestBoardOpen(true)}
              onOpenWeaponShop={() => setWeaponShopOpen(true)}
              onOpenArmorShop={() => setArmorShopOpen(true)}
              onExitToWorldMap={() => openWorldMap(true)}
            />
            <FieldHUD
              onReturnTitle={returnToTitle}
              onOpenWorldMap={() => openWorldMap(false)}
              locationName={area.name}
              playerName={character?.name ?? "ゆうしゃ"}
              bgmEnabled={bgmEnabled}
              onToggleBgm={toggleBgm}
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
          </>
        )
      ) : (
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
      )}

      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 20000,
          background: "#000",
          opacity: fade,
          pointerEvents: fade > 0.01 ? "auto" : "none",
          transition: `opacity ${FADE_MS}ms ease`,
        }}
      />
    </main>
  );
}
