import type { Metadata } from "next";

import CalibrationTool from "./CalibrationTool";

export const metadata: Metadata = {
  title: "Calibration | EquiForm",
  description: "EquiForm landmark calibration for training data",
};

export default function CalibrationPage() {
  return <CalibrationTool />;
}
