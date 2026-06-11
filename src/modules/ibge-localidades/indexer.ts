import { Result, type Result as ResultType } from "better-result";
import dayjs from "dayjs";
import type { EvlogError } from "evlog";
import { z } from "zod";
import type {
  AdapterError,
  BuildOptions,
  BuildSummary,
  IndexAdapter,
  StatusInfo,
} from "../../core/adapter";
import { fetchJson } from "../../core/http/download";
import { dominio, municipiosUrl, titulo } from "./catalog";
import { ibgeLocalidadesErrors } from "./errors";
import {
  flattenMunicipio,
  getIndexPath,
  loadIndex,
  municipioRawSchema,
  saveIndex,
  type IndiceIbgeLocalidades,
  type MunicipioIndexado,
} from "./store";

const municipiosPayloadSchema = z.array(municipioRawSchema);

/**
 * Faz o parse + achatamento do payload bruto do endpoint /municipios.
 * Exposto para teste sem rede (recebe os bytes/objeto ja em memoria).
 */
export function flattenMunicipiosPayload(
  payload: unknown
): ResultType<MunicipioIndexado[], EvlogError> {
  return Result.gen(function* () {
    const parsed = municipiosPayloadSchema.safeParse(payload);

    if (!parsed.success) {
      return yield* Result.err(
        ibgeLocalidadesErrors.FONTE_PARSE({
          url: municipiosUrl,
          internal: {
            cause: parsed.error.issues
              .map((issue) => issue.message)
              .join("; "),
          },
        })
      );
    }

    const achatados = yield* Result.try({
      try: () => parsed.data.map(flattenMunicipio),
      catch: (cause): EvlogError =>
        ibgeLocalidadesErrors.FONTE_PARSE({
          url: municipiosUrl,
          internal: { cause: String(cause) },
        }),
    });

    return Result.ok(achatados);
  });
}

async function buildMunicipios(
  onProgress?: (msg: string) => void
): Promise<ResultType<MunicipioIndexado[], EvlogError>> {
  onProgress?.(`Baixando municipios do IBGE: ${municipiosUrl}`);

  const fetched = await fetchJson<unknown>(municipiosUrl);

  if (Result.isError(fetched)) {
    return Result.err(
      ibgeLocalidadesErrors.FONTE_DOWNLOAD({
        url: municipiosUrl,
        internal: { cause: fetched.error.message },
      })
    );
  }

  onProgress?.("Achatando hierarquia de municipios");

  return flattenMunicipiosPayload(fetched.value);
}

export const ibgeLocalidadesIndexAdapter: IndexAdapter & {
  buildMunicipios: typeof buildMunicipios;
} = {
  key: dominio,
  titulo,
  storage: "json",
  requiresHeavyDownload: false,
  buildMunicipios,
  async build(
    opts?: BuildOptions
  ): Promise<ResultType<BuildSummary, AdapterError>> {
    const built = await buildMunicipios(opts?.onProgress);

    if (Result.isError(built)) return Result.err(built.error);

    const indice: IndiceIbgeLocalidades = {
      versao: 1,
      criadoEm: dayjs().toISOString(),
      fonte: "ibge-localidades",
      municipios: built.value,
    };

    const saved = await saveIndex(indice);

    if (Result.isError(saved)) return Result.err(saved.error);

    opts?.onProgress?.(
      `Indice gravado: ${built.value.length} municipios em ${saved.value}`
    );

    return Result.ok({
      dominio,
      registros: built.value.length,
      atualizadoEm: indice.criadoEm,
      caminho: saved.value,
      detalhes: {
        ufs: contarUfs(built.value),
      },
    });
  },
  async status(): Promise<ResultType<StatusInfo, AdapterError>> {
    const loaded = await loadIndex();

    if (Result.isError(loaded)) return Result.err(loaded.error);

    const indice = loaded.value;

    return Result.ok({
      key: dominio,
      titulo,
      storage: "json",
      requiresHeavyDownload: false,
      existe: Boolean(indice),
      atualizadoEm: indice?.criadoEm ?? null,
      registros: indice?.municipios.length ?? null,
      caminho: getIndexPath(),
    });
  },
};

function contarUfs(municipios: MunicipioIndexado[]): number {
  return new Set(municipios.map((municipio) => municipio.uf_sigla)).size;
}
