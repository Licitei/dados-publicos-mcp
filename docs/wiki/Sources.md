# Fontes

| Fonte | Peso | Conteúdo |
| --- | --- | --- |
| `legislacao` | leve | Normas oficiais e artigos. |
| `ibge-localidades` | leve | UFs e municípios. |
| `cnae` | leve | CNAE 2.0. |
| `catmat-catser` | leve | Materiais e serviços. |
| `sicaf-fornecedores` | leve | Fornecedores SICAF. |
| `sancoes-cgu` | leve | CEIS, CNEP, CEPIM, CEAF e leniência. |
| `capag` | leve | CAPAG e entes SICONFI. |
| `receita-cnpj` | pesada | Empresas, estabelecimentos, sócios e Simples. |
| `tse-eleitoral` | pesada | Candidatos, bens, receitas e despesas. |
| `camara-deputados` | pesada | Deputados, CEAP e proposições. |
| `querido-diario` | pesada | Diários oficiais municipais. |
| `pncp` | pesada | Contratações, contratos e atas. |

Fontes pesadas não entram no `bun run index` padrão. Use `index <fonte>` ou `--include-heavy`.
