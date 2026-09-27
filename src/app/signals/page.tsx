import type { Metadata } from "next";
import { ClientSignals } from "@/components/signals/ClientSignals";
import "./signals.css";

export const metadata: Metadata = {
  title: "US Sinyal Terminali",
  description: "ABD borsalarında (NASDAQ, NYSE, NYSE American) teknik analiz tabanlı AL/SAT sinyalleri, hedef fiyatlar ve hisse durum ekranı",
};

export default function Page() {
  return <ClientSignals />;
}
