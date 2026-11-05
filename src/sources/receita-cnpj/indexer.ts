import { BunServices } from "@effect/platform-bun";
import { Clock, Effect, Layer, Schema } from "effect";
import * as Arr from "effect/Array";
import * as FileSystem from "effect/FileSystem";
import { pipe } from "effect/Function";
import * as Str from "effect/String";
import { Duck } from "../../kernel/duck/duck";
import { Http } from "../../kernel/http/client";
import { failMissing } from "../../kernel/http/missing";
import { unzipEntries, type ZipEntry } from "../../kernel/zip/archive";
import {
  defaultParts,
  DOMINIO_COLUNAS,
  DOMINIO_FILES,
  EMPRESAS_COLUNAS,
  ESTABELECIMENTOS_COLUNAS,
  monthLookback,
  partFiles,
  ReceitaCnpjError,
  rfbAuthHeader,
  SENTINEL_FILE,
  SIMPLES_COLUNAS,
  SIMPLES_FILE,
  SOCIOS_COLUNAS,
  webdavFileUrl,
  yyyymm,
} from "./catalog";

const txt = (col: string) => `coalesce(trim("${col}"), '')`;

const dig = (col: string) => `regexp_replace(coalesce("${col}", ''), '\\D', '', 'g')`;

const dat = (col: string) => `strftime(try_strptime(trim("${col}"), '%Y%m%d'), '%Y-%m-%d')`;

const norm = (expr: string) =>
  `trim(regexp_replace(strip_accents(lower(${expr})), '[^\\p{L}\\p{N}]+', ' ', 'g'))`;

const num = (col: string) =>
  `try_cast(CASE WHEN contains(trim("${col}"), ',') THEN replace(replace(trim("${col}"), '.', ''), ',', '.') ELSE trim("${col}") END AS DOUBLE)`;

const cnpjCompleto = `lpad(${dig("cnpj_basico")}, 8, '0') || lpad(${dig("cnpj_ordem")}, 4, '0') || lpad(${dig("cnpj_dv")}, 2, '0')`;

const cpfVisivelSql = `CASE WHEN length(${dig("cnpj_cpf_socio")}) = 11 THEN substr(${dig("cnpj_cpf_socio")}, 4, 6) ELSE substr(${dig("cnpj_cpf_socio")}, 1, 6) END`;

const Table = Schema.Struct({ name: Schema.String, columns: Schema.String });
type Table = (typeof Table)["Type"];

const varchars = (names: readonly string[]) =>
  pipe(
    names,
    Arr.map((name) => `${name} VARCHAR`),
    Arr.join(", ")
  );

const tables: readonly Table[] = [
  { name: "dominio", columns: varchars(["tabela", "codigo", "descricao"]) },
  {
    name: "empresa",
    columns: `${varchars(["cnpj_basico", "razao_social", "natureza_juridica", "qualificacao_responsavel"])}, capital_social DOUBLE, ${varchars(["porte", "busca"])}`,
  },
  {
    name: "estabelecimento",
    columns: varchars([
      "cnpj_completo",
      "cnpj_basico",
      "cnpj_ordem",
      "cnpj_dv",
      "matriz_filial",
      "nome_fantasia",
      "situacao_cadastral",
      "data_situacao",
      "motivo_situacao",
      "data_inicio_atividade",
      "cnae_principal",
      "cnae_secundario",
      "uf",
      "municipio",
      "bairro",
      "logradouro",
      "numero",
      "complemento",
      "cep",
      "ddd",
      "telefone",
      "email",
    ]),
  },
  {
    name: "socio",
    columns: varchars([
      "cnpj_basico",
      "identificador_socio",
      "nome_socio",
      "cnpj_cpf_socio",
      "cpf_visivel",
      "qualificacao",
      "data_entrada",
      "faixa_etaria",
      "busca",
    ]),
  },
  {
    name: "simples",
    columns: varchars([
      "cnpj_basico",
      "opcao_simples",
      "data_opcao_simples",
      "data_exclusao_simples",
      "opcao_mei",
      "data_opcao_mei",
      "data_exclusao_mei",
    ]),
  },
];

const Loader = Schema.Struct({
  table: Schema.String,
  colunas: Schema.Array(Schema.String),
  projection: Schema.String,
});
type Loader = (typeof Loader)["Type"];

const empresaLoader: Loader = {
  table: "empresa",
  colunas: EMPRESAS_COLUNAS,
  projection: `${dig("cnpj_basico")}, ${txt("razao_social")}, ${txt("natureza_juridica")}, ${txt("qualificacao_responsavel")}, ${num("capital_social")}, ${txt("porte_empresa")}, ${norm(txt("razao_social"))}`,
};

const estabelecimentoLoader: Loader = {
  table: "estabelecimento",
  colunas: ESTABELECIMENTOS_COLUNAS,
  projection: `${cnpjCompleto}, ${dig("cnpj_basico")}, ${dig("cnpj_ordem")}, ${dig("cnpj_dv")}, ${txt("identificador_matriz_filial")}, ${txt("nome_fantasia")}, ${txt("situacao_cadastral")}, ${dat("data_situacao_cadastral")}, ${txt("motivo_situacao_cadastral")}, ${dat("data_inicio_atividade")}, ${txt("cnae_fiscal_principal")}, ${txt("cnae_fiscal_secundaria")}, upper(${txt("uf")}), ${txt("municipio")}, ${txt("bairro")}, ${txt("logradouro")}, ${txt("numero")}, ${txt("complemento")}, ${txt("cep")}, ${txt("ddd1")}, ${txt("telefone1")}, ${txt("correio_eletronico")}`,
};

const socioLoader: Loader = {
  table: "socio",
  colunas: SOCIOS_COLUNAS,
  projection: `${dig("cnpj_basico")}, ${txt("identificador_socio")}, ${txt("nome_socio")}, ${dig("cnpj_cpf_socio")}, ${cpfVisivelSql}, ${txt("qualificacao_socio")}, ${dat("data_entrada_sociedade")}, ${txt("faixa_etaria")}, ${norm(txt("nome_socio"))}`,
};

const simplesLoader: Loader = {
  table: "simples",
  colunas: SIMPLES_COLUNAS,
  projection: `${dig("cnpj_basico")}, ${txt("opcao_simples")}, ${dat("data_opcao_simples")}, ${dat("data_exclusao_simples")}, ${txt("opcao_mei")}, ${dat("data_opcao_mei")}, ${dat("data_exclusao_mei")}`,
};

const dominioLoader = (tabela: string): Loader => ({
  table: "dominio",
  colunas: DOMINIO_COLUNAS,
  projection: `'${tabela}', ${txt("codigo")}, ${txt("descricao")}`,
});

const insertSql = (loader: Loader) =>
  `INSERT INTO ${loader.table} SELECT ${loader.projection} FROM read_csv(?, delim=';', header=false, encoding='latin-1', quote='"', escape='"', all_varchar=true, ignore_errors=true, null_padding=true, columns={${pipe(
    loader.colunas,
    Arr.map((name) => `'${name}': 'VARCHAR'`),
    Arr.join(", ")
  )}})`;

const resetTables = Effect.flatMap(Duck, (duck) =>
  Effect.forEach(
    tables,
    (table) =>
      duck
        .run(`DROP TABLE IF EXISTS ${table.name}`)
        .pipe(Effect.andThen(duck.run(`CREATE TABLE ${table.name} (${table.columns})`))),
    { concurrency: 1, discard: true }
  )
);

const stageEntry = (
  loader: Loader,
  dir: string,
  label: string,
  entry: ZipEntry,
  position: number
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const duck = yield* Duck;
    const path = `${dir}/${label}.${position}.csv`;
    yield* fs
      .writeFile(path, entry.data)
      .pipe(
        Effect.mapError((cause) =>
          ReceitaCnpjError.make({ code: "receita.STAGING", cause: cause.message })
        )
      );
    yield* duck.run(insertSql(loader), [path]);
    yield* fs
      .remove(path, { force: true })
      .pipe(
        Effect.mapError((cause) =>
          ReceitaCnpjError.make({ code: "receita.STAGING", cause: cause.message })
        )
      );
  });

const downloadZip = (url: string) =>
  Effect.flatMap(Http, (http) =>
    http.bytes(url, {
      headers: { authorization: rfbAuthHeader, accept: "application/zip" },
    })
  );

const probeMonth = (mes: string) =>
  failMissing(downloadZip(webdavFileUrl(mes, SENTINEL_FILE)), () =>
    ReceitaCnpjError.make({ code: "receita.SNAPSHOT_MISSING" })
  ).pipe(Effect.as(mes));

const resolveMonth = (millis: number) =>
  Effect.firstSuccessOf(
    pipe(
      Arr.range(0, monthLookback - 1),
      Arr.map((back) => probeMonth(yyyymm(millis, back)))
    )
  );

const acceptCsv = (name: string) => !pipe(name, Str.endsWith("/"));

const downloadFile = (mes: string, file: string) =>
  downloadZip(webdavFileUrl(mes, file)).pipe(
    Effect.flatMap((bytes) => unzipEntries(bytes, acceptCsv)),
    Effect.catchCause(() => Effect.succeed([]))
  );

const loadFile = (loader: Loader, dir: string, mes: string, file: string) =>
  Effect.flatMap(downloadFile(mes, file), (entries) =>
    Effect.forEach(entries, (entry, position) => stageEntry(loader, dir, file, entry, position), {
      concurrency: 1,
      discard: true,
    })
  );

const loadParts = (
  loader: Loader,
  dir: string,
  mes: string,
  prefix: "Empresas" | "Estabelecimentos" | "Socios",
  parts: readonly number[]
) =>
  Effect.forEach(
    pipe(
      partFiles(prefix),
      Arr.filter((_, i) => parts.includes(i))
    ),
    (file) => loadFile(loader, dir, mes, file),
    { concurrency: 1, discard: true }
  );

const loadDominios = (dir: string, mes: string) =>
  Effect.forEach(
    DOMINIO_FILES,
    (spec) => loadFile(dominioLoader(spec.tabela), dir, mes, spec.file),
    { concurrency: 1, discard: true }
  );

export const indexReceitaCnpj = (parts: readonly number[] = defaultParts) =>
  Effect.flatMap(Clock.currentTimeMillis, (millis) =>
    Effect.flatMap(resolveMonth(millis), (mes) =>
      Effect.scoped(
        Layer.build(BunServices.layer).pipe(
          Effect.flatMap((services) =>
            Effect.gen(function* () {
              const fs = yield* FileSystem.FileSystem;
              const dir = yield* fs.makeTempDirectoryScoped().pipe(
                Effect.mapError((cause) =>
                  ReceitaCnpjError.make({
                    code: "receita.STAGING",
                    cause: cause.message,
                  })
                )
              );
              yield* resetTables;
              yield* loadDominios(dir, mes);
              yield* loadParts(empresaLoader, dir, mes, "Empresas", parts);
              yield* loadParts(estabelecimentoLoader, dir, mes, "Estabelecimentos", parts);
              yield* loadParts(socioLoader, dir, mes, "Socios", parts);
              yield* loadFile(simplesLoader, dir, mes, SIMPLES_FILE);
            }).pipe(Effect.provideContext(services))
          )
        )
      )
    )
  );
