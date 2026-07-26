export type AreaId = "field" | "lake" | "town" | "secret";

export type AreaInfo = {
  id: AreaId;
  /** HUD・エリア内表示名 */
  name: string;
  desc: string;
  bgm: string;
};

/** プレイ可能な全エリア */
export const AREAS: AreaInfo[] = [
  {
    id: "field",
    name: "キルギム草原 - 始まりの草原",
    desc: "冒険の出発点。入り口付近にワープ屋がある。",
    bgm: "/bgm/field.mp3",
  },
  {
    id: "lake",
    name: "キルギム草原 - キルギム湖",
    desc: "水辺の広がる湖畔。",
    bgm: "/bgm/field.mp3",
  },
  {
    id: "secret",
    name: "キルギム草原 - 秘境入り口",
    desc: "秘境へと続く狭い草地。ホワイトケルピーが門を守る。",
    bgm: "/bgm/field.mp3",
  },
  {
    id: "town",
    name: "城下町",
    desc: "人が集う街。ここで一息つける。",
    bgm: "/bgm/town.mp3",
  },
];

export type WorldMapIcon = "grass" | "castle";

/** ワールドマップに出す拠点（草原内の細分化エリアは出さない） */
export type WorldMapNode = {
  /** 移動先エリア（草原拠点＝始まりの草原） */
  id: AreaId;
  name: string;
  desc: string;
  x: number;
  y: number;
  icon: WorldMapIcon;
};

export const WORLD_MAP_NODES: WorldMapNode[] = [
  {
    id: "field",
    name: "キルギム草原",
    desc: "広大な草原地帯。ワープ屋から各地へ足を運べる。",
    x: 84,
    y: 87.5,
    icon: "grass",
  },
  {
    id: "town",
    name: "城下町",
    desc: "人が集う街。ここで一息つける。",
    x: 90.3,
    y: 77.7,
    icon: "castle",
  },
];

/** 互換エイリアス */
export type WorldArea = WorldMapNode;
export const WORLD_AREAS = WORLD_MAP_NODES;

/** ワープ屋の行き先（草原内エリア） */
export type WarpDestination = {
  id: AreaId;
  name: string;
  desc: string;
};

export const WARP_DESTINATIONS: WarpDestination[] = [
  {
    id: "field",
    name: "始まりの草原",
    desc: "キルギム草原の入り口付近。",
  },
  {
    id: "lake",
    name: "キルギム湖",
    desc: "水の多い湖畔エリア。",
  },
  {
    id: "secret",
    name: "秘境入り口",
    desc: "秘境の門がある狭い草地。",
  },
];

/** 始まりの草原・入り口付近のワープ屋マス */
export const FIELD_WARP_SHOP = { col: 15, row: 28 };

/** 秘境入り口マップサイズ（狭め） */
export const SECRET_COLS = 16;
export const SECRET_ROWS = 16;

/** 秘境の門（北側） */
export const SECRET_PORTAL = { col: 8, row: 2 };

/** ホワイトケルピー配置（門の手前） */
export const SECRET_KELPIE_POS = { col: 8, row: 5 };

export function getArea(id: AreaId): AreaInfo {
  return AREAS.find((a) => a.id === id) ?? AREAS[0];
}

export function isValidAreaId(id: string): id is AreaId {
  return (
    id === "field" || id === "lake" || id === "town" || id === "secret"
  );
}

/** ワールドマップの「いまここ」判定用（湖・秘境も草原拠点扱い） */
export function worldMapPresenceId(areaId: AreaId | null): AreaId | null {
  if (areaId == null) return null;
  if (areaId === "lake" || areaId === "secret") return "field";
  return areaId;
}
