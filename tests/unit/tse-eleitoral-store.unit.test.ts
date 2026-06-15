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

const route = async (input: string | URL | Request): Promise<Response> => {
  const url = String(input);
  return url.includes("consulta_cand_2024.zip")
    ? new Response(candidatosZip)
    : url.includes("bem_candidato_2024.zip")
      ? new Response(bensZip)
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
        expect(total).toEqual({ candidatos: 2, bens: 3 });
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
});
