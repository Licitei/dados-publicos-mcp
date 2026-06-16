import { Match, Schema } from "effect";
import { normalize, onlyDigits } from "../../kernel/text/normalize";

export const ckanBase = "https://www.tesourotransparente.gov.br/ckan";

export const packageShowUrl = {
  estados: `${ckanBase}/api/3/action/package_show?id=capag-estados`,
  municipios: `${ckanBase}/api/3/action/package_show?id=capag-municipios`,
} as const;

export const siconfiEntesUrl =
  "https://apidatalake.tesouro.gov.br/ords/siconfi/tt/entes";

export const siconfiPageSize = 6_000;

export const csvOptions = { encoding: "utf-8", delimiter: ";" } as const;

export const codigoIbgeLength = 7;

const looseText = Schema.optional(
  Schema.NullOr(Schema.Union([Schema.String, Schema.Number]))
);

const CkanResource = Schema.Struct({
  name: looseText,
  format: looseText,
  url: Schema.String,
  last_modified: looseText,
  created: looseText,
});
export type CkanResource = (typeof CkanResource)["Type"];

export const PackageShowPayload = Schema.Struct({
  success: Schema.optional(Schema.NullOr(Schema.Boolean)),
  result: Schema.optional(
    Schema.NullOr(
      Schema.Struct({ resources: Schema.Array(CkanResource) })
    )
  ),
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
export type SiconfiEnteRaw = (typeof SiconfiEnteRaw)["Type"];

export const SiconfiEntesPayload = Schema.Struct({
  items: Schema.optional(Schema.NullOr(Schema.Array(SiconfiEnteRaw))),
  hasMore: Schema.optional(Schema.NullOr(Schema.Boolean)),
  offset: looseText,
  limit: looseText,
});
export type SiconfiEntesPayload = (typeof SiconfiEntesPayload)["Type"];

export const EstadoFlat = Schema.Struct({
  uf: Schema.String,
  ano: Schema.Number,
  indicador1: Schema.NullOr(Schema.Number),
  nota1: Schema.NullOr(Schema.String),
  indicador2: Schema.NullOr(Schema.Number),
  nota2: Schema.NullOr(Schema.String),
  indicador3: Schema.NullOr(Schema.Number),
  nota3: Schema.NullOr(Schema.String),
  capag: Schema.NullOr(Schema.String),
  qualidadeInfo: Schema.NullOr(Schema.String),
  observacao: Schema.NullOr(Schema.String),
});
export type EstadoFlat = (typeof EstadoFlat)["Type"];

export const MunicipioFlat = Schema.Struct({
  codIbge: Schema.String,
  nome: Schema.String,
  nomeNorm: Schema.String,
  uf: Schema.String,
  anoBase: Schema.Number,
  posicao: Schema.NullOr(Schema.String),
  indicador1: Schema.NullOr(Schema.Number),
  nota1: Schema.NullOr(Schema.String),
  indicador2: Schema.NullOr(Schema.Number),
  nota2: Schema.NullOr(Schema.String),
  indicador3: Schema.NullOr(Schema.Number),
  nota3: Schema.NullOr(Schema.String),
  capag: Schema.NullOr(Schema.String),
  busca: Schema.String,
});
export type MunicipioFlat = (typeof MunicipioFlat)["Type"];

export const EnteFlat = Schema.Struct({
  codIbge: Schema.String,
  ente: Schema.String,
  uf: Schema.NullOr(Schema.String),
  esfera: Schema.NullOr(Schema.String),
  regiao: Schema.NullOr(Schema.String),
  populacao: Schema.NullOr(Schema.Number),
  cnpj: Schema.NullOr(Schema.String),
  exercicio: Schema.NullOr(Schema.Number),
  busca: Schema.String,
});
export type EnteFlat = (typeof EnteFlat)["Type"];

export const CapagErrorCode = Schema.Literals([
  "capag.RESOURCE_MISSING",
  "capag.ENTE_NOT_FOUND",
  "capag.CNPJ_NOT_FOUND",
  "capag.MISSING_IDENTIFIER",
]);
export type CapagErrorCode = (typeof CapagErrorCode)["Type"];

export class CapagError extends Schema.TaggedErrorClass<CapagError>()(
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
  value === null || value === undefined ? "" : String(value).trim();

const toTextOrNull = (value: string | number | null | undefined) =>
  toText(value) || null;

export const parseIndicador = (raw: string | number | null | undefined) =>
  Match.value(raw).pipe(
    Match.when(Match.number, (value) =>
      Number.isFinite(value) ? value : null
    ),
    Match.orElse(() => {
      const trimmed = toText(raw);
      return Match.value(
        trimmed === "" || /^n\.?[de]\.?$/i.test(trimmed)
      ).pipe(
        Match.when(true, () => null),
        Match.orElse(() => {
          const hasPercent = trimmed.includes("%");
          const cleaned = trimmed
            .replace(/%/g, "")
            .replace(/\s/g, "")
            .replace(/,/g, ".");
          const value = Number(cleaned);
          return Match.value(Number.isFinite(value)).pipe(
            Match.when(false, () => null),
            Match.orElse(() => (hasPercent ? value / 100 : value))
          );
        })
      );
    })
  );

const notasValidas = new Set([
  "A+",
  "A",
  "B+",
  "B",
  "C",
  "D",
  "n.d.",
  "n.e.",
]);

export const parseNota = (raw: string | number | null | undefined) => {
  const trimmed = toText(raw);
  const lower = trimmed.toLowerCase();
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

export const extractYear = (name: string) => {
  const match = name.match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : null;
};

export const extractPosicao = (name: string) => {
  const br = name.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
  const iso = name.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  return br
    ? `${br[3]}-${br[2]}-${br[1]}`
    : iso
      ? `${iso[1]}-${iso[2]}-${iso[3]}`
      : null;
};

const resourceTime = (resource: CkanResource) => {
  const value = toText(resource.last_modified) || toText(resource.created);
  const parsed = value === "" ? Number.NaN : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const hasExtension = (resource: CkanResource, extension: string) =>
  toText(resource.url).toLowerCase().endsWith(`.${extension}`);

const matchesFormat = (
  resource: CkanResource,
  format: string,
  extension: string
) =>
  toText(resource.format).toUpperCase() === format ||
  hasExtension(resource, extension);

const resourcesByFormat = (
  payload: PackageShowPayload,
  ceilingYear: number,
  format: string,
  extension: string
) =>
  (payload.result?.resources ?? [])
    .filter((resource) => matchesFormat(resource, format, extension))
    .map((resource) => {
      const name = toText(resource.name);
      const year = extractYear(name);
      return { resource, name, year };
    })
    .filter((entry) => entry.year === null || entry.year <= ceilingYear);

const latestResource = (
  candidates: ReturnType<typeof resourcesByFormat>
) =>
  [...candidates].sort((a, b) => {
    const ya = a.year ?? 0;
    const yb = b.year ?? 0;
    return yb !== ya
      ? yb - ya
      : (extractPosicao(b.name) ?? "").localeCompare(
          extractPosicao(a.name) ?? ""
        ) ||
        resourceTime(b.resource) - resourceTime(a.resource);
  })[0];

export const latestCsvResource = (
  payload: PackageShowPayload,
  ceilingYear: number
) => latestResource(resourcesByFormat(payload, ceilingYear, "CSV", "csv"));

export const latestXlsxResource = (
  payload: PackageShowPayload,
  ceilingYear: number
) => latestResource(resourcesByFormat(payload, ceilingYear, "XLSX", "xlsx"));

const headerKey = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const headerLookup = (record: Record<string, string>) =>
  new Map(
    Object.entries(record).map(([key, value]) => [
      headerKey(key),
      (value ?? "").trim(),
    ])
  );

const field = (lookup: Map<string, string>, keys: readonly string[]) =>
  keys.map((key) => lookup.get(headerKey(key)) ?? "").find((v) => v !== "") ??
  "";

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

export const mapEstados = (
  records: readonly Record<string, string>[],
  ano: number
) =>
  records.flatMap((record) => {
    const lookup = headerLookup(record);
    const uf = field(lookup, estadoKeys.uf).toUpperCase();
    return Match.value(isUf(uf)).pipe(
      Match.when(false, () => []),
      Match.orElse(() => [
        {
          uf,
          ano,
          indicador1: parseIndicador(field(lookup, estadoKeys.indicador1)),
          nota1: parseNota(field(lookup, estadoKeys.nota1)),
          indicador2: parseIndicador(field(lookup, estadoKeys.indicador2)),
          nota2: parseNota(field(lookup, estadoKeys.nota2)),
          indicador3: parseIndicador(field(lookup, estadoKeys.indicador3)),
          nota3: parseNota(field(lookup, estadoKeys.nota3)),
          capag: parseNota(field(lookup, estadoKeys.capag)),
          qualidadeInfo: toTextOrNull(field(lookup, estadoKeys.qualidadeInfo)),
          observacao: toTextOrNull(field(lookup, estadoKeys.observacao)),
        } satisfies EstadoFlat,
      ])
    );
  });

const normalizeCodIbge = (raw: string) => {
  const digits = onlyDigits(raw);
  return digits.length >= 6 && digits.length <= codigoIbgeLength
    ? digits.padStart(codigoIbgeLength, "0")
    : null;
};

const enteCodIbge = (raw: string) => {
  const digits = onlyDigits(raw);
  return digits.length === 0
    ? null
    : digits.length <= 2
      ? digits
      : digits.padStart(codigoIbgeLength, "0");
};

export const municipiosSheetPrefix = "CAPAG Ano Base";

export const matchMunicipiosSheet = (name: string) =>
  normalize(name).startsWith(normalize(municipiosSheetPrefix));

export const municipiosXlsxColumns = {
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

const cell = (row: readonly string[], index: number) =>
  (row[index] ?? "").trim();

export const mapMunicipiosRows = (
  rows: readonly (readonly string[])[],
  anoBase: number,
  posicao: string | null
) =>
  rows.flatMap((row) => {
    const codIbge = normalizeCodIbge(cell(row, municipiosXlsxColumns.codIbge));
    const uf = cell(row, municipiosXlsxColumns.uf).toUpperCase();
    return Match.value(codIbge === null || !isUf(uf)).pipe(
      Match.when(true, () => []),
      Match.orElse(() => {
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
          } satisfies MunicipioFlat,
        ];
      })
    );
  });

const toIntOrNull = (raw: string | number | null | undefined) => {
  const value = parseIndicador(raw);
  return value === null ? null : Math.trunc(value);
};

const cnpjOrNull = (raw: string | number | null | undefined) => {
  const digits = onlyDigits(toText(raw));
  return digits.length === 14 ? digits : null;
};

export const mapEntes = (raws: readonly SiconfiEnteRaw[]) => {
  const byCod = raws.reduce<Map<string, EnteFlat>>((acc, raw) => {
    const codIbge = enteCodIbge(toText(raw.cod_ibge));
    const ente = toText(raw.ente);
    return Match.value(codIbge === null || ente === "").pipe(
      Match.when(true, () => acc),
      Match.orElse(() => {
        const exercicio = toIntOrNull(raw.exercicio);
        const prev = acc.get(codIbge ?? "");
        const keep =
          prev === undefined || (exercicio ?? 0) >= (prev.exercicio ?? 0);
        return Match.value(keep).pipe(
          Match.when(false, () => acc),
          Match.orElse(() =>
            acc.set(codIbge ?? "", {
              codIbge: codIbge ?? "",
              ente,
              uf: toTextOrNull(raw.uf)?.toUpperCase() ?? null,
              esfera: toTextOrNull(raw.esfera),
              regiao: toTextOrNull(raw.regiao)?.toUpperCase() ?? null,
              populacao: toIntOrNull(raw.populacao),
              cnpj: cnpjOrNull(raw.cnpj),
              exercicio,
              busca: normalize(ente),
            })
          )
        );
      })
    );
  }, new Map());
  return [...byCod.values()];
};
