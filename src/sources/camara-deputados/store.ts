import { Http } from "../../kernel/http/client";
import { refreshSearch } from "../../kernel/search/index-rows";
import { Clock, Context, DateTime, Effect, Layer } from "effect";
import { Duck, type DuckTable } from "../../kernel/duck/duck";
import { Fuzzy } from "../../kernel/search/fuzzy";
import { CEAP_ANO_MAX } from "./catalog";
import { loadCotas, loadDeputados, loadProposicaoAutores, loadProposicoes } from "./indexer";
import { appendWithIds } from "../../kernel/duck/append";

export const deputadoTable: DuckTable = {
  name: "deputado",
  key: "id",
  columns: {
    id: "VARCHAR",
    uri: "VARCHAR",
    nome: "VARCHAR",
    nomeCivil: "VARCHAR",
    nomeNorm: "VARCHAR",
    siglaSexo: "VARCHAR",
    dataNascimento: "VARCHAR",
    dataFalecimento: "VARCHAR",
    ufNascimento: "VARCHAR",
    municipioNascimento: "VARCHAR",
    idLegislaturaInicial: "INTEGER",
    idLegislaturaFinal: "INTEGER",
  },
  search: ["nomeNorm"],
};

export const cotaTable: DuckTable = {
  name: "cota",
  key: "id",
  columns: {
    id: "VARCHAR",
    nuDeputadoId: "INTEGER",
    ideCadastro: "INTEGER",
    nomeParlamentar: "VARCHAR",
    cpfDeputado: "VARCHAR",
    sgUf: "VARCHAR",
    sgPartido: "VARCHAR",
    numSubCota: "INTEGER",
    txtDescricao: "VARCHAR",
    txtFornecedor: "VARCHAR",
    cnpjCpf: "VARCHAR",
    cnpjCpfNorm: "VARCHAR",
    datEmissao: "VARCHAR",
    vlrDocumento: "DOUBLE",
    vlrGlosa: "DOUBLE",
    vlrLiquido: "DOUBLE",
    numMes: "INTEGER",
    numAno: "INTEGER",
    ideDocumento: "VARCHAR",
    urlDocumento: "VARCHAR",
    busca: "VARCHAR",
  },
  search: ["busca"],
};

export const proposicaoTable: DuckTable = {
  name: "proposicao",
  key: "id",
  columns: {
    id: "VARCHAR",
    uri: "VARCHAR",
    siglaTipo: "VARCHAR",
    numero: "INTEGER",
    ano: "INTEGER",
    ementa: "VARCHAR",
    ementaDetalhada: "VARCHAR",
    keywords: "VARCHAR",
    dataApresentacao: "VARCHAR",
    situacao: "VARCHAR",
    ultimoStatusData: "VARCHAR",
    ultimoStatusOrgao: "VARCHAR",
    busca: "VARCHAR",
  },
  search: ["busca"],
};

export const proposicaoAutorTable: DuckTable = {
  name: "proposicao_autor",
  key: "id",
  columns: {
    id: "VARCHAR",
    idProposicao: "VARCHAR",
    idDeputadoAutor: "VARCHAR",
    uriAutor: "VARCHAR",
    nomeAutor: "VARCHAR",
    nomeAutorNorm: "VARCHAR",
    proponente: "INTEGER",
  },
};

const makeCamara = Effect.gen(function* () {
  const duck = yield* Duck;
  const http = yield* Http;
  const fuzzy = yield* Fuzzy;

  const indexAnos = (anos: readonly number[]) =>
    Effect.gen(function* () {
      const deputados = yield* loadDeputados.pipe(
        Effect.provideService(Http, http),
        Effect.provideService(Duck, duck)
      );
      yield* duck.replace(deputadoTable, deputados);
      yield* Effect.forEach(
        [cotaTable, proposicaoTable, proposicaoAutorTable],
        (table) => duck.create(table),
        { concurrency: 1, discard: true }
      );
      yield* Effect.forEach(
        anos,
        (ano) =>
          Effect.gen(function* () {
            const cotas = yield* loadCotas(ano).pipe(
              Effect.provideService(Http, http),
              Effect.provideService(Duck, duck)
            );
            yield* appendWithIds(cotaTable, `${ano}-`, cotas).pipe(
              Effect.provideService(Duck, duck)
            );
            const proposicoes = yield* loadProposicoes(ano).pipe(
              Effect.provideService(Http, http),
              Effect.provideService(Duck, duck)
            );
            yield* duck.append(proposicaoTable, proposicoes);
            const autores = yield* loadProposicaoAutores(ano).pipe(
              Effect.provideService(Http, http),
              Effect.provideService(Duck, duck)
            );
            yield* appendWithIds(proposicaoAutorTable, `${ano}-`, autores).pipe(
              Effect.provideService(Duck, duck)
            );
          }),
        { concurrency: 1, discard: true }
      );
      yield* duck.reindex(cotaTable);
      yield* duck.reindex(proposicaoTable);
      yield* Effect.forEach([deputadoTable, cotaTable, proposicaoTable], refreshSearch, {
        concurrency: 1,
      }).pipe(Effect.provideService(Duck, duck), Effect.provideService(Fuzzy, fuzzy));
      return {
        deputados: yield* duck.count(deputadoTable),
        cotas: yield* duck.count(cotaTable),
        proposicoes: yield* duck.count(proposicaoTable),
        proposicoesAutores: yield* duck.count(proposicaoAutorTable),
      };
    });

  const index = Effect.flatMap(Clock.currentTimeMillis, (millis) =>
    indexAnos([Math.min(DateTime.toPartsUtc(DateTime.makeUnsafe(millis)).year, CEAP_ANO_MAX)])
  );

  return { index, indexAnos };
});

export class CamaraDeputados extends Context.Service<
  CamaraDeputados,
  Effect.Success<typeof makeCamara>
>()("dados-publicos-mcp/sources/camara-deputados/store/CamaraDeputados") {}

export const CamaraDeputadosLive = Layer.effect(CamaraDeputados)(makeCamara);
