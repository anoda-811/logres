"use client";
import { useEffect, useState } from "react";
import GameCanvas from "../components/GameCanvas";
import ChatPanel from "../components/ChatPanel";
import FieldHUD from "../components/FieldHUD";
import FieldBgm from "../components/FieldBgm";
import WorldMapModal from "../components/WorldMapModal";
import QuestBoardModal from "../components/QuestBoardModal";
import WeaponShopModal from "../components/WeaponShopModal";
import WorldSelectScreen, {
  type WorldInfo,
} from "../components/WorldSelectScreen";
import {
  getActiveCharacter,
  type PlayerCharacter,
} from "../lib/characters";
import { getArea, type AreaId } from "../lib/locations";
import {
  loadBgmEnabled,
  loadSavedAreaId,
  saveAreaId,
  saveBgmEnabled,
} from "../lib/settings";

export default function Page() {
  const [started, setStarted] = useState(false);
  const [world, setWorld] = useState<WorldInfo | null>(null);
  const [character, setCharacter] = useState<PlayerCharacter | null>(null);
  const [areaId, setAreaId] = useState<AreaId>("field");
  const [mapOpen, setMapOpen] = useState(false);
  const [questBoardOpen, setQuestBoardOpen] = useState(false);
  const [weaponShopOpen, setWeaponShopOpen] = useState(false);
  const [bgmEnabled, setBgmEnabled] = useState(true);

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
      setStarted(true);
    }
  }, []);

  const returnToTitle = () => {
    setStarted(false);
    setWorld(null);
    setCharacter(null);
    setMapOpen(false);
    setQuestBoardOpen(false);
    setWeaponShopOpen(false);
  };

  const travelTo = (id: AreaId) => {
    setAreaId(id);
    saveAreaId(id);
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
      }}
    >
      <FieldBgm
        src={area.bgm}
        playing={started}
        enabled={bgmEnabled}
      />
      {started ? (
        <>
          <GameCanvas
            key={areaId}
            areaId={areaId}
            onOpenQuestBoard={() => setQuestBoardOpen(true)}
            onOpenWeaponShop={() => setWeaponShopOpen(true)}
          />
          <FieldHUD
            onReturnTitle={returnToTitle}
            onOpenWorldMap={() => setMapOpen(true)}
            locationName={area.name}
            playerName={character?.name ?? "ゆうしゃ"}
            bgmEnabled={bgmEnabled}
            onToggleBgm={toggleBgm}
          />
          <ChatPanel className="field-chat" />
          <WorldMapModal
            open={mapOpen}
            currentAreaId={areaId}
            onClose={() => setMapOpen(false)}
            onTravel={travelTo}
          />
          <QuestBoardModal
            open={questBoardOpen}
            onClose={() => setQuestBoardOpen(false)}
          />
          <WeaponShopModal
            open={weaponShopOpen}
            onClose={() => setWeaponShopOpen(false)}
          />
        </>
      ) : (
        <WorldSelectScreen
          onStart={(w, c) => {
            setWorld(w);
            setCharacter(c);
            const last = loadSavedAreaId();
            setAreaId(last);
            saveAreaId(last);
            setStarted(true);
          }}
        />
      )}
    </main>
  );
}
