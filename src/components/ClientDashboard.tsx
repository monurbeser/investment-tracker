"use client";
import dynamic from "next/dynamic";

// Clocks, market status and live prices depend on the viewer's current time,
// so the terminal renders on the client only (avoids hydration mismatches).
export const ClientDashboard = dynamic(() => import("./Dashboard").then((m) => m.Dashboard), {
  ssr: false,
  loading: () => <div className="boot">DXB Invest Terminal yükleniyor…</div>,
});
