import { Effect } from "effect";
import { Http } from "../../kernel/http/client";
import { SubclassesPayload, flatten, subclassesUrl } from "./catalog";

export const fetchSubclasses = Effect.gen(function* () {
  const http = yield* Http;
  const payload = yield* http.json(subclassesUrl, SubclassesPayload, {
    headers: { accept: "application/json" },
  });
  return flatten(payload);
});
