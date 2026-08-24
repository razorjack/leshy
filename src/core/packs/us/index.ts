import type { CountryPack } from "../../types.ts";
import { ssn } from "./ssn.ts";

export const us: CountryPack = {
  id: "us",
  label: "United States",
  locale: "en",
  detectors: [ssn],
};
