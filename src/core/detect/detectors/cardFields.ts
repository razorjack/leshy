import type { KeyDetector } from "../../types.ts";
import { generators } from "../../generate/generators.ts";

// The card number is structural (Luhn); its companions are only recognisable
// by name. Together with the number they are enough to charge the card.
export const cardCode: KeyDetector = {
  id: "card-code",
  label: "Card security code",
  type: "card-code",
  kind: "key",
  enabled: true,
  keys: /^(?:cvv2?|cvc2?|csc|cid|card_?(?:code|verification\w*)|security_?code)$/i,
  generate: generators["card-code"],
};

export const cardExpiry: KeyDetector = {
  id: "card-expiry",
  label: "Card expiry",
  type: "card-expiry",
  kind: "key",
  enabled: true,
  keys: /^(?:card_?)?(?:exp(?:iry|iration|ires)?(?:_?date)?|exp_?(?:month|year|mm|yy)|valid_?(?:thru|until|to))$/i,
  generate: generators["card-expiry"],
};
