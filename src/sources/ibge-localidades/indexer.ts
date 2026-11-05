import { Effect } from "effect";
import { Http } from "../../kernel/http/client";
import { MunicipiosPayload, flatten, municipiosUrl } from "./catalog";

export const fetchMunicipios = Effect.gen(function* () {
  const http = yield* Http;
  const payload = yield* http.json(municipiosUrl, MunicipiosPayload, {
    headers: { accept: "application/json" },
  });
  return yield* flatten(payload);
});
