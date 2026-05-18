import { createStore } from "@tanstack/store";
import { Result, type Result as ResultType } from "better-result";
import type { LegislacaoError } from "./errors";
import { legislacaoIndexAdapter } from "./indexer";
import {
  getIndexPath,
  loadIndex,
  saveIndex,
  type IndiceLegislacao,
} from "./store";

type RuntimeState = {
  indice: IndiceLegislacao | null;
  indiceCarregado: boolean;
  indexando: boolean;
  erro: string | null;
};

export const runtimeStore = createStore<RuntimeState>({
  indice: null,
  indiceCarregado: false,
  indexando: false,
  erro: null,
});

export async function getIndiceLocal() {
  const state = runtimeStore.state;

  if (state.indiceCarregado) return Result.ok(state.indice);

  const loaded = await loadIndex();

  if (Result.isOk(loaded)) {
    runtimeStore.setState((prev) => ({
      ...prev,
      indice: loaded.value,
      indiceCarregado: true,
      erro: null,
    }));

    return loaded;
  }

  runtimeStore.setState((prev) => ({
    ...prev,
    indice: null,
    indiceCarregado: false,
    erro: loaded.error.message,
  }));

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
    LegislacaoError
  >
> {
  const loaded = await getIndiceLocal();

  if (Result.isError(loaded)) return loaded;

  const indice = loaded.value;
  const state = runtimeStore.state;

  return Result.ok({
    caminho: getIndexPath(),
    existe: Boolean(indice),
    indexando: state.indexando,
    erro: state.erro,
    atualizadoEm: indice?.criadoEm ?? null,
    normasIndexadas: indice?.documentos.map((documento) => documento.norma.id) ?? [],
  });
}

export async function recriarIndiceLocal() {
  runtimeStore.setState((prev) => ({
    ...prev,
    indexando: true,
    erro: null,
  }));

  const built = await legislacaoIndexAdapter.build();

  if (Result.isError(built)) {
    runtimeStore.setState((prev) => ({
      ...prev,
      indexando: false,
      erro: built.error.message,
    }));

    return built;
  }

  const indice: IndiceLegislacao = {
    versao: 1,
    criadoEm: new Date().toISOString(),
    fonte: "planalto",
    documentos: built.value,
  };
  const saved = await saveIndex(indice);

  if (Result.isOk(saved)) {
    runtimeStore.setState((prev) => ({
      ...prev,
      indice,
      indiceCarregado: true,
      indexando: false,
      erro: null,
    }));

    return Result.ok({
      caminho: saved.value,
      atualizadoEm: indice.criadoEm,
      normasIndexadas: indice.documentos.map((documento) => documento.norma.id),
    });
  }

  runtimeStore.setState((prev) => ({
    ...prev,
    indexando: false,
    erro: saved.error.message,
  }));

  return saved;
}
