import { Effect, Schema, Struct } from "effect";
import { ReceitaCnpj } from "../../sources/receita-cnpj/store";
import { NonEmptyString, positiveIntMax } from "../checks";
import { defineTool } from "../tool";

const ConsultarInput = Schema.Struct({ cnpj: NonEmptyString });

const consultarCnpj = defineTool({
  name: "consultar_cnpj",
  description:
    "Consulta um CNPJ completo (14 digitos) no indice local da Receita Federal. Offline, sem rate limit.",
  input: ConsultarInput,
  run: (args) =>
    ReceitaCnpj.pipe(
      Effect.flatMap((service) => service.consultarCnpj(args.cnpj))
    ),
});

const BuscarEmpresaInput = Schema.Struct({
  nome: NonEmptyString,
  limite: Schema.optionalKey(positiveIntMax(100)),
});

const buscarEmpresaPorNome = defineTool({
  name: "buscar_empresa_por_nome",
  description:
    "Busca empresas por razao social ou nome fantasia (BM25 com fallback fuzzy pg_trgm).",
  input: BuscarEmpresaInput,
  run: (args) =>
    ReceitaCnpj.pipe(
      Effect.flatMap((service) =>
        service.buscarEmpresaPorNome(args.nome, Struct.renameKeys(Struct.pick(args, ["limite"]), { limite: "limit" }))
      )
    ),
});

const BuscarSocioInput = Schema.Struct({
  nome: NonEmptyString,
  cpf_visivel: Schema.optionalKey(Schema.String),
  limite: Schema.optionalKey(positiveIntMax(100)),
});

const buscarSocioPorNome = defineTool({
  name: "buscar_socio_por_nome",
  description:
    "Busca socios por nome (QSA) e lista todas as empresas em que aparece. Opcionalmente filtra pelos 6 digitos visiveis do CPF mascarado.",
  input: BuscarSocioInput,
  run: (args) =>
    ReceitaCnpj.pipe(
      Effect.flatMap((service) =>
        service.buscarSocioPorNome(args.nome, Struct.renameKeys(Struct.pick(args, ["limite", "cpf_visivel"]), { limite: "limit", cpf_visivel: "cpfVisivel" }))
      )
    ),
});

const SociosEmComumInput = Schema.Struct({
  cnpjs: Schema.Array(NonEmptyString).pipe(Schema.check(Schema.isMinLength(2))),
});

const sociosEmComum = defineTool({
  name: "socios_em_comum",
  description:
    "Recebe dois ou mais CNPJs e retorna os socios compartilhados (deteccao de conluio/laranjas em licitacoes).",
  input: SociosEmComumInput,
  run: (args) =>
    ReceitaCnpj.pipe(
      Effect.flatMap((service) => service.sociosEmComum(args.cnpjs))
    ),
});

const FiltrarInput = Schema.Struct({
  cnae: Schema.optionalKey(NonEmptyString),
  uf: Schema.optionalKey(NonEmptyString),
  municipio: Schema.optionalKey(NonEmptyString),
  porte: Schema.optionalKey(NonEmptyString),
  situacao: Schema.optionalKey(NonEmptyString),
  limite: Schema.optionalKey(positiveIntMax(200)),
}).pipe(
  Schema.check(
    Schema.makeFilter((value) =>
      value.cnae !== undefined ||
      value.uf !== undefined ||
      value.municipio !== undefined ||
      value.porte !== undefined ||
      value.situacao !== undefined
        ? undefined
        : "Informe ao menos um filtro: cnae, uf, municipio, porte ou situacao."
    )
  )
);

const filtrarEmpresas = defineTool({
  name: "filtrar_empresas",
  description:
    "Filtra empresas por CNAE, UF, municipio (codigo RFB), porte (ME/EPP) e situacao cadastral.",
  input: FiltrarInput,
  run: (args) =>
    ReceitaCnpj.pipe(
      Effect.flatMap((service) =>
        service.filtrarEmpresas(Struct.renameKeys(Struct.pick(args, ["cnae", "uf", "municipio", "porte", "situacao", "limite"]), { limite: "limit" }))
      )
    ),
});

export const receitaTools = [
  consultarCnpj,
  buscarEmpresaPorNome,
  buscarSocioPorNome,
  sociosEmComum,
  filtrarEmpresas,
] as const;
