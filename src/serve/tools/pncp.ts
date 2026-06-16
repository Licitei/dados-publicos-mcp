import { Effect, Match, Schema } from "effect";
import { Pncp } from "../../sources/pncp/store";
import { NonEmptyString, Uf, positiveIntMax } from "../checks";
import { defineTool } from "../tool";

const Entidade = Schema.Literals([
  "contratacoes",
  "contratos",
  "atas",
  "todas",
]);

const toTipo = Match.type<(typeof Entidade)["Type"]>().pipe(
  Match.when("contratacoes", () => "contratacao" as const),
  Match.when("contratos", () => "contrato" as const),
  Match.when("atas", () => "ata" as const),
  Match.when("todas", () => "todas" as const),
  Match.exhaustive
);

const BuscarPncpInput = Schema.Struct({
  termo: Schema.String.pipe(Schema.check(Schema.isMinLength(2))),
  entidade: Schema.optional(Entidade),
  uf: Schema.optional(Uf),
  municipio: Schema.optional(NonEmptyString),
  orgaoCnpj: Schema.optional(NonEmptyString),
  modalidade: Schema.optional(positiveIntMax(Number.MAX_SAFE_INTEGER)),
  limite: Schema.optional(positiveIntMax(200)),
});

const buscarPncpLocal = defineTool({
  name: "buscar_pncp_local",
  description:
    "Busca full-text (FTS) no objetoCompra/objetoContrato/objetoContratacao em TODO o indice local do PNCP.",
  input: BuscarPncpInput,
  run: (args) =>
    Pncp.pipe(
      Effect.flatMap((service) =>
        service.buscarPncp({
          termo: args.termo,
          tipo: Match.value(args.entidade).pipe(
            Match.when(Match.undefined, () => undefined),
            Match.orElse(toTipo)
          ),
          uf: args.uf,
          municipio: args.municipio,
          orgaoCnpj: args.orgaoCnpj,
          modalidade: args.modalidade,
          limit: args.limite,
        })
      )
    ),
});

const FornecedorPorNomeInput = Schema.Struct({
  nome: Schema.String.pipe(Schema.check(Schema.isMinLength(2))),
  limite: Schema.optional(positiveIntMax(200)),
});

const fornecedorPncpPorNome = defineTool({
  name: "fornecedor_pncp_por_nome",
  description:
    "Busca fornecedores por NOME/razao social (FTS) no indice local de contratos PNCP, com total de contratos e valor.",
  input: FornecedorPorNomeInput,
  run: (args) =>
    Pncp.pipe(
      Effect.flatMap((service) =>
        service.fornecedorPncpPorNome(args.nome, { limit: args.limite })
      )
    ),
});

const ContratosDoFornecedorInput = Schema.Struct({
  ni: NonEmptyString,
  limite: Schema.optional(positiveIntMax(200)),
});

const contratosDoFornecedor = defineTool({
  name: "contratos_do_fornecedor",
  description:
    "Lista todos os contratos de um fornecedor por niFornecedor (CNPJ/CPF) em todo o historico local.",
  input: ContratosDoFornecedorInput,
  run: (args) =>
    Pncp.pipe(
      Effect.flatMap((service) =>
        service.contratosDoFornecedor({
          niFornecedor: args.ni,
          limit: args.limite,
        })
      )
    ),
});

const AlertasInput = Schema.Struct({
  uf: Schema.optional(Uf),
  modalidade: Schema.optional(positiveIntMax(Number.MAX_SAFE_INTEGER)),
  desde: Schema.optional(NonEmptyString),
  limite: Schema.optional(positiveIntMax(200)),
});

const alertasPncp = defineTool({
  name: "alertas_pncp",
  description:
    "Editais (contratacoes) novos, opcionalmente em UF Y, atualizados desde uma data.",
  input: AlertasInput,
  run: (args) =>
    Pncp.pipe(
      Effect.flatMap((service) =>
        service.alertasPncp({
          uf: args.uf,
          modalidade: args.modalidade,
          dataInicial: args.desde,
          limit: args.limite,
        })
      )
    ),
});

export const pncpTools = [
  buscarPncpLocal,
  fornecedorPncpPorNome,
  contratosDoFornecedor,
  alertasPncp,
] as const;
