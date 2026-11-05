import { Effect, Schema } from "effect";
import * as Arr from "effect/Array";
import { Http } from "../../kernel/http/client";
import { parseCsvRecords } from "../../kernel/csv/parse";
import { indexByKey, pickFirst } from "../../kernel/csv/fields";
import { unzipEntries, type ZipEntry } from "../../kernel/zip/archive";
import { normalize, onlyDigits } from "../../kernel/text/normalize";
import { CvmCadastroRow, CvmProcessoRow, CvmAcusadoRow, CvmError, cvmUrls } from "./catalog";

export const loadCvm = Effect.gen(function* () {
  const http = yield* Http;
  const download = (url: string) =>
    http
      .bytes(url)
      .pipe(
        Effect.mapError((cause) => CvmError.make({ code: "cvm.DOWNLOAD", cause: cause.message }))
      );
  const cadastro = (url: string) =>
    download(url).pipe(
      Effect.flatMap((bytes) =>
        Effect.forEach(
          parseCsvRecords(bytes, { delimiter: ";", encoding: "latin1" }),
          (row, position) => {
            const indexed = indexByKey(row);
            const nome = pickFirst(indexed, ["DENOM_SOCIAL"]);
            return Schema.decodeEffect(CvmCadastroRow)({
              id: String(position),
              cnpj: onlyDigits(pickFirst(indexed, ["CNPJ_CIA", "CNPJ_FUNDO"])),
              nome,
              registro: pickFirst(indexed, ["CD_CVM", "CODIGO_CVM"]),
              situacao: pickFirst(indexed, ["SIT", "SIT_REG"]),
              dataRegistro: pickFirst(indexed, ["DT_REG"]),
              fonte: url,
              busca: normalize(nome),
            });
          }
        )
      )
    );
  const companhias = yield* cadastro(cvmUrls.companhia);
  const fundos = yield* cadastro(cvmUrls.fundo);
  const bytes = yield* download(cvmUrls.processos);
  const entries = yield* unzipEntries(bytes, (name) =>
    /processo_sancionador(?:_acusado)?\.csv$/i.test(name)
  );
  const processRows = Arr.flatMap(
    Arr.filter(entries, (entry: ZipEntry) =>
      /(?:^|\/)processo_sancionador\.csv$/i.test(entry.name)
    ),
    (entry: ZipEntry) => parseCsvRecords(entry.data, { delimiter: ";", encoding: "latin1" })
  );
  const accusedRows = Arr.flatMap(
    Arr.filter(entries, (entry: ZipEntry) =>
      /processo_sancionador_acusado\.csv$/i.test(entry.name)
    ),
    (entry: ZipEntry) => parseCsvRecords(entry.data, { delimiter: ";", encoding: "latin1" })
  );
  const processos = yield* Effect.forEach(processRows, (row) => {
    const indexed = indexByKey(row);
    const nup = pickFirst(indexed, ["NUP"]);
    const objeto = pickFirst(indexed, ["Objeto"]);
    const ementa = pickFirst(indexed, ["Ementa"]);
    return Schema.decodeEffect(CvmProcessoRow)({
      id: nup,
      nup,
      objeto,
      ementa,
      dataAbertura: pickFirst(indexed, ["Data_Abertura"]),
      fase: pickFirst(indexed, ["Fase_Atual"]),
      subfase: pickFirst(indexed, ["Subfase_Atual"]),
      dataMovimentacao: pickFirst(indexed, ["Data_Ultima_Movimentacao"]),
      fonte: cvmUrls.processos,
      busca: normalize(`${objeto} ${ementa}`),
    });
  });
  const acusados = yield* Effect.forEach(accusedRows, (row, position) => {
    const indexed = indexByKey(row);
    const nup = pickFirst(indexed, ["NUP"]);
    const nome = pickFirst(indexed, ["Nome_Acusado"]);
    return Schema.decodeEffect(CvmAcusadoRow)({
      id: `${nup}:${position}`,
      nup,
      nome,
      situacao: pickFirst(indexed, ["Situacao"]),
      dataSituacao: pickFirst(indexed, ["Data_Situacao"]),
      fonte: cvmUrls.processos,
      busca: normalize(nome),
    });
  });
  yield* Arr.every([companhias, fundos, processos, acusados], (rows) => rows.length > 0)
    ? Effect.void
    : Effect.fail(CvmError.make({ code: "cvm.EMPTY" }));
  return { companhias, fundos, processos, acusados };
}).pipe(
  Effect.mapError((cause) =>
    Schema.is(CvmError)(cause) ? cause : CvmError.make({ code: "cvm.PARSE", cause: String(cause) })
  )
);
