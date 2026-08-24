import type { StructuralDetector } from "../../types.ts";
import { generators } from "../../generate/generators.ts";

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
  generate: generators.ssn,
};
