import type { Generate, StructuralDetector } from "../../types.ts";
import { fakerFor } from "../../generate/faker.ts";
import { pad } from "../../generate/shape.ts";

const generate: Generate = (context) => {
  const faker = fakerFor(context.seed, "en");
  let area = faker.number.int({ min: 1, max: 899 });
  if (area === 666) area = 665;
  const serial = faker.number.int({ min: 1, max: 9999 });
  // Group "00" is never issued — Leshy's SSN fake namespace.
  return `${pad(area, 3)}-00-${pad(serial, 4)}`;
};

export const ssn: StructuralDetector = {
  id: "ssn",
  label: "US SSN",
  type: "ssn",
  kind: "structural",
  enabled: true,
  match: /(?<![\d-])\d{3}-\d{2}-\d{4}(?![\d-])/g,
  keys: /^ssn$|social_?security/i,
  validate: (text) => {
    const [area = "", group = "", serial = ""] = text.split("-");
    return area !== "000" && area !== "666" && group !== "00" && serial !== "0000";
  },
  generate,
};
