import ky from "ky";
import { normas } from "./catalog";
import { htmlToParagraphs } from "./parser";
import { saveIndex, type DocumentoIndexado } from "./store";

const http = ky.create({
  timeout: 30_000,
  retry: {
    limit: 3,
    methods: ["get"],
    statusCodes: [408, 413, 429, 500, 502, 503, 504],
    backoffLimit: 3_000,
  },
  headers: {
    "user-agent": "dados-publicos-mcp/0.1.0",
    accept: "text/html,application/xhtml+xml",
  },
});

export async function indexarLegislacao() {
  const documentos: DocumentoIndexado[] = [];

  for (const norma of normas) {
    const buffer = await http.get(norma.url).arrayBuffer();
    const html = decodePlanaltalto(buffer);

    documentos.push({
      norma,
      paragrafos: htmlToParagraphs(html),
    });
  }

  const indice = {
    versao: 1 as const,
    criadoEm: new Date().toISOString(),
    fonte: "planalto" as const,
    documentos,
  };
  const caminho = await saveIndex(indice);

  return {
    caminho,
    atualizadoEm: indice.criadoEm,
    normasIndexadas: documentos.map((documento) => documento.norma.id),
  };
}

function decodePlanaltalto(buffer: ArrayBuffer) {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);

  if (!utf8.includes("�")) return utf8;

  return new TextDecoder("windows-1252", { fatal: false }).decode(buffer);
}
