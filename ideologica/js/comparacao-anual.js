let supabaseClient = null;
let allRelatorios = [];
let lojasSelecionadas = new Set(); // vazio = todas as lojas comparáveis

function fmtMoney(v){
  return (v==null?0:v).toLocaleString("pt-BR",{style:"currency",currency:"BRL",maximumFractionDigits:2});
}
function fmtPct(v){
  if(v==null) return "—";
  const s = (v*100).toLocaleString("pt-BR",{maximumFractionDigits:1,minimumFractionDigits:1});
  return (v>0?"+":"")+s+"%";
}
function fmtMoneyCompact(v){
  if(v==null) return "";
  const abs = Math.abs(v);
  if(abs>=1000000) return "R$ "+(v/1000000).toLocaleString("pt-BR",{maximumFractionDigits:1})+"M";
  if(abs>=1000) return "R$ "+(v/1000).toLocaleString("pt-BR",{maximumFractionDigits:0})+"K";
  return fmtMoney(v);
}
function deltaClass(v){
  if(v==null||v===0) return "delta-zero";
  return v>0 ? "delta-pos" : "delta-neg";
}
function esc(v){
  return String(v||"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
}

// ── bandeira / nome de exibição (mesma lógica das outras páginas) ──
const BRAND_OVERRIDES = { "RS - PORTO ALEGRE": "rj", "RESTAURA JEANS RS - SANTA ROSA": "mega", "SC CACADOR": "mega" };
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
    if(map.has(r.loja) && map.get(r.loja)) continue;
    map.set(r.loja, r.bandeira || BRAND_OVERRIDES[r.loja] || brandFromText(r.loja));
  }
  return map;
}
function brandOf(loja){ return lojaBandeiraMap.get(loja) || BRAND_OVERRIDES[loja] || brandFromText(loja); }
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
const LOJA_DISPLAY_OVERRIDES = {
  "MINHA LAVANDERIA - TEUT": "MINHA LAVANDERIA - TEUTÔNIA",
  "RESTAURA JEANS - PO": "RESTAURA JEANS - PONTE RASA",
  "MINHA LAVANDERIA E RESTAURA JEANS HIGIEN": "MINHA LAVANDERIA E RESTAURA JEANS HIGIENÓPOLIS",
  "MINHA LAVANDERIA SP - TAUBAT": "MINHA LAVANDERIA SP - TAUBATÉ",
};
function displayLoja(loja){ return LOJA_DISPLAY_OVERRIDES[loja] || loja; }

function lojaFromArquivo(arquivoOrigem){
  const base = (arquivoOrigem||"")
    .split(/[\\/]/).pop().replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ")
    .replace(/\s+b64$/i, "").replace(/\s+/g, " ").trim();
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
  // HISTORICO_2025_* já vem com o nome da loja ATUAL certo (mapeado no import) —
  // reprocessar pelo arquivo quebraria (ver ideologica/import/import_historico_2025.js).
  if((r.arquivo_origem||"").startsWith("HISTORICO_")) return r;
  const lojaArquivo = lojaFromArquivo(r.arquivo_origem);
  return lojaArquivo ? {...r, loja_original: r.loja, loja: lojaArquivo} : r;
}
function dedupeRelatorios(rows){
  const seen = new Set();
  return rows.filter(r=>{
    const key = [r.loja, r.periodo_inicio, r.periodo_fim, r.arquivo_origem, Number(r.total_faturado||0).toFixed(2)].join("|||");
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function foldKey(s){ return (s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().trim(); }
function preferLojaName(a,b){
  const accentsA = /[À-ÖØ-öø-ÿ]/.test(a), accentsB = /[À-ÖØ-öø-ÿ]/.test(b);
  if(accentsA !== accentsB) return accentsA;
  return a.length > b.length;
}
// foldKey() sozinho só remove acento/caixa — não basta quando a mesma loja
// tem grafias mais diferentes entre arquivos, tipo abreviação ("RJ Caxias
// S. Pelegrino" x "RJ CAXIAS SÃO PELEGRINO"): ficava sem bater e a loja
// aparecia duas vezes no ranking. Quando já existe um UF/Cidade/Unidade
// cadastrado em LOJA_LOCATION_OVERRIDES (loja-location.js) — que já lista
// essas variantes como apelidos da mesma unidade — agrupa por esse trio em
// vez do nome cru; só cai pro foldKey puro quando a loja ainda não tem
// override.
function canonicalGroupKey(loja){
  const loc = lojaLocation(loja);
  return loc ? 'loc:'+loc.join('|').toLowerCase() : 'key:'+foldKey(loja);
}
function canonicalizeLojaNames(rows){
  const byKey = new Map();
  for(const r of rows){
    const key = canonicalGroupKey(r.loja);
    const cur = byKey.get(key);
    if(!cur || preferLojaName(r.loja, cur)) byKey.set(key, r.loja);
  }
  for(const r of rows) r.loja = byKey.get(canonicalGroupKey(r.loja));
}
function normHallName(s){ return (s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().trim(); }
function applyHallConsultorFilter(consultorSel){
  if(typeof hallGetUser!=="function") return;
  const hu = hallGetUser();
  if(!hu || hu.role!=="consultor") return;
  const alvo = normHallName(hu.nome);
  const match = [...consultorSel.options].find(o=>o.value && normHallName(o.value)===alvo);
  if(match) consultorSel.value = match.value;
}

// ── mês fechado (mesma regra da antiga aba Ano a Ano) ──
function ultimoDiaDoMes(ano, mes){
  const isLeap = (ano%4===0 && ano%100!==0) || ano%400===0;
  return [31, isLeap?29:28, 31,30,31,30,31,31,30,31,30,31][mes-1];
}
function mesFechado(r){
  const [ano,mes,dia] = r.periodo_fim.split("-").map(Number);
  return dia === ultimoDiaDoMes(ano, mes);
}
const CA_MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const CA_CORES = ["#2a78d6","#eb6834","#1baf7a"]; // ordem categórica fixa, validada (skill dataviz)

// ── RESUMO ESCRITO NA MÃO A CADA ATUALIZAÇÃO DE DADOS ──
// Não é uma chamada de IA ao vivo (o site é estático, sem servidor — expor
// uma API key de LLM no navegador seria inseguro). Toda vez que os dados
// forem reimportados/atualizados de forma relevante, Claude Code reescreve
// este bloco lendo os números novos. Ver memória "ideologica-historico-2025".
const RESUMO_IA = {
  atualizadoEm: "27/07/2026",
  paragrafo: "Comparando junho/2025 com junho/2026 — o único mês fechado nos dois anos até agora — nas 7 lojas com dado disponível em ambos, o total caiu -2,0% (R$340,4K → R$333,5K). Isso esconde uma divisão real: 4 das 7 lojas cresceram, mas quedas fortes em Limeira e JD Aurélia puxaram o resultado geral pra baixo. Com só 1 mês de sobreposição, é uma leitura preliminar — fica mais confiável a cada mês novo que fechar em 2026.",
  destaques: [
    {tipo:"pos", texto:"<b>ML Indaiatuba</b> cresceu +13,6% e <b>RJ São José dos Campos</b> +11,4% — os dois melhores da comparação."},
    {tipo:"pos", texto:"<b>Mega Campinas Cambuí</b> (+4,8%) e <b>RJ Belo Horizonte</b> (+4,6%) também avançaram."},
    {tipo:"neg", texto:"<b>RJ Limeira</b> caiu -33,3% — a maior queda, vale investigar o motivo com o consultor responsável."},
    {tipo:"neg", texto:"<b>Mega Campinas JD Aurélia</b> caiu -13,3% — loja nova no sistema (foi ao ar em 2026), comparação ainda com pouco histórico."},
    {tipo:"neg", texto:"<b>ML Teutônia</b> caiu -6,0%."},
  ],
};

function renderResumo(){
  const destaquesHtml = RESUMO_IA.destaques.map(d=>`<div class="ca-destaque ${d.tipo==='pos'?'pos':'neg'}"><span class="dot"></span><span>${d.texto}</span></div>`).join("");
  return `
  <div class="ca-resumo-card">
    <div class="ca-resumo-badge">✦</div>
    <div class="ca-resumo-body">
      <div class="ca-resumo-head">
        <span class="ca-resumo-title">Resumo</span>
        <span class="ca-resumo-data">atualizado em ${RESUMO_IA.atualizadoEm}</span>
      </div>
      <div class="ca-resumo-texto">${RESUMO_IA.paragrafo}</div>
      <div class="ca-destaques">${destaquesHtml}</div>
    </div>
  </div>`;
}

// ── carregamento e filtros ──
async function loadData(){
  const root = document.getElementById("ca-root");
  try{
    const {data, error} = await supabaseClient
      .from("faturamento_relatorios")
      .select("*, itens:faturamento_itens(*)")
      .order("periodo_inicio",{ascending:true});
    if(error) throw error;
    allRelatorios = (data || [])
      .filter(r => !(r.arquivo_origem||"").startsWith("AMOSTRA_"))
      .map(normalizeRelatorio);
    allRelatorios = dedupeRelatorios(allRelatorios);
    canonicalizeLojaNames(allRelatorios);
    lojaBandeiraMap = buildLojaBandeiraMap(allRelatorios);
    populateFilterOptions();
    render();
  }catch(err){
    console.error(err);
    root.innerHTML = `<div class="state-msg">Erro ao carregar dados do Supabase: ${err.message||err}</div>`;
  }
}
function populateFilterOptions(){
  const consultorSel = document.getElementById("f-consultor");
  const consultores = [...new Set(allRelatorios.map(r=>r.consultor).filter(Boolean))].sort();
  for(const c of consultores){
    const opt=document.createElement("option");
    opt.value=c; opt.textContent=c;
    consultorSel.appendChild(opt);
  }
  applyHallConsultorFilter(consultorSel);
}

// ── núcleo: só lojas com pelo menos 1 mês fechado em comum entre os 2 anos
// mais recentes — chart E tabela ficam no MESMO recorte, senão o total da
// empresa parece cair só porque menos lojas ainda fecharam o mês em 2026
// (não é queda de faturamento, é cobertura de dado incompleta ainda).
function computeComparavel(){
  const bandeira = document.getElementById("f-bandeira").value;
  const consultor = document.getElementById("f-consultor").value;
  const passa = r => matchesBandeiraFilter(r.loja,bandeira) && (!consultor||r.consultor===consultor);

  const fechados = allRelatorios.filter(r=>passa(r) && mesFechado(r));
  const porLojaAnoMes = new Map();
  for(const r of fechados){
    const key = r.loja+"|||"+r.periodo_fim.slice(0,7);
    const cur = porLojaAnoMes.get(key);
    if(!cur || r.periodo_fim>cur.periodo_fim) porLojaAnoMes.set(key, r);
  }
  const dedupRows = [...porLojaAnoMes.values()];
  const anos = [...new Set(dedupRows.map(r=>Number(r.periodo_fim.slice(0,4))))].sort((a,b)=>a-b);
  if(anos.length<2) return null;
  const anoAnt = anos[anos.length-2], anoAtu = anos[anos.length-1];

  const porLoja = new Map(); // loja -> {ant:Map(mes->valor), atu:Map(mes->valor)}
  for(const r of dedupRows){
    const ano = Number(r.periodo_fim.slice(0,4));
    if(ano!==anoAnt && ano!==anoAtu) continue;
    const mes = Number(r.periodo_fim.slice(5,7));
    if(!porLoja.has(r.loja)) porLoja.set(r.loja, {ant:new Map(), atu:new Map()});
    (ano===anoAnt ? porLoja.get(r.loja).ant : porLoja.get(r.loja).atu).set(mes, Number(r.total_faturado||0));
  }

  // universo inteiro de lojas comparáveis (dentro do filtro bandeira/consultor,
  // ANTES de aplicar a seleção manual de lojas) — usado pra montar as pills e
  // pra decidir se uma loja pode aparecer na lista de seleção.
  const linhasTodas = [...porLoja.entries()].map(([lj,{ant,atu}])=>{
    const mesesComuns = [...ant.keys()].filter(m=>atu.has(m));
    if(!mesesComuns.length) return null;
    const totalAnt = mesesComuns.reduce((s,m)=>s+ant.get(m),0);
    const totalAtu = mesesComuns.reduce((s,m)=>s+atu.get(m),0);
    return {loja:lj, meses:mesesComuns.length, totalAnt, totalAtu, dif: totalAtu-totalAnt, pct: totalAnt?(totalAtu-totalAnt)/totalAnt:null};
  }).filter(Boolean).sort((a,b)=>b.totalAtu-a.totalAtu);

  // seleção manual do usuário (pills) — vazio = todas
  const linhas = lojasSelecionadas.size ? linhasTodas.filter(l=>lojasSelecionadas.has(l.loja)) : linhasTodas;
  const comparaveis = new Set(linhas.map(l=>l.loja));

  // séries mensais do grafico: soma SÓ das lojas comparáveis, nos 2 anos, em
  // todos os meses fechados que existirem (não só os meses em comum) — assim
  // 2025 mostra a curva do ano inteiro e 2026 vai crescendo mês a mês, mas
  // sempre com o MESMO conjunto de lojas nos dois lados.
  const totalPorAnoMes = new Map();
  for(const r of dedupRows){
    if(!comparaveis.has(r.loja)) continue;
    const key = r.periodo_fim.slice(0,4)+"|||"+Number(r.periodo_fim.slice(5,7));
    totalPorAnoMes.set(key, (totalPorAnoMes.get(key)||0) + Number(r.total_faturado||0));
  }
  const series = anos.map((ano,i)=>({
    ano, cor: CA_CORES[i % CA_CORES.length],
    valores: Array.from({length:12}, (_,m)=> totalPorAnoMes.has(ano+"|||"+(m+1)) ? totalPorAnoMes.get(ano+"|||"+(m+1)) : null),
  }));

  const totalComumAnt = linhas.reduce((s,l)=>s+l.totalAnt,0);
  const totalComumAtu = linhas.reduce((s,l)=>s+l.totalAtu,0);

  return {anoAnt, anoAtu, linhas, linhasTodas, series, totalComumAnt, totalComumAtu, comparaveis};
}

function render(){
  const root = document.getElementById("ca-root");
  const dados = computeComparavel();
  renderLojaPills(dados ? dados.linhasTodas : []);
  if(!dados){
    root.innerHTML = renderResumo() + `<div class="ca-growth-empty">Ainda não há 2 anos com mês fechado suficiente pra comparar com esse filtro.</div>`;
    return;
  }
  const dif = dados.totalComumAtu - dados.totalComumAnt;
  const pct = dados.totalComumAnt ? dif/dados.totalComumAnt : null;

  root.innerHTML = `
    ${renderResumo()}
    <div class="ca-kpis">
      <div class="kpi"><div class="kpi-label">${dados.anoAnt} (meses comparáveis)</div><div class="kpi-value">${fmtMoney(dados.totalComumAnt)}</div></div>
      <div class="kpi"><div class="kpi-label">${dados.anoAtu} (mesmos meses)</div><div class="kpi-value">${fmtMoney(dados.totalComumAtu)}</div></div>
      <div class="kpi"><div class="kpi-label">Crescimento</div><div class="kpi-value ${pct>0?'teal':''}">${fmtPct(pct)}</div></div>
      <div class="kpi"><div class="kpi-label">Lojas comparáveis</div><div class="kpi-value">${dados.linhas.length}</div></div>
    </div>
    ${renderChart(dados.series)}
    ${renderTabela(dados)}
  `;
  initHover(dados.series);
}

function renderChart(series){
  const W=900, H=320, padL=68, padR=24, padT=20, padB=36;
  const plotW=W-padL-padR, plotH=H-padT-padB;
  const allVals = series.flatMap(s=>s.valores).filter(v=>v!=null);
  const niceMax = niceCeil(Math.max(1, ...allVals));
  const x = i => padL + (i/11)*plotW;
  const y = v => padT + plotH - (v/niceMax)*plotH;

  const gridlines = [0,0.25,0.5,0.75,1].map(f=>{
    const yy = padT + plotH - f*plotH;
    return `<line x1="${padL}" y1="${yy.toFixed(1)}" x2="${W-padR}" y2="${yy.toFixed(1)}" class="aa-grid"/>
            <text x="${padL-8}" y="${(yy+4).toFixed(1)}" class="aa-axis-y" text-anchor="end">${fmtMoneyCompact(f*niceMax)}</text>`;
  }).join("");
  const xLabels = CA_MESES.map((m,i)=>`<text x="${x(i).toFixed(1)}" y="${H-padB+18}" class="aa-axis-x" text-anchor="middle">${m}</text>`).join("");

  const linesHtml = series.map(s=>{
    let path="", started=false;
    s.valores.forEach((v,i)=>{
      if(v==null){ started=false; return; }
      path += (started?"L":"M")+x(i).toFixed(1)+","+y(v).toFixed(1)+" ";
      started=true;
    });
    const dots = s.valores.map((v,i)=> v==null?"":`<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="4" fill="${s.cor}" stroke="var(--surface)" stroke-width="2"/>`).join("");
    let lastIdx=-1; s.valores.forEach((v,i)=>{ if(v!=null) lastIdx=i; });
    const label = lastIdx>=0 ? `<text x="${(x(lastIdx)+8).toFixed(1)}" y="${(y(s.valores[lastIdx])+4).toFixed(1)}" class="aa-endlabel">${fmtMoneyCompact(s.valores[lastIdx])}</text>` : "";
    return `<path d="${path.trim()}" fill="none" stroke="${s.cor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${dots}${label}`;
  }).join("");
  const legend = series.map(s=>`<span class="aa-legend-item"><span class="aa-legend-swatch" style="background:${s.cor}"></span>${s.ano}</span>`).join("");

  return `
  <div class="aa-chart-card">
    <div class="aa-chart-head">
      <span class="aa-chart-title">Faturamento mensal — lojas comparáveis (só meses fechados)</span>
      <span class="aa-legend">${legend}</span>
    </div>
    <svg viewBox="0 0 ${W} ${H}" class="aa-svg" id="ca-svg" preserveAspectRatio="xMidYMid meet">
      ${gridlines}
      ${xLabels}
      ${linesHtml}
      <line id="ca-crosshair" x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT+plotH}" class="aa-crosshair" style="display:none"/>
    </svg>
    <div id="ca-tooltip" class="aa-tooltip" style="display:none"></div>
  </div>`;
}
function niceCeil(v){
  if(v<=0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v/pow;
  const niceN = n<=1?1:n<=2?2:n<=5?5:10;
  return niceN*pow;
}
function initHover(series){
  const svg = document.getElementById("ca-svg");
  const crosshair = document.getElementById("ca-crosshair");
  const tooltip = document.getElementById("ca-tooltip");
  if(!svg) return;
  const W=900, padL=68, padR=24;
  const plotW=W-padL-padR;
  svg.addEventListener("pointermove",(e)=>{
    const rect = svg.getBoundingClientRect();
    const xPx = (e.clientX-rect.left)*(W/rect.width);
    let i = Math.round(((xPx-padL)/plotW)*11);
    i = Math.max(0, Math.min(11, i));
    const xData = padL + (i/11)*plotW;
    crosshair.setAttribute("x1", xData); crosshair.setAttribute("x2", xData);
    crosshair.style.display = "";
    const rows = series.map(s=>{
      const v = s.valores[i];
      return `<div class="aa-tooltip-row"><span class="aa-tooltip-key" style="background:${s.cor}"></span><b>${v==null?"—":fmtMoney(v)}</b><span class="aa-tooltip-label">${s.ano}</span></div>`;
    }).join("");
    tooltip.innerHTML = `<div class="aa-tooltip-title">${CA_MESES[i]}</div>${rows}`;
    tooltip.style.display = "block";
    tooltip.style.left = Math.max(4, e.clientX-rect.left+12)+"px";
    tooltip.style.top = Math.max(4, e.clientY-rect.top-10)+"px";
  });
  svg.addEventListener("pointerleave",()=>{
    crosshair.style.display="none";
    tooltip.style.display="none";
  });
}

function renderTabela(dados){
  if(!dados.linhas.length){
    return `<div class="ca-growth-empty">Nenhuma loja selecionada tem dado comparável com esse filtro.</div>`;
  }
  const maxAbsPct = Math.max(0.01, ...dados.linhas.map(l=>Math.abs(l.pct||0)));
  const rows = dados.linhas.map(l=>{
    const pctAbs = Math.min(1, Math.abs(l.pct||0)/maxAbsPct);
    const barClass = (l.pct||0) < 0 ? "neg" : "";
    return `
    <tr>
      <td>${lojaLineHtml(l.loja)}</td>
      <td class="num muted">${l.meses}/12</td>
      <td class="num">${fmtMoney(l.totalAnt)}</td>
      <td class="num col-sep">${fmtMoney(l.totalAtu)}</td>
      <td class="num ${deltaClass(l.dif)}">${fmtMoney(l.dif)}</td>
      <td class="num">
        <div class="ca-growth-cell">
          <div class="ca-growth-track"><div class="ca-growth-fill ${barClass}" style="width:${(pctAbs*100).toFixed(0)}%"></div></div>
          <span class="${deltaClass(l.pct)}">${fmtPct(l.pct)}</span>
        </div>
      </td>
    </tr>`;
  }).join("");

  return `
  <div class="aa-tabela-card">
    <div class="aa-tabela-head">Por loja — ${dados.anoAnt} × ${dados.anoAtu} (meses fechados em comum)</div>
    <table>
      <thead><tr>
        <th>Loja</th><th class="num">Meses</th>
        <th class="num">${dados.anoAnt}</th><th class="num col-sep">${dados.anoAtu}</th>
        <th class="num">Diferença</th><th class="num">Crescimento</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function renderLojaPills(linhasTodas){
  const el = document.getElementById("ca-loja-pills");
  if(!el) return;
  const nomes = linhasTodas.map(l=>l.loja).sort((a,b)=>a.localeCompare(b,"pt"));
  if(!nomes.length){
    el.innerHTML = `<span class="muted">Nenhuma loja comparável com esse filtro.</span>`;
    return;
  }
  el.innerHTML = nomes.map(nome=>{
    const on = lojasSelecionadas.has(nome);
    return `<button type="button" class="ca-loja-pill${on?" on":""}" data-loja="${encodeURIComponent(nome)}">${lojaLineHtml(nome)}</button>`;
  }).join("");
}

function initFilterHandlers(){
  ["f-bandeira","f-consultor"].forEach(id=>{
    document.getElementById(id).addEventListener("change", render);
  });
  document.getElementById("btn-clear").addEventListener("click",()=>{
    document.getElementById("f-bandeira").value="";
    document.getElementById("f-consultor").value="";
    lojasSelecionadas.clear();
    render();
  });
  document.getElementById("ca-loja-pills").addEventListener("click",(e)=>{
    const btn = e.target.closest(".ca-loja-pill");
    if(!btn) return;
    const nome = decodeURIComponent(btn.dataset.loja);
    if(lojasSelecionadas.has(nome)) lojasSelecionadas.delete(nome); else lojasSelecionadas.add(nome);
    render();
  });
  document.getElementById("btn-todas-lojas").addEventListener("click",()=>{
    lojasSelecionadas.clear();
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
    document.getElementById("ca-root").innerHTML = `<div class="state-msg">Biblioteca do Supabase não carregou.</div>`;
    return;
  }
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  initFilterHandlers();
  await loadData();
})();
