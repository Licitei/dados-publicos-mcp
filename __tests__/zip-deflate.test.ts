import { describe, expect, test } from "bun:test";
import { unzipEntries, unzipFirst } from "../src/core/parse/zip";

// ---------------------------------------------------------------------------
// Cobre o ramo DEFLATE (metodo 8) de src/core/parse/zip.ts:
// readLocalEntry -> Bun.inflateSync(...). A fixture e montada em memoria,
// 100% bun-native (Bun.deflateSync produz raw deflate, lido por
// Bun.inflateSync), sem rede, sem arquivos em disco e sem libs externas.
//
// Para contraste tambem inclui uma entrada STORED (metodo 0), exercitando o
// outro ramo (Uint8Array.prototype.slice.call). A estrutura do ZIP segue o
// layout: [LFH + dados]* + [CDFH]* + EOCD.
// ---------------------------------------------------------------------------

const LFH_SIGNATURE = 0x04034b50;
const CDFH_SIGNATURE = 0x02014b50;
const EOCD_SIGNATURE = 0x06054b50;

const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

type FixtureFile = {
  name: string;
  payload: Uint8Array;
  /** 0 = stored (sem compressao), 8 = deflate (Bun.deflateSync raw). */
  method: number;
};

// Tabela CRC-32 (polinomio 0xedb88320) gerada uma vez.
const crcTable = (() => {
  const table = new Uint32Array(256);

  for (let n = 0; n < 256; n++) {
    let c = n;

    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }

    table[n] = c >>> 0;
  }

  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;

  for (let i = 0; i < bytes.length; i++) {
    crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Comprime conforme o metodo da entrada. Para deflate usamos Bun.deflateSync
 * (raw deflate) — exatamente o formato que Bun.inflateSync espera no leitor.
 */
function compressEntry(payload: Uint8Array, method: number): Uint8Array {
  if (method === METHOD_STORED) return payload;
  if (method === METHOD_DEFLATE) {
    return new Uint8Array(Bun.deflateSync(new Uint8Array(payload)));
  }

  throw new Error(`metodo de teste nao suportado: ${method}`);
}

/** Monta um ZIP em memoria com metodo de compressao por entrada. */
function buildZip(files: FixtureFile[]): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];

  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const raw = file.payload;
    const compressed = compressEntry(raw, file.method);
    const crc = crc32(raw);
    const localHeaderOffset = offset;

    // --- Local File Header + dados ---
    const lfh = new Uint8Array(30 + nameBytes.length + compressed.length);
    const lfhView = new DataView(lfh.buffer);

    lfhView.setUint32(0, LFH_SIGNATURE, true);
    lfhView.setUint16(4, 20, true); // version needed
    lfhView.setUint16(6, 0, true); // flags
    lfhView.setUint16(8, file.method, true); // compression method
    lfhView.setUint16(10, 0, true); // mod time
    lfhView.setUint16(12, 0, true); // mod date
    lfhView.setUint32(14, crc, true);
    lfhView.setUint32(18, compressed.length, true); // compressed size
    lfhView.setUint32(22, raw.length, true); // uncompressed size
    lfhView.setUint16(26, nameBytes.length, true);
    lfhView.setUint16(28, 0, true); // extra field length
    lfh.set(nameBytes, 30);
    lfh.set(compressed, 30 + nameBytes.length);

    offset += lfh.length;
    localParts.push(lfh);

    // --- Central Directory File Header ---
    const cdfh = new Uint8Array(46 + nameBytes.length);
    const cdView = new DataView(cdfh.buffer);

    cdView.setUint32(0, CDFH_SIGNATURE, true);
    cdView.setUint16(4, 20, true); // version made by
    cdView.setUint16(6, 20, true); // version needed
    cdView.setUint16(8, 0, true); // flags
    cdView.setUint16(10, file.method, true); // compression method
    cdView.setUint16(12, 0, true); // mod time
    cdView.setUint16(14, 0, true); // mod date
    cdView.setUint32(16, crc, true);
    cdView.setUint32(20, compressed.length, true); // compressed size
    cdView.setUint32(24, raw.length, true); // uncompressed size
    cdView.setUint16(28, nameBytes.length, true);
    cdView.setUint16(30, 0, true); // extra field length
    cdView.setUint16(32, 0, true); // comment length
    cdView.setUint16(34, 0, true); // disk number start
    cdView.setUint16(36, 0, true); // internal attrs
    cdView.setUint32(38, 0, true); // external attrs
    cdView.setUint32(42, localHeaderOffset, true); // local header offset
    cdfh.set(nameBytes, 46);

    centralParts.push(cdfh);
  }

  const centralStart = offset;
  const centralSize = centralParts.reduce((sum, p) => sum + p.length, 0);

  // --- End Of Central Directory ---
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);

  eocdView.setUint32(0, EOCD_SIGNATURE, true);
  eocdView.setUint16(4, 0, true); // disk number
  eocdView.setUint16(6, 0, true); // disk with CD
  eocdView.setUint16(8, files.length, true); // entries on this disk
  eocdView.setUint16(10, files.length, true); // total entries
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(16, centralStart, true);
  eocdView.setUint16(20, 0, true); // comment length

  const total = centralStart + centralSize + eocd.length;
  const out = new Uint8Array(total);
  let cursor = 0;

  for (const part of localParts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  for (const part of centralParts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  out.set(eocd, cursor);

  return out;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

describe("unzipEntries: ramo DEFLATE(8) via Bun.inflateSync", () => {
  // Payload bem comprimivel: forca o deflate a produzir algo menor que o
  // original, garantindo que estamos de fato no caminho comprimido.
  const deflatePayload = enc.encode("coluna;valor\n".repeat(800));
  const storedPayload = enc.encode("entrada nao comprimida (stored)");

  test("le entradas deflate e stored do mesmo zip", () => {
    const zip = buildZip([
      { name: "deflate/dados.csv", payload: deflatePayload, method: METHOD_DEFLATE },
      { name: "stored/plano.txt", payload: storedPayload, method: METHOD_STORED },
    ]);
    const entries = unzipEntries(zip);

    expect(entries.map((e) => e.name)).toEqual([
      "deflate/dados.csv",
      "stored/plano.txt",
    ]);

    // entry.bytes() descompacta via Bun.inflateSync e bate com o original.
    const deflateBack = entries[0].bytes();
    expect(deflateBack).toEqual(deflatePayload);
    expect(dec.decode(deflateBack)).toBe(dec.decode(deflatePayload));

    // entrada stored: ramo metodo 0 (slice), round-trip identico.
    const storedBack = entries[1].bytes();
    expect(storedBack).toEqual(storedPayload);
    expect(dec.decode(storedBack)).toBe("entrada nao comprimida (stored)");
  });

  test("a entrada deflate de fato foi comprimida na fixture", () => {
    // Sanidade: o byte comprimido e menor que o original, confirmando que o
    // round-trip exercita a descompressao real (e nao um stored disfarcado).
    const compressed = compressEntry(deflatePayload, METHOD_DEFLATE);
    expect(compressed.length).toBeLessThan(deflatePayload.length);

    // E o leitor restaura o conteudo integral apesar do tamanho reduzido.
    const zip = buildZip([
      { name: "so-deflate.bin", payload: deflatePayload, method: METHOD_DEFLATE },
    ]);
    expect(unzipEntries(zip)[0].bytes()).toEqual(deflatePayload);
  });

  test("unzipFirst devolve os bytes da primeira entrada (deflate)", () => {
    const zip = buildZip([
      { name: "primeiro.csv", payload: deflatePayload, method: METHOD_DEFLATE },
      { name: "segundo.txt", payload: storedPayload, method: METHOD_STORED },
    ]);

    expect(unzipFirst(zip)).toEqual(deflatePayload);
  });

  test("unzipFirst funciona quando a primeira entrada e stored", () => {
    const zip = buildZip([
      { name: "primeiro.txt", payload: storedPayload, method: METHOD_STORED },
      { name: "segundo.csv", payload: deflatePayload, method: METHOD_DEFLATE },
    ]);

    expect(dec.decode(unzipFirst(zip))).toBe("entrada nao comprimida (stored)");
  });

  test("deflate preserva bytes binarios arbitrarios (nao so texto)", () => {
    const binary = new Uint8Array(512);
    for (let i = 0; i < binary.length; i++) {
      // Padrao repetitivo => comprimivel, mas cobre o range 0..255.
      binary[i] = (i * 7) % 256;
    }

    const zip = buildZip([
      { name: "bin/blob.dat", payload: binary, method: METHOD_DEFLATE },
    ]);

    expect(unzipEntries(zip)[0].bytes()).toEqual(binary);
  });
});
