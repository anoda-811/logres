"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import BattleScreen from "../../components/BattleScreen";

function BattleInner() {
  const params = useSearchParams();
  const monsterId = params.get("monsterId");
  const instanceId = params.get("instanceId");

  return <BattleScreen monsterId={monsterId} instanceId={instanceId} />;
}

export default function BattlePage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            background: "#6fbf6f",
            color: "#1a2e14",
            fontWeight: 700,
          }}
        >
          戦闘準備中…
        </div>
      }
    >
      <BattleInner />
    </Suspense>
  );
}
