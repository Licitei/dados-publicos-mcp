import { Effect } from "effect";
import { getJson } from "../../kernel/http/client";
import { SubclassesPayload, flatten, subclassesUrl } from "./catalog";

export const fetchSubclasses = Effect.gen(function* () {
  const payload = yield* getJson(subclassesUrl, SubclassesPayload, {
    headers: { accept: "application/json" },
  });
  return flatten(payload);
});
