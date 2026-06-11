import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const modalidades = [
  { codigo: 1, nome: "Leilao - Eletronico" },
  { codigo: 2, nome: "Dialogo Competitivo" },
  { codigo: 3, nome: "Concurso" },
  { codigo: 4, nome: "Concorrencia - Eletronica" },
  { codigo: 5, nome: "Concorrencia - Presencial" },
  { codigo: 6, nome: "Pregao - Eletronico" },
  { codigo: 7, nome: "Pregao - Presencial" },
  { codigo: 8, nome: "Dispensa" },
  { codigo: 9, nome: "Inexigibilidade" },
  { codigo: 10, nome: "Manifestacao de Interesse" },
  { codigo: 11, nome: "Pre-qualificacao" },
  { codigo: 12, nome: "Credenciamento" },
  { codigo: 13, nome: "Leilao - Presencial" },
];

const scope = {
  faz: [
    "Consulta legislacao oficial indexada localmente.",
    "Consulta PNCP online para licitacoes, contratos, atas RP, orgaos e PCA.",
    "Consulta dados cadastrais de CNPJ via BrasilAPI ou MinhaReceita.",
    "Mantem indices LOCAIS de fontes oficiais (rode `index <fonte>`): legislacao, ibge-localidades, cnae, sancoes-cgu, catmat-catser, sicaf-fornecedores, capag, receita-cnpj, tse-eleitoral, camara-deputados, querido-diario e pncp-bulk.",
    "Habilita buscas que a API online nao oferece: FTS por texto/objeto no PNCP local, reverse-lookup de fornecedores por nome, cruzamento por CNPJ/CPF.",
    "Expoe `status_indices` para inspecionar quais dominios estao construidos (existe, storage, atualizadoEm, registros, heavy, caminho).",
    "Retorna dados brutos estruturados para o agente analisar.",
  ],
  naoFaz: [
    "Nao usa banco proprio de licitacoes alem dos indices locais reconstruiveis a partir das fontes oficiais.",
    "Nao faz matching proprietario, scoring, analise de viabilidade ou propostas.",
    "Nao baixa automaticamente as fontes pesadas (receita-cnpj, tse-eleitoral, camara-deputados, querido-diario, pncp-bulk): exigem `index --include-heavy` ou `index <fonte>` explicito.",
  ],
};

export function registerDadosPublicosResources(server: McpServer) {
  server.registerResource(
    "modalidades_pncp",
    "licitacao://modalidades",
    {
      title: "Modalidades PNCP",
      description: "Tabela de referencia dos codigos de modalidade PNCP.",
      mimeType: "application/json",
    },
    (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(modalidades, null, 2),
        },
      ],
    })
  );

  server.registerResource(
    "escopo_dados_publicos_mcp",
    "dados-publicos://scope",
    {
      title: "Escopo do dados-publicos-mcp",
      description: "O que este MCP faz e nao faz.",
      mimeType: "application/json",
    },
    (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(scope, null, 2),
        },
      ],
    })
  );
}
