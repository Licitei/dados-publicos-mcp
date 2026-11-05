import { expect, layer } from "@effect/vitest";
import { Duration, Effect, Layer } from "effect";
import * as Arr from "effect/Array";
import * as Option from "effect/Option";
import * as Str from "effect/String";
import * as Order from "effect/Order";
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

const seeded = Effect.gen(function* () {
  const tse = yield* TseEleitoral;
  yield* tse.indexAnos([2024]);
  return tse;
});

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

    it.effect("buscarCandidato matches by bm25 name, falls back to fff fuzzy, honors ano", () =>
      Effect.gen(function* () {
        const tse = yield* seeded;
        const hit = yield* tse.buscarCandidato("joao da silva");
        expect(Arr.map(hit, (r) => r.sqCandidato)).toContain("SP001");
        expect(Option.map(Arr.head(hit), (r) => r.nome)).toEqual(Option.some("JOÃO DA SILVA"));
        expect(Option.exists(Arr.head(hit), (r) => Number(r.score) > 0)).toBe(true);
        const typo = yield* tse.buscarCandidato("joao da silvq");
        expect(Arr.map(typo, (r) => r.sqCandidato)).toContain("SP001");
        const fuzzyOnly = yield* tse.buscarCandidato("mria suza");
        expect(Arr.map(fuzzyOnly, (r) => r.sqCandidato)).toEqual(["SP002"]);
        expect(Arr.every(fuzzyOnly, (r) => r.score === 0)).toBe(true);
        const ano = yield* tse.buscarCandidato("joao", { ano: 2024 });
        expect(Arr.map(ano, (r) => r.sqCandidato)).toContain("SP001");
        const outro = yield* tse.buscarCandidato("joao", { ano: 2020 });
        expect(outro).toHaveLength(0);
      })
    );

    it.effect("dueDiligenceCandidato returns candidacies + assets + total, by cpf or sq", () =>
      Effect.gen(function* () {
        const tse = yield* seeded;
        const porCpf = yield* tse.dueDiligenceCandidato({
          cpf: "111.222.333-44",
        });
        expect(Arr.map(porCpf.candidaturas, (c) => c.sqCandidato)).toEqual(["SP001"]);
        expect(porCpf.bens).toHaveLength(2);
        expect(porCpf.totalBensDeclarado).toBeCloseTo(580000.5, 1);
        expect(Option.map(Arr.head(porCpf.bens), (b) => b.descricao)).toEqual(
          Option.some("Imóvel residencial")
        );
        const porSq = yield* tse.dueDiligenceCandidato({ sqCandidato: "SP002" });
        expect(porSq.candidaturas).toHaveLength(1);
        expect(porSq.bens).toHaveLength(1);
        const erro = yield* Effect.flip(tse.dueDiligenceCandidato({}));
        expect(erro._tag).toBe("TseError");
        expect(erro.message).toContain("cpf ou sqCandidato");
      })
    );

    it.effect("buscarDoacoes resolves a donor by document or name, joined to candidates", () =>
      Effect.gen(function* () {
        const tse = yield* seeded;
        const porDoc = yield* tse.buscarDoacoes("11.222.333/0001-81");
        expect(porDoc).toHaveLength(2);
        expect(Arr.every(porDoc, (r) => r.nomeDoador === "EMPRESA ALPHA LTDA")).toBe(true);
        expect(Option.map(Arr.head(porDoc), (r) => Number(r.valor))).toEqual(Option.some(50000));
        expect(
          Arr.sort(
            Arr.map(porDoc, (r) => String(r.nomeCandidato)),
            Order.String
          )
        ).toEqual(["JOÃO DA SILVA", "MARIA SOUZA"]);
        const porNome = yield* tse.buscarDoacoes("alpha");
        expect(Arr.map(porNome, (r) => r.cpfCnpjDoador)).toContain("11222333000181");
        expect(Option.exists(Arr.head(porNome), (r) => Number(r.score) > 0)).toBe(true);
        expect(Option.exists(Arr.head(porNome), (r) => r.nomeCandidato !== null)).toBe(true);
        const typo = yield* tse.buscarDoacoes("alpa");
        expect(Arr.map(typo, (r) => r.cpfCnpjDoador)).toContain("11222333000181");
        expect(Arr.every(typo, (r) => r.score === 0)).toBe(true);
        const semAno = yield* tse.buscarDoacoes("alpha", { ano: 2020 });
        expect(semAno).toHaveLength(0);
      })
    );

    it.effect("buscarFornecedorCampanha resolves a supplier by name or document", () =>
      Effect.gen(function* () {
        const tse = yield* seeded;
        const porNome = yield* tse.buscarFornecedorCampanha("grafica");
        expect(porNome).toHaveLength(2);
        expect(Arr.map(porNome, (r) => r.cpfCnpjForn)).toContain("44555666000199");
        expect(Option.exists(Arr.head(porNome), (r) => Number(r.score) > 0)).toBe(true);
        const typo = yield* tse.buscarFornecedorCampanha("grafca");
        expect(Arr.map(typo, (r) => r.cpfCnpjForn)).toContain("44555666000199");
        expect(Arr.every(typo, (r) => r.score === 0)).toBe(true);
        const porDoc = yield* tse.buscarFornecedorCampanha("44555666000199");
        expect(porDoc).toHaveLength(2);
        const semAno = yield* tse.buscarFornecedorCampanha("grafica", {
          ano: 2020,
        });
        expect(semAno).toHaveLength(0);
      })
    );

    it.effect("rastrearDoadorOriginario walks origin -> repassador -> candidate", () =>
      Effect.gen(function* () {
        const tse = yield* seeded;
        const chain = yield* tse.rastrearDoadorOriginario("123.456.789-01");
        expect(chain).toHaveLength(1);
        const link = Arr.head(chain);
        expect(Option.map(link, (c) => c.nomeOrig)).toEqual(Option.some("FULANO ORIGINARIO"));
        expect(Option.map(link, (c) => c.repassadorNome)).toEqual(
          Option.some("EMPRESA ALPHA LTDA")
        );
        expect(Option.map(link, (c) => c.nomeCandidato)).toEqual(Option.some("JOÃO DA SILVA"));
        expect(Option.map(link, (c) => Number(c.valorOriginario))).toEqual(Option.some(50000));
      })
    );
  }
);
