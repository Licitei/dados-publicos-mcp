import { panic } from "better-result";

export type ZipEntry = {
  name: string;
  bytes: () => Uint8Array;
};

const EOCD_SIGNATURE = 0x06054b50;
const CDFH_SIGNATURE = 0x02014b50;
const LFH_SIGNATURE = 0x04034b50;

/**
 * Le um arquivo ZIP sem dependencia externa: localiza o End Of Central
 * Directory, percorre o Central Directory e descompacta cada entrada com
 * Bun.inflateSync (raw deflate). Suporta store (0) e deflate (8).
 */
export function unzipEntries(zip: Uint8Array | ArrayBuffer): ZipEntry[] {
  // ArrayBuffer.isView e true para TypedArray (Uint8Array) e false para
  // ArrayBuffer puro; discriminacao de tipo sem checagem de classe runtime.
  const buf = ArrayBuffer.isView(zip) ? zip : new Uint8Array(zip);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const eocd = findEocd(buf, view);

  if (eocd === -1) {
    panic("ZIP invalido: End Of Central Directory nao encontrado.");
  }

  const totalEntries = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const entries: ZipEntry[] = [];

  for (let i = 0; i < totalEntries; i++) {
    if (view.getUint32(offset, true) !== CDFH_SIGNATURE) {
      panic(
        "ZIP invalido: assinatura de Central Directory File Header incorreta.",
      );
    }

    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraFieldLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const nameBytes = buf.subarray(offset + 46, offset + 46 + fileNameLength);
    const name = new TextDecoder("utf-8").decode(nameBytes);

    entries.push({
      name,
      bytes: () =>
        readLocalEntry(
          buf,
          view,
          localHeaderOffset,
          compressionMethod,
          compressedSize,
          uncompressedSize,
        ),
    });

    offset += 46 + fileNameLength + extraFieldLength + commentLength;
  }

  return entries;
}

/** Atalho: retorna os bytes da primeira entrada do ZIP. */
export function unzipFirst(zip: Uint8Array | ArrayBuffer): Uint8Array {
  const entries = unzipEntries(zip);

  if (entries.length === 0) {
    panic("ZIP vazio: nenhuma entrada encontrada.");
  }

  return entries[0].bytes();
}

function readLocalEntry(
  buf: Uint8Array,
  view: DataView,
  localHeaderOffset: number,
  compressionMethod: number,
  compressedSize: number,
  uncompressedSize: number,
): Uint8Array {
  if (view.getUint32(localHeaderOffset, true) !== LFH_SIGNATURE) {
    panic("ZIP invalido: assinatura de Local File Header incorreta.");
  }

  const fileNameLength = view.getUint16(localHeaderOffset + 26, true);
  const extraFieldLength = view.getUint16(localHeaderOffset + 28, true);
  const dataStart = localHeaderOffset + 30 + fileNameLength + extraFieldLength;
  const data = buf.subarray(dataStart, dataStart + compressedSize);

  if (compressionMethod === 0) {
    return Uint8Array.prototype.slice.call(data);
  }

  if (compressionMethod === 8) {
    return Bun.inflateSync(new Uint8Array(data));
  }

  return panic(
    `ZIP nao suportado: metodo de compressao ${compressionMethod} (tamanho ${uncompressedSize}).`,
  );
}

/** Localiza o offset do registro End Of Central Directory. */
function findEocd(buf: Uint8Array, view: DataView): number {
  const minSize = 22;

  if (buf.byteLength < minSize) return -1;

  // O comentario final tem no maximo 0xffff bytes; varre de tras pra frente.
  const maxBack = Math.min(buf.byteLength, minSize + 0xffff);
  const start = buf.byteLength - minSize;
  const limit = buf.byteLength - maxBack;

  for (let i = start; i >= limit; i--) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) {
      return i;
    }
  }

  return -1;
}
