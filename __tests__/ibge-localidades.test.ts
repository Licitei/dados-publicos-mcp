import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Result } from "better-result";
import dayjs from "dayjs";
import { flattenMunicipiosPayload } from "../src/modules/ibge-localidades/indexer";
import {
  flattenMunicipio,
  formatCodigoIbge,
  saveIndex,
} from "../src/modules/ibge-localidades/store";
import {
  listarMunicipiosUf,
  resolverCodigoIbge,
  resolverMunicipio,
  validarUf,
} from "../src/modules/ibge-localidades/service";

// ---------------------------------------------------------------------------
// Fixtures inline (formato bruto do endpoint /municipios) - SEM rede
// ---------------------------------------------------------------------------

const campinasRaw = {
  id: 3509502,
  nome: "Campinas",
  microrregiao: {
    id: 35032,
    nome: "Campinas",
    mesorregiao: {
      id: 3507,
      nome: "Campinas",
      UF: {
        id: 35,
        sigla: "SP",
        nome: "São Paulo",
        regiao: { id: 3, sigla: "SE", nome: "Sudeste" },
      },
    },
  },
  "regiao-imediata": {
    id: 350038,
    nome: "Campinas",
    "regiao-intermediaria": {
      id: 3510,
      nome: "Campinas",
      UF: {
        id: 35,
        sigla: "SP",
        nome: "São Paulo",
        regiao: { id: 3, sigla: "SE", nome: "Sudeste" },
      },
    },
  },
};

// Municipio de RO cujo id comeca com 11 (7 digitos, preserva ordem).
const altaFlorestaRaw = {
  id: 1100015,
  nome: "Alta Floresta D'Oeste",
  microrregiao: {
    id: 11006,
    nome: "Cacoal",
    mesorregiao: {
      id: 1102,
      nome: "Leste Rondoniense",
      UF: {
        id: 11,
        sigla: "RO",
        nome: "Rondônia",
        regiao: { id: 1, sigla: "N", nome: "Norte" },
      },
    },
  },
};

// CASO DE BORDA: microrregiao=null -> fallback via regiao-imediata.
const boaEsperancaRaw = {
  id: 5101837,
  nome: "Boa Esperança do Norte",
  microrregiao: null,
  "regiao-imediata": {
    id: 510008,
    nome: "Sorriso",
    "regiao-intermediaria": {
      id: 5103,
      nome: "Sinop",
      UF: {
        id: 51,
        sigla: "MT",
        nome: "Mato Grosso",
        regiao: { id: 5, sigla: "CO", nome: "Centro-Oeste" },
      },
    },
  },
};

// Homonimo em outra UF para testar desambiguacao por UF.
const santaMariaRsRaw = {
  id: 4316907,
  nome: "Santa Maria",
  microrregiao: {
    id: 43021,
    nome: "Santa Maria",
    mesorregiao: {
      id: 4305,
      nome: "Centro Ocidental Rio-grandense",
      UF: {
        id: 43,
        sigla: "RS",
        nome: "Rio Grande do Sul",
        regiao: { id: 4, sigla: "S", nome: "Sul" },
      },
    },
  },
};

const santaMariaDfRaw = {
  id: 5300108,
  nome: "Brasília",
  microrregiao: {
    id: 53001,
    nome: "Brasília",
    mesorregiao: {
      id: 5301,
      nome: "Distrito Federal",
      UF: {
        id: 53,
        sigla: "DF",
        nome: "Distrito Federal",
        regiao: { id: 5, sigla: "CO", nome: "Centro-Oeste" },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// formatCodigoIbge
// ---------------------------------------------------------------------------

test("formatCodigoIbge preserva 7 digitos como string", () => {
  expect(formatCodigoIbge(3509502)).toBe("3509502");
  expect(formatCodigoIbge(1100015)).toBe("1100015");
  // Hipotetico com zero a esquerda: garante padStart.
  expect(formatCodigoIbge(123)).toBe("0000123");
});

// ---------------------------------------------------------------------------
// flattenMunicipio
// ---------------------------------------------------------------------------

test("achata municipio pelo path principal microrregiao.mesorregiao.UF", () => {
  const flat = flattenMunicipio(campinasRaw);

  expect(flat).toEqual({
    id: "3509502",
    nome: "Campinas",
    nome_normalizado: "campinas",
    uf_sigla: "SP",
    uf_id: 35,
    uf_nome: "São Paulo",
    mesorregiao_id: 3507,
    mesorregiao_nome: "Campinas",
    regiao_sigla: "SE",
  });
});

test("normaliza nome com apostrofo/acento para busca", () => {
  const flat = flattenMunicipio(altaFlorestaRaw);

  expect(flat.nome_normalizado).toBe("alta floresta d oeste");
  expect(flat.uf_sigla).toBe("RO");
  expect(flat.regiao_sigla).toBe("N");
});

test("fallback para regiao-imediata quando microrregiao e null", () => {
  const flat = flattenMunicipio(boaEsperancaRaw);

  expect(flat.id).toBe("5101837");
  expect(flat.uf_sigla).toBe("MT");
  expect(flat.uf_id).toBe(51);
  expect(flat.regiao_sigla).toBe("CO");
  // mesorregiao indisponivel nesse caso, mas o municipio nao e perdido.
  expect(flat.mesorregiao_id).toBeNull();
  expect(flat.mesorregiao_nome).toBeNull();
});

// ---------------------------------------------------------------------------
// flattenMunicipiosPayload (parse + map do array bruto)
// ---------------------------------------------------------------------------

test("flattenMunicipiosPayload achata array bruto inteiro", () => {
  const result = flattenMunicipiosPayload([
    campinasRaw,
    boaEsperancaRaw,
    altaFlorestaRaw,
  ]);

  expect(Result.isOk(result)).toBe(true);

  if (Result.isOk(result)) {
    expect(result.value).toHaveLength(3);
    expect(result.value.map((m) => m.id)).toEqual([
      "3509502",
      "5101837",
      "1100015",
    ]);
  }
});

test("flattenMunicipiosPayload rejeita payload invalido", () => {
  const result = flattenMunicipiosPayload([{ id: 1, nome: "X" }]);

  expect(Result.isError(result)).toBe(true);
});

// ---------------------------------------------------------------------------
// validarUf (pura, sem indice)
// ---------------------------------------------------------------------------

test("validarUf normaliza caixa/espacos e retorna codigo numerico", () => {
  const sp = validarUf("sp");

  expect(Result.isOk(sp)).toBe(true);

  if (Result.isOk(sp)) {
    expect(sp.value).toEqual({ sigla: "SP", id: 35, nome: "Sao Paulo" });
  }

  const ro = validarUf("  RO ");

  expect(Result.isOk(ro)).toBe(true);

  if (Result.isOk(ro)) expect(ro.value.id).toBe(11);
});

test("validarUf rejeita sigla inexistente", () => {
  const result = validarUf("XX");

  expect(Result.isError(result)).toBe(true);
});

// ---------------------------------------------------------------------------
// Funcoes de busca contra um indice salvo num data dir temporario (sem rede)
// ---------------------------------------------------------------------------

async function seedIndex() {
  process.env.DADOS_PUBLICOS_MCP_DATA_DIR = await mkdtemp(
    join(tmpdir(), "ibge-localidades-test-"),
  );

  const payload = flattenMunicipiosPayload([
    campinasRaw,
    altaFlorestaRaw,
    boaEsperancaRaw,
    santaMariaRsRaw,
    santaMariaDfRaw,
  ]);

  if (Result.isError(payload)) throw payload.error;

  const saved = await saveIndex({
    versao: 1,
    criadoEm: dayjs().toISOString(),
    fonte: "ibge-localidades",
    municipios: payload.value,
  });

  expect(Result.isOk(saved)).toBe(true);
}

test("resolverMunicipio acha codigo IBGE exato por nome", async () => {
  await seedIndex();

  const result = await resolverMunicipio({ nome: "Campinas" });

  expect(Result.isOk(result)).toBe(true);

  if (Result.isOk(result)) {
    expect(result.value.exato).toBe(true);
    expect(result.value.candidatos).toHaveLength(1);
    expect(result.value.candidatos[0]?.codigoIbge).toBe("3509502");
    expect(result.value.candidatos[0]?.uf).toBe("SP");
  }
});

test("resolverMunicipio desambigua homonimo por UF", async () => {
  await seedIndex();

  const semUf = await resolverMunicipio({ nome: "Santa Maria" });

  expect(Result.isOk(semUf)).toBe(true);

  if (Result.isOk(semUf)) {
    // So existe Santa Maria/RS nessa fixture; match exato unico.
    expect(semUf.value.candidatos).toHaveLength(1);
    expect(semUf.value.candidatos[0]?.codigoIbge).toBe("4316907");
  }

  const comUf = await resolverMunicipio({ nome: "Santa Maria", uf: "rs" });

  expect(Result.isOk(comUf)).toBe(true);

  if (Result.isOk(comUf)) {
    expect(comUf.value.candidatos[0]?.uf).toBe("RS");
  }
});

test("resolverMunicipio erra quando municipio nao existe na UF", async () => {
  await seedIndex();

  const result = await resolverMunicipio({ nome: "Campinas", uf: "RJ" });

  expect(Result.isError(result)).toBe(true);
});

test("resolverCodigoIbge faz a resolucao reversa", async () => {
  await seedIndex();

  const result = await resolverCodigoIbge("3509502");

  expect(Result.isOk(result)).toBe(true);

  if (Result.isOk(result)) {
    expect(result.value.nome).toBe("Campinas");
    expect(result.value.uf).toBe("SP");
    expect(result.value.regiao).toBe("SE");
  }
});

test("resolverCodigoIbge normaliza mascara e ainda resolve", async () => {
  await seedIndex();

  const result = await resolverCodigoIbge("3.509.502");

  expect(Result.isOk(result)).toBe(true);

  if (Result.isOk(result)) {
    expect(result.value.codigoIbge).toBe("3509502");
  }
});

test("resolverCodigoIbge erra para codigo inexistente", async () => {
  await seedIndex();

  const result = await resolverCodigoIbge("9999999");

  expect(Result.isError(result)).toBe(true);
});

test("listarMunicipiosUf devolve municipios da UF ordenados", async () => {
  await seedIndex();

  const result = await listarMunicipiosUf("MT");

  expect(Result.isOk(result)).toBe(true);

  if (Result.isOk(result)) {
    expect(result.value.uf).toBe("MT");
    expect(result.value.ufId).toBe(51);
    expect(result.value.total).toBe(1);
    expect(result.value.municipios[0]?.codigoIbge).toBe("5101837");
  }
});

test("listarMunicipiosUf rejeita UF invalida antes de tocar o indice", async () => {
  await seedIndex();

  const result = await listarMunicipiosUf("ZZ");

  expect(Result.isError(result)).toBe(true);
});
