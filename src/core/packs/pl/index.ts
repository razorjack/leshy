import type { CountryPack } from "../../types.ts";
import { address } from "./address.ts";
import { isFakePesel, pesel } from "./pesel.ts";

export const pl: CountryPack = {
  id: "pl",
  label: "Poland",
  locale: "pl",
  detectors: [pesel, address],
  preserve: [
    {
      id: "fake-pesel",
      // Leshy's PESEL fakes carry a 2100s month (41–52): checksum-valid, and
      // nobody alive has one.
      isFake: (text) => /^\d{11}$/.test(text) && isFakePesel(text),
      enabled: true,
    },
  ],
};
