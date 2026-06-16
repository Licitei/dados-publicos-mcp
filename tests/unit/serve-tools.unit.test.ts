import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { DbLayer } from "../../src/kernel/db/client";
import { foldExit } from "../../src/serve/fold";
import { indexRegistry } from "../../src/serve/index-registry";
import { tools } from "../../src/serve/registry";
import { CamaraDeputadosLive } from "../../src/sources/camara-deputados/store";
import { CapagLive } from "../../src/sources/capag/store";
import { CatmatCatserLive } from "../../src/sources/catmat-catser/store";
import { CmedAnvisaLive } from "../../src/sources/cmed-anvisa/store";
import { CnaeLive } from "../../src/sources/cnae/store";
import {
  IbgeLocalidades,
  IbgeLocalidadesLive,
} from "../../src/sources/ibge-localidades/store";
import { LegislacaoLive } from "../../src/sources/legislacao/store";
import { PainelPrecosLive } from "../../src/sources/painel-precos/store";
import { PncpLive } from "../../src/sources/pncp/store";
import { QueridoDiarioLive } from "../../src/sources/querido-diario/store";
import { ReceitaCnpjLive } from "../../src/sources/receita-cnpj/store";
import { SancoesCguLive } from "../../src/sources/sancoes-cgu/store";
import { IbgeEconomiaLive } from "../../src/sources/ibge-economia/store";
import { SenadoFederalLive } from "../../src/sources/senado/store";
import { SicafLive } from "../../src/sources/sicaf-fornecedores/store";
import { SiconfiFiscalLive } from "../../src/sources/siconfi-fiscal/store";
import { TcuInidoneosLive } from "../../src/sources/tcu-inidoneos/store";
import { TransparenciaDespesasLive } from "../../src/sources/transparencia-despesas/store";
import { TransferegovLive } from "../../src/sources/transferegov/store";
import { TseEleitoralLive } from "../../src/sources/tse-eleitoral/store";
import { EmbedderStub } from "./support/embedder-stub";

const uf = (sigla: string, id: number, nome: string) => ({
  id,
  sigla,
  nome,
  regiao: { id: 5, sigla: "SE", nome: "Sudeste" },
});

const withMicro = (id: number, nome: string, ufObj: ReturnType<typeof uf>) => ({
  id,
  nome,
  microrregiao: {
    id: 1,
    nome: "Micro",
    mesorregiao: { id: 1, nome: "Meso", UF: ufObj },
  },
});

const SP = uf("SP", 35, "Sao Paulo");

const municipiosFixture = [
  withMicro(3550308, "São Paulo", SP),
  withMicro(3509502, "Campinas", SP),
];

const route = async (input: string | URL | Request): Promise<Response> => {
  const path = new URL(String(input)).pathname;
  return path.endsWith("/municipios")
    ? Response.json(municipiosFixture)
    : new Response("rota desconhecida", { status: 404 });
};

const stub = Object.assign(route, { preconnect: () => {} }) satisfies typeof fetch;

const HttpStub = FetchHttpClient.layer.pipe(
  Layer.provide(Layer.succeed(FetchHttpClient.Fetch, stub))
);

const Infra = Layer.mergeAll(DbLayer, EmbedderStub, HttpStub);

const TestLayer = Layer.mergeAll(
  LegislacaoLive,
  IbgeLocalidadesLive,
  CnaeLive,
  CatmatCatserLive,
  SicafLive,
  SancoesCguLive,
  ReceitaCnpjLive,
  TseEleitoralLive,
  CamaraDeputadosLive,
  QueridoDiarioLive,
  CapagLive,
  PncpLive,
  TcuInidoneosLive,
  IbgeEconomiaLive,
  SenadoFederalLive,
  CmedAnvisaLive,
  SiconfiFiscalLive,
  TransferegovLive,
  PainelPrecosLive,
  TransparenciaDespesasLive
).pipe(Layer.provideMerge(Infra));

const toolByName = (name: string) => {
  const found = tools.find((tool) => tool.name === name);
  if (found === undefined) {
    throw new Error(`tool ${name} ausente do registry`);
  }
  return found;
};

const seeded = Effect.gen(function* () {
  const ibge = yield* IbgeLocalidades;
  yield* ibge.index;
});

describe("serve tool layer", () => {
  it("registry exposes 65 query + 12 index + 1 status + 5 guia = 83 tools", () => {
    expect(tools).toHaveLength(83);
    expect(tools.map((tool) => tool.name)).toContain("status_indices");
    expect(tools.map((tool) => tool.name)).toContain("resolver_municipio");
    expect(tools.map((tool) => tool.name)).toContain("guia_uso");
    expect(tools.map((tool) => tool.name)).toContain("verificar_inidoneo_tcu");
    expect(tools.map((tool) => tool.name)).toContain("economia_municipio");
    expect(tools.map((tool) => tool.name)).toContain("buscar_senador");
    expect(tools.map((tool) => tool.name)).toContain("buscar_medicamento_cmed");
    expect(tools.map((tool) => tool.name)).toContain("fiscal_ente_siconfi");
    expect(tools.map((tool) => tool.name)).toContain("buscar_convenio");
    expect(tools.map((tool) => tool.name)).toContain("estatistica_preco_item");
    expect(tools.map((tool) => tool.name)).toContain("buscar_despesa_federal");
  });

  it.effect(
    "guia tools fold their markdown into raw text content",
    () =>
      Effect.gen(function* () {
        const tool = toolByName("guia_triagem_fornecedor");
        const exit = yield* Effect.exit(tool.handle({}));
        const result = foldExit(exit);
        expect(result).not.toHaveProperty("isError");
        expect(result.content[0].text).toContain(
          "# Guia: triagem de fornecedor"
        );
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );

  it("every tool exposes an object inputSchema for the wire", () => {
    for (const tool of tools) {
      expect(tool.inputSchema.type).toBe("object");
      expect(typeof tool.description).toBe("string");
    }
  });

  it.effect(
    "success path folds the service value into text content",
    () =>
      Effect.gen(function* () {
        yield* seeded;
        const tool = toolByName("validar_uf");
        const exit = yield* Effect.exit(tool.handle({ uf: "sp" }));
        const result = foldExit(exit);
        expect(result).not.toHaveProperty("isError");
        const text = result.content[0].text;
        expect(JSON.parse(text)).toMatchObject({ sigla: "SP", id: 35 });
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );

  it.effect(
    "SchemaError on invalid args folds to the generic pt-BR message",
    () =>
      Effect.gen(function* () {
        const tool = toolByName("validar_uf");
        const exit = yield* Effect.exit(tool.handle({ uf: 123 }));
        const result = foldExit(exit);
        expect(result).toMatchObject({ isError: true });
        expect(result.content[0].text).toBe(
          "Parametros invalidos para a ferramenta."
        );
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );

  it.effect(
    "a source TaggedError folds to its pt-BR get message()",
    () =>
      Effect.gen(function* () {
        const tool = toolByName("validar_uf");
        const exit = yield* Effect.exit(tool.handle({ uf: "XX" }));
        const result = foldExit(exit);
        expect(result).toMatchObject({ isError: true });
        expect(result.content[0].text).toContain("UF invalida: XX");
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );

  it.effect(
    "the resolver_municipio descriptor maps nome/uf to the service",
    () =>
      Effect.gen(function* () {
        yield* seeded;
        const tool = toolByName("resolver_municipio");
        const exit = yield* Effect.exit(
          tool.handle({ nome: "sao paulo", uf: "SP" })
        );
        const result = foldExit(exit);
        expect(result).not.toHaveProperty("isError");
        expect(result.content[0].text).toContain("São Paulo");
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );

  it.effect(
    "the index-registry runs a light source against the stub http layer",
    () =>
      Effect.gen(function* () {
        const entry = indexRegistry["ibge-localidades"];
        expect(entry.heavy).toBe(false);
        const summary = yield* entry.run({});
        expect(summary).toBe(2);
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );
});
