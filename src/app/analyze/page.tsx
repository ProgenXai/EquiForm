import type { Metadata } from "next";

import AnalyzeClient from "./AnalyzeClient";

export const metadata: Metadata = {
  title: "Analyze | EquiForm",
};

export default function AnalyzePage() {
  return <AnalyzeClient />;
}
