import { Result, type Result as ResultType } from "better-result";
import type { EvlogError } from "evlog";
import type {
  AdapterError,
  BuildSummary,
  IndexAdapter,
  StatusInfo,
} from "../../core/adapter";
import { fetchJson } from "../../core/http/download";
import {
  CNAE_DOMINIO,
  CNAE_INDEX_FILE,
  CNAE_KEY,
  CNAE_SUBCLASSES_URL,
  CNAE_TITULO,
} from "./catalog";
import { cnaeErrors } from "./errors";

export type CnaeIndexError = EvlogError;

/**
 * Forma crua de uma subclasse devolvida pela API v2 do IBGE.
 * A hierarquia vem aninhada dentro de `classe`.
 */
export type RawSubclasse = {
  id: string;
  descricao: string;
  atividades?: string[] | null;
  observacoes?: string[] | null;
  classe: {
    id: string;
    descricao: string;
    observacoes?: string[] | null;
    grupo: {
      id: string;
      descricao: string;
      divisao: {
        id: string;
        descricao: string;
        secao: {
          id: string;
          descricao: string;
          observacoes?: string[] | null;
        };
      };
    };
  };
};

/**
 * Registro achatado de uma subclasse CNAE, com a cadeia hierarquica
 * desnormalizada para resolucao/listagem instantanea.
 */
export type CnaeSubclasse = {
  id: string;
  descricao: string;
  atividades: string[];
  observacoes: string[];
  classeId: string;
  classeDescricao: string;
  grupoId: string;
  grupoDescricao: string;
  divisaoId: string;
  divisaoDescricao: string;
  secaoId: string;
  secaoDescricao: string;
};

/**
 * Remove "\r\n" embutidos e espacos redundantes de cada item de texto
 * (observacoes/atividades vem multilinha na fonte).
 */
export function limparTexto(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function limparLista(value: string[] | null | undefined): string[] {
  if (!Array.isArray(value)) return [];

  return value.map(limparTexto).filter(Boolean);
}

/**
 * Achata uma subclasse crua da API em um registro CnaeSubclasse,
 * com a hierarquia desnormalizada e os textos limpos.
 */
export function mapSubclasse(raw: RawSubclasse): CnaeSubclasse {
  const classe = raw.classe;
  const grupo = classe.grupo;
  const divisao = grupo.divisao;
  const secao = divisao.secao;

  return {
    id: String(raw.id),
    descricao: limparTexto(raw.descricao),
    atividades: limparLista(raw.atividades),
    observacoes: limparLista(raw.observacoes),
    classeId: String(classe.id),
    classeDescricao: limparTexto(classe.descricao),
    grupoId: String(grupo.id),
    grupoDescricao: limparTexto(grupo.descricao),
    divisaoId: String(divisao.id),
    divisaoDescricao: limparTexto(divisao.descricao),
    secaoId: String(secao.id),
    secaoDescricao: limparTexto(secao.descricao),
  };
}

/**
 * Mapeia a lista crua da API. Devolve cnaeErrors.PARSE encapsulado em Result
 * se a forma do JSON nao for um array de subclasses com hierarquia.
 */
export function parseSubclasses(
  data: unknown,
  url: string
): ResultType<CnaeSubclasse[], EvlogError> {
  if (!Array.isArray(data)) {
    return Result.err(cnaeErrors.PARSE({ url }));
  }

  return Result.try({
    try: () => data.map((item) => mapSubclasse(item as RawSubclasse)),
    catch: (cause): EvlogError =>
      cnaeErrors.PARSE({ url, internal: { cause: String(cause) } }),
  });
}

/**
 * Baixa e parseia as subclasses CNAE da API v2 do IBGE.
 * Somente GET; ~3,6 MB; reconstroi toda a arvore CNAE 2.0.
 */
export async function buildSubclasses(): Promise<
  ResultType<CnaeSubclasse[], CnaeIndexError>
> {
  const fetched = await fetchJson<unknown>(CNAE_SUBCLASSES_URL, {
    method: "GET",
  });

  if (Result.isError(fetched)) return Result.err(fetched.error);

  return parseSubclasses(fetched.value, CNAE_SUBCLASSES_URL);
}

export const cnaeIndexAdapter: IndexAdapter & {
  buildSubclasses: typeof buildSubclasses;
} = {
  key: CNAE_KEY,
  titulo: CNAE_TITULO,
  storage: "memory",
  requiresHeavyDownload: false,
  buildSubclasses,
  async build(opts): Promise<ResultType<BuildSummary, AdapterError>> {
    opts?.onProgress?.("Baixando subclasses CNAE 2.0 do IBGE...");

    // Import dinamico evita ciclo de inicializacao com store.ts.
    const { recriarIndiceCnae } = await import("./store");
    const built = await recriarIndiceCnae();

    if (Result.isError(built)) return Result.err(built.error);

    opts?.onProgress?.(
      `Indice CNAE recriado: ${built.value.registros} subclasses.`
    );

    return Result.ok({
      dominio: CNAE_DOMINIO,
      registros: built.value.registros,
      atualizadoEm: built.value.atualizadoEm,
      caminho: built.value.caminho,
      detalhes: { fonte: "ibge-cnae-v2", arquivo: CNAE_INDEX_FILE },
    });
  },
  async status(): Promise<ResultType<StatusInfo, AdapterError>> {
    const { statusIndiceCnae } = await import("./store");
    const status = await statusIndiceCnae();

    if (Result.isError(status)) return Result.err(status.error);

    return Result.ok({
      key: CNAE_KEY,
      titulo: CNAE_TITULO,
      storage: "memory",
      requiresHeavyDownload: false,
      existe: status.value.existe,
      atualizadoEm: status.value.atualizadoEm,
      registros: status.value.registros || null,
      caminho: status.value.caminho,
    });
  },
};
