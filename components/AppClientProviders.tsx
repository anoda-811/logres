"use client";

import type { ReactNode } from "react";
import ClickSfxListener from "./ClickSfxListener";

/** layout 用のクライアント側共通マウント */
export default function AppClientProviders({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      <ClickSfxListener />
      {children}
    </>
  );
}
