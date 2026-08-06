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
  // internamente "MINHA LAVANDERIA SC -FRAIBURGO" (arquivo veio com prefixo
  // "MEGA" mas o nome interno diz ML — confirmar bandeira com o Glávio)
  "mega fraiburgo": ["SC","Fraiburgo",""],
  "mega higienopolis": ["SP","São Paulo","Higienópolis"],
  "mega livramento": ["RS","Santana do Livramento",""],
  "mega porto uniao": ["SC","Porto União",""],
  // internamente "SC MINHA LAVANDERIA - S" (truncado); loja do Glavio
  "mega sao jose": ["SC","São José",""],
  "mega santa maria": ["RS","Santa Maria",""],
  "mega santa rosa": ["RS","Santa Rosa",""],
  "ml barretos": ["SP","Barretos",""],
  "ml blumenau": ["SC","Blumenau",""],
  "ml botucatu": ["SP","Botucatu",""],
  "ml campinas dom pedro": ["SP","Campinas","Dom Pedro"],
  "ml campo grande": ["MS","Campo Grande",""],
  // o arquivo veio "CAMPOS DOAS GOY" (erro de digitação + corte); o nome certo
  // está no "Loja:" interno do relatório: MINHA LAVANDERIA - CAMPOS DOS GOYTACAZES
  "ml campos doas goy": ["RJ","Campos dos Goytacazes",""],
  "ml campos dos goytacazes": ["RJ","Campos dos Goytacazes",""],
  "ml caxias": ["RS","Caxias do Sul",""],
  "ml curitiba": ["PR","Curitiba",""],
  "ml florianopolis": ["SC","Florianópolis",""],
  "ml go p amazonia": ["GO","Goiânia","Parque Amazônia"],
  "ml go parque amazonia": ["GO","Goiânia","Parque Amazônia"],
  "ml goiania oeste": ["GO","Goiânia","Oeste"],
  // confirmado via Presence (CRM): loja do Glávio, contrato assinado 30/06/2026
  "ml guaira": ["PR","Guaíra",""],
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
  "ml xanxere": ["SC","Xanxerê",""],
  "rj alfenas": ["MG","Alfenas",""],
  "rj americana": ["SP","Americana",""],
  "rj arapongas": ["PR","Arapongas",""],
  "rj azenha": ["RS","Porto Alegre","Azenha"],
  // mesma loja do "rj azenha" — arquivo veio com "Poa" na frente
  "rj poa azenha": ["RS","Porto Alegre","Azenha"],
  "rj balsas": ["MA","Balsas",""],
  "rj belem": ["PA","Belém",""],
  "rj belo horizonte": ["MG","Belo Horizonte",""],
  "rj camaqua": ["RS","Camaquã",""],
  "rj campo largo": ["PR","Campo Largo",""],
  "rj canoas": ["RS","Canoas",""],
  // "Canos" é a Canoas com o nome do arquivo digitado errado (falta o "a") —
  // sem o apelido viraria uma loja separada e o mês contaria em dobro
  "rj canos": ["RS","Canoas",""],
  "rj carazinho": ["RS","Carazinho",""],
  "rj cassino": ["RS","Rio Grande","Cassino"],
  // internamente "RESTAURA JEANS GO - CATAL"
  "rj catalao": ["GO","Catalão",""],
  "rj chapeco": ["SC","Chapecó",""],
  "rj concordia": ["SC","Concórdia",""],
  "rj coronel fabriciano": ["MG","Coronel Fabriciano",""],
  "rj caxias centro": ["RS","Caxias do Sul","Centro"],
  "rj caxias s. pelegrino": ["RS","Caxias do Sul","São Pelegrino"],
  "rj caxias sao pelegrino": ["RS","Caxias do Sul","São Pelegrino"],
  "rj cruz alta": ["RS","Cruz Alta",""],
  "rj cuiaba": ["MT","Cuiabá",""],
  "rj farroupilha": ["RS","Farroupilha",""],
  "rj garopaba": ["SC","Garopaba",""],
  "rj gravatai": ["RS","Gravataí",""],
  "rj guarapuava": ["PR","Guarapuava",""],
  "rj horizontina": ["RS","Horizontina",""],
  "rj ijui": ["RS","Ijuí",""],
  "rj imbituba": ["SC","Imbituba",""],
  "rj jacana": ["SP","São Paulo","Jaçanã"],
  "rj jardim goias": ["GO","Goiânia","Jardim Goiás"],
  "rj joinville": ["SC","Joinville",""],
  // confirmado via Presence (CRM): loja do Glávio, contrato assinado 01/07/2026
  "rj laguna": ["SC","Laguna",""],
  "rj lajeado": ["RS","Lajeado",""],
  "rj limeira": ["SP","Limeira",""],
  "rj lindoia": ["RS","Porto Alegre","Lindóia"],
  "rj linhares": ["ES","Linhares",""],
  // duas unidades na mesma cidade — "Londrina Centro" já tinha relatório
  // importado antes mas sem esta entrada (exibia nome cru); confirmado pelo
  // nome interno do relatório ("RESTAURA JEANS PR - LONDRINA")
  "rj londrina alphaville": ["PR","Londrina","Alphaville"],
  "rj londrina centro": ["PR","Londrina","Centro"],
  "rj moinhos": ["RS","Porto Alegre","Moinhos de Vento"],
  // mesma loja do "rj moinhos" — o arquivo passou a vir com o "Poa" na
  // frente; sem o apelido viraria uma segunda loja e o mês contaria em dobro
  "rj poa moinhos": ["RS","Porto Alegre","Moinhos de Vento"],
  "rj montes claros": ["MG","Montes Claros",""],
  "rj morada do vale": ["RS","Novo Hamburgo","Morada do Vale"],
  "rj novo hamburgo": ["RS","Novo Hamburgo",""],
  "rj parauapebas": ["PA","Parauapebas",""],
  "rj passo fundo": ["RS","Passo Fundo",""],
  "rj passo fundo centro": ["RS","Passo Fundo","Centro"],
  "rj passo fundo s crsitovao": ["RS","Passo Fundo","São Cristóvão"],
  "rj passo fundo sao cristovao": ["RS","Passo Fundo","São Cristóvão"],
  "rj pelotas": ["RS","Pelotas",""],
  "rj penha": ["SP","São Paulo","Penha"],
  "rj pq sao jorge": ["SP","São Paulo","Parque São Jorge"],
  // o corte de junho veio nomeado "306" (3 dígitos), e lojaFromArquivo só
  // corta 1-2 dígitos do fim — sem este apelido o mês de junho ficaria numa
  // loja separada da de julho
  "rj pq sao jorge 306": ["SP","São Paulo","Parque São Jorge"],
  "rj picos": ["PI","Picos",""],
  // confirmado via Presence (CRM): contrato assinado 12/06/2026
  "rj pinhais": ["PR","Pinhais",""],
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
  // arquivo veio sem o "dos" ("RJ São José Campos"); loja interna do
  // relatório confirma que é a mesma "RESTAURA JEANS SAO JOSE DOS CAMPOS"
  "rj sao jose campos": ["SP","São José dos Campos",""],
  "rj sao jose dos campos": ["SP","São José dos Campos",""],
  "rj saude": ["SP","São Paulo","Saúde"],
  "rj silva bueno": ["SP","São Paulo","Silva Bueno"],
  "rj vila carrao": ["SP","São Paulo","Vila Carrão"],
  "rj vila matilde": ["SP","São Paulo","Vila Matilde"],
  "sc cacador": ["SC","Caçador",""],

  // ── Aliases pelo nome INTERNO do relatório (achados via varredura direta no
  // Supabase em 05/08/2026: 40 nomes de loja sem mapeamento, cruzados contra
  // os já existentes acima). Alguns relatórios foram salvos com o nome interno
  // do Ideologica em vez do nome derivado do arquivo — sem o alias aqui essas
  // lojas ficavam com card PRÓPRIO em "Sem estado cadastrado", separadas do
  // card certo da mesma loja (ex: "RESTAURA JEANS CANOAS" ficava fora do
  // agrupamento de "RJ Canoas"/"RJ Canos"). Não mexe nos dados, só
  // faz o dashboard agrupar como a mesma loja.
  "minha lavanderia - teut": ["RS","Teutônia",""],
  "restaura jeans morada do vale 1": ["RS","Novo Hamburgo","Morada do Vale"],
  "minha lavanderia sc -fraiburgo": ["SC","Fraiburgo",""],
  "minha lavanderia parque amazonia": ["GO","Goiânia","Parque Amazônia"],
  "minha lavanderia ba - salvador": ["BA","Salvador",""],
  "minha lavanderia e restaura jeans higien": ["SP","São Paulo","Higienópolis"],
  "minha lavanderia madalena": ["PE","Recife","Madalena"],
  "minha lavanderia ms - campo grande": ["MS","Campo Grande",""],
  "minha lavanderia sp - taubat": ["SP","Taubaté",""],
  "restaura jeans - camaqua": ["RS","Camaquã",""],
  "restaura jeans - cel. fabriciano": ["MG","Coronel Fabriciano",""],
  "restaura jeans - penha": ["SP","São Paulo","Penha"],
  "sc - joinville": ["SC","Joinville",""],
  // internamente truncado pra "PO"; confirmado pelo arquivo de origem (RJ Ponte Rasa 11.xls)
  "restaura jeans - po": ["SP","São Paulo","Ponte Rasa"],
  "restaura jeans - poa cristal": ["RS","Porto Alegre","Cristal"],
  "restaura jeans / azenha - poa": ["RS","Porto Alegre","Azenha"],
  "restaura jeans americana": ["SP","Americana",""],
  "restaura jeans canoas": ["RS","Canoas",""],
  "restaura jeans es - linhares": ["ES","Linhares",""],
  "restaura jeans horizontina": ["RS","Horizontina",""],
  "restaura jeans mg - alfenas": ["MG","Alfenas",""],
  "restaura jeans moinhos de vento": ["RS","Porto Alegre","Moinhos de Vento"],
  "restaura jeans montes claros-mg": ["MG","Montes Claros",""],
  "restaura jeans pa - parauapebas": ["PA","Parauapebas",""],
  "restaura jeans passo fundo": ["RS","Passo Fundo",""],
  "restaura jeans passo fundo sao cristovao": ["RS","Passo Fundo","São Cristóvão"],
  "restaura jeans pi - picos": ["PI","Picos",""],
  "restaura jeans piracicaba": ["SP","Piracicaba",""],
  "restaura jeans pirassununga": ["SP","Pirassununga",""],
  "restaura jeans pr - ponta grossa": ["PR","Ponta Grossa",""],
  "restaura jeans rs - carazinho": ["RS","Carazinho",""],
  "restaura jeans rs - cassino": ["RS","Rio Grande","Cassino"],
  "restaura jeans rs - cruz alta": ["RS","Cruz Alta",""],
  "restaura jeans rs - iju": ["RS","Ijuí",""],
  "restaura jeans rs - lajeado": ["RS","Lajeado",""],
  "restaura jeans rs - pelotas": ["RS","Pelotas",""],
  "restaura jeans rs - santa rosa": ["RS","Santa Rosa",""],
  "restaura jeans rs far": ["RS","Farroupilha",""],
  "restaura jeans rs santo angelo": ["RS","Santo Ângelo",""],
  "restaura jeans salvador": ["BA","Salvador",""],
  "restaura jeans santa cruz do sul": ["RS","Santa Cruz do Sul",""],
  "restaura jeans vila matilde": ["SP","São Paulo","Vila Matilde"],
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
