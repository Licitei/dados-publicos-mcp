import { Effect, Schema } from "effect";
import * as Arr from "effect/Array";
import { Http, HttpError } from "../../kernel/http/client";
import { parseCsvRecords } from "../../kernel/csv/parse";
import { indexByKey, intBr, pickFirst } from "../../kernel/csv/fields";
import { publicDocument } from "../../kernel/text/document";
import { normalize, onlyDigits } from "../../kernel/text/normalize";
import { ListaSujaError, ListaSujaRow, listaSujaUrl } from "./catalog";

export const loadListaSuja = Effect.gen(function* () {
  const http = yield* Http;
  const bytes = yield* http.bytes(listaSujaUrl, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 dados-publicos-mcp/0.1.0",
      accept: "text/csv,text/plain;q=0.9,*/*;q=0.8",
      "accept-language": "pt-BR,pt;q=0.9",
    },
  });
  const rows = yield* Effect.forEach(
    parseCsvRecords(bytes, { delimiter: ";", encoding: "latin1" }),
    (row, position) => {
      const fields = indexByKey(row);
      const pick = (...names: readonly string[]) => pickFirst(fields, names);
      const documento = publicDocument(pick("CNPJ/CPF", "CPF/CNPJ"));
      const nome = pick("Empregador");
      return Schema.decodeEffect(ListaSujaRow)({
        id: pick("ID") || String(position),
        anoFiscalizacao: intBr(pick("Ano da ação fiscal")),
        uf: pick("UF"),
        nome,
        documento,
        cnpj: onlyDigits(documento).length === 14 ? onlyDigits(documento) : null,
        estabelecimento: pick("Estabelecimento"),
        trabalhadores: intBr(pick("Trabalhadores envolvidos")),
        cnae: onlyDigits(pick("CNAE")),
        dataDecisao: pick("Decisão administrativa de procedência"),
        inclusao: pick("Inclusão no Cadastro de Empregadores"),
        fonte: listaSujaUrl,
        busca: normalize(nome),
      });
    }
  );
  return yield* Arr.isReadonlyArrayNonEmpty(rows)
    ? Effect.succeed(rows)
    : Effect.fail(ListaSujaError.make({ code: "mte.EMPTY" }));
}).pipe(
  Effect.mapError((cause) =>
    Schema.is(ListaSujaError)(cause)
      ? cause
      : ListaSujaError.make({
          code: Schema.is(HttpError)(cause)
            ? cause.status === 403
              ? "mte.BLOCKED"
              : "mte.DOWNLOAD"
            : "mte.PARSE",
          cause: String(cause),
        })
  )
);
