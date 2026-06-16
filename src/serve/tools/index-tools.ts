import { Effect, Schema } from "effect";
import { CamaraDeputados } from "../../sources/camara-deputados/store";
import { Capag } from "../../sources/capag/store";
import { CatmatCatser } from "../../sources/catmat-catser/store";
import { Cnae } from "../../sources/cnae/store";
import { IbgeEconomia } from "../../sources/ibge-economia/store";
import { IbgeLocalidades } from "../../sources/ibge-localidades/store";
import { Legislacao } from "../../sources/legislacao/store";
import { SancoesCgu } from "../../sources/sancoes-cgu/store";
import { Sicaf } from "../../sources/sicaf-fornecedores/store";
import { TcuInidoneos } from "../../sources/tcu-inidoneos/store";
import { defineTool } from "../tool";

const NoInput = Schema.Struct({});

const indexarLegislacao = defineTool({
  name: "indexar_legislacao",
  description:
    "Baixa fontes oficiais do Planalto e recria o indice local neste computador.",
  input: NoInput,
  run: () => Legislacao.pipe(Effect.flatMap((service) => service.indexAll)),
});

const indexarIbgeLocalidades = defineTool({
  name: "indexar_ibge_localidades",
  description:
    "Baixa a lista de municipios do IBGE e recria o indice local de localidades neste computador.",
  input: NoInput,
  run: () => IbgeLocalidades.pipe(Effect.flatMap((service) => service.index)),
});

const indexarCnae = defineTool({
  name: "indexar_cnae",
  description: "Baixa a tabela CNAE 2.0 do IBGE e recria o indice local neste computador.",
  input: NoInput,
  run: () => Cnae.pipe(Effect.flatMap((service) => service.index)),
});

const indexarCatmatCatser = defineTool({
  name: "indexar_catmat_catser",
  description:
    "Pagina a API Compras.gov.br e recria o indice local CATMAT/CATSER neste computador.",
  input: NoInput,
  run: () => CatmatCatser.pipe(Effect.flatMap((service) => service.index)),
});

const indexarSicafFornecedores = defineTool({
  name: "indexar_sicaf_fornecedores",
  description:
    "Baixa o cadastro de fornecedores do Compras.gov.br (SICAF) e recria o indice local neste computador.",
  input: NoInput,
  run: () => Sicaf.pipe(Effect.flatMap((service) => service.index)),
});

const indexarSancoes = defineTool({
  name: "indexar_sancoes",
  description:
    "Baixa os snapshots diarios da CGU (CEIS/CNEP/CEAF/CEPIM/Acordos) e recria o indice local neste computador.",
  input: NoInput,
  run: () => SancoesCgu.pipe(Effect.flatMap((service) => service.index)),
});

const indexarCapag = defineTool({
  name: "indexar_capag",
  description:
    "Baixa CAPAG (estados CSV historico + municipios XLSX) e /entes do SICONFI e recria o indice local.",
  input: NoInput,
  run: () => Capag.pipe(Effect.flatMap((service) => service.index)),
});

const indexarCamara = defineTool({
  name: "indexar_camara",
  description:
    "DOWNLOAD PESADO: baixa os arquivos da Camara (deputados + CEAP por ano, opcionalmente proposicoes) e recria o indice local.",
  input: NoInput,
  run: () => CamaraDeputados.pipe(Effect.flatMap((service) => service.index)),
});

const indexarTcuInidoneos = defineTool({
  name: "indexar_tcu_inidoneos",
  description:
    "Baixa as listas de inidoneos/inabilitados do TCU e recria o indice local neste computador.",
  input: NoInput,
  run: () => TcuInidoneos.pipe(Effect.flatMap((service) => service.index)),
});

const indexarIbgeEconomia = defineTool({
  name: "indexar_ibge_economia",
  description:
    "Baixa populacao estimada e PIB dos municipios (IBGE SIDRA) e recria o indice local neste computador.",
  input: NoInput,
  run: () => IbgeEconomia.pipe(Effect.flatMap((service) => service.index)),
});

export const indexTools = [
  indexarLegislacao,
  indexarIbgeLocalidades,
  indexarCnae,
  indexarCatmatCatser,
  indexarSicafFornecedores,
  indexarSancoes,
  indexarCapag,
  indexarCamara,
  indexarTcuInidoneos,
  indexarIbgeEconomia,
] as const;
