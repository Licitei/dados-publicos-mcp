import { Result, type Result as ResultType } from "better-result";
import dayjs from "dayjs";
import type { EvlogError } from "evlog";
import { z } from "zod";
import { createJsonStore } from "../../core/store/json-store";
import { normalize } from "../../core/normalize";
import { CNAE_DOMINIO, CNAE_INDEX_FILE } from "./catalog";
import { cnaeIndexAdapter, type CnaeSubclasse } from "./indexer";

export type StoreError = EvlogError;

export type IndiceCnae = {
  versao: 1;
  criadoEm: string;
  fonte: "ibge-cnae-v2";
  subclasses: CnaeSubclasse[];
};

/**
 * Indice em memoria pronto para busca/resolucao.
 * - `porId`: Map de subclasse id -> registro.
 * - `invertido`: token normalizado -> conjunto de ids de subclasse,
 *   construido sobre descricao + atividades + descricoes da hierarquia.
 */
export type CnaeMemoryIndex = {
  criadoEm: string;
  subclasses: CnaeSubclasse[];
  porId: Map<string, CnaeSubclasse>;
  invertido: Map<string, Set<string>>;
};

const cnaeSubclasseSchema: z.ZodType<CnaeSubclasse> = z
  .object({
    id: z.string(),
    descricao: z.string(),
    atividades: z.array(z.string()),
    observacoes: z.array(z.string()),
    classeId: z.string(),
    classeDescricao: z.string(),
    grupoId: z.string(),
    grupoDescricao: z.string(),
    divisaoId: z.string(),
    divisaoDescricao: z.string(),
    secaoId: z.string(),
    secaoDescricao: z.string(),
  })
  .strict();

const indiceCnaeSchema: z.ZodType<IndiceCnae> = z
  .object({
    versao: z.literal(1),
    criadoEm: z.string(),
    fonte: z.literal("ibge-cnae-v2"),
    subclasses: z.array(cnaeSubclasseSchema),
  })
  .strict();

const store = createJsonStore<IndiceCnae>({
  dominio: CNAE_DOMINIO,
  file: CNAE_INDEX_FILE,
  schema: indiceCnaeSchema,
});

type RuntimeState = {
  index: CnaeMemoryIndex | null;
  carregado: boolean;
  indexando: boolean;
  erro: string | null;
};

const runtimeState: RuntimeState = {
  index: null,
  carregado: false,
  indexando: false,
  erro: null,
};

export function getIndexPath(): string {
  return store.path();
}

/**
 * Constroi o indice em memoria (Map por id + indice invertido por token)
 * a partir da lista achatada de subclasses. Funcao pura: usada tanto pelo
 * boot quanto pelos testes com fixtures inline.
 */
export function buildMemoryIndex(
  subclasses: CnaeSubclasse[],
  criadoEm = dayjs().toISOString()
): CnaeMemoryIndex {
  const porId = new Map<string, CnaeSubclasse>();
  const invertido = new Map<string, Set<string>>();

  for (const sub of subclasses) {
    porId.set(sub.id, sub);

    const haystack = [
      sub.descricao,
      sub.classeDescricao,
      sub.grupoDescricao,
      sub.divisaoDescricao,
      sub.secaoDescricao,
      ...sub.atividades,
    ].join(" ");

    for (const token of tokenize(haystack)) {
      let bucket = invertido.get(token);

      if (!bucket) {
        bucket = new Set<string>();
        invertido.set(token, bucket);
      }

      bucket.add(sub.id);
    }
  }

  return { criadoEm, subclasses, porId, invertido };
}

/**
 * Quebra um texto em tokens normalizados (sem acento, lowercase),
 * descartando tokens de 1 caractere para reduzir ruido no indice.
 */
export function tokenize(texto: string): string[] {
  return normalize(texto)
    .split(" ")
    .filter((token) => token.length > 1);
}

function setIndex(index: CnaeMemoryIndex | null, erro: string | null): void {
  runtimeState.index = index;
  runtimeState.carregado = index !== null;
  runtimeState.erro = erro;
}

/**
 * Carrega o indice CNAE em memoria, lendo do JSON persistido quando existir.
 * Usa cache de runtime: so le do disco uma vez por processo.
 */
export async function getIndiceCnae(): Promise<
  ResultType<CnaeMemoryIndex | null, StoreError>
> {
  if (runtimeState.carregado) return Result.ok(runtimeState.index);

  const loaded = await store.load();

  if (Result.isError(loaded)) {
    setIndex(null, loaded.error.message);

    return Result.err(loaded.error);
  }

  if (!loaded.value) {
    setIndex(null, null);

    return Result.ok(null);
  }

  const index = buildMemoryIndex(
    loaded.value.subclasses,
    loaded.value.criadoEm
  );

  setIndex(index, null);

  return Result.ok(index);
}

export async function statusIndiceCnae(): Promise<
  ResultType<
    {
      caminho: string;
      existe: boolean;
      indexando: boolean;
      erro: string | null;
      atualizadoEm: string | null;
      registros: number;
    },
    StoreError
  >
> {
  const loaded = await getIndiceCnae();

  if (Result.isError(loaded)) return loaded;

  const index = loaded.value;

  return Result.ok({
    caminho: getIndexPath(),
    existe: Boolean(index),
    indexando: runtimeState.indexando,
    erro: runtimeState.erro,
    atualizadoEm: index?.criadoEm ?? null,
    registros: index?.subclasses.length ?? 0,
  });
}

/**
 * Baixa as subclasses do IBGE, persiste em JSON e recarrega o indice em
 * memoria. Usado pela ferramenta indexar_cnae e pelo adapter.build().
 */
export async function recriarIndiceCnae(): Promise<
  ResultType<
    {
      caminho: string;
      atualizadoEm: string;
      registros: number;
    },
    StoreError
  >
> {
  runtimeState.indexando = true;
  runtimeState.erro = null;

  const built = await cnaeIndexAdapter.buildSubclasses();

  if (Result.isError(built)) {
    runtimeState.indexando = false;
    runtimeState.erro = built.error.message;

    return Result.err(built.error);
  }

  const indice: IndiceCnae = {
    versao: 1,
    criadoEm: dayjs().toISOString(),
    fonte: "ibge-cnae-v2",
    subclasses: built.value,
  };

  const saved = await store.save(indice);

  if (Result.isError(saved)) {
    runtimeState.indexando = false;
    runtimeState.erro = saved.error.message;

    return Result.err(saved.error);
  }

  setIndex(buildMemoryIndex(indice.subclasses, indice.criadoEm), null);
  runtimeState.indexando = false;

  return Result.ok({
    caminho: saved.value,
    atualizadoEm: indice.criadoEm,
    registros: indice.subclasses.length,
  });
}
