let supabaseClient = null;
let allRelatorios = [];
let tingimentoPorRelatorio = new Map(); // relatorio_id -> peças (volume) captadas p/ tingimento
let sortKey = "total_faturado";
let sortDir = -1;
let mesFiltro = ""; // "" = todos, ou "YYYY-MM"
let ufFiltro = "";  // "" = todos, ou a sigla ("SP") — vem de clicar no mapa
let buscaTexto = ""; // texto livre da barra de busca (loja/cidade/bairro/UF)

const MESES_PT = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
function mesLabel(ym){
  const nome = MESES_PT[Number(ym.slice(5,7))-1] || ym;
  return nome.charAt(0).toUpperCase()+nome.slice(1);
}
// Enquanto há poucos meses de dados, pills (um por mês existente) são mais
// diretos que um seletor de data-a-data. Se o histórico crescer muito, vale
// voltar pra um seletor de intervalo.
function renderMesPills(){
  const meses = [...new Set(allRelatorios.map(r=>r.periodo_inicio.slice(0,7)))].sort();
  document.getElementById("f-mes-pills").innerHTML =
    `<button type="button" class="pill-btn${mesFiltro===""?" on":""}" data-mes="">Todos</button>` +
    meses.map(m=>`<button type="button" class="pill-btn${mesFiltro===m?" on":""}" data-mes="${m}">${mesLabel(m)}</button>`).join("");
}

function fmtMoney(v){
  return (v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL",maximumFractionDigits:0});
}
function fmtNum(v){
  return (v||0).toLocaleString("pt-BR");
}
// Relatórios importados direto do sistema Presence (ver isPresenceReport) não
// trazem contagem de ticket nenhuma — 0 aqui não é "zero tickets de verdade",
// é "não temos esse dado". Mostrar R$0,00 pareceria erro; mostra "—".
function fmtNumOrDash(v){
  return v ? fmtNum(v) : "—";
}
// Ticket médio de verdade é faturamento/tickets. Sem contagem de ticket (ver
// PRESENCE_REPORT_CONTEXT.md), aproxima por faturamento/quantidade de
// serviços — não é a mesma coisa (um ticket pode ter vários serviços), por
// isso marca com o ⓘ em vez de mostrar igual a um ticket médio real.
function ticketMedioHtml(faturamento, tickets, volume){
  if(tickets) return fmtMoney(faturamento/tickets);
  if(volume) return `${fmtMoney(faturamento/volume)} <span class="info-approx" title="Aproximado: faturamento ÷ quantidade de serviços — esse relatório não tem contagem de ticket real (veio do sistema Presence, ver ideologica/import/PRESENCE_REPORT_CONTEXT.md).">ⓘ</span>`;
  return "—";
}
// .xlsx é o sinal real: todo relatório do Allegro.Net/Ideologica sai em .xls
// legado (BIFF/OLE2) — só o resumo exportado direto do sistema Presence vem
// em .xlsx moderno. Ver ideologica/import/PRESENCE_REPORT_CONTEXT.md.
function isPresenceReport(r){
  return /\.xlsx$/i.test(r && r.arquivo_origem || "");
}
function fmtDate(d){
  if(!d) return "";
  const [y,m,day] = d.split("-");
  return `${day}/${m}/${y}`;
}
function esc(v){
  return String(v||"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
}
// Prioridade da bandeira: 1) coluna `bandeira` gravada no import (vem do
// PREFIXO DO NOME DO ARQUIVO no Drive — RJ/ML/MEGA — sempre a fonte mais
// confiável, ver bandeiraFromArquivo() em ideologica/import/parse_report.js);
// 2) override manual, só pra loja antiga já importada antes dessa coluna
// existir; 3) heurística de texto no nome da loja, último recurso.
const BRAND_OVERRIDES = {
  "RS - PORTO ALEGRE": "rj",
  "RESTAURA JEANS RS - SANTA ROSA": "mega",
  "SC CACADOR": "mega",
};
function brandFromText(loja){
  const l = (loja||"").toLowerCase();
  const isRJ = l.startsWith("rj ") || l.includes("restaura jeans") || l.includes("jeans");
  const isML = l.startsWith("ml ") || l.includes("lavanderia");
  if((isRJ && isML) || l.includes("mega")) return "mega";
  if(isML) return "ml";
  if(isRJ) return "rj";
  return null;
}
let lojaBandeiraMap = new Map();
function buildLojaBandeiraMap(rows){
  const map = new Map();
  for(const r of rows){
    if(map.has(r.loja) && map.get(r.loja)) continue; // já achou um valor não-nulo pra essa loja
    map.set(r.loja, r.bandeira || BRAND_OVERRIDES[r.loja] || brandFromText(r.loja));
  }
  return map;
}
function brandOf(loja){
  return lojaBandeiraMap.get(loja) || BRAND_OVERRIDES[loja] || brandFromText(loja);
}
// "ml_mega" e um filtro combinado (nao uma bandeira de verdade): mostra Minha
// Lavanderia standalone junto com as lojas Mega (que ja sao RJ+ML na mesma
// unidade) — util pra ver o total do lado "lavanderia" do negocio de uma vez.
function matchesBandeiraFilter(loja, filtro){
  if(!filtro) return true;
  if(filtro==="ml_mega"){ const b=brandOf(loja); return b==="ml"||b==="mega"; }
  return brandOf(loja)===filtro;
}
function brandTag(loja){
  const b = brandOf(loja);
  if(b==="mega") return '<span class="tag-mega">MEGA</span> ';
  if(b==="ml") return '<span class="tag-ml">ML</span> ';
  if(b==="rj") return '<span class="tag-rj">RJ</span> ';
  return "";
}
// O campo "Loja:" do relatório vem de uma caixa de texto de largura fixa no
// Crystal Reports e às vezes corta o nome (ex. "MINHA LAVANDERIA - TEUT").
// Não afeta o valor gravado (usado pra agrupar/filtrar) — só a exibição.
const LOJA_DISPLAY_OVERRIDES = {
  "MINHA LAVANDERIA - TEUT": "MINHA LAVANDERIA - TEUTÔNIA",
  "RESTAURA JEANS - PO": "RESTAURA JEANS - PONTE RASA",
  "MINHA LAVANDERIA E RESTAURA JEANS HIGIEN": "MINHA LAVANDERIA E RESTAURA JEANS HIGIENÓPOLIS",
  "MINHA LAVANDERIA SP - TAUBAT": "MINHA LAVANDERIA SP - TAUBATÉ",
};
function displayLoja(loja){
  return LOJA_DISPLAY_OVERRIDES[loja] || loja;
}
// UF/Cidade/Unidade de cada loja (LOJA_LOCATION_OVERRIDES/lojaLocation/
// lojaDisplayText/lojaLineHtml) mudaram pra ideologica/js/loja-location.js —
// compartilhado com comparativo.js e comparacao-anual.js, pra todas as
// páginas mostrarem a loja sempre no mesmo formato.
function lojaFromArquivo(arquivoOrigem){
  const base = (arquivoOrigem||"")
    .split(/[\\/]/).pop()
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+b64$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const loja = base.replace(/\s+\d{1,2}\s*$/, "").trim();
  if(!loja) return null;
  if(/^rj poa$/i.test(loja)) return "RJ POA Petrópolis";
  return loja.split(" ").map(w=>{
    if(/^(rj|ml)$/i.test(w)) return w.toUpperCase();
    if(/^mega$/i.test(w)) return "Mega";
    if(/^(de|da|do|das|dos)$/i.test(w)) return w.toLowerCase();
    if(w.length<=3 && w===w.toLowerCase()) return w.toUpperCase();
    return w;
  }).join(" ");
}
function normalizeRelatorio(r){
  // HISTORICO_2025_* nao segue o padrao "<Loja> <corte>.xls" dos consultores —
  // ja vem com o nome da loja ATUAL certo na coluna loja (mapeado na hora do
  // import), reprocessar pelo nome do arquivo quebraria (viraria algo tipo
  // "Historico 2025 Set Rj Limeira" em vez de "RJ Limeira").
  if((r.arquivo_origem||"").startsWith("HISTORICO_")) return r;
  const lojaArquivo = lojaFromArquivo(r.arquivo_origem);
  return lojaArquivo ? {...r, loja_original: r.loja, loja: lojaArquivo} : r;
}
function dedupeRelatorios(rows){
  const contentKey = r => {
    const itens=(r.itens||[]).map(it=>[it.tipo,it.categoria,Number(it.faturamento||0),Number(it.percentual||0),Number(it.volume||0),Number(it.percentual_volume||0),Number(it.media_servico||0),Number(it.tickets||0),Number(it.media_ticket||0)]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
    return JSON.stringify([r.consultor,r.periodo_inicio,r.periodo_fim,Number(r.total_faturado||0),Number(r.total_taxa_adicional||0),Number(r.valor_anulado||0),Number(r.total_tickets||0),Number(r.total_volume||0),itens]);
  };
  const seen = new Set();
  const seenContent = new Map();
  const duplicates = [];
  window.ideologicaDuplicateReports = duplicates;
  return rows.filter(r=>{
    const key = [r.loja, r.periodo_inicio, r.periodo_fim, r.arquivo_origem, Number(r.total_faturado||0).toFixed(2)].join("|||");
    if(seen.has(key)) return false;
    seen.add(key);
    const ckey=contentKey(r);
    if(seenContent.has(ckey)){
      duplicates.push({mantido:seenContent.get(ckey),bloqueado:r});
      return false;
    }
    seenContent.set(ckey,r);
    return true;
  });
}
// Duas leituras da mesma loja em meses diferentes podem vir com grafia
// diferente no nome do arquivo (acento, maiúscula — ex. "RJ Ijuí" x "RJ Ijui",
// já que o nome vem de quem digitou o arquivo naquele mês, não de um cadastro
// fixo). Sem isso a loja aparece duplicada (uma linha por grafia, em vez de
// uma linha só com pills de corte) em toda tabela/ranking que agrupa por
// `loja`. Escolhe uma grafia única por chave sem acento/caixa (locationKey) e
// força todos os relatórios daquela loja pra ela, preferindo a versão
// acentuada (mais completa) e, empatando, a mais longa.
function preferLojaName(a,b){
  const accentsA = /[À-ÖØ-öø-ÿ]/.test(a), accentsB = /[À-ÖØ-öø-ÿ]/.test(b);
  if(accentsA !== accentsB) return accentsA;
  return a.length > b.length;
}
// canonicalGroupKey() vem de loja-location.js (carregado antes desta página)
// — é a MESMA função usada pelo comparativo, pela comparação anual e pelo
// verificador de duplicidade do import. Manter uma cópia local aqui já
// causou divergência silenciosa de regra entre as telas.
function canonicalizeLojaNames(rows){
  const byKey = new Map();
  for(const r of rows){
    const key = canonicalGroupKey(r.loja);
    const cur = byKey.get(key);
    if(!cur || preferLojaName(r.loja, cur)) byKey.set(key, r.loja);
  }
  for(const r of rows) r.loja = byKey.get(canonicalGroupKey(r.loja));
}
function showToast(msg){
  const t=document.createElement("div");
  t.className="toast";
  t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(()=>t.remove(),4000);
}
// Pré-seleciona o filtro de consultor pela identidade logada no hall (auth.js),
// sem travar a tela pra quem chegar aqui direto sem login (fica em "Todos").
function normHallName(s){return (s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().trim();}
function applyHallConsultorFilter(consultorSel){
  if(typeof hallGetUser!=="function") return;
  const hu = hallGetUser();
  if(!hu || hu.role!=="consultor") return;
  const alvo = normHallName(hu.nome);
  const match = [...consultorSel.options].find(o=>o.value && normHallName(o.value)===alvo);
  if(match) consultorSel.value = match.value;
}

async function loadRelatorios(){
  const tbody = document.getElementById("tbody");
  tbody.innerHTML = `<tr><td colspan="6" class="state-msg">Carregando...</td></tr>`;
  try{
    const {data, error} = await supabaseClient
      .from("faturamento_relatorios")
      .select("*, itens:faturamento_itens(*)")
      .order("periodo_fim",{ascending:false})
      .order("id",{ascending:true});
    if(error) throw error;
    // ignora relatorios de amostra/teste (nunca sao dados reais de loja) e o
    // historico de 2025 (HISTORICO_2025_*) — o filtro TODOS desta tela e' so
    // pro periodo corrente (junho/2026 em diante); o historico so aparece no
    // comparativo.html, que sempre pede 2 datas explicitas (nunca "TODOS").
    allRelatorios = (data || [])
      .filter(r => !(r.arquivo_origem||"").startsWith("AMOSTRA_"))
      .filter(r => !(r.arquivo_origem||"").startsWith("HISTORICO_"))
      .map(normalizeRelatorio);
    allRelatorios = dedupeRelatorios(allRelatorios);
    const duplicateCount=(window.ideologicaDuplicateReports||[]).length;
    if(duplicateCount)console.error("Relatórios duplicados bloqueados:",window.ideologicaDuplicateReports);
    canonicalizeLojaNames(allRelatorios);
    lojaBandeiraMap = buildLojaBandeiraMap(allRelatorios);
    tingimentoPorRelatorio = new Map();
    for(const r of allRelatorios){
      const vol = (r.itens||[]).filter(it=>it.tipo==="servico" && /tingimento/i.test(it.categoria||"")).reduce((s,it)=>s+Number(it.volume||0),0);
      if(vol) tingimentoPorRelatorio.set(r.id, vol);
    }
    populateFilterOptions();
    render();
  }catch(err){
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="6" class="state-msg">Erro ao carregar dados do Supabase. Confira js/config.js e se a tabela faturamento_relatorios existe.</td></tr>`;
    showToast("Erro ao carregar: "+(err.message||err));
  }
}

function populateFilterOptions(){
  const lojaSel = document.getElementById("f-loja");
  const consultorSel = document.getElementById("f-consultor");
  if(lojaSel.options.length<=1){
    // Agrupa por UF (optgroup) — a lista já passou de 90 lojas e rolar uma
    // lista plana pra achar uma loja específica ficou ruim. Quem ainda não
    // tem UF cadastrado em loja-location.js cai num grupo "Sem estado", que
    // serve de lembrete visual pra cadastrar.
    const lojas = [...new Set(allRelatorios.map(r=>r.loja))];
    const porUf = new Map();
    for(const l of lojas){
      const uf = (lojaLocation(l)||[])[0] || "Sem estado";
      if(!porUf.has(uf)) porUf.set(uf,[]);
      porUf.get(uf).push(l);
    }
    const ufs = [...porUf.keys()].sort((a,b)=>
      a==="Sem estado" ? 1 : b==="Sem estado" ? -1 : a.localeCompare(b,"pt"));
    for(const uf of ufs){
      const grupo=document.createElement("optgroup");
      grupo.label = uf==="Sem estado" ? uf : `${uf} · ${porUf.get(uf).length} loja${porUf.get(uf).length>1?"s":""}`;
      for(const l of porUf.get(uf).sort((a,b)=>lojaDisplayText(a).localeCompare(lojaDisplayText(b),"pt"))){
        const opt=document.createElement("option");
        opt.value=l; opt.textContent=lojaDisplayText(l);
        grupo.appendChild(opt);
      }
      lojaSel.appendChild(grupo);
    }
  }
  if(consultorSel.options.length<=1){
    const consultores = [...new Set(allRelatorios.map(r=>r.consultor).filter(Boolean))].sort();
    for(const c of consultores){
      const opt=document.createElement("option");
      opt.value=c; opt.textContent=c;
      consultorSel.appendChild(opt);
    }
    applyHallConsultorFilter(consultorSel);
  }
  // Default inicial: mês mais recente com dado, em vez de "Todos" — loadRelatorios()
  // só roda 1x (sem refresh periódico), então isso só afeta o primeiro carregamento
  // da página, nunca sobrescreve uma escolha manual do usuário.
  const meses = [...new Set(allRelatorios.map(r=>r.periodo_inicio.slice(0,7)))].sort();
  if(meses.length) mesFiltro = meses[meses.length-1];
  renderMesPills();
}

// Busca livre: procura no nome da loja E no UF/Cidade/Unidade, porque quem
// digita "caxias" ou "moinhos" está pensando no lugar, não na grafia do
// arquivo ("RJ MOINHOS"). Ignora acento e caixa, e exige que TODOS os termos
// apareçam — "sp campinas" acha as de Campinas sem trazer o resto de SP.
function casaBusca(loja, termo){
  const loc = lojaLocation(loja) || [];
  const alvo = locationKey([loja, displayLoja(loja), loc[0], loc[1], loc[2]].filter(Boolean).join(" "));
  return locationKey(termo).split(/\s+/).filter(Boolean).every(t => alvo.includes(t));
}

function getFiltered(){
  const bandeira = document.getElementById("f-bandeira").value;
  const loja = document.getElementById("f-loja").value;
  const consultor = document.getElementById("f-consultor").value;
  return allRelatorios.filter(r=>{
    if(!matchesBandeiraFilter(r.loja,bandeira)) return false;
    if(loja && r.loja!==loja) return false;
    if(consultor && r.consultor!==consultor) return false;
    if(mesFiltro && !r.periodo_inicio.startsWith(mesFiltro)) return false;
    if(ufFiltro && ((lojaLocation(r.loja)||[])[0]||"")!==ufFiltro) return false;
    if(buscaTexto && !casaBusca(r.loja, buscaTexto)) return false;
    return true;
  });
}

// Cada relatório é uma leitura ACUMULADA do mês até periodo_fim (corte do dia
// 15 = faturamento de 01 a 15; corte do dia 30 já inclui o do dia 15) — não são
// fatias que se somam DENTRO do mesmo mês. Mas mês a mês o ciclo reinicia (o
// corte de julho não inclui o faturamento de junho), então a chave tem que
// ser loja+mês (periodo_inicio, sempre dia 1, identifica o mês) — só assim
// "Todos" soma cada mês corretamente em vez de descartar os meses anteriores
// de uma loja que já tem corte no mês mais recente. Pra KPIs e rankings, usa
// só a leitura mais recente por loja+mês dentro do filtro; a tabela abaixo
// continua mostrando todo relatório importado (histórico de cada corte).
function latestPerLoja(rows){
  const best = new Map();
  for(const r of rows){
    const key = r.loja+"|"+r.periodo_inicio.slice(0,7);
    const cur = best.get(key);
    if(!cur || r.periodo_fim > cur.periodo_fim) best.set(key, r);
  }
  return [...best.values()];
}

function render(){
  const filtered = getFiltered();
  const snapshot = latestPerLoja(filtered);
  renderKpis(snapshot);
  renderRanking("rank-consultor", groupSum(snapshot,"consultor"));
  renderRanking("rank-loja", groupSum(snapshot,"loja"), true);
  renderUfMap(snapshot);
  renderTable(filtered);
}

// ── Mapa de lojas por estado ─────────────────────────────────────────────
// Coroplético em faixas fixas em vez de escala contínua: a distribuição é de
// cauda muito longa (RS 26 e SP 24 lojas, contra 1 loja na maioria dos
// estados), então uma escala linear pintaria quase tudo no tom mais claro e
// só dois estados no escuro. As faixas mostram a diferença entre "1 loja" e
// "um punhado" que é o que interessa aqui.
const UF_FAIXAS = [
  {min:10, cls:"n4", label:"10+"},
  {min:4,  cls:"n3", label:"4–9"},
  {min:2,  cls:"n2", label:"2–3"},
  {min:1,  cls:"n1", label:"1"},
];
function ufFaixa(n){ return (UF_FAIXAS.find(f=>n>=f.min)||{cls:""}).cls; }

function renderUfMap(rows){
  const wrap = document.getElementById("uf-map-wrap");
  const lista = document.getElementById("uf-list");
  if(!wrap || !lista || typeof BR_UF_PATHS === "undefined") return;

  // conta lojas (não relatórios) e soma faturamento por UF, dentro do filtro atual
  const porUf = new Map();
  for(const r of rows){
    const uf = (lojaLocation(r.loja)||[])[0];
    if(!uf) continue; // loja sem UF cadastrado ainda — aparece no aviso do rodapé
    if(!porUf.has(uf)) porUf.set(uf,{lojas:new Set(),fat:0});
    const o = porUf.get(uf);
    o.lojas.add(r.loja);
    o.fat += Number(r.total_faturado||0);
  }
  const semUf = rows.filter(r=>!(lojaLocation(r.loja)||[])[0]).length;

  const paths = BR_UF_PATHS.map(u=>{
    const d = porUf.get(u.sigla);
    const n = d ? d.lojas.size : 0;
    return `<path d="${u.d}" data-uf="${u.sigla}" class="${n?"has-lojas "+ufFaixa(n):""}${ufFiltro===u.sigla?" focado":""}"><title>${u.nome}: ${n} loja${n===1?"":"s"}</title></path>`;
  }).join("");
  // Tudo (contornos + pinos) vive dentro de um <g> só, porque o zoom é um
  // transform nesse grupo — assim mapa e pinos nunca saem de registro.
  wrap.innerHTML = `<svg class="uf-map${ufFiltro?" com-zoom":""}" viewBox="${BR_UF_VIEWBOX}" role="img" aria-label="Mapa do Brasil com a quantidade de lojas por estado">`
    + `<g class="uf-zoom">${paths}<g class="uf-pins"></g></g></svg>`
    + `<div class="uf-tip" id="uf-tip"></div>`;

  const ordenado = [...porUf.entries()].sort((a,b)=> b[1].lojas.size-a[1].lojas.size || a[0].localeCompare(b[0]));
  const nomeDe = s => (BR_UF_PATHS.find(u=>u.sigla===s)||{}).nome || s;
  lista.innerHTML = ordenado.length
    ? ordenado.map(([uf,o])=>`<div class="uf-item" data-uf="${uf}" title="Clique para filtrar por ${esc(nomeDe(uf))}"><span class="ui-sigla">${uf}</span><span class="ui-nome">${esc(nomeDe(uf))}</span><span class="ui-n">${o.lojas.size}</span></div>`).join("")
      + (semUf?`<div class="uf-empty">${semUf} relatório(s) sem estado cadastrado</div>`:"")
    : `<div class="uf-empty">Nenhuma loja no filtro atual.</div>`;

  // Filtrar por um estado deixa o mapa quase todo cinza — sem um aviso claro
  // isso parece defeito, e o "Limpar filtros" fica longe, lá no topo.
  const chip = document.getElementById("uf-filtro-chip");
  if(chip){
    chip.innerHTML = ufFiltro
      ? `<button type="button" class="uf-chip" id="uf-chip-btn" title="Remover o filtro de estado">${ufFiltro} · ${esc(nomeDe(ufFiltro))} <span class="uf-chip-x">✕</span></button>`
      : "";
    const btn = document.getElementById("uf-chip-btn");
    if(btn) btn.addEventListener("click", ()=>{ ufFiltro=""; render(); });
  }

  // A legenda acompanha o que o mapa está mostrando: no Brasil inteiro a cor
  // do estado é densidade de lojas; com um estado aberto o assunto vira a
  // bandeira de cada pino, e a escala de densidade não diz mais nada.
  const legenda = document.getElementById("uf-legend");
  if(legenda){
    legenda.innerHTML = ufFiltro
      ? `<span class="lg-label">Bandeira</span>`
        + ["rj","ml","mega"].map(b=>`<span class="lg-item"><span class="lg-pin" style="background:var(--pin-${b})"></span>${PIN_NOMES[b]}</span>`).join("")
      : `<span class="lg-label">Lojas por estado</span>`
        + `<span class="lg-item"><span class="lg-sw" style="background:var(--uf-0)"></span>0</span>`
        + [...UF_FAIXAS].reverse().map(f=>`<span class="lg-item"><span class="lg-sw" style="background:var(--uf-${f.cls.slice(1)})"></span>${f.label}</span>`).join("");
  }

  aplicarZoomUf(wrap, rows);
  ligarHoverUf(wrap, lista, porUf, nomeDe);
}

// ── Zoom no estado + pinos das cidades ───────────────────────────────────
// Com um estado selecionado o mapa amplia nele e troca de assunto: deixa de
// responder "quantas lojas por estado" (a rampa de cor) e passa a responder
// "em que cidades elas estão". Por isso o estado focado fica num tom neutro
// — manter o verde escuro de SP faria o pino verde da Mega sumir dentro dele.
// A cor sai do CSS por [data-band] — `fill="var(--x)"` como ATRIBUTO do SVG
// não resolve variável CSS (só funciona como propriedade), e o pino saía sem
// cor nenhuma.
const PIN_NOMES = { rj:"Restaura Jeans", ml:"Minha Lavanderia", mega:"Mega" };
// gota clássica de GPS com a ponta exatamente em (0,0), pra ancorar na cidade
const PIN_PATH = "M0 0C-3.6-6-7-9.4-7-13.2A7 7 0 1 1 7-13.2C7-9.4 3.6-6 0 0Z";

function aplicarZoomUf(wrap, rows){
  const svg = wrap.querySelector("svg");
  const grupo = svg.querySelector(".uf-zoom");
  const camadaPins = svg.querySelector(".uf-pins");
  if(!grupo || !camadaPins) return;

  if(!ufFiltro){                       // Brasil inteiro: sem zoom, sem pinos
    grupo.style.transform = "";
    camadaPins.innerHTML = "";
    return;
  }
  const alvo = svg.querySelector(`path[data-uf="${ufFiltro}"]`);
  if(!alvo) return;

  const vb = svg.viewBox.baseVal;
  const b = alvo.getBBox();
  // 0.82 deixa uma folga em volta: colado na borda o estado fica sufocado e
  // os pinos do litoral encostam no limite do quadro.
  const escala = Math.min(vb.width/b.width, vb.height/b.height) * 0.82;
  const tx = vb.width/2 - (b.x + b.width/2)*escala;
  const ty = vb.height/2 - (b.y + b.height/2)*escala;
  grupo.style.transform = `translate(${tx}px,${ty}px) scale(${escala})`;

  // agrupa por cidade+bandeira: São Paulo capital tem 7 lojas RJ, e 7 pinos no
  // mesmo ponto viram um borrão. Um pino por bandeira, com a contagem dentro.
  const porPin = new Map();
  for(const r of rows){
    const loc = lojaLocation(r.loja);
    if(!loc || loc[0] !== ufFiltro) continue;
    const xy = (typeof CIDADE_XY!=="undefined") && CIDADE_XY[`${loc[0]}|${loc[1]}`];
    if(!xy) continue;
    const band = brandOf(r.loja) || "rj";
    const k = `${loc[1]}|${band}`;
    if(!porPin.has(k)) porPin.set(k,{cidade:loc[1], band, xy, lojas:new Set(), fat:0});
    const p = porPin.get(k);
    p.lojas.add(r.loja);
    p.fat += Number(r.total_faturado||0);
  }

  // duas bandeiras na mesma cidade ficariam uma em cima da outra: espalha
  // horizontalmente em torno do ponto real, mantendo o conjunto centrado.
  const porCidade = new Map();
  for(const p of porPin.values()){
    if(!porCidade.has(p.cidade)) porCidade.set(p.cidade,[]);
    porCidade.get(p.cidade).push(p);
  }
  // O pino não pode crescer junto com o zoom, senão vira um balão gigante —
  // mas compensar em 1/escala puro deixa ele do tamanho que teria no Brasil
  // inteiro (uns 8px, ilegível). O fator 2.1 fixa o pino em ~25px na tela,
  // independente de quanto o estado ampliou.
  const inv = 2.1/escala;
  const pins = [];
  for(const grupoCidade of porCidade.values()){
    grupoCidade.sort((a,b)=>b.lojas.size-a.lojas.size);
    const passo = 15*inv;
    const inicio = -passo*(grupoCidade.length-1)/2;
    grupoCidade.forEach((p,i)=>{
      const x = p.xy[0] + inicio + i*passo, y = p.xy[1];
      const n = p.lojas.size;
      pins.push(`<g class="uf-pin" data-band="${p.band}" transform="translate(${x} ${y}) scale(${inv})"
        data-pin="${encodeURIComponent(p.cidade+"|"+p.band)}"
        data-tip="${esc(p.cidade)}|${PIN_NOMES[p.band]||p.band}|${n}|${fmtMoney(p.fat)}">
        <path d="${PIN_PATH}"/>
        ${n>1 ? `<text x="0" y="-9.6" text-anchor="middle" class="uf-pin-n">${n}</text>`
              : `<circle cx="0" cy="-13.2" r="2.6" fill="#fff"/>`}
      </g>`);
    });
  }
  camadaPins.innerHTML = pins.join("");
}

// Modal do pino: mostra as lojas daquela cidade+bandeira com o mesmo
// detalhamento por serviço/produto da tabela (reusa lojaDetailHtml), pra não
// obrigar a caçar a loja na tabela depois de achá-la no mapa.
function abrirModalPin(chave){
  const ov = document.getElementById("ov-pin");
  if(!ov || !chave) return;
  const [cidade, band] = decodeURIComponent(chave).split("|");

  // usa a mesma leitura mais recente por loja+mês que alimenta KPIs e mapa
  const doPin = latestPerLoja(getFiltered()).filter(r=>{
    const loc = lojaLocation(r.loja) || [];
    return loc[0]===ufFiltro && loc[1]===cidade && (brandOf(r.loja)||"rj")===band;
  });
  if(!doPin.length) return;

  const porLoja = new Map();
  for(const r of doPin){
    const atual = porLoja.get(r.loja);
    if(!atual || r.periodo_fim > atual.periodo_fim) porLoja.set(r.loja, r);
  }
  const lojas = [...porLoja.values()].sort((a,b)=>Number(b.total_faturado||0)-Number(a.total_faturado||0));
  const totalFat = lojas.reduce((s,r)=>s+Number(r.total_faturado||0),0);
  const totalTix = lojas.reduce((s,r)=>s+Number(r.total_tickets||0),0);

  document.getElementById("ov-pin-title").innerHTML =
    `<span class="ov-pin-band ov-band-${band}">${PIN_NOMES[band]||band}</span> ${esc(cidade)} <span class="ov-uf">${ufFiltro}</span>`;
  document.getElementById("ov-pin-sub").textContent =
    `${lojas.length} loja${lojas.length>1?"s":""} · ${fmtMoney(totalFat)}` + (totalTix?` · ${fmtNum(totalTix)} tickets`:"");

  document.getElementById("ov-pin-body").innerHTML = lojas.map(r=>`
    <div class="ov-loja">
      <div class="ov-loja-top">
        <div class="ov-loja-nome">${lojaLineHtml(r.loja)}</div>
        <div class="ov-loja-num">
          <span><b>${fmtMoney(r.total_faturado)}</b></span>
          <span class="muted">${fmtNumOrDash(r.total_tickets)} tickets</span>
          <span class="muted">${ticketMedioHtml(r.total_faturado, r.total_tickets, r.total_volume)}</span>
        </div>
      </div>
      <div class="ov-loja-per">${fmtDate(r.periodo_inicio)} – ${fmtDate(r.periodo_fim)} · ${esc(r.consultor||"sem consultor")}</div>
      ${lojaDetailHtml(r.loja, r.periodo_fim)}
    </div>`).join("");

  ov.hidden = false;
  document.getElementById("ov-pin-x").focus();
}
function fecharModalPin(){
  const ov = document.getElementById("ov-pin");
  if(ov) ov.hidden = true;
}
function initModalPin(){
  const ov = document.getElementById("ov-pin");
  if(!ov) return;
  document.getElementById("ov-pin-x").addEventListener("click", fecharModalPin);
  // clicar no fundo escuro fecha; dentro da caixa, não
  ov.addEventListener("click", e=>{ if(e.target===ov) fecharModalPin(); });
  document.addEventListener("keydown", e=>{ if(e.key==="Escape" && !ov.hidden) fecharModalPin(); });
}

// Realce sincronizado nos dois sentidos (mapa ↔ lista): nos estados pequenos
// do Nordeste é praticamente impossível acertar o mouse, então passar na
// lista é o caminho prático — e passar no mapa acende a linha correspondente.
function ligarHoverUf(wrap, lista, porUf, nomeDe){
  const svg = wrap.querySelector("svg");
  const tip = wrap.querySelector("#uf-tip");
  const pathDe = uf => svg.querySelector(`path[data-uf="${uf}"]`);
  const itemDe = uf => lista.querySelector(`.uf-item[data-uf="${uf}"]`);

  function acender(uf, evt){
    apagar();
    const p = pathDe(uf); if(!p) return;
    p.classList.add("hot");
    svg.classList.add("tem-hot"); // faz os outros estados recuarem (ver CSS)
    // Ordem do DOM = ordem de pintura no SVG. O estado precisa subir acima
    // dos VIZINHOS (senão a borda de realce fica cortada por quem é desenhado
    // depois), mas continuar abaixo dos PINOS — com appendChild puro ele ia
    // pro fim de tudo e passava por cima dos pinos das cidades.
    const camadaPins = svg.querySelector(".uf-pins");
    if(camadaPins && camadaPins.parentNode === p.parentNode) p.parentNode.insertBefore(p, camadaPins);
    else p.parentNode.appendChild(p);
    const it = itemDe(uf); if(it) it.classList.add("hot");
    const d = porUf.get(uf);
    const n = d ? d.lojas.size : 0;
    tip.innerHTML = `<span class="tip-uf">${uf}</span> ${esc(nomeDe(uf))}<br><span class="tip-sub">${n} loja${n===1?"":"s"}${d?" · "+fmtMoney(d.fat):""}</span>`;
    tip.classList.add("on");
    if(evt) posicionarTip(evt);
  }
  function apagar(){
    svg.classList.remove("tem-hot");
    svg.querySelectorAll("path.hot").forEach(p=>p.classList.remove("hot"));
    lista.querySelectorAll(".uf-item.hot").forEach(i=>i.classList.remove("hot"));
    tip.classList.remove("on");
  }
  function posicionarTip(evt){
    const r = wrap.getBoundingClientRect();
    tip.style.left = (evt.clientX - r.left) + "px";
    tip.style.top = (evt.clientY - r.top - 6) + "px";
  }

  svg.addEventListener("mousemove", e=>{
    // pino tem prioridade sobre o estado embaixo dele
    const pin = e.target.closest(".uf-pin");
    if(pin){
      const [cidade,bandeira,n,fat] = (pin.dataset.tip||"").split("|");
      tip.innerHTML = `<span class="tip-uf">${esc(bandeira)}</span> ${esc(cidade)}<br><span class="tip-sub">${n} loja${n==="1"?"":"s"} · ${esc(fat)}</span>`;
      tip.classList.add("on");
      posicionarTip(e);
      return;
    }
    const p = e.target.closest("path");
    if(!p){ apagar(); return; }
    const uf = p.dataset.uf;
    if(!p.classList.contains("hot")) acender(uf, e); else posicionarTip(e);
  });
  svg.addEventListener("mouseleave", apagar);
  svg.addEventListener("click", e=>{
    const pin = e.target.closest(".uf-pin");
    if(pin){ abrirModalPin(pin.dataset.pin); return; }
    const p = e.target.closest("path[data-uf]");
    if(p && p.classList.contains("has-lojas")){
      // trocar de estado direto, sem precisar fechar antes
      if(p.dataset.uf !== ufFiltro){ ufFiltro = p.dataset.uf; render(); }
      return;
    }
    // Clique no vazio (mar, estado sem loja, fora do desenho) fecha o zoom.
    // Antes só fechava clicando de novo no mesmo estado, o que ninguém
    // adivinha — o instinto é clicar fora pra voltar.
    if(ufFiltro){ ufFiltro = ""; render(); }
  });

  lista.querySelectorAll(".uf-item").forEach(it=>{
    it.addEventListener("mouseenter", ()=>{
      acender(it.dataset.uf);
      // tooltip ancorado no centro do estado, já que o mouse está na lista
      const p = pathDe(it.dataset.uf);
      if(p){
        const b = p.getBBox(), vb = svg.viewBox.baseVal, r = svg.getBoundingClientRect();
        tip.style.left = ((b.x+b.width/2)/vb.width*r.width) + "px";
        tip.style.top = ((b.y+b.height/2)/vb.height*r.height) + "px";
      }
    });
    it.addEventListener("mouseleave", apagar);
    it.addEventListener("click", ()=>filtrarPorUf(it.dataset.uf));
  });
}

// Clicar num estado filtra o painel inteiro por ele; clicar de novo desfaz.
function filtrarPorUf(uf){
  ufFiltro = (ufFiltro===uf) ? "" : uf;
  render();
}

function renderKpis(rows){
  const totalFaturado = rows.reduce((s,r)=>s+Number(r.total_faturado||0),0);
  const totalTickets = rows.reduce((s,r)=>s+Number(r.total_tickets||0),0);
  const ticketMedio = totalTickets ? totalFaturado/totalTickets : 0;
  const lojas = new Set(rows.map(r=>r.loja)).size;
  const pecasTingimento = rows.reduce((s,r)=>s+(tingimentoPorRelatorio.get(r.id)||0),0);
  document.getElementById("kpi-faturamento").textContent = fmtMoney(totalFaturado);
  document.getElementById("kpi-tickets").textContent = fmtNum(totalTickets);
  document.getElementById("kpi-ticket-medio").textContent = fmtMoney(ticketMedio);
  document.getElementById("kpi-tingimento").textContent = fmtNum(pecasTingimento);
  document.getElementById("kpi-lojas").textContent = fmtNum(lojas);
}

// Conteúdo exibido ao expandir uma loja (no ranking ou na tabela): quebra por
// serviço/produto do corte mais recente, com linha de total por bloco e um
// total geral no fim.
function lojaDetailHtml(lojaName, periodoFim){
  const historico = allRelatorios
    .filter(r=>r.loja===lojaName)
    .sort((a,b)=> a.periodo_fim < b.periodo_fim ? 1 : a.periodo_fim > b.periodo_fim ? -1 : 0);
  if(!historico.length) return `<div class="state-msg">Sem dados para essa loja.</div>`;
  const latest = (periodoFim && historico.find(r=>r.periodo_fim===periodoFim)) || historico[0];
  const itens = (latest.itens||[]).filter(it=>Number(it.faturamento||0)>0 || Number(it.volume||0)>0);
  const servicos = itens.filter(it=>it.tipo==="servico").sort((a,b)=>Number(b.faturamento||0)-Number(a.faturamento||0));
  const produtos = itens.filter(it=>it.tipo==="produto").sort((a,b)=>Number(b.faturamento||0)-Number(a.faturamento||0));
  const sumField = (list,f) => list.reduce((s,it)=>s+Number(it[f]||0),0);
  const totalRow = (list) => {
    const fat = sumField(list,"faturamento"), vol = sumField(list,"volume"), tix = sumField(list,"tickets");
    return `<tr class="total-row"><td>Total</td><td class="num">${fmtNum(vol)}</td><td class="num">${ticketMedioHtml(fat,tix,vol)}</td><td class="num">${fmtMoney(fat)}</td></tr>`;
  };
  const catTable = (titulo, list) => !list.length ? "" : `
    <table class="mini-table"><thead><tr><th>${titulo}</th><th class="num">Volume</th><th class="num">Ticket médio</th><th class="num">Faturamento</th></tr></thead>
    <tbody>${list.map(it=>`<tr><td>${it.categoria}</td><td class="num">${fmtNum(it.volume)}</td><td class="num">${it.media_ticket?fmtMoney(it.media_ticket):ticketMedioHtml(it.faturamento,it.tickets,it.volume)}</td><td class="num">${fmtMoney(it.faturamento)}</td></tr>`).join("")}${totalRow(list)}</tbody></table>`;
  const totalGeral = sumField(servicos,"faturamento") + sumField(produtos,"faturamento");
  return `
    <div class="loja-detail">
      <div class="loja-detail-col">
        <h4>Detalhe por serviço/produto — corte de ${fmtDate(latest.periodo_fim)}${isPresenceReport(latest)?' <span class="tag-presence" title="Relatório gerado direto pelo sistema Presence — sem contagem de ticket, período aproximado.">Presence</span>':''}</h4>
        ${catTable("Serviço", servicos)}
        ${catTable("Produto", produtos)}
        ${!servicos.length && !produtos.length ? '<div class="state-msg">Sem itens registrados nesse corte.</div>' : `<div class="loja-detail-grand-total">Valor total: ${fmtMoney(totalGeral)}</div>`}
      </div>
    </div>`;
}

function groupSum(rows,key){
  const map = new Map();
  for(const r of rows){
    const k = r[key] || "(sem "+key+")";
    map.set(k, (map.get(k)||0) + Number(r.total_faturado||0));
  }
  return [...map.entries()].sort((a,b)=>b[1]-a[1]);
}

function renderRanking(elId, entries, isLoja){
  const el = document.getElementById(elId);
  if(!entries.length){
    el.innerHTML = `<div class="state-msg">Sem dados no período/filtro selecionado.</div>`;
    return;
  }
  const max = entries[0][1] || 1;
  el.innerHTML = entries.slice(0,10).map(([name,val])=>{
    const row = `
    <div class="bar-row${isLoja?" clickable":""}"${isLoja?` data-loja="${encodeURIComponent(name)}"`:""}>
      <div class="bar-name">${isLoja?`<span class="expand-caret">▸</span>`:""}${isLoja?lojaLineHtml(name):esc(name)}</div>
      <div class="bar-track-row">
        <div class="bar-track"><div class="bar-fill" style="width:${Math.max(2,(val/max)*100)}%"></div></div>
        <div class="bar-value">${fmtMoney(val)}</div>
      </div>
    </div>`;
    const detail = isLoja ? `<div class="loja-detail-wrap" style="display:none"></div>` : "";
    return row + detail;
  }).join("");
}

// A tabela agrupa só por LOJA (não mais por loja+mês) — uma linha por loja,
// não importa quantos meses de histórico ela já tenha. Cada grupo mostra uma
// linha só, com pills clicáveis pra qualquer corte já importado (de qualquer
// mês) — a escolha fica lembrada em activeCutByGroup até o usuário trocar de
// novo. Antes agrupava por loja+periodo_inicio e cada mês virava uma linha
// própria; unificado a pedido do Douglas pra não fragmentar loja com >1 mês
// importado (ex.: RJ Limeira aparecia 2x — junho e julho).
const activeCutByGroup = new Map(); // groupKey -> periodo_fim escolhido
const openLojaGroups = new Set(); // groupKeys com o detalhe aberto no momento
const ufsRecolhidas = new Set();  // UFs com as lojas escondidas na tabela
let lastTableRows = [];

function groupKey(r){
  return r.loja;
}
// O dia do corte real varia +-1/2 dias (fim de semana, feriado) mas
// representa sempre a mesma "janela" de corte — agrupa no múltiplo de 5
// mais próximo pra pill ficar estável (9/10/11→10, 14/15/16→15, 29/30/31→30...).
// A data exata continua na coluna Período, isso é só o rótulo da pill.
function cutDay(periodoFim){
  const day = Number((periodoFim||"").slice(8,10));
  if(!day) return "?";
  return Math.min(30, Math.round(day/5)*5) || day;
}
// Rótulo da pill: só "DD" quando os cortes da loja são todos do mesmo mês
// (caso comum, rótulo curto como sempre foi); "DD/MM" quando a loja já tem
// corte de mais de um mês, pra não mostrar duas pills "15" sem dizer qual mês.
function cutLabel(periodoFim, showMonth){
  const day = cutDay(periodoFim);
  if(!showMonth) return day;
  const mm = (periodoFim||"").slice(5,7);
  return `${day}/${mm}`;
}

function renderTable(rows){
  lastTableRows = rows;
  const tbody = document.getElementById("tbody");
  if(!rows.length){
    tbody.innerHTML = `<tr><td colspan="6" class="state-msg">Nenhum relatório encontrado para esse filtro.</td></tr>`;
    return;
  }
  const groups = new Map();
  for(const r of rows){
    const key = groupKey(r);
    if(!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const groupRows = [...groups.entries()].map(([key, list])=>{
    list.sort((a,b)=> a.periodo_fim < b.periodo_fim ? -1 : a.periodo_fim > b.periodo_fim ? 1 : 0);
    const wantedCut = activeCutByGroup.get(key);
    const chosen = list.find(r=>r.periodo_fim===wantedCut) || list[list.length-1];
    // ordena sempre pelo corte mais completo do mês (o último, ex. dia 30),
    // não pelo corte exibido — clicar numa pill não deve mexer a posição da linha.
    const sortBasis = list[list.length-1];
    return {key, list, chosen, sortBasis};
  });
  groupRows.sort((a,b)=>{
    const va=a.sortBasis[sortKey], vb=b.sortBasis[sortKey];
    if(typeof va === "string") return sortDir*va.localeCompare(vb);
    return sortDir*((va||0)-(vb||0));
  });
  // Agrupa por UF. Dentro do estado a ordem escolhida na coluna é preservada;
  // já os ESTADOS entram pelo total do próprio estado (não pela maior loja
  // isolada) — senão a Paraíba, com 2 lojas, apareceria na frente de SP e RS
  // só porque tem a maior loja da rede. Ordenação por texto (Loja/Consultor)
  // não tem total que faça sentido somar, então aí é alfabético por UF.
  const porUf = new Map();
  for(const g of groupRows){
    const uf = (lojaLocation(g.chosen.loja)||[])[0] || "";
    if(!porUf.has(uf)) porUf.set(uf, []);
    porUf.get(uf).push(g);
  }
  const ehTexto = typeof (groupRows[0]||{}).sortBasis?.[sortKey] === "string";
  const ordenados = [...porUf.entries()].sort((a,b)=>{
    if(!a[0]) return 1;               // "sem estado cadastrado" sempre por último
    if(!b[0]) return -1;
    if(ehTexto) return a[0].localeCompare(b[0],"pt");
    const soma = itens => itens.reduce((s,g)=>s+Number(g.sortBasis[sortKey]||0),0);
    return sortDir*(soma(a[1])-soma(b[1]));
  });
  const nomeUf = s => (typeof BR_UF_PATHS!=="undefined" ? (BR_UF_PATHS.find(u=>u.sigla===s)||{}).nome : "") || "";
  const linhaGrupo = (uf, itens, recolhido) => {
    const total = itens.reduce((s,g)=>s+Number(g.chosen.total_faturado||0),0);
    const rotulo = uf ? `<span class="tg-uf">${uf}</span><span class="tg-nome">${esc(nomeUf(uf))}</span>` : `<span class="tg-nome">Sem estado cadastrado</span>`;
    return `<tr class="uf-group-row${recolhido?" recolhido":""}" data-uf="${uf}" title="${recolhido?"Mostrar":"Recolher"} as lojas de ${esc(uf?nomeUf(uf):"sem estado")}">`
      + `<td colspan="3"><span class="tg-caret">▾</span>${rotulo}<span class="tg-qtd">${itens.length} loja${itens.length>1?"s":""}</span></td>`
      + `<td class="num tg-total">${fmtMoney(total)}</td><td colspan="2"></td></tr>`;
  };

  tbody.innerHTML = ordenados.map(([uf, itens])=>{
    // Estado recolhido não renderiza as lojas (em vez de escondê-las com CSS):
    // com 78 linhas na tabela, deixar o DOM só com o que aparece é mais leve,
    // e o que estava expandido volta igual porque openLojaGroups é por loja.
    if(ufsRecolhidas.has(uf)) return linhaGrupo(uf, itens, true);
    return linhaGrupo(uf, itens, false) + itens.map(({key, list, chosen})=>{
    const showMonth = new Set(list.map(r=>(r.periodo_inicio||"").slice(0,7))).size > 1;
    const pills = list.length>1 ? `<span class="cut-pills">${list.map(r=>
      `<button type="button" class="cut-pill${r.periodo_fim===chosen.periodo_fim?" active":""}" data-group="${encodeURIComponent(key)}" data-periodo="${r.periodo_fim}">${cutLabel(r.periodo_fim,showMonth)}</button>`
    ).join("")}</span>` : "";
    const isOpen = openLojaGroups.has(key);
    return `
    <tr class="loja-row${isOpen?" open":""}" data-loja="${encodeURIComponent(chosen.loja)}" data-periodo="${chosen.periodo_fim}" data-key="${encodeURIComponent(key)}">
      <td><span class="expand-caret">▸</span>${lojaLineHtml(chosen.loja)}${pills}</td>
      <td class="muted">${chosen.consultor||"—"}</td>
      <td>${fmtDate(chosen.periodo_inicio)} – ${fmtDate(chosen.periodo_fim)}</td>
      <td class="num">${fmtMoney(chosen.total_faturado)}</td>
      <td class="num">${fmtNumOrDash(chosen.total_tickets)}</td>
      <td class="num">${ticketMedioHtml(chosen.total_faturado, chosen.total_tickets, chosen.total_volume)}</td>
    </tr>
    <tr class="loja-detail-row"${isOpen?"":' style="display:none"'}><td colspan="6">${isOpen?lojaDetailHtml(chosen.loja, chosen.periodo_fim):""}</td></tr>`;
    }).join("");
  }).join("");

  const btnUfs = document.getElementById("btn-toggle-ufs");
  if(btnUfs){
    const ufsNaTela = ordenados.map(([uf])=>uf);
    const todosRecolhidos = ufsNaTela.length && ufsNaTela.every(u=>ufsRecolhidas.has(u));
    btnUfs.textContent = todosRecolhidos ? "Expandir todos" : "Recolher todos";
    btnUfs.hidden = ufsNaTela.length < 2;
  }
}

function initCutPillHandler(){
  document.getElementById("tbody").addEventListener("click",(e)=>{
    const grupo = e.target.closest("tr.uf-group-row");
    if(grupo){
      const uf = grupo.dataset.uf;
      if(ufsRecolhidas.has(uf)) ufsRecolhidas.delete(uf); else ufsRecolhidas.add(uf);
      renderTable(lastTableRows);
      return;
    }
    const pill = e.target.closest(".cut-pill");
    if(pill){
      // troca o corte sem fechar o detalhe se ele já estiver aberto — só
      // re-renderiza os dados, sem colapsar e reabrir (evita o "pulo" da tabela).
      activeCutByGroup.set(decodeURIComponent(pill.dataset.group), pill.dataset.periodo);
      renderTable(lastTableRows);
      return;
    }
    const row = e.target.closest("tr.loja-row");
    if(!row) return;
    const detailRow = row.nextElementSibling;
    if(!detailRow || !detailRow.classList.contains("loja-detail-row")) return;
    const key = decodeURIComponent(row.dataset.key);
    const opening = detailRow.style.display === "none";
    if(opening){
      openLojaGroups.add(key);
      detailRow.querySelector("td").innerHTML = lojaDetailHtml(decodeURIComponent(row.dataset.loja), row.dataset.periodo);
      detailRow.style.display = "";
      row.classList.add("open");
    }else{
      openLojaGroups.delete(key);
      detailRow.style.display = "none";
      row.classList.remove("open");
    }
  });
}
// No ranking não existe uma "pill" de corte por loja — a barra reflete o(s)
// corte(s) já escolhido(s) pelo filtro de mês. Se um mês específico estiver
// selecionado, mostra o corte mais recente DENTRO desse mês; em "Todos" (que
// pode somar mais de um mês), mostra o corte mais recente que a loja tiver.
function initLojaRankingHandler(){
  document.getElementById("rank-loja").addEventListener("click",(e)=>{
    const row = e.target.closest(".bar-row.clickable");
    if(!row) return;
    const wrap = row.nextElementSibling;
    if(!wrap || !wrap.classList.contains("loja-detail-wrap")) return;
    const opening = wrap.style.display === "none";
    if(opening){
      const loja = decodeURIComponent(row.dataset.loja);
      let periodoFim = null;
      if(mesFiltro){
        const noMes = allRelatorios.filter(r=>r.loja===loja && r.periodo_inicio.startsWith(mesFiltro)).sort((a,b)=>a.periodo_fim<b.periodo_fim?1:-1);
        if(noMes.length) periodoFim = noMes[0].periodo_fim;
      }
      wrap.innerHTML = lojaDetailHtml(loja, periodoFim);
      wrap.style.display = "";
      row.classList.add("open");
    }else{
      wrap.style.display = "none";
      row.classList.remove("open");
    }
  });
}

function initSortHandlers(){
  document.querySelectorAll("th[data-sort]").forEach(th=>{
    th.addEventListener("click",()=>{
      const key = th.dataset.sort;
      if(sortKey===key){ sortDir*=-1; } else { sortKey=key; sortDir=-1; }
      render();
    });
  });
}

function initFilterHandlers(){
  ["f-bandeira","f-loja","f-consultor"].forEach(id=>{
    document.getElementById(id).addEventListener("change",render);
  });
  document.getElementById("f-mes-pills").addEventListener("click",(e)=>{
    const btn = e.target.closest(".pill-btn");
    if(!btn) return;
    mesFiltro = btn.dataset.mes;
    renderMesPills();
    render();
  });
  // Recolher os 18 estados um a um pra ver só o resumo não valeria o clique;
  // o botão inverte tudo de uma vez. O rótulo segue o que o clique VAI fazer.
  const btnUfs = document.getElementById("btn-toggle-ufs");
  if(btnUfs) btnUfs.addEventListener("click", ()=>{
    const ufsNaTela = [...document.querySelectorAll(".uf-group-row")].map(r=>r.dataset.uf);
    const todosRecolhidos = ufsNaTela.length && ufsNaTela.every(u=>ufsRecolhidas.has(u));
    ufsRecolhidas.clear();
    if(!todosRecolhidos) ufsNaTela.forEach(u=>ufsRecolhidas.add(u));
    renderTable(lastTableRows);
  });

  const busca = document.getElementById("f-busca");
  const buscaX = document.getElementById("f-busca-x");
  if(busca){
    busca.addEventListener("input", ()=>{
      buscaTexto = busca.value.trim();
      if(buscaX) buscaX.hidden = !buscaTexto;
      render();
    });
    // Esc limpa sem tirar a mão do teclado
    busca.addEventListener("keydown", e=>{ if(e.key==="Escape"){ busca.value=""; busca.dispatchEvent(new Event("input")); } });
  }
  if(buscaX) buscaX.addEventListener("click", ()=>{ busca.value=""; busca.dispatchEvent(new Event("input")); busca.focus(); });

  document.getElementById("btn-clear").addEventListener("click",()=>{
    document.getElementById("f-bandeira").value="";
    document.getElementById("f-loja").value="";
    document.getElementById("f-consultor").value="";
    if(busca){ busca.value=""; buscaTexto=""; if(buscaX) buscaX.hidden = true; }
    mesFiltro="";
    ufFiltro="";
    renderMesPills();
    render();
  });
}

(async function init(){
  if(typeof hallGetUser==="function"){
    const hu = hallGetUser();
    if(hu && hu.role==="admin"){
      const a = document.getElementById("switch-presence");
      if(a) a.href = "../presence/admin.html";
    }
  }
  if(!window.supabase){
    showToast("Biblioteca do Supabase não carregou.");
    return;
  }
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  initFilterHandlers();
  initSortHandlers();
  initCutPillHandler();
  initLojaRankingHandler();
  initModalPin();
  await loadRelatorios();
})();
