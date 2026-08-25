import type { Detector } from "../../types.ts";
import { email } from "./email.ts";
import { phone } from "./phone.ts";
import { ipv4, ipv6 } from "./ip.ts";
import { mac } from "./mac.ts";
import { creditCard } from "./creditCard.ts";
import { iban } from "./iban.ts";
import { jwt } from "./jwt.ts";
import { apiKey } from "./apiKey.ts";
import {
  authHeader,
  cookie,
  password,
  privateKey,
  sessionId,
  token,
  urlCredentials,
} from "./secret.ts";
import { uuid } from "./uuid.ts";
import { person } from "./person.ts";
import { address, city, postcode, street } from "./address.ts";
import { org } from "./org.ts";
import { birthDate } from "./birthDate.ts";
import { coordinates } from "./coordinates.ts";
import { cardCode, cardExpiry } from "./cardFields.ts";

/**
 * Country-neutral detectors, always on. Anything that only makes sense inside
 * one country's document lives in a pack (src/core/packs). Declaration order is
 * the tie-break for equal-tier, equal-length overlaps.
 */
export const builtins: Detector[] = [
  creditCard,
  cardCode,
  cardExpiry,
  iban,
  jwt,
  password,
  sessionId,
  token,
  authHeader,
  cookie,
  urlCredentials,
  privateKey,
  apiKey,
  email,
  mac,
  ipv6,
  ipv4,
  phone,
  uuid,
  person,
  street,
  city,
  postcode,
  address,
  org,
  birthDate,
  coordinates,
];
