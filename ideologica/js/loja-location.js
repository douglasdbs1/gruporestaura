// UF / Cidade / Unidade de cada loja — usado por TODAS as páginas da
// Ideológica (Visão Geral, Comparativo, Comparação Anual) pra mostrar sempre
// o mesmo formato: pill da bandeira + UF + cidade + unidade (quando tem).
// Arquivo compartilhado (script classico, sem module/import) — as páginas
// que usam lojaLineHtml() já precisam ter brandTag()/displayLoja()/esc()
// definidas nelas mesmas (cada página já tem essas 3, ver comparativo.js/
// comparacao-anual.js/dashboard.js).
//
// O arquivo/relatório controla a bandeira e o nome visível, mas não traz
// UF/cidade em campos separados. Este mapa explícito evita inferências
// erradas ("RJ" no começo é Restaura Jeans, não o estado). A chave é
// normalizada pra aceitar diferenças de caixa e acentuação entre arquivos.
const LOJA_LOCATION_OVERRIDES = {
  "mega cacador": ["SC","Caçador",""],
  "mega campinas cambui": ["SP","Campinas","Cambuí"],
  "mega campinas jd aurelia": ["SP","Campinas","Jardim Aurélia"],
  "mega francisco beltrao": ["PR","Francisco Beltrão",""],
  "mega franca": ["SP","Franca",""],
  "mega franscisco beltrao": ["PR","Francisco Beltrão",""],
  "mega higienopolis": ["SP","São Paulo","Higienópolis"],
  "mega livramento": ["RS","Santana do Livramento",""],
  "mega porto uniao": ["SC","Porto União",""],
  "mega santa maria": ["RS","Santa Maria",""],
  "mega santa rosa": ["RS","Santa Rosa",""],
  "ml barretos": ["SP","Barretos",""],
  "ml botucatu": ["SP","Botucatu",""],
  "ml campinas dom pedro": ["SP","Campinas","Dom Pedro"],
  "ml campo grande": ["MS","Campo Grande",""],
  // o arquivo veio "CAMPOS DOAS GOY" (erro de digitação + corte); o nome certo
  // está no "Loja:" interno do relatório: MINHA LAVANDERIA - CAMPOS DOS GOYTACAZES
  "ml campos doas goy": ["RJ","Campos dos Goytacazes",""],
  "ml campos dos goytacazes": ["RJ","Campos dos Goytacazes",""],
  "ml caxias": ["RS","Caxias do Sul",""],
  "ml florianopolis": ["SC","Florianópolis",""],
  "ml goiania oeste": ["GO","Goiânia","Oeste"],
  "ml indaiatuba": ["SP","Indaiatuba",""],
  "ml joao pessoa manaira": ["PB","João Pessoa","Manaíra"],
  "ml joao pessoa tambau": ["PB","João Pessoa","Tambaú"],
  "ml manaus": ["AM","Manaus",""],
  "ml mineiros": ["GO","Mineiros",""],
  "ml mossoro": ["RN","Mossoró",""],
  "ml recife": ["PE","Recife",""],
  "ml recife madalena": ["PE","Recife","Madalena"],
  "ml salvador": ["BA","Salvador",""],
  "ml sao roque": ["SP","São Roque",""],
  "ml sorocaba": ["SP","Sorocaba",""],
  "ml taubate": ["SP","Taubaté",""],
  "ml teutonia": ["RS","Teutônia",""],
  "ml vargem grande": ["SP","Vargem Grande Paulista",""],
  "rj alfenas": ["MG","Alfenas",""],
  "rj americana": ["SP","Americana",""],
  "rj azenha": ["RS","Porto Alegre","Azenha"],
  "rj balsas": ["MA","Balsas",""],
  "rj belem": ["PA","Belém",""],
  "rj belo horizonte": ["MG","Belo Horizonte",""],
  "rj camaqua": ["RS","Camaquã",""],
  "rj canoas": ["RS","Canoas",""],
  "rj carazinho": ["RS","Carazinho",""],
  "rj cassino": ["RS","Rio Grande","Cassino"],
  "rj chapeco": ["SC","Chapecó",""],
  "rj caxias centro": ["RS","Caxias do Sul","Centro"],
  "rj caxias s. pelegrino": ["RS","Caxias do Sul","São Pelegrino"],
  "rj caxias sao pelegrino": ["RS","Caxias do Sul","São Pelegrino"],
  "rj cruz alta": ["RS","Cruz Alta",""],
  "rj cuiaba": ["MT","Cuiabá",""],
  "rj farroupilha": ["RS","Farroupilha",""],
  "rj guarapuava": ["PR","Guarapuava",""],
  "rj horizontina": ["RS","Horizontina",""],
  "rj ijui": ["RS","Ijuí",""],
  "rj jacana": ["SP","São Paulo","Jaçanã"],
  "rj lajeado": ["RS","Lajeado",""],
  "rj limeira": ["SP","Limeira",""],
  "rj lindoia": ["RS","Porto Alegre","Lindóia"],
  "rj linhares": ["ES","Linhares",""],
  "rj moinhos": ["RS","Porto Alegre","Moinhos de Vento"],
  "rj montes claros": ["MG","Montes Claros",""],
  "rj parauapebas": ["PA","Parauapebas",""],
  "rj passo fundo": ["RS","Passo Fundo",""],
  "rj passo fundo centro": ["RS","Passo Fundo","Centro"],
  "rj passo fundo s crsitovao": ["RS","Passo Fundo","São Cristóvão"],
  "rj passo fundo sao cristovao": ["RS","Passo Fundo","São Cristóvão"],
  "rj pelotas": ["RS","Pelotas",""],
  "rj penha": ["SP","São Paulo","Penha"],
  "rj picos": ["PI","Picos",""],
  "rj piracicaba": ["SP","Piracicaba",""],
  "rj pirassununga": ["SP","Pirassununga",""],
  "rj poa cristal": ["RS","Porto Alegre","Cristal"],
  "rj poa petropolis": ["RS","Porto Alegre","Petrópolis"],
  "rj ponta grossa": ["PR","Ponta Grossa",""],
  "rj ponta grossa 15 julho": ["PR","Ponta Grossa",""],
  "rj ponte rasa": ["SP","São Paulo","Ponte Rasa"],
  "rj portao": ["PR","Curitiba","Portão"],
  "rj portao 15 julho": ["PR","Curitiba","Portão"],
  // Provável duplicata mal-nomeada da "RJ Cassino" já existente (mesma loja
  // interna "RESTAURA JEANS RS - CASSINO", arquivo só saiu com o nome da
  // cidade em vez da unidade) — ver aviso passado ao Douglas em 03/08/2026.
  // Mantido aqui só pra não exibir o nome cru enquanto isso não é corrigido.
  "rj rio grande": ["RS","Rio Grande","Cassino"],
  "rj salvador": ["BA","Salvador",""],
  "rj santa cruz do sul": ["RS","Santa Cruz do Sul",""],
  "rj santo angelo": ["RS","Santo Ângelo",""],
  "rj sao jose dos campos": ["SP","São José dos Campos",""],
  "rj saude": ["SP","São Paulo","Saúde"],
  "rj silva bueno": ["SP","São Paulo","Silva Bueno"],
  "rj vila carrao": ["SP","São Paulo","Vila Carrão"],
  "rj vila matilde": ["SP","São Paulo","Vila Matilde"],
  "sc cacador": ["SC","Caçador",""],
};
function locationKey(loja){return (loja||"").normalize("NFD").replace(new RegExp("[\\u0300-\\u036f]","g"),"").toLowerCase().trim();}
function lojaLocation(loja){return LOJA_LOCATION_OVERRIDES[locationKey(loja)]||null;}
// Versão texto puro (sem HTML/pill) — pra <option> de <select> e exportação,
// onde não dá pra colocar span colorido.
function lojaDisplayText(loja){
  const loc=lojaLocation(loja);
  return loc?[loc[0],loc[1],loc[2]].filter(Boolean).join(" · "):displayLoja(loja);
}
function lojaLineHtml(loja){
  const loc=lojaLocation(loja);
  if(!loc)return `<span class="loja-line"><span class="loja-brand-slot">${brandTag(loja).trim()}</span><span class="loja-city">${esc(displayLoja(loja))}</span></span>`;
  return `<span class="loja-line" title="${esc(displayLoja(loja))}"><span class="loja-brand-slot">${brandTag(loja).trim()}</span><span class="loja-uf">${esc(loc[0])}</span><span class="loja-sep">·</span><span class="loja-city">${esc(loc[1])}</span>${loc[2]?`<span class="loja-sep">·</span><span class="loja-unit">${esc(loc[2])}</span>`:""}</span>`;
}
// Chave de agrupamento do ranking/KPIs: duas grafias diferentes do mesmo
// arquivo ("RJ Caxias S. Pelegrino" x "RJ CAXIAS SÃO PELEGRINO") só contam
// como UMA loja quando caem na mesma chave — senão o mês conta em dobro,
// porque cada corte é acumulado desde o dia 1. Ver canonicalizeLojaNames()
// nas 3 páginas.
function canonicalGroupKey(loja){
  const loc=lojaLocation(loja);
  return loc?"loc:"+loc.join("|").toLowerCase():"key:"+locationKey(loja);
}
// Node (scripts de import/auditoria) usa as mesmas funções do dashboard pra
// não divergir a regra. No browser `module` não existe e isso é ignorado.
if(typeof module!=="undefined"&&module.exports){
  module.exports={LOJA_LOCATION_OVERRIDES,locationKey,lojaLocation,canonicalGroupKey};
}
