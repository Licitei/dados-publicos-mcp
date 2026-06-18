import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import {
  CamaraDeputados,
  CamaraDeputadosLive,
} from "../../src/sources/camara-deputados/store";
import { EmbedderStub } from "./support/embedder-stub";
import { TestDbLive } from "./support/test-db";

const concat = (...parts: Uint8Array[]) => {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
};

const makeZip = (files: { name: string; data: Uint8Array }[], method = 0) => {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const nameBytes = enc.encode(file.name);
    const payload =
      method === 8 ? new Uint8Array(deflateRawSync(file.data)) : file.data;
    const lfh = new DataView(new ArrayBuffer(30));
    lfh.setUint32(0, 0x04034b50, true);
    lfh.setUint16(8, method, true);
    lfh.setUint32(18, payload.length, true);
    lfh.setUint32(22, file.data.length, true);
    lfh.setUint16(26, nameBytes.length, true);
    const local = concat(new Uint8Array(lfh.buffer), nameBytes, payload);
    const cdh = new DataView(new ArrayBuffer(46));
    cdh.setUint32(0, 0x02014b50, true);
    cdh.setUint16(10, method, true);
    cdh.setUint32(20, payload.length, true);
    cdh.setUint32(24, file.data.length, true);
    cdh.setUint16(28, nameBytes.length, true);
    cdh.setUint32(42, offset, true);
    centrals.push(concat(new Uint8Array(cdh.buffer), nameBytes));
    locals.push(local);
    offset += local.length;
  }
  const cd = concat(...centrals);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, files.length, true);
  eocd.setUint16(10, files.length, true);
  eocd.setUint32(12, cd.length, true);
  eocd.setUint32(16, offset, true);
  return concat(...locals, cd, new Uint8Array(eocd.buffer));
};

const bom = new Uint8Array([0xef, 0xbb, 0xbf]);

const utf8 = (text: string) =>
  concat(bom, new TextEncoder().encode(text));

const deputadosCsv = [
  '"id";"uri";"nome";"nomeCivil";"siglaSexo";"dataNascimento";"dataFalecimento";"ufNascimento";"municipioNascimento";"idLegislaturaInicial";"idLegislaturaFinal"',
  '"220593";"https://dadosabertos.camara.leg.br/api/v2/deputados/220593";"João da Silva";"João Pereira da Silva";"M";"1970-03-15";"";"SP";"São Paulo";"56";"57"',
  '"178957";"https://dadosabertos.camara.leg.br/api/v2/deputados/178957";"Maria Souza";"Maria Aparecida Souza";"F";"1985-06-20";"";"MG";"Belo Horizonte";"55";"57"',
].join("\r\n");

const cotaCsv = [
  '"nuDeputadoId";"ideCadastro";"txNomeParlamentar";"cpf";"sgUF";"sgPartido";"numSubCota";"txtDescricao";"txtFornecedor";"txtCNPJCPF";"datEmissao";"vlrDocumento";"vlrGlosa";"vlrLiquido";"numMes";"numAno";"ideDocumento";"urlDocumento"',
  '"220593";"3001";"João da Silva";"";"SP";"MDB";"3";"DIVULGAÇÃO DA ATIVIDADE PARLAMENTAR";"GRAFICA BETA LTDA";"44.555.666/0001-99";"2026-02-10";"8000,00";"0,00";"8000,00";"2";"2026";"DOC1";"http://doc/1"',
  '"178957";"3002";"Maria Souza";"";"MG";"PT";"3";"DIVULGAÇÃO DA ATIVIDADE PARLAMENTAR";"GRAFICA BETA LTDA";"44555666000199";"2026-03-12";"5000,00";"0,00";"5000,00";"3";"2026";"DOC2";"http://doc/2"',
  '"220593";"3004";"João da Silva";"";"SP";"MDB";"5";"MANUTENÇÃO DE ESCRITÓRIO";"GRAFICA BETA LTDA";"44555666000199";"2026-05-01";"2000,00";"0,00";"2000,00";"5";"2026";"DOC4";"http://doc/4"',
  '"220593";"3003";"João da Silva";"";"SP";"MDB";"1";"COMBUSTÍVEIS E LUBRIFICANTES";"POSTO GAMA COMBUSTIVEIS";"77.888.999/0001-11";"2026-04-01";"600,00";"0,00";"600,00";"4";"2026";"DOC3";"http://doc/3"',
].join("\r\n");

const proposicoesCsv = [
  '"id";"uri";"siglaTipo";"numero";"ano";"ementa";"ementaDetalhada";"keywords";"dataApresentacao";"ultimoStatus_descricaoSituacao";"ultimoStatus_dataHora";"ultimoStatus_siglaOrgao"',
  '"2400001";"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2400001";"PL";"1001";"2026";"Dispõe sobre a proteção de dados pessoais e a privacidade dos cidadãos";"Estabelece regras para tratamento de dados pessoais";"privacidade, dados pessoais, proteção";"2026-02-01";"Aguardando Parecer";"2026-02-05T10:00";"CCJC"',
  '"2400002";"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2400002";"PEC";"2002";"2026";"Altera o regime tributário das pequenas empresas e o Simples Nacional";"Reforma tributária para microempresas";"tributos, simples nacional, empresas";"2026-03-01";"Em Tramitação";"2026-03-10T11:00";"PLEN"',
].join("\r\n");

const autoresCsv = [
  '"idProposicao";"uriProposicao";"idDeputadoAutor";"uriAutor";"nomeAutor";"proponente"',
  '"2400001";"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2400001";"220593";"https://dadosabertos.camara.leg.br/api/v2/deputados/220593";"João da Silva";"1"',
  '"2400002";"https://dadosabertos.camara.leg.br/api/v2/proposicoes/2400002";"178957";"https://dadosabertos.camara.leg.br/api/v2/deputados/178957";"Maria Souza";"1"',
].join("\r\n");

const ceapZip = makeZip(
  [{ name: "Ano-2026.csv", data: utf8(cotaCsv) }],
  8
);

const route = async (input: string | URL | Request): Promise<Response> => {
  const url = String(input);
  return url.includes("deputados/csv/deputados.csv")
    ? new Response(utf8(deputadosCsv))
    : url.includes("Ano-2026.csv.zip")
      ? new Response(ceapZip)
      : url.includes("proposicoesAutores-2026.csv")
        ? new Response(utf8(autoresCsv))
        : url.includes("proposicoes-2026.csv")
          ? new Response(utf8(proposicoesCsv))
          : new Response("rota desconhecida", { status: 404 });
};

const stub = Object.assign(route, {
  preconnect: () => {},
}) satisfies typeof fetch;

const HttpStub = FetchHttpClient.layer.pipe(
  Layer.provide(Layer.succeed(FetchHttpClient.Fetch, stub))
);

const TestLayer = Layer.mergeAll(
  CamaraDeputadosLive.pipe(
    Layer.provide(Layer.mergeAll(TestDbLive, EmbedderStub, HttpStub))
  ),
  TestDbLive,
  EmbedderStub,
  HttpStub
);

const seeded = Effect.gen(function* () {
  const camara = yield* CamaraDeputados;
  yield* camara.indexAnos([2026]);
  return camara;
});

describe("camara-deputados store + csv/zip ingest", () => {
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
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );

  it.effect(
    "buscarDeputado matches by trgm name, falls back to id/uf relational",
    () =>
      Effect.gen(function* () {
        const camara = yield* seeded;
        const porNome = yield* camara.buscarDeputado({ nome: "joao silva" });
        expect(porNome.map((r) => r.id)).toContain("220593");
        expect(Number(porNome[0].score)).toBeGreaterThan(0);
        const typo = yield* camara.buscarDeputado({ nome: "joao silvz" });
        expect(typo.map((r) => r.id)).toContain("220593");
        const porId = yield* camara.buscarDeputado({ id: "178957" });
        expect(porId).toHaveLength(1);
        expect(porId[0].nome).toBe("Maria Souza");
        const porUf = yield* camara.buscarDeputado({ uf: "sp" });
        expect(porUf.map((r) => r.id)).toEqual(["220593"]);
      }).pipe(Effect.provide(TestLayer)),
    60_000
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
        expect(porNome.every((r) => r.cnpjCpfNorm === "44555666000199")).toBe(
          true
        );
        expect(Number(porNome[0].score)).toBeLessThan(0);
        expect(porNome[0].nomeDeputado).not.toBeNull();
        const typo = yield* camara.gastosPorFornecedor({ fornecedor: "grafia" });
        expect(typo.map((r) => r.cnpjCpfNorm)).toContain("44555666000199");
        expect(Number(typo[0].score)).toBeGreaterThan(0);
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
      }).pipe(Effect.provide(TestLayer)),
    60_000
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
        const byDep = reverse.deputados.map((d) => Number(d.deputadoId)).sort();
        expect(byDep).toEqual([178957, 220593]);
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );

  it.effect(
    "buscarProposicao ranks by hybrid RRF, honors tipo/ano, includes authors",
    () =>
      Effect.gen(function* () {
        const camara = yield* seeded;
        const lexical = yield* camara.buscarProposicao({
          termo: "proteção de dados pessoais",
        });
        expect(lexical[0].id).toBe("2400001");
        expect(Number(lexical[0].score)).toBeGreaterThan(0);
        const semLexical = yield* camara.buscarProposicao({
          termo: "zzzz termo sem correspondencia lexical",
        });
        expect(semLexical.length).toBeGreaterThan(0);
        const porTipo = yield* camara.buscarProposicao({
          termo: "tributário",
          tipo: "pec",
        });
        expect(porTipo.map((r) => r.id)).toEqual(["2400002"]);
        const porAno = yield* camara.buscarProposicao({
          termo: "dados",
          ano: 2020,
        });
        expect(porAno).toHaveLength(0);
        const comAutores = yield* camara.buscarProposicao({
          termo: "dados pessoais",
          incluirAutores: true,
        });
        const alvo = comAutores.find((r) => r.id === "2400001");
        expect(alvo).toBeDefined();
        const autores = (alvo?.autores ?? []) as Record<string, unknown>[];
        expect(autores.map((a) => a.nomeAutor)).toContain("João da Silva");
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );
});
