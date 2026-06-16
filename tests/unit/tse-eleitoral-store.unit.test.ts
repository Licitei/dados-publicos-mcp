import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { DbLayer } from "../../src/kernel/db/client";
import {
  TseEleitoral,
  TseEleitoralLive,
} from "../../src/sources/tse-eleitoral/store";

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

const latin1 = (text: string) => new Uint8Array(Buffer.from(text, "latin1"));

const candidatosCsv = [
  '"SQ_CANDIDATO";"NR_CPF_CANDIDATO";"NM_CANDIDATO";"NM_URNA_CANDIDATO";"ANO_ELEICAO";"SG_UF";"CD_CARGO";"DS_CARGO";"NR_PARTIDO";"SG_PARTIDO";"DS_SIT_TOT_TURNO";"DT_NASCIMENTO";"DS_OCUPACAO"',
  '"SP001";"11122233344";"JOÃO DA SILVA";"JOÃO DO POVO";"2024";"SP";"11";"PREFEITO";"15";"MDB";"ELEITO";"15/03/1970";"EMPRESÁRIO"',
  '"SP002";"55566677788";"MARIA SOUZA";"MARIA DA SAÚDE";"2024";"SP";"13";"VEREADOR";"13";"PT";"#NULO#";"20/06/1985";"MÉDICA"',
].join("\r\n");

const candidatosUfCsv = [
  '"SQ_CANDIDATO";"NR_CPF_CANDIDATO";"NM_CANDIDATO";"NM_URNA_CANDIDATO";"ANO_ELEICAO"',
  '"SP999";"00000000000";"NAO INDEXAR";"FANTASMA";"2024"',
].join("\r\n");

const bensCsv = [
  '"SQ_CANDIDATO";"ANO_ELEICAO";"SG_UF";"NR_ORDEM_BEM_CANDIDATO";"CD_TIPO_BEM_CANDIDATO";"DS_TIPO_BEM_CANDIDATO";"DS_BEM_CANDIDATO";"VR_BEM_CANDIDATO"',
  '"SP001";"2024";"SP";"1";"12";"Casa";"Imóvel residencial";"500000,00"',
  '"SP001";"2024";"SP";"2";"21";"Veículo";"Carro; modelo X";"80000,50"',
  '"SP002";"2024";"SP";"1";"12";"Apartamento";"Apto centro";"300000,00"',
].join("\r\n");

const candidatosZip = makeZip([
  { name: "consulta_cand_2024_BRASIL.csv", data: latin1(candidatosCsv) },
  { name: "consulta_cand_2024_SP.csv", data: latin1(candidatosUfCsv) },
]);
const bensZip = makeZip(
  [{ name: "bem_candidato_2024_BRASIL.csv", data: latin1(bensCsv) }],
  8
);

const receitasCsv = [
  '"SQ_RECEITA";"SQ_CANDIDATO";"NR_CPF_CANDIDATO";"ANO_ELEICAO";"NR_CPF_CNPJ_DOADOR";"NM_DOADOR";"NM_DOADOR_RFB";"CD_CNAE_DOADOR";"DS_CNAE_DOADOR";"SG_UF_DOADOR";"VR_RECEITA";"DT_RECEITA";"DS_ORIGEM_RECEITA";"DS_NATUREZA_RECEITA";"NR_RECIBO_DOACAO"',
  '"R1";"SP001";"11122233344";"2024";"11222333000181";"EMPRESA ALPHA LTDA";"";"6201500";"Software";"SP";"50000,00";"10/08/2024";"Origem";"Pessoa juridica";"REC1"',
  '"R2";"SP002";"55566677788";"2024";"99988877766";"JOSE PEREIRA";"";"";"";"MG";"2000,00";"11/08/2024";"Origem";"Pessoa fisica";"REC2"',
  '"R3";"SP002";"55566677788";"2024";"11222333000181";"EMPRESA ALPHA LTDA";"";"6201500";"Software";"SP";"30000,00";"12/08/2024";"Origem";"Pessoa juridica";"REC3"',
].join("\r\n");

const originarioCsv = [
  '"SQ_RECEITA";"ANO_ELEICAO";"NR_CPF_CNPJ_DOADOR_ORIGINARIO";"NM_DOADOR_ORIGINARIO";"NM_DOADOR_ORIGINARIO_RFB";"DS_TP_DOADOR_ORIGINARIO";"CD_CNAE_DOADOR_ORIGINARIO";"VR_RECEITA";"DT_RECEITA"',
  '"R1";"2024";"12345678901";"FULANO ORIGINARIO";"";"Pessoa Fisica";"";"50000,00";"10/08/2024"',
].join("\r\n");

const despesasCsv = [
  '"SQ_DESPESA";"SQ_CANDIDATO";"NR_CPF_CANDIDATO";"ANO_ELEICAO";"NR_CPF_CNPJ_FORNECEDOR";"NM_FORNECEDOR";"NM_FORNECEDOR_RFB";"CD_CNAE_FORNECEDOR";"DS_CNAE_FORNECEDOR";"SG_UF_FORNECEDOR";"VR_DESPESA_CONTRATADA";"DT_DESPESA";"DS_DESPESA";"NR_DOCUMENTO"',
  '"D1";"SP001";"11122233344";"2024";"44555666000199";"GRAFICA BETA LTDA";"";"1813001";"Impressao";"SP";"8000,00";"15/08/2024";"Material grafico";"NF1"',
  '"D2";"SP002";"55566677788";"2024";"44555666000199";"GRAFICA BETA LTDA";"";"1813001";"Impressao";"SP";"5000,00";"16/08/2024";"Panfletos";"NF2"',
].join("\r\n");

const prestacaoZip = makeZip(
  [
    { name: "receitas_candidatos_2024_BRASIL.csv", data: latin1(receitasCsv) },
    {
      name: "receitas_candidatos_doador_originario_2024_BRASIL.csv",
      data: latin1(originarioCsv),
    },
    {
      name: "despesas_contratadas_2024_BRASIL.csv",
      data: latin1(despesasCsv),
    },
  ],
  8
);

const route = async (input: string | URL | Request): Promise<Response> => {
  const url = String(input);
  return url.includes("consulta_cand_2024.zip")
    ? new Response(candidatosZip)
    : url.includes("bem_candidato_2024.zip")
      ? new Response(bensZip)
      : url.includes("prestacao_de_contas_eleitorais_candidatos_2024.zip")
        ? new Response(prestacaoZip)
        : new Response("rota desconhecida", { status: 404 });
};

const stub = Object.assign(route, {
  preconnect: () => {},
}) satisfies typeof fetch;

const HttpStub = FetchHttpClient.layer.pipe(
  Layer.provide(Layer.succeed(FetchHttpClient.Fetch, stub))
);

const TestLayer = Layer.mergeAll(
  TseEleitoralLive.pipe(Layer.provide(Layer.mergeAll(DbLayer, HttpStub))),
  DbLayer,
  HttpStub
);

const seeded = Effect.gen(function* () {
  const tse = yield* TseEleitoral;
  yield* tse.indexAnos([2024]);
  return tse;
});

describe("tse-eleitoral store + zip/csv ingest", () => {
  it.effect(
    "indexAnos parses only the BRASIL csv from each zip and counts rows",
    () =>
      Effect.gen(function* () {
        const tse = yield* TseEleitoral;
        const total = yield* tse.indexAnos([2024]);
        expect(total).toEqual({
          candidatos: 2,
          bens: 3,
          receitas: 3,
          despesas: 2,
          originarios: 1,
        });
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );

  it.effect(
    "buscarCandidato matches by bm25 name, falls back to trgm, honors ano",
    () =>
      Effect.gen(function* () {
        const tse = yield* seeded;
        const hit = yield* tse.buscarCandidato("joao da silva");
        expect(hit.map((r) => r.sqCandidato)).toContain("SP001");
        expect(hit[0].nome).toBe("JOÃO DA SILVA");
        expect(Number(hit[0].score)).toBeLessThan(0);
        const typo = yield* tse.buscarCandidato("silvz");
        expect(typo.map((r) => r.sqCandidato)).toContain("SP001");
        expect(Number(typo[0].score)).toBeGreaterThan(0);
        const ano = yield* tse.buscarCandidato("joao", { ano: 2024 });
        expect(ano.map((r) => r.sqCandidato)).toContain("SP001");
        const outro = yield* tse.buscarCandidato("joao", { ano: 2020 });
        expect(outro).toHaveLength(0);
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );

  it.effect(
    "dueDiligenceCandidato returns candidacies + assets + total, by cpf or sq",
    () =>
      Effect.gen(function* () {
        const tse = yield* seeded;
        const porCpf = yield* tse.dueDiligenceCandidato({
          cpf: "111.222.333-44",
        });
        expect(porCpf.candidaturas.map((c) => c.sqCandidato)).toEqual(["SP001"]);
        expect(porCpf.bens).toHaveLength(2);
        expect(porCpf.totalBensDeclarado).toBeCloseTo(580000.5, 1);
        expect(porCpf.bens[0].descricao).toBe("Imóvel residencial");
        const porSq = yield* tse.dueDiligenceCandidato({ sqCandidato: "SP002" });
        expect(porSq.candidaturas).toHaveLength(1);
        expect(porSq.bens).toHaveLength(1);
        const erro = yield* Effect.flip(tse.dueDiligenceCandidato({}));
        expect(erro._tag).toBe("TseError");
        expect(erro.message).toContain("cpf ou sqCandidato");
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );

  it.effect(
    "buscarDoacoes resolves a donor by document or name, joined to candidates",
    () =>
      Effect.gen(function* () {
        const tse = yield* seeded;
        const porDoc = yield* tse.buscarDoacoes("11.222.333/0001-81");
        expect(porDoc).toHaveLength(2);
        expect(porDoc.every((r) => r.nomeDoador === "EMPRESA ALPHA LTDA")).toBe(
          true
        );
        expect(Number(porDoc[0].valor)).toBe(50000);
        expect(porDoc.map((r) => r.nomeCandidato).sort()).toEqual([
          "JOÃO DA SILVA",
          "MARIA SOUZA",
        ]);
        const porNome = yield* tse.buscarDoacoes("alpha");
        expect(porNome.map((r) => r.cpfCnpjDoador)).toContain("11222333000181");
        expect(Number(porNome[0].score)).toBeLessThan(0);
        expect(porNome[0].nomeCandidato).not.toBeNull();
        const typo = yield* tse.buscarDoacoes("alpa");
        expect(typo.map((r) => r.cpfCnpjDoador)).toContain("11222333000181");
        expect(Number(typo[0].score)).toBeGreaterThan(0);
        const semAno = yield* tse.buscarDoacoes("alpha", { ano: 2020 });
        expect(semAno).toHaveLength(0);
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );

  it.effect(
    "buscarFornecedorCampanha resolves a supplier by name or document",
    () =>
      Effect.gen(function* () {
        const tse = yield* seeded;
        const porNome = yield* tse.buscarFornecedorCampanha("grafica");
        expect(porNome).toHaveLength(2);
        expect(porNome.map((r) => r.cpfCnpjForn)).toContain("44555666000199");
        expect(Number(porNome[0].score)).toBeLessThan(0);
        const porDoc = yield* tse.buscarFornecedorCampanha("44555666000199");
        expect(porDoc).toHaveLength(2);
        const semAno = yield* tse.buscarFornecedorCampanha("grafica", {
          ano: 2020,
        });
        expect(semAno).toHaveLength(0);
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );

  it.effect(
    "rastrearDoadorOriginario walks origin -> repassador -> candidate",
    () =>
      Effect.gen(function* () {
        const tse = yield* seeded;
        const chain = yield* tse.rastrearDoadorOriginario("123.456.789-01");
        expect(chain).toHaveLength(1);
        expect(chain[0].nomeOrig).toBe("FULANO ORIGINARIO");
        expect(chain[0].repassadorNome).toBe("EMPRESA ALPHA LTDA");
        expect(chain[0].nomeCandidato).toBe("JOÃO DA SILVA");
        expect(Number(chain[0].valorOriginario)).toBe(50000);
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );
});
