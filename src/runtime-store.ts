import { createStore } from "@tanstack/store";
import { indexarLegislacao } from "./indexer";
import { getIndexPath, loadIndex, type IndiceLegislacao } from "./store";

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

  if (state.indiceCarregado) return state.indice;

  try {
    const indice = await loadIndex();

    runtimeStore.setState((prev) => ({
      ...prev,
      indice,
      indiceCarregado: true,
      erro: null,
    }));

    return indice;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";

    runtimeStore.setState((prev) => ({
      ...prev,
      indice: null,
      indiceCarregado: true,
      erro: message,
    }));

    throw error;
  }
}

export async function statusIndiceLocal() {
  const indice = await getIndiceLocal();
  const state = runtimeStore.state;

  return {
    caminho: getIndexPath(),
    existe: Boolean(indice),
    indexando: state.indexando,
    erro: state.erro,
    atualizadoEm: indice?.criadoEm ?? null,
    normasIndexadas: indice?.documentos.map((documento) => documento.norma.id) ?? [],
  };
}

export async function recriarIndiceLocal() {
  runtimeStore.setState((prev) => ({
    ...prev,
    indexando: true,
    erro: null,
  }));

  try {
    const result = await indexarLegislacao();
    const indice = await loadIndex();

    runtimeStore.setState((prev) => ({
      ...prev,
      indice,
      indiceCarregado: true,
      indexando: false,
      erro: null,
    }));

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";

    runtimeStore.setState((prev) => ({
      ...prev,
      indexando: false,
      erro: message,
    }));

    throw error;
  }
}
