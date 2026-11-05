import { Context, Effect, Layer, Match, Option, Schema } from "effect";
import * as Arr from "effect/Array";
import { pipe } from "effect/Function";
import * as Str from "effect/String";
import { Duck } from "../../kernel/duck/duck";
import { normalize, onlyDigits } from "../../kernel/text/normalize";
import {
  IDENTIFICADOR_SOCIO,
  MATRIZ_FILIAL,
  PORTE_EMPRESA,
  porteCodigo,
  ReceitaCnpjError,
  SITUACAO_CADASTRAL,
  situacaoCodigo,
} from "./catalog";
import { indexReceitaCnpj } from "./indexer";
import { clamp } from "../../kernel/duck/search";

const nullIfEmpty = (value: string | null | undefined) =>
  value === null || value === undefined || value === "" ? null : value;

const Cond = Schema.Struct({
  clause: Schema.String,
  values: Schema.Array(
    Schema.Union([Schema.Null, Schema.Boolean, Schema.Finite, Schema.BigInt, Schema.String])
  ),
});
type Cond = (typeof Cond)["Type"];

const OptText = Schema.NullOr(Schema.String);

const EstabelecimentoRow = Schema.Struct({
  cnpj_completo: Schema.String,
  cnpj_basico: Schema.String,
  matriz_filial: Schema.String,
  nome_fantasia: Schema.String,
  situacao_cadastral: Schema.String,
  data_situacao: OptText,
  motivo_situacao: Schema.String,
  data_inicio_atividade: OptText,
  cnae_principal: Schema.String,
  cnae_secundario: Schema.String,
  uf: Schema.String,
  municipio: Schema.String,
  bairro: Schema.String,
  logradouro: Schema.String,
  numero: Schema.String,
  complemento: Schema.String,
  cep: Schema.String,
  ddd: Schema.String,
  telefone: Schema.String,
  email: Schema.String,
});

const EmpresaRow = Schema.Struct({
  cnpj_basico: Schema.String,
  razao_social: Schema.String,
  natureza_juridica: Schema.String,
  capital_social: Schema.NullOr(Schema.Finite),
  porte: Schema.String,
});

const SocioRow = Schema.Struct({
  nome_socio: Schema.String,
  identificador_socio: Schema.String,
  cpf_visivel: Schema.String,
  qualificacao: Schema.String,
  data_entrada: OptText,
});

const SimplesRow = Schema.Struct({
  opcao_simples: Schema.String,
  data_opcao_simples: OptText,
  opcao_mei: Schema.String,
  data_opcao_mei: OptText,
});

const DominioRow = Schema.Struct({
  tabela: Schema.String,
  codigo: Schema.String,
  descricao: Schema.String,
});

const EmpresaHitRow = Schema.Struct({
  cnpjBasico: Schema.String,
  razaoSocial: Schema.String,
  naturezaJuridica: Schema.String,
  porte: Schema.String,
  score: Schema.Finite,
  cnpj: OptText,
  nome_fantasia: OptText,
  situacao_cadastral_codigo: OptText,
  uf: OptText,
});

const SocioHitRow = Schema.Struct({
  cnpjBasico: Schema.String,
  nomeSocio: Schema.String,
  cnpjCpfSocio: Schema.String,
  cpfVisivel: Schema.String,
  identificadorSocio: Schema.String,
  qualificacao: Schema.String,
  dataEntrada: OptText,
  score: Schema.Finite,
  razao_social: OptText,
  qualificacao_descricao: OptText,
});

const SocioComumRow = Schema.Struct({
  nome_socio: Schema.String,
  cpf_visivel: Schema.String,
  cnpj_cpf_socio: Schema.String,
  identificador_socio: Schema.String,
  cnpjs_basicos: Schema.Array(Schema.String),
  quantidade_empresas: Schema.Finite,
});

const FiltroRow = Schema.Struct({
  cnpj: Schema.String,
  cnpj_basico: Schema.String,
  razao_social: OptText,
  nome_fantasia: Schema.String,
  situacao_cadastral: Schema.String,
  cnae_principal: Schema.String,
  porte: OptText,
  uf: Schema.String,
  municipio_codigo_rfb: Schema.String,
  municipio: OptText,
});

const CountsRow = Schema.Struct({
  empresas: Schema.Finite,
  estabelecimentos: Schema.Finite,
  socios: Schema.Finite,
  simples: Schema.Finite,
  dominios: Schema.Finite,
});

const situacaoLabel = (codigo: string) =>
  SITUACAO_CADASTRAL[codigo] ??
  SITUACAO_CADASTRAL[pipe(codigo, Str.padStart(2, "0"))] ??
  "desconhecida";

const tokensOf = (nome: string) =>
  pipe(
    normalize(nome),
    Str.split(" "),
    Arr.filter((token) => token !== "")
  );

const nameConditions = (column: string, tokens: readonly string[]): Cond => ({
  clause: pipe(
    tokens,
    Arr.map(() => `${column} ILIKE '%' || ? || '%'`),
    Arr.join(" AND ")
  ),
  values: tokens,
});

const nameTerms = (nome: string) => {
  const tokens = tokensOf(nome);
  return {
    tokens,
    phrase: pipe(tokens, Arr.join(" ")),
    cond: nameConditions("busca", tokens),
  };
};

const joinConds = (conds: readonly Cond[]) =>
  Match.value(conds.length).pipe(
    Match.when(0, () => "true"),
    Match.orElse(() =>
      pipe(
        conds,
        Arr.map((cond) => cond.clause),
        Arr.join(" AND ")
      )
    )
  );

const condValues = (conds: readonly Cond[]) =>
  pipe(
    conds,
    Arr.flatMap((cond) => cond.values)
  );

const makeReceitaCnpj = Effect.gen(function* () {
  const duck = yield* Duck;

  const dominioLabels = (pairs: readonly (readonly [string, string])[]) =>
    Match.value(pairs.length).pipe(
      Match.when(0, () => Effect.succeed(new Map<string, string>())),
      Match.orElse(() =>
        duck
          .query(
            DominioRow,
            `select tabela, codigo, descricao from dominio where ${pipe(
              pairs,
              Arr.map(() => "(tabela = ? and codigo = ?)"),
              Arr.join(" or ")
            )}`,
            pipe(
              pairs,
              Arr.flatMap(([tabela, codigo]) => [tabela, codigo])
            )
          )
          .pipe(
            Effect.map(
              (rows) =>
                new Map(
                  pipe(
                    rows,
                    Arr.map((d) => [`${d.tabela}:${d.codigo}`, d.descricao] as const)
                  )
                )
            )
          )
      )
    );

  const consultarCnpj = (cnpj: string) =>
    Effect.gen(function* () {
      const digits = onlyDigits(cnpj);
      yield* Match.value(digits.length).pipe(
        Match.when(14, () => Effect.void),
        Match.orElse(() => Effect.fail(ReceitaCnpjError.make({ code: "receita.CNPJ_INVALIDO" })))
      );
      const basico = pipe(digits, Str.slice(0, 8));
      const estabRows = yield* duck.query(
        EstabelecimentoRow,
        "select * from estabelecimento where cnpj_completo = ? limit 1",
        [digits]
      );
      return yield* Option.match(Arr.head(estabRows), {
        onNone: () => Effect.succeed(null),
        onSome: (found) =>
          Effect.gen(function* () {
            const empresas = yield* duck.query(
              EmpresaRow,
              "select cnpj_basico, razao_social, natureza_juridica, capital_social, porte from empresa where cnpj_basico = ? limit 1",
              [basico]
            );
            const socios = yield* duck.query(
              SocioRow,
              "select nome_socio, identificador_socio, cpf_visivel, qualificacao, data_entrada from socio where cnpj_basico = ? order by nome_socio, data_entrada",
              [basico]
            );
            const simplesRows = yield* duck.query(
              SimplesRow,
              "select opcao_simples, data_opcao_simples, opcao_mei, data_opcao_mei from simples where cnpj_basico = ? limit 1",
              [basico]
            );
            const emp = Arr.head(empresas);
            const simplesRow = Arr.head(simplesRows);
            const pairs = pipe(
              [
                [
                  "naturezas",
                  Option.match(emp, { onNone: () => "", onSome: (e) => e.natureza_juridica }),
                ],
                ["cnaes", found.cnae_principal],
                ["municipios", found.municipio],
                ["motivos", found.motivo_situacao],
                ...pipe(
                  socios,
                  Arr.map((s) => ["qualificacoes", s.qualificacao] as const)
                ),
              ] as const,
              Arr.filter(([, codigo]) => codigo !== "")
            );
            const label = yield* dominioLabels(pairs);
            const lookup = (tabela: string, codigo: string | null) =>
              codigo !== null && codigo !== "" ? (label.get(`${tabela}:${codigo}`) ?? null) : null;
            const secundarias = pipe(
              found.cnae_secundario,
              Str.split(","),
              Arr.map(Str.trim),
              Arr.filter((c) => c !== "")
            );
            return {
              cnpj: found.cnpj_completo,
              cnpj_basico: found.cnpj_basico,
              razao_social: Option.match(emp, {
                onNone: () => null,
                onSome: (e) => e.razao_social,
              }),
              nome_fantasia: nullIfEmpty(found.nome_fantasia),
              matriz_filial: MATRIZ_FILIAL[found.matriz_filial] ?? found.matriz_filial,
              situacao_cadastral: situacaoLabel(found.situacao_cadastral),
              situacao_cadastral_codigo: found.situacao_cadastral,
              data_situacao: found.data_situacao,
              motivo_situacao: lookup("motivos", found.motivo_situacao),
              data_inicio_atividade: found.data_inicio_atividade,
              cnae_principal: found.cnae_principal,
              cnae_principal_descricao: lookup("cnaes", found.cnae_principal),
              cnae_secundaria: secundarias,
              natureza_juridica: Option.match(emp, {
                onNone: () => null,
                onSome: (e) => e.natureza_juridica,
              }),
              natureza_juridica_descricao: Option.match(emp, {
                onNone: () => null,
                onSome: (e) => lookup("naturezas", e.natureza_juridica),
              }),
              capital_social: Option.match(emp, {
                onNone: () => null,
                onSome: (e) => e.capital_social,
              }),
              porte: Option.match(emp, {
                onNone: () => null,
                onSome: (e) => PORTE_EMPRESA[e.porte] ?? e.porte,
              }),
              endereco: {
                logradouro: found.logradouro,
                numero: found.numero,
                complemento: found.complemento,
                bairro: found.bairro,
                cep: found.cep,
                municipio_codigo_rfb: found.municipio,
                municipio: lookup("municipios", found.municipio),
                uf: found.uf,
              },
              contato: {
                ddd: found.ddd,
                telefone: found.telefone,
                email: found.email,
              },
              simples: {
                opcao_simples: Option.match(simplesRow, {
                  onNone: () => null,
                  onSome: (r) => r.opcao_simples,
                }),
                data_opcao_simples: Option.match(simplesRow, {
                  onNone: () => null,
                  onSome: (r) => r.data_opcao_simples,
                }),
                opcao_mei: Option.match(simplesRow, {
                  onNone: () => null,
                  onSome: (r) => r.opcao_mei,
                }),
                data_opcao_mei: Option.match(simplesRow, {
                  onNone: () => null,
                  onSome: (r) => r.data_opcao_mei,
                }),
              },
              socios: pipe(
                socios,
                Arr.map((s) => ({
                  nome_socio: s.nome_socio,
                  tipo: IDENTIFICADOR_SOCIO[s.identificador_socio] ?? s.identificador_socio,
                  cpf_visivel: nullIfEmpty(s.cpf_visivel),
                  qualificacao: lookup("qualificacoes", s.qualificacao),
                  data_entrada: s.data_entrada,
                }))
              ),
            };
          }),
      });
    });

  const buscarEmpresaPorNome = (nome: string, options?: { readonly limit?: number }) =>
    Effect.gen(function* () {
      const limit = clamp(options?.limit, 20, 100);
      const { tokens, phrase, cond } = nameTerms(nome);
      const rows = yield* Match.value(tokens.length).pipe(
        Match.when(0, () => Effect.succeed([])),
        Match.orElse(() =>
          duck.query(
            EmpresaHitRow,
            `with hit as (
              select cnpj_basico as "cnpjBasico", razao_social as "razaoSocial",
                natureza_juridica as "naturezaJuridica", porte,
                (jaro_winkler_similarity(busca, ?) + case when starts_with(busca, ?) then 1.0 else 0.0 end)::DOUBLE as score
              from empresa
              where ${cond.clause}
              order by score desc, cnpj_basico
              limit ?::BIGINT
            )
            select h.*, e.cnpj_completo as cnpj, e.nome_fantasia, e.situacao_cadastral as situacao_cadastral_codigo, e.uf
            from hit h
            left join (
              select distinct on (cnpj_basico) cnpj_basico, cnpj_completo, nome_fantasia, situacao_cadastral, uf
              from estabelecimento
              where cnpj_basico in (select "cnpjBasico" from hit)
              order by cnpj_basico, matriz_filial, cnpj_completo
            ) e on e."cnpj_basico" = h."cnpjBasico"
            order by h.score desc, h."cnpjBasico"`,
            [phrase, phrase, ...cond.values, limit]
          )
        )
      );
      return pipe(
        rows,
        Arr.map((row) => ({
          cnpjBasico: row.cnpjBasico,
          razaoSocial: row.razaoSocial,
          naturezaJuridica: row.naturezaJuridica,
          porte: PORTE_EMPRESA[row.porte] ?? row.porte,
          score: row.score,
          cnpj: row.cnpj,
          nome_fantasia: row.nome_fantasia,
          situacao_cadastral:
            row.situacao_cadastral_codigo !== null
              ? situacaoLabel(row.situacao_cadastral_codigo)
              : null,
          uf: row.uf,
        }))
      );
    });

  const buscarSocioPorNome = (
    nome: string,
    options?: { readonly limit?: number; readonly cpfVisivel?: string }
  ) =>
    Effect.gen(function* () {
      const limit = clamp(options?.limit, 20, 100);
      const { tokens, phrase, cond } = nameTerms(nome);
      const cpfDigits =
        options?.cpfVisivel !== undefined && options.cpfVisivel !== ""
          ? onlyDigits(options.cpfVisivel)
          : "";
      const cpf =
        cpfDigits === ""
          ? null
          : cpfDigits.length >= 11
            ? pipe(cpfDigits, Str.slice(3, 9))
            : cpfDigits;
      const rows = yield* Match.value(tokens.length).pipe(
        Match.when(0, () => Effect.succeed([])),
        Match.orElse(() =>
          duck.query(
            SocioHitRow,
            `with hit as (
              select cnpj_basico as "cnpjBasico", nome_socio as "nomeSocio",
                cnpj_cpf_socio as "cnpjCpfSocio", cpf_visivel as "cpfVisivel",
                identificador_socio as "identificadorSocio", qualificacao,
                data_entrada as "dataEntrada",
                (jaro_winkler_similarity(busca, ?) + case when starts_with(busca, ?) then 1.0 else 0.0 end)::DOUBLE as score
              from socio
              where ${cond.clause}
                and (?::VARCHAR is null or cpf_visivel = ?::VARCHAR)
              order by score desc, cnpj_basico, nome_socio
              limit ?::BIGINT
            )
            select h.*,
              (select max(e.razao_social) from empresa e where e.cnpj_basico = h."cnpjBasico") as razao_social,
              (select max(d.descricao) from dominio d where d.tabela = 'qualificacoes' and d.codigo = h.qualificacao) as qualificacao_descricao
            from hit h
            order by h.score desc, h."cnpjBasico", h."nomeSocio"`,
            [phrase, phrase, ...cond.values, cpf, cpf, limit]
          )
        )
      );
      return pipe(
        rows,
        Arr.map((row) => ({
          ...row,
          tipo: IDENTIFICADOR_SOCIO[row.identificadorSocio] ?? row.identificadorSocio,
        }))
      );
    });

  const sociosEmComum = (cnpjs: readonly string[]) =>
    Effect.gen(function* () {
      const basicos = Arr.dedupe(
        pipe(
          cnpjs,
          Arr.map((c) => pipe(onlyDigits(c), Str.slice(0, 8))),
          Arr.filter((value) => value !== "")
        )
      );
      const rows = yield* Match.value(basicos.length < 2).pipe(
        Match.when(true, () => Effect.succeed([])),
        Match.orElse(() =>
          duck.query(
            SocioComumRow,
            `select any_value(nome_socio) as nome_socio, any_value(cpf_visivel) as cpf_visivel,
              any_value(cnpj_cpf_socio) as cnpj_cpf_socio, any_value(identificador_socio) as identificador_socio,
              list_sort(list(distinct cnpj_basico)) as cnpjs_basicos,
              count(distinct cnpj_basico)::INTEGER as quantidade_empresas
            from socio
            where cnpj_basico in (${pipe(
              basicos,
              Arr.map(() => "?"),
              Arr.join(", ")
            )})
            group by case when cnpj_cpf_socio <> '' then cnpj_cpf_socio else busca || ':' || cpf_visivel end
            having count(distinct cnpj_basico) >= 2
            order by quantidade_empresas desc, nome_socio`,
            basicos
          )
        )
      );
      return pipe(
        rows,
        Arr.map((row) => ({
          nome_socio: row.nome_socio,
          cpf_visivel: nullIfEmpty(row.cpf_visivel),
          cnpj_cpf_socio: nullIfEmpty(row.cnpj_cpf_socio),
          tipo: IDENTIFICADOR_SOCIO[row.identificador_socio] ?? row.identificador_socio,
          cnpjs_basicos: row.cnpjs_basicos,
          quantidade_empresas: row.quantidade_empresas,
        }))
      );
    });

  const filtrarEmpresas = (options: {
    readonly cnae?: string;
    readonly uf?: string;
    readonly municipio?: string;
    readonly porte?: string;
    readonly situacao?: string;
    readonly limit?: number;
  }) =>
    Effect.gen(function* () {
      const limit = clamp(options.limit, 50, 200);
      const conds = Arr.getSomes([
        pipe(
          Option.fromNullishOr(options.uf),
          Option.map((uf): Cond => ({
            clause: "e.uf = ?",
            values: [pipe(uf, Str.trim, Str.toUpperCase)],
          }))
        ),
        pipe(
          Option.fromNullishOr(options.cnae),
          Option.map((cnae): Cond => ({
            clause: "e.cnae_principal = ?",
            values: [onlyDigits(cnae)],
          }))
        ),
        pipe(
          Option.fromNullishOr(options.municipio),
          Option.map((municipio): Cond => ({
            clause: "e.municipio = ?",
            values: [onlyDigits(municipio)],
          }))
        ),
        pipe(
          Option.fromNullishOr(options.situacao),
          Option.flatMap((situacao) => Option.fromNullishOr(situacaoCodigo(situacao))),
          Option.map((codigo): Cond => ({
            clause: "e.situacao_cadastral in (?, ?)",
            values: [codigo, pipe(codigo, Str.padStart(2, "0"))],
          }))
        ),
        pipe(
          Option.fromNullishOr(options.porte),
          Option.flatMap((porte) => Option.fromNullishOr(porteCodigo(porte))),
          Option.map((porte): Cond => ({
            clause: "emp.porte = ?",
            values: [porte],
          }))
        ),
      ]);
      const rows = yield* duck.query(
        FiltroRow,
        `with hit as (
          select e.cnpj_completo as cnpj, e.cnpj_basico, e.nome_fantasia, e.situacao_cadastral,
            e.cnae_principal, e.uf, e.municipio as municipio_codigo_rfb, emp.porte, emp.razao_social
          from estabelecimento e
          left join empresa emp on emp.cnpj_basico = e.cnpj_basico
          where ${joinConds(conds)}
          order by e.cnpj_completo
          limit ?::BIGINT
        )
        select h.*,
          (select max(d.descricao) from dominio d where d.tabela = 'municipios' and d.codigo = h.municipio_codigo_rfb) as municipio
        from hit h
        order by h.cnpj`,
        [...condValues(conds), limit]
      );
      return pipe(
        rows,
        Arr.map((row) => ({
          cnpj: row.cnpj,
          cnpj_basico: row.cnpj_basico,
          razao_social: row.razao_social,
          nome_fantasia: nullIfEmpty(row.nome_fantasia),
          situacao_cadastral: situacaoLabel(row.situacao_cadastral),
          cnae_principal: row.cnae_principal,
          porte: row.porte !== null ? (PORTE_EMPRESA[row.porte] ?? row.porte) : null,
          uf: row.uf,
          municipio_codigo_rfb: row.municipio_codigo_rfb,
          municipio: row.municipio,
        }))
      );
    });

  const index = indexReceitaCnpj().pipe(
    Effect.provideService(Duck, duck),
    Effect.andThen(
      duck.query(
        CountsRow,
        `select
          (select count(*) from empresa)::INTEGER as empresas,
          (select count(*) from estabelecimento)::INTEGER as estabelecimentos,
          (select count(*) from socio)::INTEGER as socios,
          (select count(*) from simples)::INTEGER as simples,
          (select count(*) from dominio)::INTEGER as dominios`
      )
    ),
    Effect.map((rows) =>
      Option.getOrElse(Arr.head(rows), () => ({
        empresas: 0,
        estabelecimentos: 0,
        socios: 0,
        simples: 0,
        dominios: 0,
      }))
    )
  );

  return {
    index,
    indexAll: index,
    consultarCnpj,
    buscarEmpresaPorNome,
    buscarSocioPorNome,
    sociosEmComum,
    filtrarEmpresas,
  };
});

export class ReceitaCnpj extends Context.Service<
  ReceitaCnpj,
  Effect.Success<typeof makeReceitaCnpj>
>()("dados-publicos-mcp/sources/receita-cnpj/store/ReceitaCnpj") {}

export const ReceitaCnpjLive = Layer.effect(ReceitaCnpj)(makeReceitaCnpj);
