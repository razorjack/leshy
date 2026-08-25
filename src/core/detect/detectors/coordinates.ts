import type { KeyDetector } from "../../types.ts";
import { generators } from "../../generate/generators.ts";

// A coordinate pair pins a person to a doorstep. Bare decimals have no shape
// of their own, so only the key names them.
export const coordinates: KeyDetector = {
  id: "coordinates",
  label: "Coordinates",
  type: "geo",
  kind: "key",
  enabled: true,
  keys: /(?:^|_)(?:lat|latitude|lng|lon|long|longitude|coords?|coordinates|geo(?:location)?)$/i,
  generate: generators.geo,
};
