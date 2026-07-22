"use client";
import { useEffect, useState } from "react";
import GameCanvas from "../components/GameCanvas";
import ChatPanel from "../components/ChatPanel";

export default function Page() {
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("resumeField") === "1") {
      sessionStorage.removeItem("resumeField");
      setStarted(true);
    }
  }, []);

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
      {started ? (
        <>
          <GameCanvas />
          <ChatPanel className="field-chat" />
        </>
      ) : (
        <div style={{ textAlign: "center" }}>
          <h1 style={{ color: "#fff", background: "#000", padding: "20px" }}>
            タイトル
          </h1>
          <button
            onClick={() => setStarted(true)}
            style={{ padding: "12px 24px", fontSize: 18 }}
          >
            START
          </button>
        </div>
      )}
    </main>
  );
}
