import { expect, layer } from "@effect/vitest";
import { Duration, Effect, Layer } from "effect";
import * as Arr from "effect/Array";
import * as Option from "effect/Option";
import * as Str from "effect/String";
import { TseEleitoral, TseEleitoralLive } from "../../src/sources/tse-eleitoral/store";
import { fixtureLayer, pathIncludes } from "./support/fixture-server";
import { zip } from "./support/stored-zip";
import { TestDuckLive } from "./support/test-duck";
import { TestFuzzyLive } from "./support/test-fuzzy";

const latin1 = (text: string) =>
  Uint8Array.from(
    Arr.map(Arr.fromIterable(text), (char) =>
      Str.codePointAt(0)(char).pipe(Option.getOrElse(() => 63))
    )
  );

const candidatosCsv = Arr.join(
  [
    '"SQ_CANDIDATO";"NR_CPF_CANDIDATO";"NM_CANDIDATO";"NM_URNA_CANDIDATO";"ANO_ELEICAO";"SG_UF";"CD_CARGO";"DS_CARGO";"NR_PARTIDO";"SG_PARTIDO";"DS_SIT_TOT_TURNO";"DT_NASCIMENTO";"DS_OCUPACAO"',
    '"SP001";"11122233344";"JOÃO DA SILVA";"JOÃO DO POVO";"2024";"SP";"11";"PREFEITO";"15";"MDB";"ELEITO";"15/03/1970";"EMPRESÁRIO"',
    '"SP002";"55566677788";"MARIA SOUZA";"MARIA DA SAÚDE";"2024";"SP";"13";"VEREADOR";"13";"PT";"#NULO#";"20/06/1985";"MÉDICA"',
  ],
  "\r\n"
);

const candidatosUfCsv = Arr.join(
  [
    '"SQ_CANDIDATO";"NR_CPF_CANDIDATO";"NM_CANDIDATO";"NM_URNA_CANDIDATO";"ANO_ELEICAO"',
    '"SP999";"00000000000";"NAO INDEXAR";"FANTASMA";"2024"',
  ],
  "\r\n"
);

const bensCsv = Arr.join(
  [
    '"SQ_CANDIDATO";"ANO_ELEICAO";"SG_UF";"NR_ORDEM_BEM_CANDIDATO";"CD_TIPO_BEM_CANDIDATO";"DS_TIPO_BEM_CANDIDATO";"DS_BEM_CANDIDATO";"VR_BEM_CANDIDATO"',
    '"SP001";"2024";"SP";"1";"12";"Casa";"Imóvel residencial";"500000,00"',
    '"SP001";"2024";"SP";"2";"21";"Veículo";"Carro; modelo X";"80000,50"',
    '"SP002";"2024";"SP";"1";"12";"Apartamento";"Apto centro";"300000,00"',
  ],
  "\r\n"
);

const candidatosZip = zip(
  [
    { name: "consulta_cand_2024_BRASIL.csv", bytes: latin1(candidatosCsv) },
    { name: "consulta_cand_2024_SP.csv", bytes: latin1(candidatosUfCsv) },
  ],
  { method: "deflate" }
);
const bensZip = zip([{ name: "bem_candidato_2024_BRASIL.csv", bytes: latin1(bensCsv) }], {
  method: "deflate",
});

const receitasCsv = Arr.join(
  [
    '"SQ_RECEITA";"SQ_CANDIDATO";"NR_CPF_CANDIDATO";"ANO_ELEICAO";"NR_CPF_CNPJ_DOADOR";"NM_DOADOR";"NM_DOADOR_RFB";"CD_CNAE_DOADOR";"DS_CNAE_DOADOR";"SG_UF_DOADOR";"VR_RECEITA";"DT_RECEITA";"DS_ORIGEM_RECEITA";"DS_NATUREZA_RECEITA";"NR_RECIBO_DOACAO"',
    '"R1";"SP001";"11122233344";"2024";"11222333000181";"EMPRESA ALPHA LTDA";"";"6201500";"Software";"SP";"50000,00";"10/08/2024";"Origem";"Pessoa juridica";"REC1"',
    '"R2";"SP002";"55566677788";"2024";"99988877766";"JOSE PEREIRA";"";"";"";"MG";"2000,00";"11/08/2024";"Origem";"Pessoa fisica";"REC2"',
    '"R3";"SP002";"55566677788";"2024";"11222333000181";"EMPRESA ALPHA LTDA";"";"6201500";"Software";"SP";"30000,00";"12/08/2024";"Origem";"Pessoa juridica";"REC3"',
  ],
  "\r\n"
);

const originarioCsv = Arr.join(
  [
    '"SQ_RECEITA";"ANO_ELEICAO";"NR_CPF_CNPJ_DOADOR_ORIGINARIO";"NM_DOADOR_ORIGINARIO";"NM_DOADOR_ORIGINARIO_RFB";"DS_TP_DOADOR_ORIGINARIO";"CD_CNAE_DOADOR_ORIGINARIO";"VR_RECEITA";"DT_RECEITA"',
    '"R1";"2024";"12345678901";"FULANO ORIGINARIO";"";"Pessoa Fisica";"";"50000,00";"10/08/2024"',
  ],
  "\r\n"
);

const despesasCsv = Arr.join(
  [
    '"SQ_DESPESA";"SQ_CANDIDATO";"NR_CPF_CANDIDATO";"ANO_ELEICAO";"NR_CPF_CNPJ_FORNECEDOR";"NM_FORNECEDOR";"NM_FORNECEDOR_RFB";"CD_CNAE_FORNECEDOR";"DS_CNAE_FORNECEDOR";"SG_UF_FORNECEDOR";"VR_DESPESA_CONTRATADA";"DT_DESPESA";"DS_DESPESA";"NR_DOCUMENTO"',
    '"D1";"SP001";"11122233344";"2024";"44555666000199";"GRAFICA BETA LTDA";"";"1813001";"Impressao";"SP";"8000,00";"15/08/2024";"Material grafico";"NF1"',
    '"D2";"SP002";"55566677788";"2024";"44555666000199";"GRAFICA BETA LTDA";"";"1813001";"Impressao";"SP";"5000,00";"16/08/2024";"Panfletos";"NF2"',
  ],
  "\r\n"
);

const prestacaoZip = zip(
  [
    { name: "receitas_candidatos_2024_BRASIL.csv", bytes: latin1(receitasCsv) },
    {
      name: "receitas_candidatos_doador_originario_2024_BRASIL.csv",
      bytes: latin1(originarioCsv),
    },
    {
      name: "despesas_contratadas_2024_BRASIL.csv",
      bytes: latin1(despesasCsv),
    },
  ],
  { method: "deflate" }
);

const HttpFixture = Layer.unwrap(
  Effect.all({ candidatosZip, bensZip, prestacaoZip }, { concurrency: 2 }).pipe(
    Effect.map(({ candidatosZip, bensZip, prestacaoZip }) =>
      fixtureLayer([
        { match: pathIncludes("consulta_cand_2024.zip"), respond: { body: candidatosZip } },
        { match: pathIncludes("bem_candidato_2024.zip"), respond: { body: bensZip } },
        {
          match: pathIncludes("prestacao_de_contas_eleitorais_candidatos_2024.zip"),
          respond: { body: prestacaoZip },
        },
      ])
    )
  )
);

const TestLayer = TseEleitoralLive.pipe(
  Layer.provideMerge(Layer.mergeAll(TestDuckLive, TestFuzzyLive, HttpFixture))
);

layer(TestLayer, { timeout: Duration.seconds(120), excludeTestServices: true })(
  "tse-eleitoral store + zip/csv ingest",
  (it) => {
    it.effect("indexAnos parses only the BRASIL csv from each zip and counts rows", () =>
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
      })
    );
  }
);
