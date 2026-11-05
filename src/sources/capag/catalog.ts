import { Match, Schema } from "effect";
import * as Arr from "effect/Array";
import { dual, pipe } from "effect/Function";
import * as Option from "effect/Option";
import * as Order from "effect/Order";
import * as Str from "effect/String";
import type { CsvRecord } from "../../kernel/csv/parse";
import { indexByKey, pickFirst } from "../../kernel/csv/fields";
import { normalize, onlyDigits } from "../../kernel/text/normalize";

const ckanBase = "https://www.tesourotransparente.gov.br/ckan";

export const packageShowUrl = {
  estados: `${ckanBase}/api/3/action/package_show?id=capag-estados`,
  municipios: `${ckanBase}/api/3/action/package_show?id=capag-municipios`,
} as const;

export const siconfiEntesUrl = "https://apidatalake.tesouro.gov.br/ords/siconfi/tt/entes";

export const siconfiPageSize = 6_000;

export const csvOptions = { encoding: "utf-8", delimiter: ";" } as const;

const codigoIbgeLength = 7;

const looseText = Schema.optional(Schema.NullOr(Schema.Union([Schema.String, Schema.Finite])));

const CkanResource = Schema.Struct({
  name: looseText,
  format: looseText,
  url: Schema.String,
  last_modified: looseText,
  created: looseText,
});
type CkanResource = (typeof CkanResource)["Type"];

export const PackageShowPayload = Schema.Struct({
  success: Schema.optional(Schema.NullOr(Schema.Boolean)),
  result: Schema.optional(Schema.NullOr(Schema.Struct({ resources: Schema.Array(CkanResource) }))),
});
export type PackageShowPayload = (typeof PackageShowPayload)["Type"];

const SiconfiEnteRaw = Schema.Struct({
  cod_ibge: looseText,
  ente: Schema.optional(Schema.NullOr(Schema.String)),
  uf: Schema.optional(Schema.NullOr(Schema.String)),
  esfera: Schema.optional(Schema.NullOr(Schema.String)),
  regiao: Schema.optional(Schema.NullOr(Schema.String)),
  populacao: looseText,
  cnpj: looseText,
  exercicio: looseText,
});
type SiconfiEnteRaw = (typeof SiconfiEnteRaw)["Type"];

export const SiconfiEntesPayload = Schema.Struct({
  items: Schema.optional(Schema.NullOr(Schema.Array(SiconfiEnteRaw))),
  hasMore: Schema.optional(Schema.NullOr(Schema.Boolean)),
  offset: looseText,
  limit: looseText,
});
export type SiconfiEntesPayload = (typeof SiconfiEntesPayload)["Type"];

const Indicadores = Schema.Struct({
  indicador1: Schema.NullOr(Schema.Finite),
  nota1: Schema.NullOr(Schema.String),
  indicador2: Schema.NullOr(Schema.Finite),
  nota2: Schema.NullOr(Schema.String),
  indicador3: Schema.NullOr(Schema.Finite),
  nota3: Schema.NullOr(Schema.String),
});

const EstadoFlat = Schema.Struct({
  uf: Schema.String,
  ano: Schema.Finite,
  ...Indicadores.fields,
  capag: Schema.NullOr(Schema.String),
  qualidadeInfo: Schema.NullOr(Schema.String),
  observacao: Schema.NullOr(Schema.String),
});
type EstadoFlat = (typeof EstadoFlat)["Type"];

const MunicipioFlat = Schema.Struct({
  codIbge: Schema.String,
  nome: Schema.String,
  nomeNorm: Schema.String,
  uf: Schema.String,
  anoBase: Schema.Finite,
  posicao: Schema.NullOr(Schema.String),
  ...Indicadores.fields,
  capag: Schema.NullOr(Schema.String),
  busca: Schema.String,
});
type MunicipioFlat = (typeof MunicipioFlat)["Type"];

const EnteFlat = Schema.Struct({
  codIbge: Schema.String,
  ente: Schema.String,
  uf: Schema.NullOr(Schema.String),
  esfera: Schema.NullOr(Schema.String),
  regiao: Schema.NullOr(Schema.String),
  populacao: Schema.NullOr(Schema.Finite),
  cnpj: Schema.NullOr(Schema.String),
  exercicio: Schema.NullOr(Schema.Finite),
  busca: Schema.String,
});
type EnteFlat = (typeof EnteFlat)["Type"];

const CapagErrorCode = Schema.Literals([
  "capag.RESOURCE_MISSING",
  "capag.ENTE_NOT_FOUND",
  "capag.CNPJ_NOT_FOUND",
  "capag.MISSING_IDENTIFIER",
]);
type CapagErrorCode = (typeof CapagErrorCode)["Type"];

export class CapagError extends Schema.TaggedError<CapagError, { readonly brand: unique symbol }>()(
  "CapagError",
  {
    code: CapagErrorCode,
    dataset: Schema.optional(Schema.String),
    termo: Schema.optional(Schema.String),
    cnpj: Schema.optional(Schema.String),
  }
) {
  override get message() {
    switch (this.code) {
      case "capag.RESOURCE_MISSING":
        return `Nenhum recurso de CAPAG encontrado no CKAN para ${this.dataset}.`;
      case "capag.ENTE_NOT_FOUND":
        return `Ente nao encontrado na CAPAG: ${this.termo}.`;
      case "capag.CNPJ_NOT_FOUND":
        return `CNPJ nao encontrado no registro SICONFI de entes: ${this.cnpj}.`;
      case "capag.MISSING_IDENTIFIER":
        return "Informe ibge ou nome para consultar a CAPAG do ente.";
    }
  }
}

const toText = (value: string | number | null | undefined) =>
  pipe(
    Option.fromNullishOr(value),
    Option.map((present) => pipe(String(present), Str.trim)),
    Option.getOrElse(() => "")
  );

const toTextOrNull = (value: string | number | null | undefined) => {
  const text = toText(value);
  return text === "" ? null : text;
};

const parseIndicador = (raw: string | number | null | undefined) =>
  Match.value(raw).pipe(
    Match.when(Match.number, (value) => (Number.isFinite(value) ? value : null)),
    Match.orElse(() => {
      const trimmed = toText(raw);
      return Match.value(trimmed === "" || /^n\.?[de]\.?$/i.test(trimmed)).pipe(
        Match.when(true, () => null),
        Match.orElse(() => {
          const hasPercent = pipe(trimmed, Str.includes("%"));
          const cleaned = pipe(
            trimmed,
            Str.replace(/%/g, ""),
            Str.replace(/\s/g, ""),
            Str.replace(/,/g, ".")
          );
          const value = Number(cleaned);
          return Match.value(Number.isFinite(value)).pipe(
            Match.when(false, () => null),
            Match.orElse(() => (hasPercent ? value / 100 : value))
          );
        })
      );
    })
  );

const notasValidas = new Set(["A+", "A", "B+", "B", "C", "D", "n.d.", "n.e."]);

const parseNota = (raw: string | number | null | undefined) => {
  const trimmed = toText(raw);
  const lower = pipe(trimmed, Str.toLowerCase);
  return Match.value(notasValidas.has(trimmed)).pipe(
    Match.when(true, () => trimmed),
    Match.orElse(() =>
      Match.value(lower).pipe(
        Match.when("nd", () => "n.d."),
        Match.when("ne", () => "n.e."),
        Match.orElse(() => null)
      )
    )
  );
};

const extractYear = (name: string) =>
  pipe(
    name,
    Str.match(/\b(20\d{2})\b/),
    Option.flatMap(Arr.get(1)),
    Option.map(Number),
    Option.getOrNull
  );

const dateParts = (name: string, pattern: RegExp) =>
  pipe(
    name,
    Str.match(pattern),
    Option.flatMap((found) => Option.all([Arr.get(found, 1), Arr.get(found, 2), Arr.get(found, 3)]))
  );

export const extractPosicao = (name: string) =>
  pipe(
    dateParts(name, /\b(\d{2})\/(\d{2})\/(\d{4})\b/),
    Option.map(([day, month, year]) => `${year}-${month}-${day}`),
    Option.orElse(() =>
      pipe(
        dateParts(name, /\b(\d{4})-(\d{2})-(\d{2})\b/),
        Option.map(([year, month, day]) => `${year}-${month}-${day}`)
      )
    ),
    Option.getOrNull
  );

const resourceTime = (resource: CkanResource) => {
  const modified = toText(resource.last_modified);
  const value = modified === "" ? toText(resource.created) : modified;
  const parsed = value === "" ? Number.NaN : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const hasExtension = (resource: CkanResource, extension: string) =>
  pipe(toText(resource.url), Str.toLowerCase, Str.endsWith(`.${extension}`));

const matchesFormat = (resource: CkanResource, format: string, extension: string) =>
  pipe(toText(resource.format), Str.toUpperCase) === format || hasExtension(resource, extension);

const resourcesByFormat = (
  payload: PackageShowPayload,
  ceilingYear: number,
  format: string,
  extension: string
) =>
  pipe(
    payload.result?.resources ?? [],
    Arr.filter((resource) => matchesFormat(resource, format, extension)),
    Arr.map((resource) => {
      const name = toText(resource.name);
      const year = extractYear(name);
      return { resource, name, year };
    }),
    Arr.filter((entry) => entry.year === null || entry.year <= ceilingYear)
  );

const Candidate = Schema.Struct({
  resource: CkanResource,
  name: Schema.String,
  year: Schema.NullOr(Schema.Finite),
});
type Candidate = (typeof Candidate)["Type"];

const candidateOrder = Order.combineAll([
  Order.flip(Order.mapInput(Order.Number, (entry: Candidate) => entry.year ?? 0)),
  Order.flip(Order.mapInput(Order.String, (entry: Candidate) => extractPosicao(entry.name) ?? "")),
  Order.flip(Order.mapInput(Order.Number, (entry: Candidate) => resourceTime(entry.resource))),
]);

const latestResource = (candidates: readonly Candidate[]) =>
  pipe(candidates, Arr.sort(candidateOrder), Arr.head, Option.getOrUndefined);

const resourceLookup = (
  format: string,
  extension: string
): {
  (ceilingYear: number): (payload: PackageShowPayload) => Candidate | undefined;
  (payload: PackageShowPayload, ceilingYear: number): Candidate | undefined;
} =>
  dual(2, (payload: PackageShowPayload, ceilingYear: number) =>
    latestResource(resourcesByFormat(payload, ceilingYear, format, extension))
  );

export const latestCsvResource = resourceLookup("CSV", "csv");

export const latestXlsxResource = resourceLookup("XLSX", "xlsx");

const estadoKeys = {
  uf: ["UF", "Sigla", "Ente"],
  indicador1: ["Indicador 1", "Indicador1", "IND1"],
  nota1: ["Nota 1", "Nota1"],
  indicador2: ["Indicador 2", "Indicador2", "IND2"],
  nota2: ["Nota 2", "Nota2"],
  indicador3: ["Indicador 3", "Indicador3", "IND3"],
  nota3: ["Nota 3", "Nota3"],
  capag: ["Classificacao da CAPAG", "CAPAG", "Capag", "Nota CAPAG"],
  qualidadeInfo: ["Qualidade da Informacao", "Qualidade"],
  observacao: ["Observacao", "Observacoes"],
} as const;

const isUf = (value: string) => /^[A-Z]{2}$/.test(value);

export const mapEstados: {
  (ano: number): (records: readonly CsvRecord[]) => EstadoFlat[];
  (records: readonly CsvRecord[], ano: number): EstadoFlat[];
} = dual(2, (records: readonly CsvRecord[], ano: number): EstadoFlat[] =>
  pipe(
    records,
    Arr.flatMap((record) => {
      const lookup = indexByKey(record);
      const uf = pipe(pickFirst(lookup, estadoKeys.uf), Str.toUpperCase);
      return Match.value(isUf(uf)).pipe(
        Match.when(false, (): EstadoFlat[] => []),
        Match.orElse((): EstadoFlat[] => [
          {
            uf,
            ano,
            indicador1: parseIndicador(pickFirst(lookup, estadoKeys.indicador1)),
            nota1: parseNota(pickFirst(lookup, estadoKeys.nota1)),
            indicador2: parseIndicador(pickFirst(lookup, estadoKeys.indicador2)),
            nota2: parseNota(pickFirst(lookup, estadoKeys.nota2)),
            indicador3: parseIndicador(pickFirst(lookup, estadoKeys.indicador3)),
            nota3: parseNota(pickFirst(lookup, estadoKeys.nota3)),
            capag: parseNota(pickFirst(lookup, estadoKeys.capag)),
            qualidadeInfo: toTextOrNull(pickFirst(lookup, estadoKeys.qualidadeInfo)),
            observacao: toTextOrNull(pickFirst(lookup, estadoKeys.observacao)),
          },
        ])
      );
    })
  )
);

const normalizeCodIbge = (raw: string) => {
  const digits = onlyDigits(raw);
  return digits.length >= 6 && digits.length <= codigoIbgeLength
    ? pipe(digits, Str.padStart(codigoIbgeLength, "0"))
    : null;
};

const enteCodIbge = (raw: string) => {
  const digits = onlyDigits(raw);
  return digits.length === 0
    ? null
    : digits.length <= 2
      ? digits
      : pipe(digits, Str.padStart(codigoIbgeLength, "0"));
};

const municipiosSheetPrefix = "CAPAG Ano Base";

export const matchMunicipiosSheet = (name: string) =>
  pipe(normalize(name), Str.startsWith(normalize(municipiosSheetPrefix)));

const municipiosXlsxColumns = {
  codIbge: 0,
  nome: 1,
  uf: 2,
  indicador1: 5,
  nota1: 6,
  indicador2: 34,
  nota2: 36,
  indicador3: 63,
  nota3: 66,
  capag: 69,
} as const;

const cell = (row: readonly string[], index: number) => pipe(row[index] ?? "", Str.trim);

export const mapMunicipiosRows: {
  (
    anoBase: number,
    posicao: string | null
  ): (rows: readonly (readonly string[])[]) => MunicipioFlat[];
  (rows: readonly (readonly string[])[], anoBase: number, posicao: string | null): MunicipioFlat[];
} = dual(
  3,
  (
    rows: readonly (readonly string[])[],
    anoBase: number,
    posicao: string | null
  ): MunicipioFlat[] =>
    pipe(
      rows,
      Arr.flatMap((row) => {
        const codIbge = normalizeCodIbge(cell(row, municipiosXlsxColumns.codIbge));
        const uf = pipe(cell(row, municipiosXlsxColumns.uf), Str.toUpperCase);
        return Match.value(codIbge === null || !isUf(uf)).pipe(
          Match.when(true, (): MunicipioFlat[] => []),
          Match.orElse((): MunicipioFlat[] => {
            const nome = cell(row, municipiosXlsxColumns.nome);
            const nomeNorm = normalize(nome);
            return [
              {
                codIbge: codIbge ?? "",
                nome,
                nomeNorm,
                uf,
                anoBase,
                posicao,
                indicador1: parseIndicador(cell(row, municipiosXlsxColumns.indicador1)),
                nota1: parseNota(cell(row, municipiosXlsxColumns.nota1)),
                indicador2: parseIndicador(cell(row, municipiosXlsxColumns.indicador2)),
                nota2: parseNota(cell(row, municipiosXlsxColumns.nota2)),
                indicador3: parseIndicador(cell(row, municipiosXlsxColumns.indicador3)),
                nota3: parseNota(cell(row, municipiosXlsxColumns.nota3)),
                capag: parseNota(cell(row, municipiosXlsxColumns.capag)),
                busca: nomeNorm,
              },
            ];
          })
        );
      })
    )
);

const toIntOrNull = (raw: string | number | null | undefined) => {
  const value = parseIndicador(raw);
  return value === null ? null : Math.trunc(value);
};

const cnpjOrNull = (raw: string | number | null | undefined) => {
  const digits = onlyDigits(toText(raw));
  return digits.length === 14 ? digits : null;
};

const upperOrNull = (raw: string | null | undefined) => {
  const text = toTextOrNull(raw);
  return text === null ? null : pipe(text, Str.toUpperCase);
};

export const mapEntes = (raws: readonly SiconfiEnteRaw[]) => {
  const byCod = pipe(
    raws,
    Arr.reduce(new Map<string, EnteFlat>(), (acc, raw) => {
      const codIbge = enteCodIbge(toText(raw.cod_ibge));
      const ente = toText(raw.ente);
      return Match.value(codIbge === null || ente === "").pipe(
        Match.when(true, () => acc),
        Match.orElse(() => {
          const exercicio = toIntOrNull(raw.exercicio);
          const prev = acc.get(codIbge ?? "");
          const keep = prev === undefined || (exercicio ?? 0) >= (prev.exercicio ?? 0);
          return Match.value(keep).pipe(
            Match.when(false, () => acc),
            Match.orElse(() =>
              acc.set(codIbge ?? "", {
                codIbge: codIbge ?? "",
                ente,
                uf: upperOrNull(raw.uf),
                esfera: toTextOrNull(raw.esfera),
                regiao: upperOrNull(raw.regiao),
                populacao: toIntOrNull(raw.populacao),
                cnpj: cnpjOrNull(raw.cnpj),
                exercicio,
                busca: normalize(ente),
              })
            )
          );
        })
      );
    })
  );
  return [...byCod.values()];
};
