import { expect, layer } from "@effect/vitest";
import { Duration, Effect, Layer } from "effect";
import * as Arr from "effect/Array";
import * as Option from "effect/Option";
import * as Order from "effect/Order";
import * as Predicate from "effect/Predicate";
import {
  CamaraDeputados,
  CamaraDeputadosLive,
} from "../../src/sources/camara-deputados/store";
import { TestEmbedderLive } from "./support/test-embedder";
import { fixtureLayer, pathIncludes } from "./support/fixture-server";
import { utf8, zip } from "./support/stored-zip";
import { TestDbLive } from "./support/test-db";

const bom = [0xef, 0xbb, 0xbf];

const utf8Bom = (text: string) => Uint8Array.from([...bom, ...utf8(text)]);

const deputadosCsv = Arr.join(
  [
  '"id";"uri";"nome";"nomeCivil";"siglaSexo";"dataNascimento";"dataFalecimento";"ufNascimento";"municipioNascimento";"idLegislaturaInicial";"idLegislaturaFinal"',
  '"220593";"https://dadosabertos.camara.leg.br/api/v2/deputados/220593";"João da Silva";"João Pereira da Silva";"M";"1970-03-15";"";"SP";"São Paulo";"56";"57"',
  '"178957";"https://dadosabertos.camara.leg.br/api/v2/deputados/178957";"Maria Souza";"Maria Aparecida Souza";"F";"1985-06-20";"";"MG";"Belo Horizonte";"55";"57"',
  ],
  "\r\n"
);

const cotaCsv = Arr.join(
  [
  '"nuDeputadoId";"ideCadastro";"txNomeParlamentar";"cpf";"sgUF";"sgPartido";"numSubCota";"txtDescricao";"txtFornecedor";"txtCNPJCPF";"datEmissao";"vlrDocumento";"vlrGlosa";"vlrLiquido";"numMes";"numAno";"ideDocumento";"urlDocumento"',
  '"220593";"3001";"João da Silva";"";"SP";"MDB";"3";"DIVULGAÇÃO DA ATIVIDADE PARLAMENTAR";"GRAFICA BETA LTDA";"44.555.666/0001-99";"2026-02-10";"8000,00";"0,00";"8000,00";"2";"2026";"DOC1";"http://doc/1"',
  '"178957";"3002";"Maria Souza";"";"MG";"PT";"3";"DIVULGAÇÃO DA ATIVIDADE PARLAMENTAR";"GRAFICA BETA LTDA";"44555666000199";"2026-03-12";"5000,00";"0,00";"5000,00";"3";"2026";"DOC2";"http://doc/2"',
  '"220593";"3004";"João da Silva";"";"SP";"MDB";"5";"MANUTENÇÃO DE ESCRITÓRIO";"GRAFICA BETA LTDA";"44555666000199";"2026-05-01";"2000,00";"0,00";"2000,00";"5";"2026";"DOC4";"http://doc/4"',
  '"220593";"3003";"João da Silva";"";"SP";"MDB";"1";"COMBUSTÍVEIS E LUBRIFICANTES";"POSTO GAMA COMBUSTIVEIS";"77.888.999/0001-11";"2026-04-01";"600,00";"0,00";"600,00";"4";"2026";"DOC3";"http://doc/3"',
  ],
  "\r\n"
);

const proposicoesCsv = Arr.join(
  [
  '"id";"uri";"siglaTipo";"numero";"ano";"ementa";"ementaDetalhada";"keywords";"dataApresentacao";"ultimoStatus_descricaoSituacao";"ultimoStatus_dataHora";"ultimoStatus_siglaOrgao"',
  '"2400001";"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2400001";"PL";"1001";"2026";"Dispõe sobre a proteção de dados pessoais e a privacidade dos cidadãos";"Estabelece regras para tratamento de dados pessoais";"privacidade, dados pessoais, proteção";"2026-02-01";"Aguardando Parecer";"2026-02-05T10:00";"CCJC"',
  '"2400002";"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2400002";"PEC";"2002";"2026";"Altera o regime tributário das pequenas empresas e o Simples Nacional";"Reforma tributária para microempresas";"tributos, simples nacional, empresas";"2026-03-01";"Em Tramitação";"2026-03-10T11:00";"PLEN"',
  ],
  "\r\n"
);

const autoresCsv = Arr.join(
  [
  '"idProposicao";"uriProposicao";"idDeputadoAutor";"uriAutor";"nomeAutor";"proponente"',
  '"2400001";"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2400001";"220593";"https://dadosabertos.camara.leg.br/api/v2/deputados/220593";"João da Silva";"1"',
  '"2400002";"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2400002";"178957";"https://dadosabertos.camara.leg.br/api/v2/deputados/178957";"Maria Souza";"1"',
  ],
  "\r\n"
);

const ceapZip = zip([{ name: "Ano-2026.csv", bytes: utf8Bom(cotaCsv) }], {
  method: "deflate",
});

const HttpFixture = Layer.unwrap(
  ceapZip.pipe(
    Effect.map((ceapBody) =>
      fixtureLayer([
  { match: pathIncludes("deputados/csv/deputados.csv"), respond: { body: utf8Bom(deputadosCsv) } },
  { match: pathIncludes("Ano-2026.csv.zip"), respond: { body: ceapBody } },
  { match: pathIncludes("proposicoesAutores-2026.csv"), respond: { body: utf8Bom(autoresCsv) } },
  { match: pathIncludes("proposicoes-2026.csv"), respond: { body: utf8Bom(proposicoesCsv) } },
])
    )
  )
);

const TestLayer = Layer.mergeAll(
  CamaraDeputadosLive.pipe(
    Layer.provide(Layer.mergeAll(TestDbLive, TestEmbedderLive, HttpFixture))
  ),
  TestDbLive,
  TestEmbedderLive,
  HttpFixture
);

const seeded = Effect.gen(function* () {
  const camara = yield* CamaraDeputados;
  yield* camara.indexAnos([2026]);
  return camara;
});

layer(TestLayer, { timeout: Duration.seconds(60) })("camara-deputados store + csv/zip ingest", (it) => {
  it.effect(
    "indexAnos loads deputados once + cota/proposicao/autor per ano and counts",
    () =>
      Effect.gen(function* () {
        const camara = yield* CamaraDeputados;
        const total = yield* camara.indexAnos([2026]);
        expect(total).toEqual({
          deputados: 2,
          cotas: 4,
          proposicoes: 2,
          proposicoesAutores: 2,
        });
      }),
  );

  it.effect(
    "buscarDeputado matches by trgm name, falls back to id/uf relational",
    () =>
      Effect.gen(function* () {
        const camara = yield* seeded;
        const porNome = yield* camara.buscarDeputado({ nome: "joao silva" });
        expect(Arr.map(porNome, (r) => r.id)).toContain("220593");
        expect(Option.exists(Arr.head(porNome), (r) => Number(r.score) > 0)).toBe(true);
        const typo = yield* camara.buscarDeputado({ nome: "joao silvz" });
        expect(Arr.map(typo, (r) => r.id)).toContain("220593");
        const porId = yield* camara.buscarDeputado({ id: "178957" });
        expect(porId).toHaveLength(1);
        expect(Option.map(Arr.head(porId), (r) => r.nome)).toEqual(Option.some("Maria Souza"));
        const porUf = yield* camara.buscarDeputado({ uf: "sp" });
        expect(Arr.map(porUf, (r) => r.id)).toEqual(["220593"]);
      }),
  );

  it.effect(
    "gastosPorFornecedor resolves by bm25 name, trgm typo, and exact cnpj",
    () =>
      Effect.gen(function* () {
        const camara = yield* seeded;
        const porNome = yield* camara.gastosPorFornecedor({
          fornecedor: "grafica",
        });
        expect(porNome).toHaveLength(3);
        expect(Arr.every(porNome, (r) => r.cnpjCpfNorm === "44555666000199")).toBe(
          true
        );
        expect(Option.exists(Arr.head(porNome), (r) => Number(r.score) < 0)).toBe(true);
        expect(Option.exists(Arr.head(porNome), (r) => r.nomeDeputado !== null)).toBe(true);
        const typo = yield* camara.gastosPorFornecedor({ fornecedor: "grafia" });
        expect(Arr.map(typo, (r) => r.cnpjCpfNorm)).toContain("44555666000199");
        expect(Option.exists(Arr.head(typo), (r) => Number(r.score) > 0)).toBe(true);
        const porDoc = yield* camara.gastosPorFornecedor({
          cnpjCpf: "44.555.666/0001-99",
        });
        expect(porDoc).toHaveLength(3);
        const comCategoria = yield* camara.gastosPorFornecedor({
          fornecedor: "grafica",
          categoria: "DIVULGAÇÃO",
        });
        expect(comCategoria).toHaveLength(2);
        const semAno = yield* camara.gastosPorFornecedor({
          fornecedor: "grafica",
          ano: 2020,
        });
        expect(semAno).toHaveLength(0);
        const semFiltro = yield* Effect.flip(
          camara.gastosPorFornecedor({})
        );
        expect(semFiltro._tag).toBe("CamaraError");
        expect(semFiltro.message).toContain("fornecedor");
      }),
  );

  it.effect(
    "fornecedorCotaParlamentar breaks an exact supplier down by deputado + totals",
    () =>
      Effect.gen(function* () {
        const camara = yield* seeded;
        const reverse = yield* camara.fornecedorCotaParlamentar({
          cnpjCpf: "44.555.666/0001-99",
        });
        expect(reverse.cnpjCpf).toBe("44555666000199");
        expect(reverse.fornecedor).toBe("GRAFICA BETA LTDA");
        expect(reverse.totalDocumentos).toBe(3);
        expect(reverse.totalLiquido).toBeCloseTo(15000, 1);
        expect(reverse.deputados).toHaveLength(2);
        const byDep = Arr.sort(Arr.map(reverse.deputados, (d) => Number(d.deputadoId)), Order.Number);
        expect(byDep).toEqual([178957, 220593]);
      }),
  );

  it.effect(
    "buscarProposicao ranks by hybrid RRF, honors tipo/ano, includes authors",
    () =>
      Effect.gen(function* () {
        const camara = yield* seeded;
        const lexical = yield* camara.buscarProposicao({
          termo: "proteção de dados pessoais",
        });
        expect(Option.map(Arr.head(lexical), (r) => r.id)).toEqual(Option.some("2400001"));
        expect(Option.exists(Arr.head(lexical), (r) => Number(r.score) > 0)).toBe(true);
        const semLexical = yield* camara.buscarProposicao({
          termo: "zzzz termo sem correspondencia lexical",
        });
        expect(semLexical.length).toBeGreaterThan(0);
        const porTipo = yield* camara.buscarProposicao({
          termo: "tributário",
          tipo: "pec",
        });
        expect(Arr.map(porTipo, (r) => r.id)).toEqual(["2400002"]);
        const porAno = yield* camara.buscarProposicao({
          termo: "dados",
          ano: 2020,
        });
        expect(porAno).toHaveLength(0);
        const comAutores = yield* camara.buscarProposicao({
          termo: "dados pessoais",
          incluirAutores: true,
        });
        const alvo = Arr.findFirst(comAutores, (r) => r.id === "2400001");
        expect(Option.isSome(alvo)).toBe(true);
        const autores = Option.match(alvo, {
          onNone: () => [],
          onSome: (r): readonly unknown[] => {
            const found = r["autores"];
            return Arr.isArray(found) ? found : [];
          },
        });
        expect(
          Arr.map(autores, (a) => (Predicate.hasProperty(a, "nomeAutor") ? a.nomeAutor : undefined))
        ).toContain("João da Silva");
      }),
  );
});
