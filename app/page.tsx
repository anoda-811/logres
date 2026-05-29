"use client";
import { useState } from "react";
import GameCanvas from "../components/GameCanvas";

export default function Page() {
  const [started, setStarted] = useState(false);
  return (
    <main style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
      {started ? (
        <GameCanvas />
      ) : (
        <div style={{ textAlign: "center" }}>
          <h1 style={{ color: "#fff", background: "#000", padding: "20px" }}>タイトル</h1>
          <button onClick={() => setStarted(true)} style={{ padding: "12px 24px", fontSize: 18 }}>
            START
          </button>
        </div>
      )}
    </main>
  );
}
