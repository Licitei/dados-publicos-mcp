import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { Result } from "better-result";
import { crc32 } from "node:zlib";
import {
  colLetterToIndex,
  extractPosicao,
  extractYear,
  mapEstadosRows,
  mapMunicipiosRows,
  normalizeCodIbge,
  parseIndicador,
  parseNota,
  readXlsxSheet,
} from "../src/modules/capag/parse";
import { parseCsv } from "../src/core/parse/csv";
import {
  capagEnte,
  capagSerieHistorica,
  countCapag,
  createSchema,
  entesPorNota,
  resolverEntePorCnpj,
} from "../src/modules/capag/service";

// ----------------------- parsing puro -----------------------

describe("parseIndicador", () => {
  test("percentual BR com virgula vira fracao", () => {
    expect(parseIndicador("92,29%")).toBeCloseTo(0.9229, 6);
    expect(parseIndicador("-1,03%")).toBeCloseTo(-0.0103, 6);
    expect(parseIndicador("231,81%")).toBeCloseTo(2.3181, 6);
  });

  test("fracao decimal do XLSX permanece fracao", () => {
    expect(parseIndicador(0.8016044393645374)).toBeCloseTo(0.8016, 4);
    expect(parseIndicador("0.084260903")).toBeCloseTo(0.0842609, 6);
  });

  test("vazio e n.d. viram null", () => {
    expect(parseIndicador("")).toBeNull();
    expect(parseIndicador("n.d.")).toBeNull();
    expect(parseIndicador(null)).toBeNull();
    expect(parseIndicador(undefined)).toBeNull();
  });
});

describe("parseNota", () => {
  test("notas validas inclusive modificadores", () => {
    expect(parseNota("A+")).toBe("A+");
    expect(parseNota("B+")).toBe("B+");
    expect(parseNota(" C ")).toBe("C");
    expect(parseNota("D")).toBe("D");
    expect(parseNota("n.d.")).toBe("n.d.");
    expect(parseNota("n.e.")).toBe("n.e.");
  });

  test("desconhecida/vazia vira null", () => {
    expect(parseNota("")).toBeNull();
    expect(parseNota("X")).toBeNull();
    expect(parseNota(null)).toBeNull();
  });
});

describe("extractYear / extractPosicao", () => {
  test("extrai ano de nomes de resource", () => {
    expect(extractYear("Capag Estados 2025")).toBe(2025);
    expect(extractYear("CAPAG Ano Base 2024")).toBe(2024);
    expect(extractYear("Metadados")).toBeNull();
  });

  test("extrai data de posicao BR e ISO", () => {
    expect(extractPosicao("Capag Municipios 2025 - 09/11/2025")).toBe(
      "2025-11-09",
    );
    expect(extractPosicao("posicao 2025-02-19")).toBe("2025-02-19");
    expect(extractPosicao("sem data")).toBeNull();
  });
});

describe("colLetterToIndex / normalizeCodIbge", () => {
  test("letras de coluna Excel viram indices 0-based", () => {
    expect(colLetterToIndex("A")).toBe(0);
    expect(colLetterToIndex("F")).toBe(5);
    expect(colLetterToIndex("G")).toBe(6);
    expect(colLetterToIndex("AI")).toBe(34);
    expect(colLetterToIndex("AK")).toBe(36);
    expect(colLetterToIndex("BL")).toBe(63);
    expect(colLetterToIndex("BO")).toBe(66);
    expect(colLetterToIndex("BR")).toBe(69);
  });

  test("cod ibge normaliza para 7 digitos", () => {
    expect(normalizeCodIbge(5200050)).toBe("5200050");
    expect(normalizeCodIbge("5200050")).toBe("5200050");
    expect(normalizeCodIbge("520005")).toBe("0520005");
    expect(normalizeCodIbge("CAPAG")).toBeNull();
    expect(normalizeCodIbge("")).toBeNull();
  });
});

// ----------------------- CSV de estados (fixture inline) -----------------------

const ESTADOS_CSV = [
  "UF;Indicador 1;Nota 1;Indicador 2;Nota 2;Indicador 3;Nota 3;Classificação da CAPAG;Qualidade da informação contábil e fiscal;Observação",
  "AC;34,95%;A;92,29%;B;-1,03%;C;C;Bicf;",
  "MG;181,78%;C;95,21%;C;-19,53%;C;D;Aicf;",
  "SP;147,35%;C;89,75%;B;1,97%;B;B;Bicf;",
].join("\n");

describe("mapEstadosRows", () => {
  test("mapeia CSV de estados normalizando percentuais", () => {
    const matrix = parseCsv(ESTADOS_CSV, { delimiter: ";", encoding: "utf-8" });
    const rows = mapEstadosRows(matrix.slice(1));

    expect(rows).toHaveLength(3);

    const ac = rows.find((r) => r.uf === "AC")!;
    expect(ac.indicador1).toBeCloseTo(0.3495, 6);
    expect(ac.nota1).toBe("A");
    expect(ac.indicador3).toBeCloseTo(-0.0103, 6);
    expect(ac.nota3).toBe("C");
    expect(ac.capag).toBe("C");
    expect(ac.qualidadeInfo).toBe("Bicf");

    const mg = rows.find((r) => r.uf === "MG")!;
    expect(mg.capag).toBe("D");
  });
});

// ----------------------- XLSX minimo (fixture gerada em memoria) -----------------------

/**
 * Constroi um XLSX minimo (ZIP store-only, que unzipEntries suporta) com a aba
 * "CAPAG Ano Base 2024" reproduzindo o layout real de colunas.
 */
function buildXlsxFixture(): Uint8Array {
  const shared = ["GO", "Goias", "RJ", "Rio de Janeiro"];
  const sharedStrings = `<?xml version="1.0"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.length}" uniqueCount="${shared.length}">
${shared.map((s) => `<si><t>${s}</t></si>`).join("")}
</sst>`;

  const workbook = `<?xml version="1.0"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>
<sheet name="Prévia da CAPAG" sheetId="36" r:id="rId1"/>
<sheet name="CAPAG Ano Base 2024" sheetId="35" r:id="rId2"/>
</sheets>
</workbook>`;

  const rels = `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
</Relationships>`;

  // Helpers para montar celulas por coluna (col index 0-based -> letra).
  function letter(idx: number): string {
    let n = idx + 1;
    let s = "";
    while (n > 0) {
      const r = (n - 1) % 26;
      s = String.fromCharCode(65 + r) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  function numCell(col: number, row: number, v: number | string): string {
    return `<c r="${letter(col)}${row}"><v>${v}</v></c>`;
  }
  function sharedCell(col: number, row: number, idx: number): string {
    return `<c r="${letter(col)}${row}" t="s"><v>${idx}</v></c>`;
  }
  function strCell(col: number, row: number, v: string): string {
    return `<c r="${letter(col)}${row}" t="str"><v>${v}</v></c>`;
  }

  // Linha de dados: A=cod, B=nome(shared), C=uf(shared), F=ind1, G=nota1,
  // AI=ind2, AK=nota2, BL=ind3, BO=nota3, BR=capag.
  function dataRow(
    row: number,
    cod: string,
    nameIdx: number,
    ufIdx: number,
    ind1: number,
    nota1: string,
    ind2: number,
    nota2: string,
    ind3: number,
    nota3: string,
    capag: string,
  ): string {
    const cells = [
      numCell(0, row, cod),
      sharedCell(1, row, nameIdx),
      sharedCell(2, row, ufIdx),
      numCell(5, row, ind1),
      strCell(6, row, nota1),
      numCell(34, row, ind2),
      strCell(36, row, nota2),
      numCell(63, row, ind3),
      strCell(66, row, nota3),
      strCell(69, row, capag),
    ].join("");
    return `<row r="${row}">${cells}</row>`;
  }

  const sheet2 = `<?xml version="1.0"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>
<row r="4"><c r="A4"><v>3</v></c><c r="F4" t="str"><v>Indicador 1</v></c></row>
${dataRow(5, "5200050", 1, 0, 0.024171127, "A", 0.8016044393645374, "A", 0.084260903, "A", "A")}
${dataRow(6, "3304557", 3, 2, 2.3181, "C", 0.9844, "C", -0.087, "C", "D")}
</sheetData>
</worksheet>`;

  const sheet1 = `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>`;

  const files: { name: string; content: string }[] = [
    { name: "xl/workbook.xml", content: workbook },
    { name: "xl/_rels/workbook.xml.rels", content: rels },
    { name: "xl/sharedStrings.xml", content: sharedStrings },
    { name: "xl/worksheets/sheet1.xml", content: sheet1 },
    { name: "xl/worksheets/sheet2.xml", content: sheet2 },
  ];

  return zipStore(files);
}

/** Cria um ZIP usando apenas o metodo store (0), suportado por unzipEntries. */
function zipStore(files: { name: string; content: string }[]): Uint8Array {
  const enc = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  type Meta = {
    nameBytes: Uint8Array;
    crc: number;
    size: number;
    offset: number;
  };
  const metas: Meta[] = [];

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const data = enc.encode(f.content);
    const crc = crc32(Buffer.from(data)) >>> 0;
    const lfh = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(lfh.buffer);

    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true); // version
    dv.setUint16(6, 0, true); // flags
    dv.setUint16(8, 0, true); // method store
    dv.setUint16(10, 0, true); // time
    dv.setUint16(12, 0, true); // date
    dv.setUint32(14, crc, true);
    dv.setUint32(18, data.length, true); // compressed
    dv.setUint32(22, data.length, true); // uncompressed
    dv.setUint16(26, nameBytes.length, true);
    dv.setUint16(28, 0, true); // extra
    lfh.set(nameBytes, 30);

    metas.push({ nameBytes, crc, size: data.length, offset });

    localParts.push(lfh, data);
    offset += lfh.length + data.length;
  }

  for (const m of metas) {
    const cdfh = new Uint8Array(46 + m.nameBytes.length);
    const dv = new DataView(cdfh.buffer);

    dv.setUint32(0, 0x02014b50, true);
    dv.setUint16(4, 20, true); // version made by
    dv.setUint16(6, 20, true); // version needed
    dv.setUint16(8, 0, true);
    dv.setUint16(10, 0, true); // method store
    dv.setUint16(12, 0, true);
    dv.setUint16(14, 0, true);
    dv.setUint32(16, m.crc, true);
    dv.setUint32(20, m.size, true);
    dv.setUint32(24, m.size, true);
    dv.setUint16(28, m.nameBytes.length, true);
    dv.setUint16(30, 0, true); // extra
    dv.setUint16(32, 0, true); // comment
    dv.setUint16(34, 0, true);
    dv.setUint16(36, 0, true);
    dv.setUint32(38, 0, true);
    dv.setUint32(42, m.offset, true);
    cdfh.set(m.nameBytes, 46);

    centralParts.push(cdfh);
  }

  const centralSize = centralParts.reduce((a, b) => a + b.length, 0);
  const centralOffset = offset;
  const eocd = new Uint8Array(22);
  const edv = new DataView(eocd.buffer);

  edv.setUint32(0, 0x06054b50, true);
  edv.setUint16(4, 0, true);
  edv.setUint16(6, 0, true);
  edv.setUint16(8, files.length, true);
  edv.setUint16(10, files.length, true);
  edv.setUint32(12, centralSize, true);
  edv.setUint32(16, centralOffset, true);
  edv.setUint16(20, 0, true);

  const all = [...localParts, ...centralParts, eocd];
  const total = all.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;

  for (const part of all) {
    out.set(part, pos);
    pos += part.length;
  }

  return out;
}

describe("readXlsxSheet + mapMunicipiosRows", () => {
  test("le aba CAPAG Ano Base e mapeia colunas/indicadores", () => {
    const xlsx = buildXlsxFixture();
    const rows = readXlsxSheet(xlsx, (name) =>
      name.trim().startsWith("CAPAG Ano Base"),
    );
    const mapped = mapMunicipiosRows(rows);

    expect(mapped).toHaveLength(2);

    const go = mapped.find((m) => m.codIbge === "5200050")!;
    expect(go.nome).toBe("Goias");
    expect(go.uf).toBe("GO");
    expect(go.indicador1).toBeCloseTo(0.024171, 5);
    expect(go.nota1).toBe("A");
    expect(go.indicador2).toBeCloseTo(0.801604, 5);
    expect(go.capag).toBe("A");

    const rj = mapped.find((m) => m.codIbge === "3304557")!;
    expect(rj.uf).toBe("RJ");
    expect(rj.nota3).toBe("C");
    expect(rj.capag).toBe("D");
    // Linha de cabecalho (row 4) nao deve virar registro.
    expect(mapped.every((m) => /^\d{7}$/.test(m.codIbge))).toBe(true);
  });
});

// ----------------------- busca via SQLite :memory: -----------------------

function seedDb(): Database {
  const db = new Database(":memory:");

  createSchema(db);

  db.exec(`
    INSERT INTO capag_estados (uf, ano, indicador1, nota1, indicador2, nota2, indicador3, nota3, capag, qualidade_info, observacao) VALUES
      ('AC', 2024, 0.30, 'A', 0.90, 'B', 0.01, 'B', 'B', 'Aicf', ''),
      ('AC', 2025, 0.3495, 'A', 0.9229, 'B', -0.0103, 'C', 'C', 'Bicf', ''),
      ('MG', 2025, 1.8178, 'C', 0.9521, 'C', -0.1953, 'C', 'D', 'Aicf', ''),
      ('SP', 2025, 1.4735, 'C', 0.8975, 'B', 0.0197, 'B', 'B', 'Bicf', '');

    INSERT INTO capag_municipios (cod_ibge, nome, uf, ano_base, posicao, indicador1, nota1, indicador2, nota2, indicador3, nota3, capag) VALUES
      ('5200050', 'Abadia de Goias', 'GO', 2024, '2025-11-09', 0.0242, 'A', 0.8016, 'A', 0.0843, 'A', 'A'),
      ('5200050', 'Abadia de Goias', 'GO', 2023, '2024-10-15', 0.05, 'A', 0.82, 'A', 0.07, 'A', 'A+'),
      ('3304557', 'Rio de Janeiro', 'RJ', 2024, '2025-11-09', 2.31, 'C', 0.98, 'C', -0.08, 'C', 'D'),
      ('3550308', 'Sao Paulo', 'SP', 2024, '2025-11-09', 1.47, 'C', 0.89, 'B', 0.01, 'B', 'C');

    INSERT INTO siconfi_entes (cod_ibge, ente, uf, esfera, regiao, populacao, cnpj, exercicio) VALUES
      ('3304557', 'Rio de Janeiro', 'RJ', 'M', 'SE', 6211000, '42498600000171', 2026),
      ('5200050', 'Abadia de Goias', 'GO', 'M', 'CO', 8958, '24996490000174', 2026);
  `);

  return db;
}

describe("capagEnte", () => {
  test("por cod_ibge devolve posicao mais recente", () => {
    const db = seedDb();
    const res = capagEnte(db, { codIbge: "5200050" });

    expect(Result.isOk(res)).toBe(true);
    const ente = Result.isOk(res) ? res.value : null;
    expect(ente?.tipo).toBe("municipio");
    expect(ente?.ano).toBe(2024);
    expect(ente?.capag).toBe("A");
    expect(ente?.indicadores.poupanca_corrente.valor).toBeCloseTo(0.8016, 6);
    db.close();
  });

  test("por nome+uf", () => {
    const db = seedDb();
    const res = capagEnte(db, { nome: "Rio de Janeiro", uf: "RJ" });
    const ente = Result.isOk(res) ? res.value : null;

    expect(ente?.cod_ibge).toBe("3304557");
    expect(ente?.capag).toBe("D");
    db.close();
  });

  test("por uf devolve estado mais recente", () => {
    const db = seedDb();
    const res = capagEnte(db, { uf: "AC" });
    const ente = Result.isOk(res) ? res.value : null;

    expect(ente?.tipo).toBe("estado");
    expect(ente?.ano).toBe(2025);
    expect(ente?.capag).toBe("C");
    db.close();
  });

  test("ano especifico", () => {
    const db = seedDb();
    const res = capagEnte(db, { uf: "AC", ano: 2024 });
    const ente = Result.isOk(res) ? res.value : null;

    expect(ente?.ano).toBe(2024);
    expect(ente?.capag).toBe("B");
    db.close();
  });
});

describe("entesPorNota", () => {
  test("lista entes C/D (estados + municipios), posicao mais recente", () => {
    const db = seedDb();
    const res = entesPorNota(db, { notas: ["C", "D"] });
    const lista = Result.isOk(res) ? res.value : [];

    const nomes = lista.map((e) => `${e.tipo}:${e.nome}:${e.capag}`).sort();
    // Estados: AC(C 2025), MG(D). Municipios: RJ(D), SP(C).
    expect(nomes).toContain("estado:AC:C");
    expect(nomes).toContain("estado:MG:D");
    expect(nomes).toContain("municipio:Rio de Janeiro:D");
    expect(nomes).toContain("municipio:Sao Paulo:C");
    // SP estado tem nota B em 2025, nao deve aparecer como estado.
    expect(nomes).not.toContain("estado:SP:B");
    db.close();
  });

  test("filtra por UF e so municipios", () => {
    const db = seedDb();
    const res = entesPorNota(db, {
      notas: ["D"],
      uf: "RJ",
      incluirEstados: false,
    });
    const lista = Result.isOk(res) ? res.value : [];

    expect(lista).toHaveLength(1);
    expect(lista[0].nome).toBe("Rio de Janeiro");
    db.close();
  });

  test("filtra por regiao via join com siconfi_entes", () => {
    const db = seedDb();
    const res = entesPorNota(db, {
      notas: ["C", "D"],
      regiao: "CO",
      incluirEstados: false,
    });
    const lista = Result.isOk(res) ? res.value : [];

    // Abadia de Goias (CO) tem nota A, nao C/D -> lista vazia para CO.
    expect(lista).toHaveLength(0);
    db.close();
  });
});

describe("capagSerieHistorica", () => {
  test("serie de municipio por cod_ibge ordenada por ano", () => {
    const db = seedDb();
    const res = capagSerieHistorica(db, { codIbge: "5200050" });
    const serie = Result.isOk(res) ? res.value : null;

    expect(serie?.tipo).toBe("municipio");
    expect(serie?.serie.map((p) => p.ano)).toEqual([2023, 2024]);
    expect(serie?.serie.map((p) => p.capag)).toEqual(["A+", "A"]);
    db.close();
  });

  test("serie de estado por uf", () => {
    const db = seedDb();
    const res = capagSerieHistorica(db, { uf: "AC" });
    const serie = Result.isOk(res) ? res.value : null;

    expect(serie?.tipo).toBe("estado");
    expect(serie?.serie.map((p) => p.capag)).toEqual(["B", "C"]);
    db.close();
  });
});

describe("resolverEntePorCnpj", () => {
  test("CNPJ de municipio resolve e anexa CAPAG", () => {
    const db = seedDb();
    const res = resolverEntePorCnpj(db, "42.498.600/0001-71");
    const out = Result.isOk(res) ? res.value : null;

    expect(out?.encontrado).toBe(true);
    expect(out?.cod_ibge).toBe("3304557");
    expect(out?.esfera).toBe("M");
    expect(out?.capag?.capag).toBe("D");
    db.close();
  });

  test("CNPJ desconhecido devolve encontrado=false", () => {
    const db = seedDb();
    const res = resolverEntePorCnpj(db, "00000000000000");
    const out = Result.isOk(res) ? res.value : null;

    expect(out?.encontrado).toBe(false);
    expect(out?.capag).toBeNull();
    db.close();
  });

  test("CNPJ invalido vira erro", () => {
    const db = seedDb();
    const res = resolverEntePorCnpj(db, "123");

    expect(Result.isError(res)).toBe(true);
    db.close();
  });
});

describe("countCapag", () => {
  test("conta registros e anos", () => {
    const db = seedDb();
    const counts = countCapag(db);

    expect(counts.estados).toBe(4);
    expect(counts.municipios).toBe(4);
    expect(counts.entes).toBe(2);
    expect(counts.anosEstados).toEqual([2024, 2025]);
    expect(counts.anosMunicipios).toEqual([2023, 2024]);
    db.close();
  });
});
