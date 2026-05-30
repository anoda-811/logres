"use client";

import { useSearchParams } from "next/navigation";

export default function BattlePage() {
  const params = useSearchParams();

  const monsterId = params.get("monsterId");

  return (
    <div
      style={{
        background: "black",
        color: "white",
        minHeight: "100vh",
        padding: "40px"
      }}
    >
      <h1>戦闘画面</h1>

      <p>敵ID: {monsterId}</p>

      <button>たたかう</button>
      <button>にげる</button>
    </div>
  );
}