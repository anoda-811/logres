// 既存コード互換の薄いラッパー
export type { GearDef as WeaponDef } from "./equipment";
export {
  WEAPONS,
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
} from "./equipment";
