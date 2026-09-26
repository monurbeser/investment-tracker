export const DUBAI_TZ = "Asia/Dubai";

export function fmtPrice(v: number | null | undefined, currency?: string): string {
  if (v == null || !isFinite(v)) return "—";
  const abs = Math.abs(v);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 8;
  const s = v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return currency ? `${s} ${currency}` : s;
}

export function fmtMoney(v: number | null | undefined, currency = "USD"): string {
  if (v == null || !isFinite(v)) return "—";
  return v.toLocaleString("en-US", { style: "currency", currency, maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 2 });
}

export function fmtPct(v: number | null | undefined, digits = 2): string {
  if (v == null || !isFinite(v)) return "—";
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)}%`;
}

export function signClass(v: number | null | undefined): string {
  if (v == null || !isFinite(v) || v === 0) return "flat";
  return v > 0 ? "up" : "down";
}

export function fmtDateTime(iso: string | number | null | undefined, withSeconds = false): string {
  if (iso == null) return "—";
  const d = typeof iso === "number" ? new Date(iso * 1000) : new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("tr-TR", {
    timeZone: DUBAI_TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" } : {}),
  });
}

export function fmtDate(sec: number): string {
  return new Date(sec * 1000).toLocaleDateString("tr-TR", { timeZone: DUBAI_TZ, day: "2-digit", month: "short", year: "numeric" });
}

/** "12 sn önce", "3 dk önce" ... */
export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s} sn önce`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} dk önce`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} sa önce`;
  return `${Math.round(h / 24)} gün önce`;
}
