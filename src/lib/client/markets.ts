export interface MarketStatus {
  key: string;
  label: string;
  open: boolean;
  hours: string;
}

function partsIn(tz: string, d: Date) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const hour = Number(get("hour")) % 24;
  return { weekday: get("weekday"), minutes: hour * 60 + Number(get("minute")) };
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

/** Regular sessions only; exchange holidays are not modelled. */
export function marketStatuses(now = new Date()): MarketStatus[] {
  const dxb = partsIn("Asia/Dubai", now);
  const ny = partsIn("America/New_York", now);
  const ldn = partsIn("Europe/London", now);
  return [
    { key: "uae", label: "DFM / ADX", open: WEEKDAYS.includes(dxb.weekday) && dxb.minutes >= 600 && dxb.minutes < 900, hours: "Pzt–Cum 10:00–15:00 GST" },
    { key: "us", label: "NYSE / NASDAQ", open: WEEKDAYS.includes(ny.weekday) && ny.minutes >= 570 && ny.minutes < 960, hours: "Pzt–Cum 09:30–16:00 ET" },
    { key: "lse", label: "LSE", open: WEEKDAYS.includes(ldn.weekday) && ldn.minutes >= 480 && ldn.minutes < 990, hours: "Pzt–Cum 08:00–16:30 UK" },
    { key: "crypto", label: "Kripto", open: true, hours: "7/24" },
  ];
}
