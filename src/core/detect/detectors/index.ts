import type { Detector } from "../../types.ts";
import { email } from "./email.ts";
import { phone } from "./phone.ts";
import { ipv4, ipv6 } from "./ip.ts";
import { mac } from "./mac.ts";
import { creditCard } from "./creditCard.ts";
import { iban } from "./iban.ts";
import { jwt } from "./jwt.ts";
import { apiKey } from "./apiKey.ts";
import { uuid } from "./uuid.ts";
import { ssn } from "./ssn.ts";
import { pesel } from "./pesel.ts";
import { person } from "./person.ts";
import { address, plAddress } from "./address.ts";
import { org } from "./org.ts";

/** Declaration order is the tie-break for equal-tier, equal-length overlaps. */
export const builtins: Detector[] = [
  pesel,
  ssn,
  creditCard,
  iban,
  jwt,
  apiKey,
  email,
  mac,
  ipv6,
  ipv4,
  phone,
  uuid,
  plAddress,
  person,
  address,
  org,
];
