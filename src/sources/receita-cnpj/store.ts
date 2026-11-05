import { Context, Effect, Layer, Match, Option } from "effect";
import * as Arr from "effect/Array";
import { pipe } from "effect/Function";
import * as Rec from "effect/Record";
import * as Str from "effect/String";
import { sql } from "drizzle-orm";
import { Db } from "../../kernel/db/client";
import { dominio } from "../../kernel/db/schemas/dominio";
import { empresa } from "../../kernel/db/schemas/empresa";
import { estabelecimento } from "../../kernel/db/schemas/estabelecimento";
import { simples } from "../../kernel/db/schemas/simples";
import { socio } from "../../kernel/db/schemas/socio";
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

const clamp = (value: number | undefined, fallback: number, max: number) =>
  value === undefined || value < 1
    ? fallback
    : Math.min(Math.trunc(value), max);

const nullIfEmpty = (value: string | null | undefined) =>
  value === null || value === undefined || value === "" ? null : value;

const nonEmptyStrings = (values: readonly unknown[]) =>
  pipe(
    values,
    Arr.filter(
      (value): value is string => typeof value === "string" && value.length > 0
    )
  );

const countOf = (rows: readonly Record<string, unknown>[]) =>
  pipe(
    Arr.head(rows),
    Option.match({
      onNone: () => 0,
      onSome: (row) => Number(row.count),
    })
  );

const situacaoLabel = (codigo: string) =>
  SITUACAO_CADASTRAL[codigo] ??
  SITUACAO_CADASTRAL[pipe(codigo, Str.padStart(2, "0"))] ??
  "desconhecida";

const empresaColumns = {
  cnpjBasico: true,
  razaoSocial: true,
  naturezaJuridica: true,
  capitalSocial: true,
  porte: true,
} as const;

const socioComumColumns = {
  cnpjBasico: true,
  identificadorSocio: true,
  nomeSocio: true,
  nomeSocioNorm: true,
  cnpjCpfSocio: true,
  cpfVisivel: true,
} as const;

const estabFiltroColumns = {
  cnpjCompleto: true,
  cnpjBasico: true,
  nomeFantasia: true,
  situacaoCadastral: true,
  cnaePrincipal: true,
  uf: true,
  municipio: true,
  porte: true,
} as const;

const makeReceitaCnpj = Effect.gen(function* () {
  const db = yield* Db;

  const consultarCnpj = (cnpj: string) =>
    Effect.gen(function* () {
      const digits = onlyDigits(cnpj);
      yield* Match.value(digits.length).pipe(
        Match.when(14, () => Effect.void),
        Match.orElse(() =>
          Effect.fail(ReceitaCnpjError.make({ code: "receita.CNPJ_INVALIDO" }))
        )
      );
      const basico = pipe(digits, Str.slice(0, 8));
      const estab = yield* db.query.estabelecimento.findFirst({
        where: { cnpjCompleto: digits },
      });
      return yield* Match.value(estab).pipe(
        Match.when(Match.undefined, () => Effect.succeed(null)),
        Match.orElse((found) =>
          Effect.gen(function* () {
            const emp = yield* db.query.empresa.findFirst({
              where: { cnpjBasico: basico },
              columns: empresaColumns,
            });
            const socios = yield* db.query.socio.findMany({
              where: { cnpjBasico: basico },
            });
            const simplesRow = yield* db.query.simples.findFirst({
              where: { cnpjBasico: basico },
            });
            const codes = {
              naturezas: [emp?.naturezaJuridica ?? ""],
              cnaes: [found.cnaePrincipal ?? ""],
              municipios: [found.municipio ?? ""],
              qualificacoes: pipe(
                socios,
                Arr.map((s) => s.qualificacao ?? "")
              ),
              motivos: [found.motivoSituacao ?? ""],
            };
            const codigos = pipe(
              Rec.values(codes),
              Arr.flatten,
              Arr.filter((value) => value !== "")
            );
            const dominios = yield* db.query.dominio.findMany({
              where: {
                tabela: {
                  in: ["naturezas", "cnaes", "municipios", "qualificacoes", "motivos"],
                },
                codigo: { in: codigos },
              },
            });
            const label = new Map(
              pipe(
                dominios,
                Arr.map((d) => [`${d.tabela}:${d.codigo}`, d.descricao] as const)
              )
            );
            const lookup = (tabela: string, codigo: string | null) =>
              codigo !== null && codigo !== ""
                ? (label.get(`${tabela}:${codigo}`) ?? null)
                : null;
            const secundarias = pipe(
              found.cnaeSecundario ?? "",
              Str.split(","),
              Arr.map(Str.trim),
              Arr.filter((c) => c !== "")
            );
            return {
              cnpj: found.cnpjCompleto,
              cnpj_basico: found.cnpjBasico,
              razao_social: emp?.razaoSocial ?? null,
              nome_fantasia: nullIfEmpty(found.nomeFantasia),
              matriz_filial:
                MATRIZ_FILIAL[found.matrizFilial ?? ""] ?? found.matrizFilial,
              situacao_cadastral: situacaoLabel(found.situacaoCadastral ?? ""),
              situacao_cadastral_codigo: found.situacaoCadastral,
              data_situacao: found.dataSituacao,
              motivo_situacao: lookup("motivos", found.motivoSituacao),
              data_inicio_atividade: found.dataInicioAtividade,
              cnae_principal: found.cnaePrincipal,
              cnae_principal_descricao: lookup("cnaes", found.cnaePrincipal),
              cnae_secundaria: secundarias,
              natureza_juridica: emp?.naturezaJuridica ?? null,
              natureza_juridica_descricao: emp !== undefined
                ? lookup("naturezas", emp.naturezaJuridica)
                : null,
              capital_social: emp?.capitalSocial ?? null,
              porte: emp !== undefined ? (PORTE_EMPRESA[emp.porte ?? ""] ?? emp.porte) : null,
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
                opcao_simples: simplesRow?.opcaoSimples ?? null,
                data_opcao_simples: simplesRow?.dataOpcaoSimples ?? null,
                opcao_mei: simplesRow?.opcaoMei ?? null,
                data_opcao_mei: simplesRow?.dataOpcaoMei ?? null,
              },
              socios: pipe(
                socios,
                Arr.map((s): Record<string, unknown> => ({
                  nome_socio: s.nomeSocio,
                  tipo:
                    IDENTIFICADOR_SOCIO[s.identificadorSocio ?? ""] ??
                    s.identificadorSocio,
                  cpf_visivel: nullIfEmpty(s.cpfVisivel),
                  qualificacao: lookup("qualificacoes", s.qualificacao),
                  data_entrada: s.dataEntrada,
                }))
              ),
            };
          })
        )
      );
    });

  const bm25Empresas = (q: string, limit: number) =>
    db.execute(sql`
      select
        cnpj_basico as "cnpjBasico", razao_social as "razaoSocial",
        natureza_juridica as "naturezaJuridica", porte, -rk as score
      from (
        select
          cnpj_basico, razao_social, natureza_juridica, porte,
          row_number() over () as rk
        from (
          select cnpj_basico, razao_social, natureza_juridica, porte
          from ${empresa}
          order by busca <@> to_bm25query(${q})
          limit ${sql.raw(String(limit))}
        ) ranked
      ) scored
      order by rk
    `).pipe(Effect.map(({ rows }) => rows));

  const trgmEmpresas = (q: string, limit: number) =>
    db.execute(sql`
      select
        cnpj_basico as "cnpjBasico", razao_social as "razaoSocial",
        natureza_juridica as "naturezaJuridica", porte,
        word_similarity(${q}, busca) as score
      from ${empresa}
      where word_similarity(${q}, busca) >= 0.2
      order by score desc, id
      limit ${sql.raw(String(limit))}
    `).pipe(Effect.map(({ rows }) => rows));

  const enrichEmpresa = (rows: readonly Record<string, unknown>[]) =>
    Effect.gen(function* () {
      const basicos = nonEmptyStrings(
        pipe(
          rows,
          Arr.map((row) => row.cnpjBasico)
        )
      );
      const estabs = yield* db.query.estabelecimento.findMany({
        where: { cnpjBasico: { in: basicos } },
        columns: {
          cnpjBasico: true,
          cnpjCompleto: true,
          nomeFantasia: true,
          situacaoCadastral: true,
          uf: true,
          matrizFilial: true,
        },
        orderBy: (e, { asc }) => asc(e.matrizFilial),
      });
      const byBasico = pipe(
        estabs,
        Arr.reduce(new Map<string, (typeof estabs)[number]>(), (acc, e) => {
          const key = e.cnpjBasico ?? "";
          return acc.has(key) ? acc : acc.set(key, e);
        })
      );
      return pipe(rows, Arr.map((row): Record<string, unknown> => {
        const e = byBasico.get(
          typeof row.cnpjBasico === "string" ? row.cnpjBasico : ""
        );
        return {
          ...row,
          porte: PORTE_EMPRESA[String(row.porte ?? "")] ?? row.porte,
          cnpj: e?.cnpjCompleto ?? null,
          nome_fantasia: e?.nomeFantasia ?? null,
          situacao_cadastral:
            e !== undefined ? situacaoLabel(e.situacaoCadastral ?? "") : null,
          uf: e?.uf ?? null,
        };
      }));
    });

  const buscarEmpresaPorNome = (
    nome: string,
    options?: { readonly limit?: number }
  ) =>
    Effect.gen(function* () {
      const q = normalize(nome);
      const limit = clamp(options?.limit, 20, 100);
      const lexical = yield* bm25Empresas(q, limit);
      const rows = yield* Match.value(lexical.length).pipe(
        Match.when(0, () => trgmEmpresas(q, limit)),
        Match.orElse(() => Effect.succeed(lexical))
      );
      return yield* enrichEmpresa(rows);
    });

  const bm25Socios = (q: string, limit: number) =>
    db.execute(sql`
      select
        cnpj_basico as "cnpjBasico", nome_socio as "nomeSocio",
        cnpj_cpf_socio as "cnpjCpfSocio", cpf_visivel as "cpfVisivel",
        identificador_socio as "identificadorSocio",
        qualificacao, data_entrada as "dataEntrada", -rk as score
      from (
        select
          cnpj_basico, nome_socio, cnpj_cpf_socio, cpf_visivel,
          identificador_socio, qualificacao, data_entrada,
          row_number() over () as rk
        from (
          select
            cnpj_basico, nome_socio, cnpj_cpf_socio, cpf_visivel,
            identificador_socio, qualificacao, data_entrada
          from ${socio}
          order by busca <@> to_bm25query(${q})
          limit ${sql.raw(String(limit))}
        ) ranked
      ) scored
      order by rk
    `).pipe(Effect.map(({ rows }) => rows));

  const trgmSocios = (q: string, limit: number) =>
    db.execute(sql`
      select
        cnpj_basico as "cnpjBasico", nome_socio as "nomeSocio",
        cnpj_cpf_socio as "cnpjCpfSocio", cpf_visivel as "cpfVisivel",
        identificador_socio as "identificadorSocio",
        qualificacao, data_entrada as "dataEntrada",
        word_similarity(${q}, busca) as score
      from ${socio}
      where word_similarity(${q}, busca) >= 0.2
      order by score desc, id
      limit ${sql.raw(String(limit))}
    `).pipe(Effect.map(({ rows }) => rows));

  const enrichSocio = (rows: readonly Record<string, unknown>[]) =>
    Effect.gen(function* () {
      const basicos = nonEmptyStrings(
        pipe(
          rows,
          Arr.map((row) => row.cnpjBasico)
        )
      );
      const qualificacoes = nonEmptyStrings(
        pipe(
          rows,
          Arr.map((row) => row.qualificacao)
        )
      );
      const empresas = yield* db.query.empresa.findMany({
        where: { cnpjBasico: { in: basicos } },
        columns: { cnpjBasico: true, razaoSocial: true },
      });
      const dominios = yield* db.query.dominio.findMany({
        where: { tabela: "qualificacoes", codigo: { in: qualificacoes } },
      });
      const razaoByBasico = new Map(
        pipe(
          empresas,
          Arr.map((e) => [e.cnpjBasico ?? "", e.razaoSocial ?? null] as const)
        )
      );
      const qualLabel = new Map(
        pipe(
          dominios,
          Arr.map((d) => [d.codigo, d.descricao] as const)
        )
      );
      return pipe(rows, Arr.map((row): Record<string, unknown> => {
        const basico =
          typeof row.cnpjBasico === "string" ? row.cnpjBasico : "";
        const qual =
          typeof row.qualificacao === "string" ? row.qualificacao : "";
        return {
          ...row,
          tipo:
            IDENTIFICADOR_SOCIO[String(row.identificadorSocio ?? "")] ??
            row.identificadorSocio,
          razao_social: razaoByBasico.get(basico) ?? null,
          qualificacao_descricao: qualLabel.get(qual) ?? null,
        };
      }));
    });

  const buscarSocioPorNome = (
    nome: string,
    options?: { readonly limit?: number; readonly cpfVisivel?: string }
  ) =>
    Effect.gen(function* () {
      const q = normalize(nome);
      const limit = clamp(options?.limit, 20, 100);
      const lexical = yield* bm25Socios(q, limit);
      const rows = yield* Match.value(lexical.length).pipe(
        Match.when(0, () => trgmSocios(q, limit)),
        Match.orElse(() => Effect.succeed(lexical))
      );
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
      const filtered = Match.value(cpf).pipe(
        Match.when(Match.string, (value) =>
          pipe(
            rows,
            Arr.filter((row) => row.cpfVisivel === value)
          )
        ),
        Match.orElse(() => rows)
      );
      return yield* enrichSocio(filtered);
    });

  const sociosEmComum = (cnpjs: readonly string[]) =>
    Effect.gen(function* () {
      const basicos = [
        ...new Set(
          pipe(
            cnpjs,
            Arr.map((c) => pipe(onlyDigits(c), Str.slice(0, 8))),
            Arr.filter((value) => value !== "")
          )
        ),
      ];
      const vazio: readonly Record<string, unknown>[] = [];
      return yield* Match.value(basicos.length < 2).pipe(
        Match.when(true, () => Effect.succeed(vazio)),
        Match.orElse(() =>
          Effect.gen(function* () {
            const rows = yield* db.query.socio.findMany({
              where: { cnpjBasico: { in: basicos } },
              columns: socioComumColumns,
            });
            type Grupo = {
              readonly basicos: Set<string>;
              readonly row: (typeof rows)[number];
            };
            const grupos = pipe(
              rows,
              Arr.reduce(new Map<string, Grupo>(), (acc, row) => {
                const key =
                  row.cnpjCpfSocio !== null &&
                  row.cnpjCpfSocio !== undefined &&
                  row.cnpjCpfSocio !== ""
                    ? row.cnpjCpfSocio
                    : `${row.nomeSocioNorm ?? ""}:${row.cpfVisivel ?? ""}`;
                const existing = acc.get(key);
                return existing !== undefined
                  ? (existing.basicos.add(row.cnpjBasico ?? ""), acc)
                  : acc.set(key, {
                      basicos: new Set([row.cnpjBasico ?? ""]),
                      row,
                    });
              })
            );
            return pipe(
              Array.from(grupos.values()),
              Arr.filter((grupo) => grupo.basicos.size >= 2),
              Arr.map((grupo): Record<string, unknown> => ({
                nome_socio: grupo.row.nomeSocio,
                cpf_visivel: nullIfEmpty(grupo.row.cpfVisivel),
                cnpj_cpf_socio: nullIfEmpty(grupo.row.cnpjCpfSocio),
                tipo:
                  IDENTIFICADOR_SOCIO[grupo.row.identificadorSocio ?? ""] ??
                  grupo.row.identificadorSocio,
                cnpjs_basicos: [...grupo.basicos],
                quantidade_empresas: grupo.basicos.size,
              }))
            );
          })
        )
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
      const where = {
        ...Match.value(options.uf).pipe(
          Match.when(Match.string, (uf) => ({ uf: pipe(uf, Str.trim, Str.toUpperCase) })),
          Match.orElse(() => ({}))
        ),
        ...Match.value(options.cnae).pipe(
          Match.when(Match.string, (cnae) => ({
            cnaePrincipal: onlyDigits(cnae),
          })),
          Match.orElse(() => ({}))
        ),
        ...Match.value(options.municipio).pipe(
          Match.when(Match.string, (municipio) => ({
            municipio: onlyDigits(municipio),
          })),
          Match.orElse(() => ({}))
        ),
        ...Match.value(
          options.situacao !== undefined
            ? situacaoCodigo(options.situacao)
            : null
        ).pipe(
          Match.when(Match.string, (codigo) => ({
            situacaoCadastral: { in: [codigo, pipe(codigo, Str.padStart(2, "0"))] },
          })),
          Match.orElse(() => ({}))
        ),
        ...Match.value(
          options.porte !== undefined ? porteCodigo(options.porte) : null
        ).pipe(
          Match.when(Match.string, (porte) => ({ porte })),
          Match.orElse(() => ({}))
        ),
      };
      const rows = yield* db.query.estabelecimento.findMany({
        where,
        columns: estabFiltroColumns,
        orderBy: (e, { asc }) => asc(e.cnpjCompleto),
        limit,
      });
      const basicos = nonEmptyStrings(
        pipe(
          rows,
          Arr.map((row) => row.cnpjBasico)
        )
      );
      const empresas = yield* db.query.empresa.findMany({
        where: { cnpjBasico: { in: basicos } },
        columns: { cnpjBasico: true, razaoSocial: true },
      });
      const municipios = yield* db.query.dominio.findMany({
        where: {
          tabela: "municipios",
          codigo: {
            in: nonEmptyStrings(
              pipe(
                rows,
                Arr.map((row) => row.municipio)
              )
            ),
          },
        },
      });
      const razaoByBasico = new Map(
        pipe(
          empresas,
          Arr.map((e) => [e.cnpjBasico ?? "", e.razaoSocial ?? null] as const)
        )
      );
      const munLabel = new Map(
        pipe(
          municipios,
          Arr.map((d) => [d.codigo, d.descricao] as const)
        )
      );
      return pipe(rows, Arr.map((row): Record<string, unknown> => ({
        cnpj: row.cnpjCompleto,
        cnpj_basico: row.cnpjBasico,
        razao_social: razaoByBasico.get(row.cnpjBasico ?? "") ?? null,
        nome_fantasia: nullIfEmpty(row.nomeFantasia),
        situacao_cadastral: situacaoLabel(row.situacaoCadastral ?? ""),
        cnae_principal: row.cnaePrincipal,
        porte: PORTE_EMPRESA[row.porte ?? ""] ?? row.porte,
        uf: row.uf,
        municipio_codigo_rfb: row.municipio,
        municipio: munLabel.get(row.municipio ?? "") ?? null,
      })));
    });

  const index = Effect.gen(function* () {
    yield* db.delete(empresa);
    yield* db.delete(estabelecimento);
    yield* db.delete(socio);
    yield* db.delete(simples);
    yield* db.delete(dominio);
    yield* indexReceitaCnpj();
    const empresas = yield* db.execute(
      sql`select count(*)::int as count from ${empresa}`
    ).pipe(Effect.map(({ rows }) => rows));
    const estabelecimentos = yield* db.execute(
      sql`select count(*)::int as count from ${estabelecimento}`
    ).pipe(Effect.map(({ rows }) => rows));
    const socios = yield* db.execute(
      sql`select count(*)::int as count from ${socio}`
    ).pipe(Effect.map(({ rows }) => rows));
    const simplesCount = yield* db.execute(
      sql`select count(*)::int as count from ${simples}`
    ).pipe(Effect.map(({ rows }) => rows));
    const dominios = yield* db.execute(
      sql`select count(*)::int as count from ${dominio}`
    ).pipe(Effect.map(({ rows }) => rows));
    return {
      empresas: countOf(empresas),
      estabelecimentos: countOf(estabelecimentos),
      socios: countOf(socios),
      simples: countOf(simplesCount),
      dominios: countOf(dominios),
    };
  });

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
