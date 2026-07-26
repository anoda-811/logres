// 既存コード互換の薄いラッパー
export type { GearDef as WeaponDef, WeaponGenre, GearRarity } from "./equipment";
export {
  WEAPONS,
  WEAPON_GENRES,
  getWeapon,
  loadOwnedWeapons,
  loadEquippedWeaponId,
  getEquippedWeapon,
  equipWeapon,
  ownWeapon,
  buyWeapon,
  subscribeWeapons,
  getWeaponSnapshot,
  getServerWeaponSnapshot,
  formatGearName,
} from "./equipment";
