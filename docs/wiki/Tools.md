# Tools MCP

O servidor expõe 58 tools.

## Consultas

- Legislação: `buscar_legislacao`, `obter_artigo`, `listar_normas`.
- IBGE: `resolver_municipio`, `resolver_codigo_ibge`, `listar_municipios_uf`, `validar_uf`.
- CNAE: `resolver_cnae`, `buscar_cnae`, `listar_cnaes_por_nivel`.
- CATMAT/CATSER: `buscar_material`, `buscar_servico`, `resolver_catmat_catser`, `normalizar_item_edital`.
- SICAF: `buscar_fornecedor_sicaf`, `fornecedor_habilitado`, `listar_fornecedores_uf_cnae`.
- CGU: `verificar_sancoes`, `buscar_sancionado_por_nome`, `sancoes_vigentes_na_data`.
- Receita: `consultar_cnpj`, `buscar_empresa_por_nome`, `buscar_socio_por_nome`, `socios_em_comum`, `filtrar_empresas`.
- TSE: `buscar_doacoes`, `buscar_fornecedor_campanha`, `rastrear_doador_originario`, `due_diligence_candidato`.
- Câmara: `fornecedor_cota_parlamentar`, `gastos_por_fornecedor`, `buscar_deputado`, `buscar_proposicao`.
- Querido Diário: `buscar_diarios`, `buscar_cnpj_em_diario`, `diarios_por_municipio`.
- CAPAG: `capag_ente`, `entes_por_nota`, `capag_serie_historica`, `resolver_ente_por_cnpj`.
- PNCP: `buscar_pncp_local`, `fornecedor_pncp_por_nome`, `contratos_do_fornecedor`, `alertas_pncp`.

## Indexação

- `indexar_legislacao`
- `indexar_ibge_localidades`
- `indexar_cnae`
- `indexar_catmat_catser`
- `indexar_sicaf_fornecedores`
- `indexar_sancoes`
- `indexar_capag`
- `indexar_camara`

Fontes pesadas sem tool dedicada são indexadas pela CLI.

## Status

- `status_indices`

## Guias

- `guia_uso`
- `guia_pesquisar_preco`
- `guia_triagem_fornecedor`
- `guia_mapear_mercado`
- `guia_due_diligence_eleitoral`
