import type { EntityType } from "../core/types.ts";

/**
 * Mark hue by what a value is, not by which detector found it: a reader
 * scanning for "did it get the credentials" wants every secret to look alike.
 * Unknown (custom) types fall into `other`. The classes are in app.css.
 */
export type MarkGroup = "identity" | "contact" | "location" | "network" | "secret" | "id" | "other";

const GROUPS: Record<MarkGroup, EntityType[]> = {
  identity: ["person", "username", "org"],
  contact: ["email", "phone"],
  location: ["address", "street", "city", "postcode", "geo"],
  network: ["ip", "mac", "hostname"],
  secret: ["jwt", "api-key", "secret", "uuid"],
  id: ["credit-card", "card-code", "card-expiry", "iban", "ssn", "pesel", "steuer-id", "dob"],
  other: [],
};

const byType = new Map<EntityType, MarkGroup>(
  (Object.entries(GROUPS) as Array<[MarkGroup, EntityType[]]>).flatMap(([group, types]) =>
    types.map((type) => [type, group]),
  ),
);

export const markGroup = (type: EntityType): MarkGroup => byType.get(type) ?? "other";

export const markClass = (type: EntityType): string => `mark-${markGroup(type)}`;
