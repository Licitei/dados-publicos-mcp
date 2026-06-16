import { Effect } from "effect";
import { getJson } from "../../kernel/http/client";
import { MunicipiosPayload, flatten, municipiosUrl } from "./catalog";

export const fetchMunicipios = Effect.gen(function* () {
  const payload = yield* getJson(municipiosUrl, MunicipiosPayload, {
    headers: { accept: "application/json" },
  });
  return yield* flatten(payload);
});
