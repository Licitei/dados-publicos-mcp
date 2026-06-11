import { Result, type Result as ResultType } from "better-result";
import type { EvlogError } from "evlog";
import { onlyDigits } from "../../core/normalize";
import {
  getIndiceCnae,
  getIndexPath,
  recriarIndiceCnae,
  statusIndiceCnae,
  tokenize,
  type CnaeMemoryIndex,
} from "./store";
import { cnaeErrors } from "./errors";
import type { CnaeSubclasse } from "./indexer";
import { CNAE_NIVEL_TAMANHO, type CnaeNivel } from "./catalog";

export type CnaeServiceError = EvlogError;

/**
 * Hierarquia desnormalizada de uma subclasse, em formato amigavel para a tool.
 */
export type CnaeHierarquia = {
  subclasse: { id: string; descricao: string };
  classe: { id: string; descricao: string };
  grupo: { id: string; descricao: string };
  divisao: { id: string; descricao: string };
  secao: { id: string; descricao: string };
};

function hierarquia(sub: CnaeSubclasse): CnaeHierarquia {
  return {
    subclasse: { id: sub.id, descricao: sub.descricao },
    classe: { id: sub.classeId, descricao: sub.classeDescricao },
    grupo: { id: sub.grupoId, descricao: sub.grupoDescricao },
    divisao: { id: sub.divisaoId, descricao: sub.divisaoDescricao },
    secao: { id: sub.secaoId, descricao: sub.secaoDescricao },
  };
}

/**
 * Resolve o codigo de uma subclasse (7 digitos, com ou sem mascara de
 * pontuacao) para a descricao oficial + hierarquia completa.
 *
 * Funcao PURA sobre o indice: nao toca disco/rede. Use resolverCnae() para a
 * versao que carrega o indice persistido.
 */
export function resolverSubclasse(
  index: CnaeMemoryIndex,
  codigo: string,
): {
  encontrado: boolean;
  codigoConsultado: string;
  subclasse?: CnaeSubclasse;
  hierarquia?: CnaeHierarquia;
} {
  const id = onlyDigits(codigo);
  const sub = index.porId.get(id);

  if (!sub) {
    return { encontrado: false, codigoConsultado: id };
  }

  return {
    encontrado: true,
    codigoConsultado: id,
    subclasse: sub,
    hierarquia: hierarquia(sub),
  };
}

export type CnaeBuscaItem = {
  id: string;
  descricao: string;
  secaoId: string;
  secaoDescricao: string;
  score: number;
};

/**
 * Busca subclasses por palavra-chave usando o indice invertido em memoria.
 * Exige que TODOS os tokens do termo casem (AND). Ordena por score (numero
 * de tokens casados) e desempata pelo codigo. Funcao PURA sobre o indice.
 */
export function buscarSubclasses(
  index: CnaeMemoryIndex,
  termo: string,
  limite = 10,
): CnaeBuscaItem[] {
  const tokens = tokenize(termo);

  if (tokens.length === 0) return [];

  // Conta quantos tokens do termo casam cada subclasse (AND -> todos).
  const scores = new Map<string, number>();

  for (const token of tokens) {
    const bucket = index.invertido.get(token);

    if (!bucket) continue;

    for (const id of bucket) {
      scores.set(id, (scores.get(id) ?? 0) + 1);
    }
  }

  const resultados: CnaeBuscaItem[] = [];

  for (const [id, score] of scores) {
    if (score < tokens.length) continue;

    const sub = index.porId.get(id);

    if (!sub) continue;

    resultados.push({
      id: sub.id,
      descricao: sub.descricao,
      secaoId: sub.secaoId,
      secaoDescricao: sub.secaoDescricao,
      score,
    });
  }

  resultados.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  return resultados.slice(0, Math.max(1, limite));
}

/**
 * Detecta o nivel hierarquico de um codigo a partir do seu formato.
 * Secao = letra (A-U). Divisao/grupo/classe/subclasse = 2/3/5/7 digitos.
 * Retorna null se o formato nao casar com nenhum nivel conhecido.
 */
export function detectarNivel(codigo: string): {
  nivel: CnaeNivel;
  valor: string;
} | null {
  const trimmed = codigo.trim();

  if (/^[A-Za-z]$/.test(trimmed)) {
    return { nivel: "secao", valor: trimmed.toUpperCase() };
  }

  const digits = onlyDigits(trimmed);

  if (digits.length === CNAE_NIVEL_TAMANHO.divisao) {
    return { nivel: "divisao", valor: digits };
  }

  if (digits.length === CNAE_NIVEL_TAMANHO.grupo) {
    return { nivel: "grupo", valor: digits };
  }

  if (digits.length === CNAE_NIVEL_TAMANHO.classe) {
    return { nivel: "classe", valor: digits };
  }

  if (digits.length === CNAE_NIVEL_TAMANHO.subclasse) {
    return { nivel: "subclasse", valor: digits };
  }

  return null;
}

function subclasseEstaSob(
  sub: CnaeSubclasse,
  nivel: CnaeNivel,
  valor: string,
): boolean {
  switch (nivel) {
    case "secao":
      return sub.secaoId === valor;
    case "divisao":
      return sub.divisaoId === valor;
    case "grupo":
      return sub.grupoId === valor;
    case "classe":
      return sub.classeId === valor;
    case "subclasse":
      return sub.id === valor;
  }
}

/**
 * Lista todas as subclasses descendentes de um codigo de
 * secao/divisao/grupo/classe (ou a propria subclasse). Funcao PURA.
 */
export function listarSubclassesPorNivel(
  index: CnaeMemoryIndex,
  codigo: string,
):
  | {
      ok: true;
      nivel: CnaeNivel;
      codigo: string;
      total: number;
      subclasses: { id: string; descricao: string }[];
    }
  | { ok: false; motivo: string } {
  const detectado = detectarNivel(codigo);

  if (!detectado) {
    return {
      ok: false,
      motivo: `Codigo nao reconhecido: "${codigo}". Use letra (secao A-U) ou 2/3/5/7 digitos (divisao/grupo/classe/subclasse).`,
    };
  }

  const subclasses = index.subclasses
    .filter((sub) => subclasseEstaSob(sub, detectado.nivel, detectado.valor))
    .map((sub) => ({ id: sub.id, descricao: sub.descricao }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    ok: true,
    nivel: detectado.nivel,
    codigo: detectado.valor,
    total: subclasses.length,
    subclasses,
  };
}

// --- Camada que carrega o indice persistido e delega as funcoes puras. ---

async function requireIndex(): Promise<
  ResultType<CnaeMemoryIndex, CnaeServiceError>
> {
  return Result.gen(async function* () {
    const loaded = yield* Result.await(getIndiceCnae());

    if (!loaded) {
      return yield* Result.err(
        cnaeErrors.INDICE_AUSENTE({ path: getIndexPath() }),
      );
    }

    return Result.ok(loaded);
  });
}

export async function resolverCnae(
  codigo: string,
): Promise<ResultType<ReturnType<typeof resolverSubclasse>, CnaeServiceError>> {
  return (await requireIndex()).map((index) =>
    resolverSubclasse(index, codigo),
  );
}

export async function buscarCnae(
  termo: string,
  limite?: number,
): Promise<ResultType<CnaeBuscaItem[], CnaeServiceError>> {
  return (await requireIndex()).map((index) =>
    buscarSubclasses(index, termo, limite),
  );
}

export async function listarCnaesPorNivel(
  codigo: string,
): Promise<
  ResultType<ReturnType<typeof listarSubclassesPorNivel>, CnaeServiceError>
> {
  return (await requireIndex()).map((index) =>
    listarSubclassesPorNivel(index, codigo),
  );
}

export async function statusCnae() {
  return statusIndiceCnae();
}

export async function indexarCnae() {
  return recriarIndiceCnae();
}
