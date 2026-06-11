import { Result, panic, type Result as ResultType } from "better-result";
import type { EvlogError } from "evlog";
import { z } from "zod";
import { normalize } from "../../core/normalize";
import { createJsonStore } from "../../core/store/json-store";
import { dominio } from "./catalog";

export type StoreError = EvlogError;

/**
 * Municipio achatado para o indice local. O `id` e mantido como STRING de 7
 * digitos (preservando zeros a esquerda). `mesorregiao_*` podem ser null para
 * o municipio recente (5101837) cujo microrregiao vem null da API.
 */
export type MunicipioIndexado = {
  id: string;
  nome: string;
  nome_normalizado: string;
  uf_sigla: string;
  uf_id: number;
  uf_nome: string;
  mesorregiao_id: number | null;
  mesorregiao_nome: string | null;
  regiao_sigla: string;
};

export type IndiceIbgeLocalidades = {
  versao: 1;
  criadoEm: string;
  fonte: "ibge-localidades";
  municipios: MunicipioIndexado[];
};

// ---------------------------------------------------------------------------
// Schemas zod do payload bruto da API (apenas os campos usados)
// ---------------------------------------------------------------------------

const ufRawSchema = z.object({
  id: z.number(),
  sigla: z.string(),
  nome: z.string(),
  regiao: z.object({
    id: z.number(),
    sigla: z.string(),
    nome: z.string(),
  }),
});

const microrregiaoRawSchema = z
  .object({
    id: z.number(),
    nome: z.string(),
    mesorregiao: z.object({
      id: z.number(),
      nome: z.string(),
      UF: ufRawSchema,
    }),
  })
  .nullable();

const regiaoImediataRawSchema = z
  .object({
    id: z.number(),
    nome: z.string(),
    "regiao-intermediaria": z.object({
      id: z.number(),
      nome: z.string(),
      UF: ufRawSchema,
    }),
  })
  .optional();

export const municipioRawSchema = z.object({
  id: z.number(),
  nome: z.string(),
  microrregiao: microrregiaoRawSchema,
  "regiao-imediata": regiaoImediataRawSchema,
});

export type MunicipioRaw = z.infer<typeof municipioRawSchema>;

// ---------------------------------------------------------------------------
// Achatamento (flatten) do payload bruto -> registro do indice
// ---------------------------------------------------------------------------

/** Codigo IBGE de municipio tem 7 digitos; preserva zeros a esquerda. */
export function formatCodigoIbge(id: number): string {
  return String(id).padStart(7, "0");
}

/**
 * Achata um municipio bruto. Usa o path principal microrregiao.mesorregiao.UF;
 * quando microrregiao e null, faz fallback para regiao-imediata.
 * regiao-intermediaria.UF (UF/regiao preservadas, mesorregiao fica null).
 */
export function flattenMunicipio(raw: MunicipioRaw): MunicipioIndexado {
  const micro = raw.microrregiao;

  if (micro) {
    const uf = micro.mesorregiao.UF;

    return {
      id: formatCodigoIbge(raw.id),
      nome: raw.nome,
      nome_normalizado: normalize(raw.nome),
      uf_sigla: uf.sigla,
      uf_id: uf.id,
      uf_nome: uf.nome,
      mesorregiao_id: micro.mesorregiao.id,
      mesorregiao_nome: micro.mesorregiao.nome,
      regiao_sigla: uf.regiao.sigla,
    };
  }

  const fallback = raw["regiao-imediata"];

  if (!fallback) {
    panic(
      `Municipio ${raw.id} (${raw.nome}) sem microrregiao nem regiao-imediata; nao da para derivar UF.`
    );
  }

  const uf = fallback["regiao-intermediaria"].UF;

  return {
    id: formatCodigoIbge(raw.id),
    nome: raw.nome,
    nome_normalizado: normalize(raw.nome),
    uf_sigla: uf.sigla,
    uf_id: uf.id,
    uf_nome: uf.nome,
    mesorregiao_id: null,
    mesorregiao_nome: null,
    regiao_sigla: uf.regiao.sigla,
  };
}

// ---------------------------------------------------------------------------
// Store JSON
// ---------------------------------------------------------------------------

const municipioIndexadoSchema: z.ZodType<MunicipioIndexado> = z
  .object({
    id: z.string(),
    nome: z.string(),
    nome_normalizado: z.string(),
    uf_sigla: z.string(),
    uf_id: z.number(),
    uf_nome: z.string(),
    mesorregiao_id: z.number().nullable(),
    mesorregiao_nome: z.string().nullable(),
    regiao_sigla: z.string(),
  })
  .strict();

const indiceSchema: z.ZodType<IndiceIbgeLocalidades> = z
  .object({
    versao: z.literal(1),
    criadoEm: z.string(),
    fonte: z.literal("ibge-localidades"),
    municipios: z.array(municipioIndexadoSchema),
  })
  .strict();

const store = createJsonStore<IndiceIbgeLocalidades>({
  dominio,
  file: "index.json",
  schema: indiceSchema,
});

export function getIndexPath(): string {
  return store.path();
}

export async function loadIndex(): Promise<
  ResultType<IndiceIbgeLocalidades | null, StoreError>
> {
  return store.load();
}

export async function getIndex(): Promise<
  ResultType<IndiceIbgeLocalidades | null, StoreError>
> {
  return store.get();
}

export async function saveIndex(
  indice: IndiceIbgeLocalidades
): Promise<ResultType<string, StoreError>> {
  return store.save(indice);
}
