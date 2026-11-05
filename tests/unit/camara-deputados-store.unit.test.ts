import { expect, layer } from "@effect/vitest";
import { Duration, Effect, Layer } from "effect";
import * as Arr from "effect/Array";
import { CamaraDeputados, CamaraDeputadosLive } from "../../src/sources/camara-deputados/store";
import { fixtureLayer, pathIncludes } from "./support/fixture-server";
import { utf8, zip } from "./support/stored-zip";
import { TestDuckLive } from "./support/test-duck";
import { TestFuzzyLive } from "./support/test-fuzzy";

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
        {
          match: pathIncludes("deputados/csv/deputados.csv"),
          respond: { body: utf8Bom(deputadosCsv) },
        },
        { match: pathIncludes("Ano-2026.csv.zip"), respond: { body: ceapBody } },
        {
          match: pathIncludes("proposicoesAutores-2026.csv"),
          respond: { body: utf8Bom(autoresCsv) },
        },
        { match: pathIncludes("proposicoes-2026.csv"), respond: { body: utf8Bom(proposicoesCsv) } },
      ])
    )
  )
);

const TestLayer = CamaraDeputadosLive.pipe(
  Layer.provideMerge(Layer.mergeAll(TestDuckLive, TestFuzzyLive, HttpFixture))
);

layer(TestLayer, { timeout: Duration.seconds(120), excludeTestServices: true })(
  "camara-deputados store + csv/zip ingest",
  (it) => {
    it.effect("indexAnos loads deputados once + cota/proposicao/autor per ano and counts", () =>
      Effect.gen(function* () {
        const camara = yield* CamaraDeputados;
        const total = yield* camara.indexAnos([2026]);
        expect(total).toEqual({
          deputados: 2,
          cotas: 4,
          proposicoes: 2,
          proposicoesAutores: 2,
        });
      })
    );
  }
);
