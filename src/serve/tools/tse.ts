import { Effect, Schema, Struct } from "effect";
import { TseEleitoral } from "../../sources/tse-eleitoral/store";
import { NonEmptyString, intYear, positiveIntMax } from "../checks";
import { defineTool } from "../tool";

const BuscarDoacoesInput = Schema.Struct({
  termo: NonEmptyString,
  ano: Schema.optionalKey(intYear),
  limite: Schema.optionalKey(positiveIntMax(200)),
});

const buscarDoacoes = defineTool({
  name: "buscar_doacoes",
  description:
    "Busca doacoes/receitas eleitorais por CPF/CNPJ ou nome do doador. Fonte: TSE (CC-BY).",
  input: BuscarDoacoesInput,
  run: (args) =>
    TseEleitoral.pipe(
      Effect.flatMap((service) =>
        service.buscarDoacoes(args.termo, Struct.renameKeys(Struct.pick(args, ["ano", "limite"]), { limite: "limit" }))
      )
    ),
});

const BuscarFornecedorInput = Schema.Struct({
  termo: NonEmptyString,
  ano: Schema.optionalKey(intYear),
  limite: Schema.optionalKey(positiveIntMax(200)),
});

const buscarFornecedorCampanha = defineTool({
  name: "buscar_fornecedor_campanha",
  description:
    "Busca fornecedores de campanha (despesas contratadas) por CPF/CNPJ ou nome. Fonte: TSE (CC-BY).",
  input: BuscarFornecedorInput,
  run: (args) =>
    TseEleitoral.pipe(
      Effect.flatMap((service) =>
        service.buscarFornecedorCampanha(args.termo, Struct.renameKeys(Struct.pick(args, ["ano", "limite"]), { limite: "limit" }))
      )
    ),
});

const RastrearInput = Schema.Struct({
  cpfCnpj: NonEmptyString,
  ano: Schema.optionalKey(intYear),
  limite: Schema.optionalKey(positiveIntMax(200)),
});

const rastrearDoadorOriginario = defineTool({
  name: "rastrear_doador_originario",
  description:
    "Rastreia a cadeia de doacao via doador originario (CPF/CNPJ). Fonte: TSE (CC-BY).",
  input: RastrearInput,
  run: (args) =>
    TseEleitoral.pipe(
      Effect.flatMap((service) =>
        service.rastrearDoadorOriginario(args.cpfCnpj, Struct.renameKeys(Struct.pick(args, ["ano", "limite"]), { limite: "limit" }))
      )
    ),
});

const DueDiligenceInput = Schema.Struct({
  cpf: Schema.optionalKey(NonEmptyString),
  sqCandidato: Schema.optionalKey(NonEmptyString),
  ano: Schema.optionalKey(intYear),
}).pipe(
  Schema.check(
    Schema.makeFilter((value) =>
      value.cpf !== undefined || value.sqCandidato !== undefined
        ? undefined
        : "Informe cpf ou sqCandidato."
    )
  )
);

const dueDiligenceCandidato = defineTool({
  name: "due_diligence_candidato",
  description:
    "Due diligence de candidato por CPF ou SQ_CANDIDATO: candidatura(s) e bens declarados. Fonte: TSE (CC-BY).",
  input: DueDiligenceInput,
  run: (args) =>
    TseEleitoral.pipe(
      Effect.flatMap((service) =>
        service.dueDiligenceCandidato(Struct.pick(args, ["cpf", "sqCandidato", "ano"]))
      )
    ),
});

export const tseTools = [
  buscarDoacoes,
  buscarFornecedorCampanha,
  rastrearDoadorOriginario,
  dueDiligenceCandidato,
] as const;
