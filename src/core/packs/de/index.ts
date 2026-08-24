import type { CountryPack } from "../../types.ts";
import { address } from "./address.ts";
import { steuerId } from "./steuerId.ts";

export const de: CountryPack = {
  id: "de",
  label: "Germany",
  locale: "de",
  detectors: [steuerId, address],
};
