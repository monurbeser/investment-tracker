"use client";
import { useEffect, useRef, useState } from "react";
import type { HistoryResponse, Resolution } from "../types";
import { fetchHistory } from "./api";

export type HistoryEntry = { data?: HistoryResponse; error?: string; loading: boolean };

/** Loads /api/history for each id and refreshes it periodically. */
export function useHistories(ids: string[], res: Resolution): Record<string, HistoryEntry> {
  const [map, setMap] = useState<Record<string, HistoryEntry>>({});
  const refreshMs = res === "intraday" ? 60_000 : 5 * 60_000;
  const idsKey = ids.join(",");
  const mapRef = useRef(map);
  mapRef.current = map;

  useEffect(() => {
    let alive = true;
    const list = idsKey ? idsKey.split(",") : [];
    const load = (id: string) => {
      setMap((m) => ({ ...m, [id]: { ...(m[id] ?? {}), loading: true } }));
      fetchHistory(id, res)
        .then((data: HistoryResponse) => alive && setMap((m) => ({ ...m, [id]: { data, loading: false } })))
        .catch((e: Error) => alive && setMap((m) => ({ ...m, [id]: { data: m[id]?.data, error: e.message, loading: false } })));
    };
    list.forEach((id) => {
      const cur = mapRef.current[id];
      if (!cur?.data || cur.data.resolution !== res) load(id);
    });
    const t = setInterval(() => list.forEach(load), refreshMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [idsKey, res, refreshMs]);

  return map;
}
