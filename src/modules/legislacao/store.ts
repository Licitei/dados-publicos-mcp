import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Result, TaggedError, type Result as ResultType } from "better-result";
import { z } from "zod";
import type { Norma } from "./catalog";
import { legislacaoIndexAdapter, type PlanaltoIndexError } from "./indexer";

export type DocumentoIndexado = {
  norma: Norma;
  paragrafos: string[];
};

export type IndiceLegislacao = {
  versao: 1;
  criadoEm: string;
  fonte: "planalto";
  documentos: DocumentoIndexado[];
};

export class IndexReadError extends TaggedError("IndexReadError")<{
  message: string;
  path: string;
}>() {}

export class IndexWriteError extends TaggedError("IndexWriteError")<{
  message: string;
  path: string;
}>() {}

export type StoreError = IndexReadError | IndexWriteError | PlanaltoIndexError;

type RuntimeState = {
  indice: IndiceLegislacao | null;
  indiceCarregado: boolean;
  indexando: boolean;
  erro: string | null;
};

const runtimeState: RuntimeState = {
  indice: null,
  indiceCarregado: false,
  indexando: false,
  erro: null,
};

const normaSchema: z.ZodType<Norma> = z
  .object({
    id: z.union([
      z.literal("lei-14133-2021"),
      z.literal("lei-8666-1993"),
      z.literal("lei-13303-2016"),
      z.literal("lc-123-2006"),
      z.literal("decreto-11462-2023"),
    ]),
    titulo: z.string(),
    apelidos: z.array(z.string()),
    url: z.string(),
    temas: z.array(z.string()),
  })
  .strict();

const documentoIndexadoSchema: z.ZodType<DocumentoIndexado> = z
  .object({
    norma: normaSchema,
    paragrafos: z.array(z.string()),
  })
  .strict();

const indiceLegislacaoSchema: z.ZodType<IndiceLegislacao> = z
  .object({
    versao: z.literal(1),
    criadoEm: z.string(),
    fonte: z.literal("planalto"),
    documentos: z.array(documentoIndexadoSchema),
  })
  .strict();

export function getIndexPath() {
  return join(getDataDir(), "legislacao", "index.json");
}

function getDataDir() {
  const configured = process.env.DADOS_PUBLICOS_MCP_DATA_DIR;

  if (configured) return configured;

  const home = process.env.HOME;

  if (!home) throw new Error("HOME nao definido; configure DADOS_PUBLICOS_MCP_DATA_DIR");

  return join(home, ".local", "share", "dados-publicos-mcp");
}

export async function loadIndex(): Promise<
  ResultType<IndiceLegislacao | null, IndexReadError>
> {
  const path = getIndexPath();

  const loaded = await Result.tryPromise({
    try: async () => {
      const file = Bun.file(path);

      if (!(await file.exists())) return null;

      return (await file.json()) as unknown;
    },
    catch: (cause) =>
      new IndexReadError({
        message: `Falha ao ler indice local em ${path}: ${causeMessage(cause)}`,
        path,
      }),
  });

  if (Result.isError(loaded)) return loaded;
  if (!loaded.value) return Result.ok(null);

  const parsed = indiceLegislacaoSchema.safeParse(loaded.value);

  if (!parsed.success) {
    return Result.err(
      new IndexReadError({
        message: `Indice local invalido em ${path}: ${parsed.error.issues
          .map((issue) => issue.message)
          .join("; ")}`,
        path,
      })
    );
  }

  return Result.ok(parsed.data);
}

export async function saveIndex(
  indice: IndiceLegislacao
): Promise<ResultType<string, IndexWriteError>> {
  const path = getIndexPath();

  return Result.tryPromise({
    try: async () => {
      await mkdir(dirname(path), { recursive: true });
      await Bun.write(path, `${JSON.stringify(indice, null, 2)}\n`);

      return path;
    },
    catch: (cause) =>
      new IndexWriteError({
        message: `Falha ao salvar indice local em ${path}: ${causeMessage(cause)}`,
        path,
      }),
  });
}

export async function getIndiceLocal() {
  if (runtimeState.indiceCarregado) return Result.ok(runtimeState.indice);

  const loaded = await loadIndex();

  if (Result.isOk(loaded)) {
    runtimeState.indice = loaded.value;
    runtimeState.indiceCarregado = true;
    runtimeState.erro = null;

    return loaded;
  }

  runtimeState.indice = null;
  runtimeState.indiceCarregado = false;
  runtimeState.erro = loaded.error.message;

  return loaded;
}

export async function statusIndiceLocal(): Promise<
  ResultType<
    {
      caminho: string;
      existe: boolean;
      indexando: boolean;
      erro: string | null;
      atualizadoEm: string | null;
      normasIndexadas: string[];
    },
    StoreError
  >
> {
  const loaded = await getIndiceLocal();

  if (Result.isError(loaded)) return loaded;

  const indice = loaded.value;

  return Result.ok({
    caminho: getIndexPath(),
    existe: Boolean(indice),
    indexando: runtimeState.indexando,
    erro: runtimeState.erro,
    atualizadoEm: indice?.criadoEm ?? null,
    normasIndexadas: indice?.documentos.map((documento) => documento.norma.id) ?? [],
  });
}

export async function recriarIndiceLocal(): Promise<
  ResultType<
    {
      caminho: string;
      atualizadoEm: string;
      normasIndexadas: string[];
    },
    StoreError
  >
> {
  runtimeState.indexando = true;
  runtimeState.erro = null;

  const built = await legislacaoIndexAdapter.build();

  if (Result.isError(built)) {
    runtimeState.indexando = false;
    runtimeState.erro = built.error.message;

    return Result.err(built.error);
  }

  const indice: IndiceLegislacao = {
    versao: 1,
    criadoEm: new Date().toISOString(),
    fonte: "planalto",
    documentos: built.value,
  };
  const saved = await saveIndex(indice);

  if (Result.isOk(saved)) {
    runtimeState.indice = indice;
    runtimeState.indiceCarregado = true;
    runtimeState.indexando = false;
    runtimeState.erro = null;

    return Result.ok({
      caminho: saved.value,
      atualizadoEm: indice.criadoEm,
      normasIndexadas: indice.documentos.map((documento) => documento.norma.id),
    });
  }

  runtimeState.indexando = false;
  runtimeState.erro = saved.error.message;

  return saved;
}

function causeMessage(cause: unknown) {
  if (typeof cause === "string") return cause;

  return String(cause);
}
