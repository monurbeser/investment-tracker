"use client";
import dynamic from "next/dynamic";

// Uses the viewer's clock, localStorage and canvas charts: client-only.
export const ClientSignals = dynamic(() => import("./SignalsApp").then((m) => m.SignalsApp), {
  ssr: false,
  loading: () => <div className="boot">US Sinyal Terminali yükleniyor…</div>,
});
