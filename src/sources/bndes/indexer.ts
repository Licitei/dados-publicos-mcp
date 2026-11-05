import { Effect, Schema } from "effect";
import * as Arr from "effect/Array";
import * as Str from "effect/String";
import { Http, HttpError } from "../../kernel/http/client";
import { parseCsvRecords } from "../../kernel/csv/parse";
import { indexByKey, intBr, numeroBr, pickFirst } from "../../kernel/csv/fields";
import { normalize, onlyDigits } from "../../kernel/text/normalize";
import { publicDocument } from "../../kernel/text/document";
import { BndesError, BndesOperacaoRow, BndesEnteRow, CkanPackage, bndesDatasets } from "./catalog";

export const loadBndes = Effect.gen(function* () {
  const http = yield* Http;
  const results = yield* Effect.forEach(
    bndesDatasets,
    (dataset) =>
      Effect.gen(function* () {
        const metadata = yield* http.json(
          `https://dadosabertos.bndes.gov.br/api/3/action/package_show?id=${dataset.package}`,
          CkanPackage
        );
        const resource = yield* Effect.fromOption(
          Arr.findFirst(
            metadata.result.resources,
            (entry) =>
              Str.toUpperCase(entry.format) === "CSV" &&
              Str.includes(dataset.resource)(normalize(entry.name))
          )
        ).pipe(Effect.mapError(() => BndesError.make({ code: "bndes.RESOURCE" })));
        yield* Str.startsWith("https://dadosabertos.bndes.gov.br/dataset/")(resource.url)
          ? Effect.void
          : Effect.fail(BndesError.make({ code: "bndes.RESOURCE" }));
        const bytes = yield* http.bytes(resource.url, { timeoutMs: 120000 });
        const raw = parseCsvRecords(bytes, { delimiter: ";", encoding: "windows-1252" });
        yield* Arr.isReadonlyArrayNonEmpty(raw)
          ? Effect.void
          : Effect.fail(BndesError.make({ code: "bndes.EMPTY" }));
        return { dataset: dataset.key, url: resource.url, raw };
      }),
    { concurrency: 1 }
  );
  const operations = Arr.flatMap(results, (result) =>
    result.dataset === "nao_automaticas"
      ? Arr.map(result.raw, (row, position) => ({ row, url: result.url, position }))
      : []
  );
  const publicEntities = Arr.flatMap(results, (result) =>
    result.dataset === "entes_publicos"
      ? Arr.map(result.raw, (row, position) => ({ row, url: result.url, position }))
      : []
  );
  const operacoes = yield* Effect.forEach(operations, ({ row, url, position }) => {
    const fields = indexByKey(row);
    const pick = (...names: readonly string[]) => pickFirst(fields, names);
    const documento = publicDocument(pick("cnpj"));
    const nome = pick("cliente");
    const descricao = pick("descricao_do_projeto");
    return Schema.decodeEffect(BndesOperacaoRow)({
      id: String(position),
      documento,
      cnpj: onlyDigits(documento).length === 14 ? onlyDigits(documento) : null,
      nome,
      descricao,
      uf: pick("uf"),
      municipio: pick("municipio"),
      codigoIbge: pick("municipio_codigo"),
      contrato: pick("numero_do_contrato"),
      dataContratacao: pick("data_da_contratacao"),
      valorContratado: numeroBr(pick("valor_contratado_reais")),
      valorDesembolsado: numeroBr(pick("valor_desembolsado_reais")),
      custoFinanceiro: pick("custo_financeiro"),
      juros: numeroBr(pick("juros")),
      carenciaMeses: intBr(pick("prazo_carencia_meses")),
      amortizacaoMeses: intBr(pick("prazo_amortizacao_meses")),
      produto: pick("produto"),
      setorCnae: pick("subsetor_cnae_codigo"),
      porte: pick("porte_do_cliente"),
      natureza: pick("natureza_do_cliente"),
      situacao: pick("situacao_do_contrato"),
      fonte: url,
      busca: normalize(`${nome} ${descricao}`),
    });
  });
  const entes = yield* Effect.forEach(publicEntities, ({ row, url, position }) => {
    const fields = indexByKey(row);
    const pick = (...names: readonly string[]) => pickFirst(fields, names);
    const nome = pick("ente_publico");
    const objetivo = pick("objetivo_do_projeto");
    return Schema.decodeEffect(BndesEnteRow)({
      id: String(position),
      nome,
      uf: pick("uf"),
      municipio: pick("municipio"),
      programa: pick("programa"),
      modalidade: pick("modalidade_operacional"),
      dataNivelAtual: pick("data_do_nivel_atual"),
      nivelAtual: pick("nivel_atual"),
      valorOperacao: numeroBr(pick("valor_da_operacao_historico_em_reais")),
      valorDesembolsado: numeroBr(pick("valor_desembolsado_em_reais")),
      saldoLiberar: numeroBr(pick("saldo_a_liberar_atualizado_em_reais")),
      objetivo,
      situacao: pick("situacao_da_operacao"),
      fonte: url,
      busca: normalize(`${nome} ${objetivo}`),
    });
  });
  return { operacoes, entes };
}).pipe(
  Effect.mapError((cause) =>
    Schema.is(BndesError)(cause)
      ? cause
      : BndesError.make({
          code: Schema.is(HttpError)(cause) ? "bndes.DOWNLOAD" : "bndes.PARSE",
          cause: String(cause),
        })
  )
);
