import type { CountryPack } from "../types.ts";
import { de } from "./de/index.ts";
import { pl } from "./pl/index.ts";
import { us } from "./us/index.ts";

/**
 * Every country pack Leshy ships. Declaration order carries into the detector
 * list, where it is the tie-break for equal-tier overlaps (adr/0004).
 */
export const packs: CountryPack[] = [de, pl, us];
