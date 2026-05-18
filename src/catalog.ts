export type NormaId =
  | "lei-14133-2021"
  | "lei-8666-1993"
  | "lei-13303-2016"
  | "lc-123-2006"
  | "decreto-11462-2023";

export type Norma = {
  id: NormaId;
  titulo: string;
  apelidos: string[];
  url: string;
  temas: string[];
};

export const normas: Norma[] = [
  {
    id: "lei-14133-2021",
    titulo: "Lei 14.133/2021 - Licitacoes e Contratos Administrativos",
    apelidos: ["nova lei de licitacoes", "lei de licitacoes", "14133"],
    url: "https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14133.htm",
    temas: ["licitacoes", "contratos", "pncp", "habilitacao", "pregao"],
  },
  {
    id: "lei-8666-1993",
    titulo: "Lei 8.666/1993 - Licitacoes e Contratos",
    apelidos: ["8666", "lei antiga de licitacoes"],
    url: "https://www.planalto.gov.br/ccivil_03/leis/l8666cons.htm",
    temas: ["licitacoes", "contratos", "regime antigo"],
  },
  {
    id: "lei-13303-2016",
    titulo: "Lei 13.303/2016 - Lei das Estatais",
    apelidos: ["lei das estatais", "13303"],
    url: "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2016/lei/l13303.htm",
    temas: ["estatais", "empresas publicas", "sociedades de economia mista"],
  },
  {
    id: "lc-123-2006",
    titulo: "Lei Complementar 123/2006 - ME/EPP",
    apelidos: ["simples nacional", "me epp", "lc 123"],
    url: "https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm",
    temas: ["microempresa", "empresa de pequeno porte", "licitacoes"],
  },
  {
    id: "decreto-11462-2023",
    titulo: "Decreto 11.462/2023 - Sistema de Registro de Precos",
    apelidos: ["registro de precos", "srp", "11462"],
    url: "https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/decreto/d11462.htm",
    temas: ["registro de precos", "ata", "contratacoes"],
  },
];

export function findNorma(id: string) {
  const normalized = normalize(id);

  return normas.find((norma) => {
    if (norma.id === normalized) return true;
    if (normalize(norma.titulo).includes(normalized)) return true;

    return norma.apelidos.some((apelido) => normalize(apelido) === normalized);
  });
}

export function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();
}
