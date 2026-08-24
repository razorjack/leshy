import type { CountryPack } from "../../types.ts";
import { address } from "./address.ts";
import { pesel } from "./pesel.ts";

export const pl: CountryPack = {
  id: "pl",
  label: "Poland",
  locale: "pl",
  detectors: [pesel, address],
};
