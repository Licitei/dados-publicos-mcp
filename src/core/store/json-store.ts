import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { Result, type Result as ResultType } from "better-result";
import type { EvlogError } from "evlog";
import type { ZodType } from "zod";
import { dominioPath } from "../dataDir";
import { storeErrors } from "./errors";

/**
 * Canal de erro do store JSON do core.
 *
 * Alvo declarativo: EvlogError do catalogo `store` (estilo dfe-kit/evlog).
 * Os modulos referenciam/propagam estes erros como EvlogError (StoreError).
 */
export type StoreError = EvlogError;

type RuntimeCache = {
  value: unknown | null;
  loaded: boolean;
};

// Cache de runtime POR dominio+arquivo (chave = caminho absoluto).
const cacheByPath = new Map<string, RuntimeCache>();

export type JsonStore<T> = {
  load(): Promise<ResultType<T | null, StoreError>>;
  save(value: T): Promise<ResultType<string, StoreError>>;
  get(): Promise<ResultType<T | null, StoreError>>;
  path(): string;
};

/**
 * Store JSON generico com validacao por schema zod e cache de runtime
 * por dominio. load() sempre le do disco; get() usa o cache em memoria.
 */
export function createJsonStore<T>(opts: {
  dominio: string;
  file?: string;
  schema: ZodType<T>;
}): JsonStore<T> {
  const file = opts.file ?? "index.json";

  const path = () => dominioPath(opts.dominio, file);

  const load = async (): Promise<ResultType<T | null, StoreError>> => {
    const filePath = path();

    return Result.gen(async function* () {
      const raw = yield* Result.await(
        Result.tryPromise({
          try: async () => {
            const handle = Bun.file(filePath);

            if (!(await handle.exists())) return null;

            return (await handle.json()) as unknown;
          },
          catch: (cause): EvlogError =>
            storeErrors.LEITURA({
              path: filePath,
              internal: { cause: String(cause) },
            }),
        }),
      );

      if (raw === null) {
        setCache(filePath, null);

        return Result.ok(null);
      }

      const parsed = opts.schema.safeParse(raw);

      if (!parsed.success) {
        return yield* Result.err(
          storeErrors.CONTEUDO_INVALIDO({
            path: filePath,
            detalhe: parsed.error.issues
              .map((issue) => issue.message)
              .join("; "),
          }),
        );
      }

      setCache(filePath, parsed.data);

      return Result.ok(parsed.data);
    });
  };

  const save = async (value: T): Promise<ResultType<string, StoreError>> => {
    const filePath = path();

    const written = await Result.tryPromise({
      try: async () => {
        await mkdir(dirname(filePath), { recursive: true });
        await Bun.write(filePath, `${JSON.stringify(value, null, 2)}\n`);

        return filePath;
      },
      catch: (cause): EvlogError =>
        storeErrors.ESCRITA({
          path: filePath,
          internal: { cause: String(cause) },
        }),
    });

    if (Result.isOk(written)) setCache(filePath, value);

    return written;
  };

  const get = async (): Promise<ResultType<T | null, StoreError>> => {
    const filePath = path();
    const cached = cacheByPath.get(filePath);

    if (cached?.loaded) return Result.ok(cached.value as T | null);

    return load();
  };

  return { load, save, get, path };
}

function setCache(path: string, value: unknown | null): void {
  cacheByPath.set(path, { value, loaded: true });
}
