import type { CountryPack } from "../../types.ts";
import { ssn } from "./ssn.ts";

export const us: CountryPack = {
  id: "us",
  label: "United States",
  locale: "en",
  detectors: [ssn],
  preserve: [
    {
      id: "fake-ssn",
      // Leshy generates SSN fakes with group "00", which is never issued.
      isFake: (text) => /^\d{3}-00-\d{4}$/.test(text),
      enabled: true,
    },
  ],
};
