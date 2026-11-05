import { Effect, Match, Schema, Struct } from "effect";
import { Pncp } from "../../sources/pncp/store";
import { NonEmptyString, Uf, positiveIntMax } from "../checks";
import { defineTool } from "../tool";

const Entidade = Schema.Literals(["contratacoes", "contratos", "atas", "todas"]);

const toTipo = Match.type<(typeof Entidade)["Type"]>().pipe(
  Match.when("contratacoes", () => "contratacao" as const),
  Match.when("contratos", () => "contrato" as const),
  Match.when("atas", () => "ata" as const),
  Match.when("todas", () => "todas" as const),
  Match.exhaustive
);

const BuscarPncpInput = Schema.Struct({
  termo: Schema.String.pipe(Schema.check(Schema.isMinLength(2))),
  entidade: Schema.optionalKey(Entidade),
  uf: Schema.optionalKey(Uf),
  municipio: Schema.optionalKey(NonEmptyString),
  orgaoCnpj: Schema.optionalKey(NonEmptyString),
  modalidade: Schema.optionalKey(positiveIntMax(Number.MAX_SAFE_INTEGER)),
  limite: Schema.optionalKey(positiveIntMax(200)),
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
          ...Struct.renameKeys(
            Struct.pick(args, ["termo", "uf", "municipio", "orgaoCnpj", "modalidade", "limite"]),
            { limite: "limit" }
          ),
          ...Match.value(args.entidade).pipe(
            Match.when(Match.undefined, () => ({})),
            Match.orElse((entidade) => ({ tipo: toTipo(entidade) }))
          ),
        })
      )
    ),
});

const FornecedorPorNomeInput = Schema.Struct({
  nome: Schema.String.pipe(Schema.check(Schema.isMinLength(2))),
  limite: Schema.optionalKey(positiveIntMax(200)),
});

const fornecedorPncpPorNome = defineTool({
  name: "fornecedor_pncp_por_nome",
  description:
    "Busca fornecedores por NOME/razao social (FTS) no indice local de contratos PNCP, com total de contratos e valor.",
  input: FornecedorPorNomeInput,
  run: (args) =>
    Pncp.pipe(
      Effect.flatMap((service) =>
        service.fornecedorPncpPorNome(
          args.nome,
          Struct.renameKeys(Struct.pick(args, ["limite"]), { limite: "limit" })
        )
      )
    ),
});

const ContratosDoFornecedorInput = Schema.Struct({
  ni: NonEmptyString,
  limite: Schema.optionalKey(positiveIntMax(200)),
});

const contratosDoFornecedor = defineTool({
  name: "contratos_do_fornecedor",
  description:
    "Lista todos os contratos de um fornecedor por niFornecedor (CNPJ/CPF) em todo o historico local.",
  input: ContratosDoFornecedorInput,
  run: (args) =>
    Pncp.pipe(
      Effect.flatMap((service) =>
        service.contratosDoFornecedor(
          Struct.renameKeys(Struct.pick(args, ["ni", "limite"]), {
            ni: "niFornecedor",
            limite: "limit",
          })
        )
      )
    ),
});

const AlertasInput = Schema.Struct({
  uf: Schema.optionalKey(Uf),
  modalidade: Schema.optionalKey(positiveIntMax(Number.MAX_SAFE_INTEGER)),
  desde: Schema.optionalKey(NonEmptyString),
  limite: Schema.optionalKey(positiveIntMax(200)),
});

const alertasPncp = defineTool({
  name: "alertas_pncp",
  description: "Editais (contratacoes) novos, opcionalmente em UF Y, atualizados desde uma data.",
  input: AlertasInput,
  run: (args) =>
    Pncp.pipe(
      Effect.flatMap((service) =>
        service.alertasPncp(
          Struct.renameKeys(Struct.pick(args, ["uf", "modalidade", "desde", "limite"]), {
            desde: "dataInicial",
            limite: "limit",
          })
        )
      )
    ),
});

export const pncpTools = [
  buscarPncpLocal,
  fornecedorPncpPorNome,
  contratosDoFornecedor,
  alertasPncp,
] as const;
