import { describe, expect, test } from "bun:test";
import {
  limparTexto,
  mapSubclasse,
  parseSubclasses,
  type RawSubclasse,
} from "../src/modules/cnae/indexer";
import { buildMemoryIndex, tokenize } from "../src/modules/cnae/store";
import {
  buscarSubclasses,
  detectarNivel,
  listarSubclassesPorNivel,
  resolverSubclasse,
} from "../src/modules/cnae/service";
import { Result } from "better-result";

// --- Fixtures inline: forma crua identica a da API v2 do IBGE, ---
// --- incluindo \r\n embutidos em observacoes e zeros a esquerda. ---

const rawFretamento: RawSubclasse = {
  id: "4929902",
  descricao:
    "TRANSPORTE RODOVIÁRIO COLETIVO DE PASSAGEIROS, SOB REGIME DE FRETAMENTO, INTERMUNICIPAL, INTERESTADUAL E INTERNACIONAL",
  atividades: [
    "ÔNIBUS COM MOTORISTA (CONDUTOR), INTERMUNICIPAL, INTERESTADUAL, INTERNACIONAL; LOCAÇÃO DE",
  ],
  observacoes: [
    "Esta subclasse compreende - o transporte rodoviário coletivo\r\n- a organização de excursões",
  ],
  classe: {
    id: "49299",
    descricao:
      "TRANSPORTE RODOVIÁRIO COLETIVO DE PASSAGEIROS, SOB REGIME DE FRETAMENTO, E OUTROS",
    observacoes: ["Esta classe compreende - x\r\n- y"],
    grupo: {
      id: "492",
      descricao: "TRANSPORTE RODOVIÁRIO DE PASSAGEIROS",
      divisao: {
        id: "49",
        descricao: "TRANSPORTE TERRESTRE",
        secao: { id: "H", descricao: "TRANSPORTE, ARMAZENAGEM E CORREIO" },
      },
    },
  },
};

const rawEscolar: RawSubclasse = {
  id: "4924800",
  descricao: "TRANSPORTE ESCOLAR",
  atividades: ["TRANSPORTE ESCOLAR, RODOVIÁRIO"],
  observacoes: ["Esta subclasse compreende - o transporte de estudantes"],
  classe: {
    id: "49248",
    descricao: "TRANSPORTE ESCOLAR",
    grupo: {
      id: "492",
      descricao: "TRANSPORTE RODOVIÁRIO DE PASSAGEIROS",
      divisao: {
        id: "49",
        descricao: "TRANSPORTE TERRESTRE",
        secao: { id: "H", descricao: "TRANSPORTE, ARMAZENAGEM E CORREIO" },
      },
    },
  },
};

// Zero a esquerda preservado (classe agricola "01113").
const rawSoja: RawSubclasse = {
  id: "0111301",
  descricao: "CULTIVO DE SOJA",
  atividades: ["SOJA, CULTIVO DE", "PRODUÇÃO DE SOJA"],
  observacoes: null,
  classe: {
    id: "01113",
    descricao: "CULTIVO DE SOJA",
    grupo: {
      id: "011",
      descricao: "PRODUÇÃO DE LAVOURAS TEMPORÁRIAS",
      divisao: {
        id: "01",
        descricao: "AGRICULTURA, PECUÁRIA E SERVIÇOS RELACIONADOS",
        secao: {
          id: "A",
          descricao: "AGRICULTURA, PECUÁRIA, PRODUÇÃO FLORESTAL, PESCA E AQÜICULTURA",
        },
      },
    },
  },
};

const rawList = [rawFretamento, rawEscolar, rawSoja];
const index = buildMemoryIndex(rawList.map(mapSubclasse), "2026-06-11T00:00:00.000Z");

describe("limparTexto", () => {
  test("remove \\r\\n embutidos e colapsa espacos", () => {
    expect(limparTexto("linha1\r\n- linha2")).toBe("linha1 - linha2");
    expect(limparTexto("  a   b  ")).toBe("a b");
  });
});

describe("mapSubclasse", () => {
  test("achata a hierarquia e preserva id como string com zero a esquerda", () => {
    const mapped = mapSubclasse(rawSoja);

    expect(mapped.id).toBe("0111301");
    expect(mapped.classeId).toBe("01113");
    expect(mapped.divisaoId).toBe("01");
    expect(mapped.secaoId).toBe("A");
    expect(mapped.grupoDescricao).toBe("PRODUÇÃO DE LAVOURAS TEMPORÁRIAS");
    expect(mapped.observacoes).toEqual([]);
  });

  test("limpa \\r\\n das observacoes da subclasse", () => {
    const mapped = mapSubclasse(rawFretamento);

    expect(mapped.observacoes[0]).toBe(
      "Esta subclasse compreende - o transporte rodoviário coletivo - a organização de excursões"
    );
  });
});

describe("parseSubclasses", () => {
  test("mapeia um array de subclasses cruas", () => {
    const parsed = parseSubclasses(rawList, "fixture://cnae");

    expect(Result.isOk(parsed)).toBe(true);
    if (Result.isOk(parsed)) {
      expect(parsed.value).toHaveLength(3);
      expect(parsed.value[0].id).toBe("4929902");
    }
  });

  test("retorna erro quando a resposta nao e um array", () => {
    const parsed = parseSubclasses({ erro: "nope" }, "fixture://cnae");

    expect(Result.isError(parsed)).toBe(true);
    if (Result.isError(parsed)) {
      expect(parsed.error.code).toBe("cnae.PARSE");
    }
  });
});

describe("tokenize", () => {
  test("normaliza, remove acento e descarta tokens de 1 char", () => {
    expect(tokenize("CULTIVO DE SOJA")).toEqual(["cultivo", "de", "soja"]);
    expect(tokenize("AQÜICULTURA")).toEqual(["aquicultura"]);
  });
});

describe("resolverSubclasse", () => {
  test("resolve por codigo sem mascara", () => {
    const r = resolverSubclasse(index, "4929902");

    expect(r.encontrado).toBe(true);
    expect(r.subclasse?.descricao).toContain("FRETAMENTO");
    expect(r.hierarquia?.secao).toEqual({
      id: "H",
      descricao: "TRANSPORTE, ARMAZENAGEM E CORREIO",
    });
  });

  test("resolve por codigo COM mascara de pontuacao", () => {
    const r = resolverSubclasse(index, "4929-9/02");

    expect(r.encontrado).toBe(true);
    expect(r.codigoConsultado).toBe("4929902");
    expect(r.subclasse?.id).toBe("4929902");
  });

  test("resolve preservando zero a esquerda", () => {
    const r = resolverSubclasse(index, "0111-3/01");

    expect(r.encontrado).toBe(true);
    expect(r.subclasse?.id).toBe("0111301");
  });

  test("nao encontra codigo inexistente", () => {
    const r = resolverSubclasse(index, "9999999");

    expect(r.encontrado).toBe(false);
    expect(r.subclasse).toBeUndefined();
  });
});

describe("buscarSubclasses", () => {
  test("acha por palavra-chave da descricao", () => {
    const hits = buscarSubclasses(index, "fretamento");

    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe("4929902");
  });

  test("acha por sinonimo das atividades, normalizando acento", () => {
    const hits = buscarSubclasses(index, "producao de soja");

    expect(hits.map((h) => h.id)).toContain("0111301");
  });

  test("aplica AND: todos os tokens precisam casar", () => {
    const hits = buscarSubclasses(index, "transporte escolar");

    expect(hits.map((h) => h.id)).toEqual(["4924800"]);
  });

  test("respeita o limite", () => {
    const hits = buscarSubclasses(index, "transporte", 1);

    expect(hits).toHaveLength(1);
  });

  test("termo vazio nao retorna nada", () => {
    expect(buscarSubclasses(index, "   ")).toEqual([]);
  });
});

describe("detectarNivel", () => {
  test("detecta cada nivel pelo formato do codigo", () => {
    expect(detectarNivel("A")).toEqual({ nivel: "secao", valor: "A" });
    expect(detectarNivel("h")).toEqual({ nivel: "secao", valor: "H" });
    expect(detectarNivel("49")).toEqual({ nivel: "divisao", valor: "49" });
    expect(detectarNivel("492")).toEqual({ nivel: "grupo", valor: "492" });
    expect(detectarNivel("49299")).toEqual({ nivel: "classe", valor: "49299" });
    expect(detectarNivel("4929-9/02")).toEqual({
      nivel: "subclasse",
      valor: "4929902",
    });
  });

  test("retorna null para formato desconhecido", () => {
    expect(detectarNivel("1234")).toBeNull();
  });
});

describe("listarSubclassesPorNivel", () => {
  test("lista subclasses sob uma secao", () => {
    const r = listarSubclassesPorNivel(index, "H");

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.nivel).toBe("secao");
      expect(r.total).toBe(2);
      expect(r.subclasses.map((s) => s.id)).toEqual(["4924800", "4929902"]);
    }
  });

  test("lista subclasses sob um grupo", () => {
    const r = listarSubclassesPorNivel(index, "492");

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.total).toBe(2);
    }
  });

  test("lista subclasses sob uma classe", () => {
    const r = listarSubclassesPorNivel(index, "49248");

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.subclasses.map((s) => s.id)).toEqual(["4924800"]);
    }
  });

  test("lista subclasse sob secao agricola (zero a esquerda)", () => {
    const r = listarSubclassesPorNivel(index, "A");

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.subclasses.map((s) => s.id)).toEqual(["0111301"]);
    }
  });

  test("retorna motivo para codigo invalido", () => {
    const r = listarSubclassesPorNivel(index, "abc");

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toContain("nao reconhecido");
    }
  });
});
