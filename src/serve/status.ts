import { Effect, Option, Schema } from "effect";
import * as Arr from "effect/Array";
import * as Rec from "effect/Record";
import * as Str from "effect/String";
import { Duck } from "../kernel/duck/duck";
import { CorpusGit, corpusDir, corpusNames } from "../kernel/search/corpus";
import { type FonteKey, indexRegistry } from "./index-registry";
import { defineTool } from "./tool";

const TableRow = Schema.Struct({ tabela: Schema.String, linhas: Schema.Finite });

const banco = Duck.pipe(
  Effect.flatMap((duck) =>
    duck.query(
      TableRow,
      "SELECT table_name AS tabela, estimated_size::INTEGER AS linhas FROM duckdb_tables() WHERE schema_name = 'main' ORDER BY table_name"
    )
  ),
  Effect.map((rows) =>
    Rec.fromEntries(
      Arr.map(
        Arr.filter(rows, (row) => !Str.startsWith("fts_main_")(row.tabela)),
        (row): readonly [string, number] => [row.tabela, row.linhas]
      )
    )
  ),
  Effect.orElseSucceed((): Record<string, number> => ({}))
);

type AcervoInfo = {
  readonly baixado: boolean;
  readonly commit: string | null;
  readonly data: string | null;
};

const ausente: AcervoInfo = { baixado: false, commit: null, data: null };

const acervos = CorpusGit.pipe(
  Effect.flatMap((git) =>
    Effect.forEach(corpusNames, (corpus) =>
      corpusDir(corpus).pipe(
        Effect.flatMap((dir) => git.localHead(corpus, dir)),
        Effect.map((head) =>
          Option.match(head, {
            onNone: (): AcervoInfo => ausente,
            onSome: ({ commit, date }): AcervoInfo => ({ baixado: true, commit, data: date }),
          })
        ),
        Effect.orElseSucceed(() => ausente),
        Effect.map((info): readonly [string, AcervoInfo] => [corpus, info])
      )
    )
  ),
  Effect.map(Rec.fromEntries)
);

const descriptions: Record<FonteKey, string> = {
  "tce-rs":
    "LicitaCon do TCE-RS: licitações, contratos, itens e participantes em 24 tabelas anuais.",
  "tce-pr":
    "Mural de Licitações do TCE-PR por ano, com os campos publicados e valores de referência; CPF é mascarado.",
  "compras-gov":
    "SIASG/Comprasnet, contratos e itens, ARP, resultados, fornecedores, UASG/órgãos e PCA; exige mês e órgãos, com limites de fan-out explícitos.",
  bndes:
    "Operações não automáticas e com entes da administração direta do BNDES, sem a carga de indiretas automáticas; cadastro de entes não publica CNPJ.",
  ibama:
    "Autos de infração e termos de embargo do IBAMA, excluindo cancelamento S e mascarando CPF antes da gravação.",
  "mte-lista-suja":
    "Cadastro de empregadores da Lista Suja do MTE; bloqueio do gov.br é informado sem substituição por espelho defasado.",
  "portal-transparencia":
    "PEP, cartões CPGF e emendas parlamentares do período mais recente disponível; períodos calculados e sondados por HEAD.",
  "servidores-siape":
    "Cadastro de servidores SIAPE do Portal da Transparência; carga pesada pela CLI, sem arquivos de remuneração.",
  cvm: "Companhias abertas, fundos, processos sancionadores e acusados da CVM; processos se vinculam por NUP e não publicam CNPJ de acusados.",
  pgfn: "Dívida ativa Previdenciária e FGTS da PGFN, com CPF mascarado e CNPJ completo.",
  "pgfn-nao-previdenciario":
    "Dívida ativa Não-Previdenciária da PGFN, carga pesada exclusiva pela CLI.",
  "indices-reajuste":
    "Taxas mensais SGS/BCB e número-índice IPCA do SIDRA/IBGE, em séries distintas.",
  leis: "Legislação brasileira em Markdown, com caminhos para citação.",
  precedentes: "Precedentes, súmulas e decisões em Markdown.",
  "ibge-localidades": "Municípios, códigos IBGE, unidades federativas e regiões.",
  cnae: "Classificação Nacional de Atividades Econômicas e sua hierarquia.",
  "catmat-catser": "Catálogos de materiais e serviços das compras públicas.",
  "sicaf-fornecedores": "Cadastro de fornecedores do governo federal.",
  "sancoes-cgu": "Sanções e impedimentos publicados pela CGU.",
  "receita-cnpj": "Empresas, estabelecimentos, sócios, Simples e domínios do CNPJ.",
  "tse-eleitoral": "Candidaturas, bens, receitas e despesas eleitorais.",
  "camara-deputados": "Deputados, cotas parlamentares, proposições e autores.",
  "querido-diario": "Diários oficiais municipais e documentos mencionados.",
  capag: "Capacidade de pagamento de estados e municípios e cadastro de entes.",
  pncp: "Contratações, contratos, fornecedores, atas, itens e instrumentos de cobrança do PNCP.",
  "tcu-inidoneos": "Licitantes inidôneos publicados pelo TCU.",
  "ibge-economia": "Indicadores econômicos municipais do IBGE.",
  senado: "Senadores e despesas da cota parlamentar.",
  "cmed-anvisa": "Preços regulados de medicamentos da CMED/ANVISA.",
  "siconfi-fiscal": "Demonstrativos fiscais de entes federativos.",
  transferegov: "Convênios e transferências federais.",
  "painel-precos": "Amostras de preços unitários praticados em compras públicas.",
  "transparencia-despesas": "Despesas federais do Portal da Transparência.",
  sinapi: "Custos de insumos da construção civil por período e localidade.",
};

export const fontes = defineTool({
  name: "fontes",
  description:
    "Descobre fontes e acervos locais, disponibilidade, volume, colunas, tipos e campos de busca textual. Fontes pesadas exigem indexação pela CLI.",
  input: Schema.Struct({}),
  run: () =>
    Effect.all({ banco, acervos }, { concurrency: 2 }).pipe(
      Effect.map((status) => ({
        fontes: Arr.map(Rec.toEntries(indexRegistry), ([fonte, entry]) => ({
          fonte,
          descricao: descriptions[fonte],
          pesada: entry.heavy,
          indexada: Arr.isReadonlyArrayNonEmpty(entry.tables)
            ? Arr.every(entry.tables, (table) => status.banco[table.name] !== undefined)
            : (status.acervos[fonte]?.baixado ?? false),
          tabelas: Arr.map(entry.tables, (table) => ({
            tabela: table.name,
            linhas: status.banco[table.name] ?? 0,
            colunas: table.columns,
            busca: table.search ?? [],
          })),
        })),
        acervos: status.acervos,
      }))
    ),
});
