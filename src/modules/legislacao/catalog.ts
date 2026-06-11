import { normalize } from "../../core/normalize";

export { normalize };

// Catalogo de normas indexaveis. Sem uniao de literais: o conjunto cresce e o
// id e simplesmente o slug/sourceId da norma (mesma convencao do minutei-ai).
export type NormaId = string;

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
  {
    id: "constituicao-federal-1988",
    titulo: "Constituição da República Federativa do Brasil de 1988",
    apelidos: ["1988", "constituicao", "constituicao federal", "cf", "cf88"],
    url: "https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm",
    temas: ["trabalhista", "constitucional"],
  },
  {
    id: "clt-decreto-lei-5452-1943",
    titulo: "Consolidação das Leis do Trabalho",
    apelidos: ["5452", "clt", "consolidacao das leis do trabalho"],
    url: "https://www.planalto.gov.br/ccivil_03/decreto-lei/del5452compilado.htm",
    temas: ["trabalhista", "trabalho-geral"],
  },
  {
    id: "lei-605-1949-repouso-semanal-remunerado",
    titulo: "Lei nº 605/1949 — Repouso semanal remunerado e feriados",
    apelidos: ["605", "lei 605"],
    url: "https://www.planalto.gov.br/ccivil_03/leis/l0605.htm",
    temas: ["trabalhista", "remuneracao"],
  },
  {
    id: "lei-4090-1962-decimo-terceiro",
    titulo: "Lei nº 4.090/1962 — Gratificação de Natal",
    apelidos: ["4090", "lei 4090"],
    url: "https://www.planalto.gov.br/ccivil_03/leis/l4090.htm",
    temas: ["trabalhista", "remuneracao"],
  },
  {
    id: "lei-4749-1965-decimo-terceiro-pagamento",
    titulo: "Lei nº 4.749/1965 — Pagamento da gratificação de Natal",
    apelidos: ["4749", "lei 4749"],
    url: "https://www.planalto.gov.br/ccivil_03/leis/l4749.htm",
    temas: ["trabalhista", "remuneracao"],
  },
  {
    id: "lei-12506-2011-aviso-previo",
    titulo: "Lei nº 12.506/2011 — Aviso prévio proporcional",
    apelidos: ["12506", "lei 12506"],
    url: "https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2011/lei/l12506.htm",
    temas: ["trabalhista", "rescisao"],
  },
  {
    id: "lei-8036-1990-fgts",
    titulo: "Lei nº 8.036/1990 — FGTS",
    apelidos: ["8036", "lei 8036", "fgts"],
    url: "https://www.planalto.gov.br/ccivil_03/leis/l8036compilada.htm",
    temas: ["trabalhista", "fgts"],
  },
  {
    id: "lei-7998-1990-seguro-desemprego-fat",
    titulo: "Lei nº 7.998/1990 — Seguro-desemprego, abono salarial e FAT",
    apelidos: ["7998", "lei 7998"],
    url: "https://www.planalto.gov.br/ccivil_03/leis/l7998compilado.htm",
    temas: ["trabalhista", "seguro-desemprego"],
  },
  {
    id: "lei-7418-1985-vale-transporte",
    titulo: "Lei nº 7.418/1985 — Vale-transporte",
    apelidos: ["7418", "lei 7418"],
    url: "https://www.planalto.gov.br/ccivil_03/leis/l7418compilado.htm",
    temas: ["trabalhista", "beneficios"],
  },
  {
    id: "lei-5889-1973-trabalho-rural",
    titulo: "Lei nº 5.889/1973 — Trabalho rural",
    apelidos: ["5889", "lei 5889"],
    url: "https://www.planalto.gov.br/ccivil_03/leis/l5889.htm",
    temas: ["trabalhista", "regimes-especiais"],
  },
  {
    id: "decreto-73626-1974-trabalho-rural",
    titulo: "Decreto nº 73.626/1974 — Regulamento do trabalho rural",
    apelidos: ["73626", "decreto 73626"],
    url: "https://www.planalto.gov.br/ccivil_03/decreto/1970-1979/d73626.htm",
    temas: ["trabalhista", "regimes-especiais"],
  },
  {
    id: "lei-complementar-150-2015-domestico",
    titulo: "Lei Complementar nº 150/2015 — Trabalho doméstico",
    apelidos: ["150", "lc 150"],
    url: "https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp150.htm",
    temas: ["trabalhista", "regimes-especiais"],
  },
  {
    id: "lei-6019-1974-trabalho-temporario-terceirizacao",
    titulo: "Lei nº 6.019/1974 — Trabalho temporário e prestação de serviços",
    apelidos: ["6019", "lei 6019"],
    url: "https://www.planalto.gov.br/ccivil_03/leis/l6019compilado.htm",
    temas: ["trabalhista", "terceirizacao"],
  },
  {
    id: "lei-13429-2017-terceirizacao",
    titulo: "Lei nº 13.429/2017 — Trabalho temporário e terceirização",
    apelidos: ["13429", "lei 13429"],
    url: "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2017/lei/l13429.htm",
    temas: ["trabalhista", "terceirizacao"],
  },
  {
    id: "lei-13467-2017-reforma-trabalhista",
    titulo: "Lei nº 13.467/2017 — Reforma trabalhista",
    apelidos: ["13467", "lei 13467", "reforma trabalhista"],
    url: "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2017/lei/l13467.htm",
    temas: ["trabalhista", "trabalho-geral"],
  },
  {
    id: "lei-11788-2008-estagio",
    titulo: "Lei nº 11.788/2008 — Estágio",
    apelidos: ["11788", "lei 11788"],
    url: "https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2008/lei/l11788.htm",
    temas: ["trabalhista", "regimes-especiais"],
  },
  {
    id: "lei-8069-1990-eca-trabalho-adolescente",
    titulo: "Lei nº 8.069/1990 — ECA",
    apelidos: [
      "8069",
      "lei 8069",
      "eca",
      "estatuto da crianca e do adolescente",
    ],
    url: "https://www.planalto.gov.br/ccivil_03/leis/l8069.htm",
    temas: ["trabalhista", "aprendizagem"],
  },
  {
    id: "decreto-9579-2018-aprendizagem",
    titulo:
      "Decreto nº 9.579/2018 — Aprendizagem e proteção à criança e ao adolescente",
    apelidos: ["9579", "decreto 9579"],
    url: "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/decreto/d9579.htm",
    temas: ["trabalhista", "aprendizagem"],
  },
  {
    id: "lei-12690-2012-cooperativas-trabalho",
    titulo: "Lei nº 12.690/2012 — Cooperativas de trabalho",
    apelidos: ["12690", "lei 12690"],
    url: "https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2012/lei/l12690.htm",
    temas: ["trabalhista", "regimes-especiais"],
  },
  {
    id: "lei-7783-1989-greve",
    titulo: "Lei nº 7.783/1989 — Direito de greve",
    apelidos: ["7783", "lei 7783"],
    url: "https://www.planalto.gov.br/ccivil_03/leis/l7783.htm",
    temas: ["trabalhista", "coletivo"],
  },
  {
    id: "lei-10101-2000-plr",
    titulo: "Lei nº 10.101/2000 — Participação nos lucros ou resultados",
    apelidos: ["10101", "lei 10101"],
    url: "https://www.planalto.gov.br/ccivil_03/leis/l10101.htm",
    temas: ["trabalhista", "remuneracao"],
  },
  {
    id: "lei-8213-1991-beneficios-previdencia-cota-pcd",
    titulo: "Lei nº 8.213/1991 — Benefícios previdenciários e cota PCD",
    apelidos: ["8213", "lei 8213"],
    url: "https://www.planalto.gov.br/ccivil_03/leis/l8213compilado.htm",
    temas: ["trabalhista", "previdencia-acidente-pcd"],
  },
  {
    id: "lei-13146-2015-estatuto-pessoa-deficiencia",
    titulo: "Lei nº 13.146/2015 — Estatuto da Pessoa com Deficiência",
    apelidos: [
      "13146",
      "lei 13146",
      "estatuto da pessoa com deficiencia",
      "lbi",
    ],
    url: "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13146.htm",
    temas: ["trabalhista", "previdencia-acidente-pcd"],
  },
  {
    id: "lei-14611-2023-igualdade-salarial",
    titulo: "Lei nº 14.611/2023 — Igualdade salarial",
    apelidos: ["14611", "lei 14611"],
    url: "https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14611.htm",
    temas: ["trabalhista", "discriminacao"],
  },
  {
    id: "lei-14457-2022-emprega-mais-mulheres-cipa-assedio",
    titulo: "Lei nº 14.457/2022 — Emprega + Mulheres e CIPA",
    apelidos: ["14457", "lei 14457"],
    url: "https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2022/lei/l14457.htm",
    temas: ["trabalhista", "discriminacao-saude-seguranca"],
  },
  {
    id: "lei-14442-2022-auxilio-alimentacao-teletrabalho",
    titulo: "Lei nº 14.442/2022 — Auxílio-alimentação e teletrabalho",
    apelidos: ["14442", "lei 14442"],
    url: "https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2022/lei/l14442.htm",
    temas: ["trabalhista", "beneficios-teletrabalho"],
  },
  {
    id: "lei-13103-2015-motorista-profissional",
    titulo: "Lei nº 13.103/2015 — Motorista profissional",
    apelidos: ["13103", "lei 13103"],
    url: "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13103.htm",
    temas: ["trabalhista", "categorias-profissionais"],
  },
  {
    id: "lei-12619-2012-motorista-profissional",
    titulo: "Lei nº 12.619/2012 — Motorista profissional",
    apelidos: ["12619", "lei 12619"],
    url: "https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2012/lei/l12619.htm",
    temas: ["trabalhista", "categorias-profissionais"],
  },
  {
    id: "lei-12815-2013-trabalho-portuario",
    titulo: "Lei nº 12.815/2013 — Trabalho portuário",
    apelidos: ["12815", "lei 12815"],
    url: "https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/lei/l12815.htm",
    temas: ["trabalhista", "categorias-profissionais"],
  },
  {
    id: "lei-9719-1998-trabalho-portuario",
    titulo: "Lei nº 9.719/1998 — Trabalho portuário",
    apelidos: ["9719", "lei 9719"],
    url: "https://www.planalto.gov.br/ccivil_03/leis/l9719.htm",
    temas: ["trabalhista", "categorias-profissionais"],
  },
  {
    id: "lei-13475-2017-aeronauta",
    titulo: "Lei nº 13.475/2017 — Aeronauta",
    apelidos: ["13475", "lei 13475"],
    url: "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2017/lei/l13475.htm",
    temas: ["trabalhista", "categorias-profissionais"],
  },
  {
    id: "lei-6514-1977-seguranca-medicina-trabalho",
    titulo: "Lei nº 6.514/1977 — Segurança e medicina do trabalho",
    apelidos: ["6514", "lei 6514"],
    url: "https://www.planalto.gov.br/ccivil_03/leis/l6514.htm",
    temas: ["trabalhista", "saude-seguranca"],
  },
  {
    id: "lei-13874-2019-liberdade-economica",
    titulo: "Lei nº 13.874/2019 — Liberdade econômica",
    apelidos: ["13874", "lei 13874"],
    url: "https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2019/lei/l13874.htm",
    temas: ["trabalhista", "trabalho-geral"],
  },
  {
    id: "decreto-10854-2021-regulamento-trabalhista",
    titulo: "Decreto nº 10.854/2021 — Regulamento trabalhista infralegal",
    apelidos: ["10854", "decreto 10854"],
    url: "https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/decreto/d10854.htm",
    temas: ["trabalhista", "regulamento"],
  },
  {
    id: "codigo-civil-lei-10406-2002",
    titulo: "Código Civil",
    apelidos: ["10406", "codigo civil", "cc"],
    url: "https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilada.htm",
    temas: ["trabalhista", "subsidiario"],
  },
  {
    id: "codigo-processo-civil-lei-13105-2015",
    titulo: "Código de Processo Civil",
    apelidos: ["13105", "cpc", "codigo de processo civil"],
    url: "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13105.htm",
    temas: ["trabalhista", "processual-subsidiario"],
  },
  {
    id: "lei-6830-1980-execucao-fiscal",
    titulo: "Lei nº 6.830/1980 — Execução fiscal",
    apelidos: ["6830", "lei 6830", "lef", "execucao fiscal"],
    url: "https://www.planalto.gov.br/ccivil_03/leis/l6830.htm",
    temas: ["trabalhista", "processual-subsidiario"],
  },
  {
    id: "lei-complementar-75-1993-ministerio-publico-uniao",
    titulo: "Lei Complementar nº 75/1993 — Ministério Público da União",
    apelidos: ["1993", "lc 1993"],
    url: "https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp75.htm",
    temas: ["trabalhista", "coletivo-processual"],
  },
];

export function findNorma(id: string) {
  const normalized = normalize(id);

  return normas.find((norma) => {
    if (norma.id === id) return true;
    if (norma.id === normalized) return true;
    if (normalize(norma.titulo).includes(normalized)) return true;

    return norma.apelidos.some((apelido) => normalize(apelido) === normalized);
  });
}
