import type { KeyDetector } from "../../types.ts";
import { generators } from "../../generate/generators.ts";

// A login is an identity of its own shape: `jdoe42`, not `John Doe`. Declared
// before `person`, whose `_name` pattern would otherwise claim `username`.
export const username: KeyDetector = {
  id: "username",
  label: "Username",
  type: "username",
  kind: "key",
  enabled: true,
  keys: /^(?:user_?name|login|nick(?:_?name)?|handle|screen_?name|user)$/i,
  generate: generators.username,
};
