import type { KeyDetector } from "../../types.ts";
import { generators } from "../../generate/generators.ts";

// A date is only PII when the field says whose birthday it is; the shape alone
// is a timestamp, which Leshy preserves.
export const birthDate: KeyDetector = {
  id: "birth-date",
  label: "Date of birth",
  type: "dob",
  kind: "key",
  enabled: true,
  keys: /(?:^|_)(?:dob|birth_?date|date_?of_?birth|birthday|born(?:_?on)?)$/i,
  generate: generators.dob,
};
