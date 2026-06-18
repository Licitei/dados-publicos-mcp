import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import * as TestClock from "effect/testing/TestClock";
import { sql } from "drizzle-orm";
import { FetchHttpClient } from "effect/unstable/http";
import { Db } from "../../src/kernel/db/client";
import { Capag, CapagLive } from "../../src/sources/capag/store";
import { TestDbLive } from "./support/test-db";

const crcTable = Array.from({ length: 256 }, (_, n) =>
  Array.from({ length: 8 }).reduce<number>(
    (c) => ((c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1),
    n
  )
);

const crc32 = (bytes: Uint8Array) =>
  (bytes.reduce(
    (crc, byte) => (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff],
    0xffffffff
  ) ^
    0xffffffff) >>>
  0;

type ZipEntry = { readonly name: string; readonly bytes: Uint8Array };

const storedZip = (entries: readonly ZipEntry[]) => {
  const encoder = new TextEncoder();
  const local = entries.map((entry) => {
    const nameBytes = encoder.encode(entry.name);
    const header = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint32(14, crc32(entry.bytes), true);
    view.setUint32(18, entry.bytes.length, true);
    view.setUint32(22, entry.bytes.length, true);
    view.setUint16(26, nameBytes.length, true);
    header.set(nameBytes, 30);
    return { nameBytes, header, data: entry.bytes };
  });
  const offsets = local.reduce<readonly number[]>(
    (acc, part) => [
      ...acc,
      (acc[acc.length - 1] ?? 0) + part.header.length + part.data.length,
    ],
    [0]
  );
  const central = local.map((part, index) => {
    const header = new Uint8Array(46 + part.nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint32(16, crc32(part.data), true);
    view.setUint32(20, part.data.length, true);
    view.setUint32(24, part.data.length, true);
    view.setUint16(28, part.nameBytes.length, true);
    view.setUint32(42, offsets[index], true);
    header.set(part.nameBytes, 46);
    return header;
  });
  const centralSize = central.reduce((sum, header) => sum + header.length, 0);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, entries.length, true);
  eocdView.setUint16(10, entries.length, true);
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(16, offsets[offsets.length - 1], true);
  const chunks = [
    ...local.flatMap((part) => [part.header, part.data]),
    ...central,
    eocd,
  ];
  const out = new Uint8Array(chunks.reduce((sum, c) => sum + c.length, 0));
  chunks.reduce((position, chunk) => {
    out.set(chunk, position);
    return position + chunk.length;
  }, 0);
  return out;
};

const colLetter = (index: number): string =>
  index < 26
    ? String.fromCharCode(65 + index)
    : `${colLetter(Math.floor(index / 26) - 1)}${colLetter(index % 26)}`;

const cell = (rowNumber: number, index: number, value: string) =>
  /^-?\d+(\.\d+)?$/.test(value)
    ? `<c r="${colLetter(index)}${rowNumber}"><v>${value}</v></c>`
    : `<c r="${colLetter(index)}${rowNumber}" t="inlineStr"><is><t>${value}</t></is></c>`;

const sheetRow = (
  rowNumber: number,
  values: readonly (readonly [number, string])[]
) =>
  `<row r="${rowNumber}">${values
    .map(([index, value]) => cell(rowNumber, index, value))
    .join("")}</row>`;

const municipioRow = (
  rowNumber: number,
  data: {
    readonly codIbge: string;
    readonly nome: string;
    readonly uf: string;
    readonly indicador1: string;
    readonly nota1: string;
    readonly indicador2: string;
    readonly nota2: string;
    readonly indicador3: string;
    readonly nota3: string;
    readonly capag: string;
  }
) =>
  sheetRow(rowNumber, [
    [0, data.codIbge],
    [1, data.nome],
    [2, data.uf],
    [5, data.indicador1],
    [6, data.nota1],
    [34, data.indicador2],
    [36, data.nota2],
    [63, data.indicador3],
    [66, data.nota3],
    [69, data.capag],
  ]);

const municipiosXlsx = storedZip([
  {
    name: "xl/workbook.xml",
    bytes: new TextEncoder().encode(
      `<?xml version="1.0"?><workbook><sheets><sheet name="CAPAG Ano Base 2024" sheetId="1" r:id="rId1"/></sheets></workbook>`
    ),
  },
  {
    name: "xl/_rels/workbook.xml.rels",
    bytes: new TextEncoder().encode(
      `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Type="ws" Target="worksheets/sheet1.xml"/></Relationships>`
    ),
  },
  {
    name: "xl/worksheets/sheet1.xml",
    bytes: new TextEncoder().encode(
      `<?xml version="1.0"?><worksheet><sheetData>${[
        sheetRow(1, [
          [0, "Cod.IBGE"],
          [1, "Municipio"],
          [2, "UF"],
        ]),
        municipioRow(5, {
          codIbge: "3550308",
          nome: "São Paulo",
          uf: "SP",
          indicador1: "0.3000",
          nota1: "A",
          indicador2: "1.2000",
          nota2: "A",
          indicador3: "2.0000",
          nota3: "A",
          capag: "A",
        }),
        municipioRow(6, {
          codIbge: "3304557",
          nome: "Rio de Janeiro",
          uf: "RJ",
          indicador1: "0.8000",
          nota1: "C",
          indicador2: "0.6000",
          nota2: "C",
          indicador3: "0.9000",
          nota3: "C",
          capag: "C",
        }),
        municipioRow(7, {
          codIbge: "5208707",
          nome: "Goiânia",
          uf: "GO",
          indicador1: "0.5500",
          nota1: "B+",
          indicador2: "0.7500",
          nota2: "B",
          indicador3: "1.1000",
          nota3: "B",
          capag: "B",
        }),
      ].join("")}</sheetData></worksheet>`
    ),
  },
]);

const estadosPackage = {
  success: true,
  result: {
    resources: [
      {
        name: "Capag Estados 2023",
        format: "CSV",
        url: "https://ckan.test/capag-estados-2023.csv",
      },
      {
        name: "Capag Estados 2024",
        format: "CSV",
        url: "https://ckan.test/capag-estados-2024.csv",
      },
    ],
  },
};

const municipiosPackage = {
  success: true,
  result: {
    resources: [
      {
        name: "Capag Municipios 2024 - 09/11/2024",
        format: "XLSX",
        url: "https://ckan.test/capag-municipios-2024.xlsx",
      },
    ],
  },
};

const estados2023Csv = [
  "UF;Indicador 1;Nota 1;Indicador 2;Nota 2;Indicador 3;Nota 3;Classificação da CAPAG;Qualidade da Informação;Observação",
  "SP;45,10%;A;88,00%;A;130,00%;A;A;Boa;-",
  "RJ;92,29%;D;70,00%;C;40,00%;D;C;Boa;-",
].join("\n");

const estados2024Csv = [
  "UF;Indicador 1;Nota 1;Indicador 2;Nota 2;Indicador 3;Nota 3;Classificação da CAPAG;Qualidade da Informação;Observação",
  "SP;44,00%;A;90,00%;A;140,00%;A;A;Boa;-",
  "RJ;95,00%;D;65,00%;C;38,00%;D;D;Boa;piora",
].join("\n");

const entesPayload = {
  items: [
    {
      cod_ibge: 3550308,
      ente: "São Paulo",
      uf: "SP",
      esfera: "M",
      regiao: "SE",
      populacao: 12300000,
      cnpj: "46.395.000/0001-39",
      exercicio: 2024,
    },
    {
      cod_ibge: 3304557,
      ente: "Rio de Janeiro",
      uf: "RJ",
      esfera: "M",
      regiao: "SE",
      populacao: 6700000,
      cnpj: "42.498.733/0001-48",
      exercicio: 2024,
    },
    {
      cod_ibge: 5208707,
      ente: "Goiânia",
      uf: "GO",
      esfera: "M",
      regiao: "CO",
      populacao: 1500000,
      cnpj: "01.612.092/0001-23",
      exercicio: 2024,
    },
    {
      cod_ibge: 35,
      ente: "Estado de São Paulo",
      uf: "BR",
      esfera: "E",
      regiao: "SE",
      populacao: 44000000,
      cnpj: "48.498.674/0001-92",
      exercicio: 2024,
    },
  ],
  hasMore: false,
};

const route = async (input: string | URL | Request): Promise<Response> => {
  const url = new URL(String(input));
  const id = url.searchParams.get("id");
  return url.pathname.endsWith("/package_show") && id === "capag-estados"
    ? Response.json(estadosPackage)
    : url.pathname.endsWith("/package_show") && id === "capag-municipios"
      ? Response.json(municipiosPackage)
      : url.pathname.endsWith("/capag-estados-2023.csv")
        ? new Response(estados2023Csv)
        : url.pathname.endsWith("/capag-estados-2024.csv")
          ? new Response(estados2024Csv)
          : url.pathname.endsWith("/capag-municipios-2024.xlsx")
            ? new Response(municipiosXlsx)
            : url.pathname.endsWith("/entes")
              ? Response.json(entesPayload)
              : new Response("rota desconhecida", { status: 404 });
};

const stub = Object.assign(route, {
  preconnect: () => {},
}) satisfies typeof fetch;

const HttpStub = FetchHttpClient.layer.pipe(
  Layer.provide(Layer.succeed(FetchHttpClient.Fetch, stub))
);

const TestLayer = Layer.mergeAll(
  CapagLive.pipe(Layer.provide(Layer.mergeAll(TestDbLive, HttpStub))),
  TestDbLive,
  HttpStub
);

const seeded = Effect.gen(function* () {
  yield* TestClock.setTime(Date.UTC(2024, 5, 15));
  const capag = yield* Capag;
  yield* capag.indexAno(2024);
  return capag;
});

describe("capag store + fiscal solvency ratings", () => {
  it.effect(
    "index discovers latest CSV (estados) + XLSX (municipios) and persists three tables",
    () =>
      Effect.gen(function* () {
        yield* seeded;
        const db = yield* Db;
        const estados = yield* db.execute(
          sql`select count(*)::int as count from capag_estado`
        );
        const municipios = yield* db.execute(
          sql`select count(*)::int as count from capag_municipio`
        );
        const entes = yield* db.execute(
          sql`select count(*)::int as count from siconfi_ente`
        );
        expect(Number(estados[0].count)).toBe(2);
        expect(Number(municipios[0].count)).toBe(3);
        expect(Number(entes[0].count)).toBe(4);
      }).pipe(Effect.provide(TestLayer)),
    30_000
  );

  it.effect(
    "capagEnte resolves by ibge exact with XLSX fraction + estado percentage coercion",
    () =>
      Effect.gen(function* () {
        const capag = yield* seeded;
        const sp = yield* capag.capagEnte({ ibge: "3550308" });
        expect(sp.capag).toBe("A");
        expect(sp.nome).toBe("São Paulo");
        expect(sp.indicador1).toBeCloseTo(0.3, 5);
        const goiania = yield* capag.capagEnte({ ibge: "5208707" });
        expect(goiania.indicador1).toBeCloseTo(0.55, 5);
        const estado = yield* capag.capagEnte({ ibge: "RJ" });
        expect(estado.uf).toBe("RJ");
        expect(estado.capag).toBe("D");
        expect(estado.indicador1).toBeCloseTo(0.95, 5);
      }).pipe(Effect.provide(TestLayer)),
    30_000
  );

  it.effect(
    "capagEnte by name exposes a bm25 (negative) score and a trgm-typo (positive) score",
    () =>
      Effect.gen(function* () {
        const capag = yield* seeded;
        const goiania = yield* capag.capagEnte({ nome: "goiania" });
        expect(goiania.nome).toBe("Goiânia");
        expect(goiania.capag).toBe("B");
        expect(goiania.score).not.toBeNull();
        expect(goiania.score).toBeLessThan(0);
        const typo = yield* capag.capagEnte({ nome: "goina" });
        expect(typo.nome).toBe("Goiânia");
        expect(typo.score).not.toBeNull();
        expect(typo.score).toBeGreaterThan(0);
        const filtered = yield* capag.capagEnte({ nome: "rio", uf: "RJ" });
        expect(filtered.uf).toBe("RJ");
      }).pipe(Effect.provide(TestLayer)),
    30_000
  );

  it.effect(
    "capagEnte fails ENTE_NOT_FOUND for an unknown name and MISSING_IDENTIFIER for empty input",
    () =>
      Effect.gen(function* () {
        const capag = yield* seeded;
        const notFound = yield* Effect.flip(
          capag.capagEnte({ nome: "cidade inexistente xyz" })
        );
        expect(notFound).toMatchObject({ code: "capag.ENTE_NOT_FOUND" });
        const missing = yield* Effect.flip(capag.capagEnte({}));
        expect(missing).toMatchObject({ code: "capag.MISSING_IDENTIFIER" });
        expect(missing.message).toContain("Informe ibge ou nome");
      }).pipe(Effect.provide(TestLayer)),
    30_000
  );

  it.effect(
    "serieHistorica returns every ano of a municipio ordered ascending by ano",
    () =>
      Effect.gen(function* () {
        const capag = yield* seeded;
        const db = yield* Db;
        yield* db.execute(sql`
          insert into capag_municipio
            (cod_ibge, nome, nome_norm, uf, ano_base, posicao, capag, busca)
          values ('3550308', 'São Paulo', 'sao paulo', 'SP', 2022,
                  '2022-11-09', 'B', 'sao paulo')
        `);
        const serie = yield* capag.serieHistorica({ ibge: "3550308" });
        expect(serie.tipo).toBe("municipio");
        const anos = serie.serie.map((row) => row.anoBase);
        expect(anos).toEqual([2022, 2024]);
        expect(serie.serie.map((row) => row.capag)).toEqual(["B", "A"]);
      }).pipe(Effect.provide(TestLayer)),
    30_000
  );

  it.effect(
    "entesPorNota filters by a rating subset and by region via the siconfi bridge",
    () =>
      Effect.gen(function* () {
        const capag = yield* seeded;
        const cd = yield* capag.entesPorNota({ notas: ["C", "D"] });
        expect(cd.estados.map((e) => e.uf)).toEqual(["RJ"]);
        const municipiosCD = cd.municipios.map((m) => m.nome);
        expect(municipiosCD).toContain("Rio de Janeiro");
        expect(municipiosCD).not.toContain("São Paulo");
        const aCentroOeste = yield* capag.entesPorNota({
          notas: ["A", "B"],
          regiao: "CO",
        });
        expect(aCentroOeste.municipios.map((m) => m.nome)).toEqual(["Goiânia"]);
        expect(aCentroOeste.estados).toEqual([]);
      }).pipe(Effect.provide(TestLayer)),
    30_000
  );

  it.effect(
    "buscarEntePorNome ranks siconfi entes by the busca bm25/trgm column",
    () =>
      Effect.gen(function* () {
        const capag = yield* seeded;
        const entes = yield* capag.buscarEntePorNome("goiania");
        expect(entes[0].ente).toBe("Goiânia");
        expect(entes[0].codIbge).toBe("5208707");
        expect(entes[0].score).toBeLessThan(0);
      }).pipe(Effect.provide(TestLayer)),
    30_000
  );

  it.effect(
    "resolverEntePorCnpj maps a CNPJ to its ente and codIbge, else CNPJ_NOT_FOUND",
    () =>
      Effect.gen(function* () {
        const capag = yield* seeded;
        const ente = yield* capag.resolverEntePorCnpj("46.395.000/0001-39");
        expect(ente.ente).toBe("São Paulo");
        expect(ente.codIbge).toBe("3550308");
        expect(ente.esfera).toBe("M");
        const sp = yield* capag.capagEnte({ ibge: ente.codIbge });
        expect(sp.capag).toBe("A");
        const estado = yield* capag.resolverEntePorCnpj("48.498.674/0001-92");
        expect(estado.esfera).toBe("E");
        expect(estado.codIbge).toBe("35");
        const missing = yield* Effect.flip(
          capag.resolverEntePorCnpj("00.000.000/0000-00")
        );
        expect(missing).toMatchObject({ code: "capag.CNPJ_NOT_FOUND" });
      }).pipe(Effect.provide(TestLayer)),
    30_000
  );
});
