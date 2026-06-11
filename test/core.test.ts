import { expect, test } from "bun:test";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { getDataDir } from "../src/core/dataDir";
import { normalize, normalizeCnpj, onlyDigits } from "../src/core/normalize";
import { parseNumeroBr } from "../src/core/parse/numero-br";
import { parseDataBr } from "../src/core/parse/data-br";
import { parseCsv, parseCsvObjects } from "../src/core/parse/csv";
import { unzipEntries, unzipFirst } from "../src/core/parse/zip";

// ---------------------------------------------------------------------------
// normalize / normalizeCnpj / onlyDigits
// ---------------------------------------------------------------------------

test("normalize remove acentos, baixa caixa e colapsa separadores", () => {
  expect(normalize("Licitação  Pública!")).toBe("licitacao publica");
  expect(normalize("  Art. 67, parag 1  ")).toBe("art 67 parag 1");
  expect(normalize("CONTRATAÇÃO-Direta")).toBe("contratacao direta");
});

test("onlyDigits mantem apenas digitos", () => {
  expect(onlyDigits("00.000.000/0001-91")).toBe("00000000000191");
  expect(onlyDigits("abc123def456")).toBe("123456");
  expect(onlyDigits("")).toBe("");
});

test("normalizeCnpj valida 14 digitos", () => {
  expect(normalizeCnpj("00.000.000/0001-91")).toBe("00000000000191");
  expect(() => normalizeCnpj("123")).toThrow();
  expect(() => normalizeCnpj("000000000001910")).toThrow();
});

// ---------------------------------------------------------------------------
// parseNumeroBr
// ---------------------------------------------------------------------------

test("parseNumeroBr converte formato brasileiro", () => {
  expect(parseNumeroBr("5.000,00")).toBe(5000);
  expect(parseNumeroBr("1.234,56")).toBe(1234.56);
  expect(parseNumeroBr("0,50")).toBe(0.5);
  expect(parseNumeroBr("1.000.000,99")).toBe(1000000.99);
  expect(parseNumeroBr("42")).toBe(42);
});

test("parseNumeroBr trata vazio e invalido como null", () => {
  expect(parseNumeroBr("")).toBeNull();
  expect(parseNumeroBr("   ")).toBeNull();
  expect(parseNumeroBr(undefined)).toBeNull();
  expect(parseNumeroBr(null)).toBeNull();
  expect(parseNumeroBr("abc")).toBeNull();
});

// ---------------------------------------------------------------------------
// parseDataBr
// ---------------------------------------------------------------------------

test("parseDataBr converte AAAAMMDD e dd/mm/aaaa", () => {
  expect(parseDataBr("20260611")).toBe("2026-06-11");
  expect(parseDataBr("11/06/2026")).toBe("2026-06-11");
  expect(parseDataBr("1/6/2026")).toBe("2026-06-01");
  expect(parseDataBr("2026-06-11")).toBe("2026-06-11");
});

test("parseDataBr trata zero/vazio/invalido como null", () => {
  expect(parseDataBr("0")).toBeNull();
  expect(parseDataBr("00000000")).toBeNull();
  expect(parseDataBr("")).toBeNull();
  expect(parseDataBr(undefined)).toBeNull();
  expect(parseDataBr(null)).toBeNull();
  expect(parseDataBr("20261301")).toBeNull();
  expect(parseDataBr("nao-data")).toBeNull();
});

// ---------------------------------------------------------------------------
// parseCsv (aspas, CRLF, delimitador ; e decode iso-8859-1)
// ---------------------------------------------------------------------------

test("parseCsv respeita aspas, CRLF e delimitador padrao ;", () => {
  const csv = 'a;b;c\r\n1;"dois; com; ponto-virgula";3\r\n"com ""aspas""";x;y';
  const rows = parseCsv(csv);

  expect(rows).toEqual([
    ["a", "b", "c"],
    ["1", "dois; com; ponto-virgula", "3"],
    ['com "aspas"', "x", "y"],
  ]);
});

test("parseCsv decodifica iso-8859-1", () => {
  // "Razão;São Paulo" em ISO-8859-1 (latin1).
  const latin1 = Uint8Array.from(
    Buffer.from("Razão;São Paulo", "latin1")
  );
  const rows = parseCsv(latin1, { encoding: "iso-8859-1" });

  expect(rows).toEqual([["Razão", "São Paulo"]]);
});

test("parseCsv remove BOM utf-8", () => {
  const withBom = "﻿nome;valor\nfoo;bar";
  const rows = parseCsv(withBom);

  expect(rows[0]).toEqual(["nome", "valor"]);
});

test("parseCsv com hasHeader descarta a primeira linha", () => {
  const rows = parseCsv("col1;col2\nv1;v2", { hasHeader: true });

  expect(rows).toEqual([["v1", "v2"]]);
});

test("parseCsvObjects usa cabecalho do arquivo", () => {
  const objs = parseCsvObjects("nome;uf\nAlpha;SP\nBeta;RJ");

  expect(objs).toEqual([
    { nome: "Alpha", uf: "SP" },
    { nome: "Beta", uf: "RJ" },
  ]);
});

test("parseCsvObjects com headerOverride nao consome linha de dados", () => {
  const objs = parseCsvObjects("Alpha;SP\nBeta;RJ", ["nome", "uf"]);

  expect(objs).toEqual([
    { nome: "Alpha", uf: "SP" },
    { nome: "Beta", uf: "RJ" },
  ]);
});

// ---------------------------------------------------------------------------
// unzipEntries / unzipFirst (fixture criada em runtime sem lib externa)
// ---------------------------------------------------------------------------

type FixtureFile = { name: string; content: string };

/**
 * Monta um arquivo ZIP minimo (sem deps) com entradas deflate, para validar
 * o leitor sem rede. Estrutura: [LFH+dados]* + [CDFH]* + EOCD.
 */
function buildZip(files: FixtureFile[]): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  const offsets: number[] = [];

  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const raw = encoder.encode(file.content);
    const compressed = Uint8Array.from(deflateRawSync(raw));
    const crc = crc32(raw);

    const lfh = new Uint8Array(30 + nameBytes.length + compressed.length);
    const lfhView = new DataView(lfh.buffer);

    lfhView.setUint32(0, 0x04034b50, true);
    lfhView.setUint16(4, 20, true); // version needed
    lfhView.setUint16(6, 0, true); // flags
    lfhView.setUint16(8, 8, true); // method: deflate
    lfhView.setUint16(10, 0, true); // mod time
    lfhView.setUint16(12, 0, true); // mod date
    lfhView.setUint32(14, crc, true);
    lfhView.setUint32(18, compressed.length, true);
    lfhView.setUint32(22, raw.length, true);
    lfhView.setUint16(26, nameBytes.length, true);
    lfhView.setUint16(28, 0, true); // extra len
    lfh.set(nameBytes, 30);
    lfh.set(compressed, 30 + nameBytes.length);

    offsets.push(offset);
    offset += lfh.length;
    localParts.push(lfh);

    const cdfh = new Uint8Array(46 + nameBytes.length);
    const cdView = new DataView(cdfh.buffer);

    cdView.setUint32(0, 0x02014b50, true);
    cdView.setUint16(4, 20, true); // version made by
    cdView.setUint16(6, 20, true); // version needed
    cdView.setUint16(8, 0, true); // flags
    cdView.setUint16(10, 8, true); // method: deflate
    cdView.setUint16(12, 0, true);
    cdView.setUint16(14, 0, true);
    cdView.setUint32(16, crc, true);
    cdView.setUint32(20, compressed.length, true);
    cdView.setUint32(24, raw.length, true);
    cdView.setUint16(28, nameBytes.length, true);
    cdView.setUint16(30, 0, true); // extra len
    cdView.setUint16(32, 0, true); // comment len
    cdView.setUint16(34, 0, true); // disk number
    cdView.setUint16(36, 0, true); // internal attrs
    cdView.setUint32(38, 0, true); // external attrs
    cdView.setUint32(42, offsets[offsets.length - 1], true);
    cdfh.set(nameBytes, 46);

    centralParts.push(cdfh);
  }

  const centralStart = offset;
  const centralSize = centralParts.reduce((sum, p) => sum + p.length, 0);

  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);

  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(4, 0, true); // disk
  eocdView.setUint16(6, 0, true); // disk with CD
  eocdView.setUint16(8, files.length, true);
  eocdView.setUint16(10, files.length, true);
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(16, centralStart, true);
  eocdView.setUint16(20, 0, true); // comment len

  const total =
    centralStart + centralSize + eocd.length;
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

test("unzipEntries le entradas deflate de um zip real", () => {
  const zip = buildZip([
    { name: "primeiro.csv", content: "a;b;c\n1;2;3" },
    { name: "pasta/segundo.txt", content: "conteudo do segundo arquivo" },
  ]);
  const entries = unzipEntries(zip);

  expect(entries.map((e) => e.name)).toEqual([
    "primeiro.csv",
    "pasta/segundo.txt",
  ]);

  const decoder = new TextDecoder();

  expect(decoder.decode(entries[0].bytes())).toBe("a;b;c\n1;2;3");
  expect(decoder.decode(entries[1].bytes())).toBe(
    "conteudo do segundo arquivo"
  );
});

test("unzipFirst devolve a primeira entrada", () => {
  const zip = buildZip([{ name: "only.txt", content: "ola mundo" }]);

  expect(new TextDecoder().decode(unzipFirst(zip))).toBe("ola mundo");
});

// ---------------------------------------------------------------------------
// getDataDir (resolucao de diretorio consciente de plataforma)
// ---------------------------------------------------------------------------

const DATA_ENV_KEYS = [
  "DADOS_PUBLICOS_MCP_DATA_DIR",
  "LOCALAPPDATA",
  "APPDATA",
  "XDG_DATA_HOME",
  "HOME",
] as const;

/** Roda fn com platform/env controlados e restaura tudo no fim. */
function withDataEnv(
  platform: string,
  env: Partial<Record<(typeof DATA_ENV_KEYS)[number], string>>,
  fn: () => void
): void {
  const savedPlatform = process.platform;
  const savedEnv = Object.fromEntries(
    DATA_ENV_KEYS.map((key) => [key, process.env[key]])
  );

  Object.defineProperty(process, "platform", {
    value: platform,
    configurable: true,
  });

  for (const key of DATA_ENV_KEYS) {
    const value = env[key];

    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    fn();
  } finally {
    Object.defineProperty(process, "platform", {
      value: savedPlatform,
      configurable: true,
    });

    for (const key of DATA_ENV_KEYS) {
      const value = savedEnv[key];

      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("getDataDir prioriza DADOS_PUBLICOS_MCP_DATA_DIR sobre tudo", () => {
  withDataEnv(
    "win32",
    {
      DADOS_PUBLICOS_MCP_DATA_DIR: "/override/explicito",
      LOCALAPPDATA: "C:\\Users\\ze\\AppData\\Local",
      HOME: "/home/ze",
    },
    () => {
      expect(getDataDir()).toBe("/override/explicito");
    }
  );
});

test("getDataDir usa LOCALAPPDATA no Windows", () => {
  withDataEnv(
    "win32",
    { LOCALAPPDATA: "C:\\Users\\ze\\AppData\\Local", HOME: "/home/ze" },
    () => {
      expect(getDataDir()).toBe(
        join("C:\\Users\\ze\\AppData\\Local", "dados-publicos-mcp")
      );
    }
  );
});

test("getDataDir cai em APPDATA quando nao ha LOCALAPPDATA no Windows", () => {
  withDataEnv(
    "win32",
    { APPDATA: "C:\\Users\\ze\\AppData\\Roaming" },
    () => {
      expect(getDataDir()).toBe(
        join("C:\\Users\\ze\\AppData\\Roaming", "dados-publicos-mcp")
      );
    }
  );
});

test("getDataDir usa XDG_DATA_HOME fora do Windows", () => {
  withDataEnv("linux", { XDG_DATA_HOME: "/data/xdg", HOME: "/home/ze" }, () => {
    expect(getDataDir()).toBe(join("/data/xdg", "dados-publicos-mcp"));
  });
});

test("getDataDir cai em ~/.local/share via HOME", () => {
  withDataEnv("linux", { HOME: "/home/ze" }, () => {
    expect(getDataDir()).toBe(
      join("/home/ze", ".local", "share", "dados-publicos-mcp")
    );
  });
});

test("unzipEntries roundtrip com payload grande comprimivel", () => {
  const content = "linha repetida;valor\n".repeat(5000);
  const zip = buildZip([{ name: "grande.csv", content }]);
  const entries = unzipEntries(zip);

  expect(new TextDecoder().decode(entries[0].bytes())).toBe(content);
});
