export type AreaId = "field" | "town";

export type WorldArea = {
  id: AreaId;
  name: string;
  desc: string;
  bgm: string;
  /** ワールドマップ上の位置 (%) */
  x: number;
  y: number;
  icon: "grass" | "castle";
};

export const WORLD_AREAS: WorldArea[] = [
  {
    id: "field",
    name: "草原フィールド",
    desc: "モンスターがいる草原。冒険の出発点。",
    bgm: "/bgm/field.mp3",
    x: 28,
    y: 58,
    icon: "grass",
  },
  {
    id: "town",
    name: "城下町",
    desc: "人が集う街。ここで一息つける。",
    bgm: "/bgm/town.mp3",
    x: 68,
    y: 42,
    icon: "castle",
  },
];

export function getArea(id: AreaId): WorldArea {
  return WORLD_AREAS.find((a) => a.id === id) ?? WORLD_AREAS[0];
}
