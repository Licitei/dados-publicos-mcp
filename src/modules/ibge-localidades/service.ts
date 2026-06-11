import { Result, type Result as ResultType } from "better-result";
import type { EvlogError } from "evlog";
import { normalize, onlyDigits } from "../../core/normalize";
import { ibgeLocalidadesErrors } from "./errors";
import { getIndex, getIndexPath, type MunicipioIndexado } from "./store";

/**
 * Tabela estatica das 27 UFs (sigla -> codigo numerico IBGE + nome).
 * Estavel e independente do download; usada por validar_uf e para validar
 * filtros antes de bater no PNCP.
 */
export const UFS: { sigla: string; id: number; nome: string }[] = [
  { sigla: "RO", id: 11, nome: "Rondonia" },
  { sigla: "AC", id: 12, nome: "Acre" },
  { sigla: "AM", id: 13, nome: "Amazonas" },
  { sigla: "RR", id: 14, nome: "Roraima" },
  { sigla: "PA", id: 15, nome: "Para" },
  { sigla: "AP", id: 16, nome: "Amapa" },
  { sigla: "TO", id: 17, nome: "Tocantins" },
  { sigla: "MA", id: 21, nome: "Maranhao" },
  { sigla: "PI", id: 22, nome: "Piaui" },
  { sigla: "CE", id: 23, nome: "Ceara" },
  { sigla: "RN", id: 24, nome: "Rio Grande do Norte" },
  { sigla: "PB", id: 25, nome: "Paraiba" },
  { sigla: "PE", id: 26, nome: "Pernambuco" },
  { sigla: "AL", id: 27, nome: "Alagoas" },
  { sigla: "SE", id: 28, nome: "Sergipe" },
  { sigla: "BA", id: 29, nome: "Bahia" },
  { sigla: "MG", id: 31, nome: "Minas Gerais" },
  { sigla: "ES", id: 32, nome: "Espirito Santo" },
  { sigla: "RJ", id: 33, nome: "Rio de Janeiro" },
  { sigla: "SP", id: 35, nome: "Sao Paulo" },
  { sigla: "PR", id: 41, nome: "Parana" },
  { sigla: "SC", id: 42, nome: "Santa Catarina" },
  { sigla: "RS", id: 43, nome: "Rio Grande do Sul" },
  { sigla: "MS", id: 50, nome: "Mato Grosso do Sul" },
  { sigla: "MT", id: 51, nome: "Mato Grosso" },
  { sigla: "GO", id: 52, nome: "Goias" },
  { sigla: "DF", id: 53, nome: "Distrito Federal" },
];

const ufBySigla = new Map(UFS.map((uf) => [uf.sigla, uf]));

/**
 * Valida/normaliza uma sigla de UF (ex 'sp', ' RO ') e retorna o codigo
 * numerico IBGE + nome. Pura, nao depende do indice baixado.
 */
export function validarUf(
  sigla: string
): ResultType<{ sigla: string; id: number; nome: string }, EvlogError> {
  const candidata = sigla.trim().toUpperCase();
  const uf = ufBySigla.get(candidata);

  if (!uf) {
    return Result.err(ibgeLocalidadesErrors.UF_INVALIDA({ uf: sigla }));
  }

  return Result.ok({ sigla: uf.sigla, id: uf.id, nome: uf.nome });
}

// ---------------------------------------------------------------------------
// Funcoes que dependem do indice baixado
// ---------------------------------------------------------------------------

async function requireMunicipios(): Promise<
  ResultType<MunicipioIndexado[], EvlogError>
> {
  return Result.gen(async function* () {
    const loaded = yield* Result.await(getIndex());

    if (!loaded) {
      return yield* Result.err(
        ibgeLocalidadesErrors.INDICE_AUSENTE({ path: getIndexPath() })
      );
    }

    return Result.ok(loaded.municipios);
  });
}

export type MunicipioResolvido = {
  codigoIbge: string;
  nome: string;
  uf: string;
  ufId: number;
  ufNome: string;
  mesorregiao: string | null;
  regiao: string;
};

function toResolvido(m: MunicipioIndexado): MunicipioResolvido {
  return {
    codigoIbge: m.id,
    nome: m.nome,
    uf: m.uf_sigla,
    ufId: m.uf_id,
    ufNome: m.uf_nome,
    mesorregiao: m.mesorregiao_nome,
    regiao: m.regiao_sigla,
  };
}

/**
 * Resolve nome de municipio (+ UF opcional) para codigo IBGE de 7 digitos.
 * Desambigua homonimos por UF. Faz match exato por nome normalizado; se nao
 * houver exato, cai para match parcial (contains). Retorna lista de candidatos.
 */
export async function resolverMunicipio(input: {
  nome: string;
  uf?: string;
}): Promise<
  ResultType<{ exato: boolean; candidatos: MunicipioResolvido[] }, EvlogError>
> {
  return Result.gen(async function* () {
    const municipios = yield* Result.await(requireMunicipios());

    const ufFiltro = input.uf ? (yield* validarUf(input.uf)).sigla : null;

    const alvo = normalize(input.nome);
    const pool = ufFiltro
      ? municipios.filter((m) => m.uf_sigla === ufFiltro)
      : municipios;

    const exatos = pool.filter((m) => m.nome_normalizado === alvo);

    if (exatos.length > 0) {
      return Result.ok({ exato: true, candidatos: exatos.map(toResolvido) });
    }

    const parciais = pool.filter((m) => m.nome_normalizado.includes(alvo));

    if (parciais.length === 0) {
      return yield* Result.err(
        ibgeLocalidadesErrors.MUNICIPIO_NAO_ENCONTRADO({
          termo: input.nome,
          uf: ufFiltro ?? undefined,
        })
      );
    }

    return Result.ok({ exato: false, candidatos: parciais.map(toResolvido) });
  });
}

/**
 * Resolucao reversa: codigo IBGE de 7 digitos -> municipio + UF + regiao.
 */
export async function resolverCodigoIbge(
  codigo: string
): Promise<ResultType<MunicipioResolvido, EvlogError>> {
  return Result.gen(async function* () {
    const municipios = yield* Result.await(requireMunicipios());

    const alvo = onlyDigits(codigo).padStart(7, "0");
    const municipio = municipios.find((m) => m.id === alvo);

    if (!municipio) {
      return yield* Result.err(
        ibgeLocalidadesErrors.CODIGO_NAO_ENCONTRADO({
          codigo,
          normalizado: alvo,
        })
      );
    }

    return Result.ok(toResolvido(municipio));
  });
}

/**
 * Lista todos os municipios de uma UF (ordenados por nome) com seus codigos.
 */
export async function listarMunicipiosUf(uf: string): Promise<
  ResultType<
    { uf: string; ufId: number; total: number; municipios: MunicipioResolvido[] },
    EvlogError
  >
> {
  return Result.gen(async function* () {
    const ufValidada = yield* validarUf(uf);

    const municipios = yield* Result.await(requireMunicipios());

    const daUf = municipios
      .filter((m) => m.uf_sigla === ufValidada.sigla)
      .sort((a, b) => a.nome_normalizado.localeCompare(b.nome_normalizado))
      .map(toResolvido);

    return Result.ok({
      uf: ufValidada.sigla,
      ufId: ufValidada.id,
      total: daUf.length,
      municipios: daUf,
    });
  });
}
