import { Effect } from "effect";
import { Http } from "../../kernel/http/client";
import {
  AgregadoPayload,
  mergeEconomia,
  pibAgregado,
  pibVariavel,
  populacaoAgregado,
  populacaoVariavel,
  serieUrl,
  valoresFor,
} from "./catalog";

const fetchValores = (agregado: number, ano: number, variavel: number) =>
  Effect.flatMap(Http, (http) =>
    http.json(serieUrl(agregado, ano, variavel), AgregadoPayload)
  ).pipe(Effect.map((payload) => valoresFor(payload, ano)));

export const fetchAno = (ano: number) =>
  Effect.all({
    populacoes: fetchValores(populacaoAgregado, ano, populacaoVariavel),
    pibs: fetchValores(pibAgregado, ano, pibVariavel),
  }).pipe(Effect.map(({ populacoes, pibs }) => mergeEconomia(ano, populacoes, pibs)));
