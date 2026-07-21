#!/usr/bin/env node
// Importa um relatorio "resumo" exportado direto do sistema Presence (nao o
// Allegro.Net/Ideologica de sempre) — .xlsx moderno e bem mais simples: so
// Loja + Grupo de servico + Qtde Servicos + Total venda, sem ticket, sem
// produto, sem percentual, sem periodo. Ver PRESENCE_REPORT_CONTEXT.md nesta
// pasta pro contexto completo (por que existe, o que falta, o que fazer
// quando o relatorio oficial for ajustado).
//
// Uso:
//   node import_presence_report.js <arquivo.xlsx> <consultor> <periodo_inicio YYYY-MM-DD> <periodo_fim YYYY-MM-DD> [--dry-run]
//
// periodo_inicio/periodo_fim sao obrigatorios por parametro (nao tem "Periodo
// de"/"Geracao:" dentro do arquivo pra extrair, e inferir só do nome do
// arquivo seria frágil demais pra fazer sem confirmar com quem importou).
//
// tickets/media_ticket ficam null de proposito (o arquivo não traz contagem
// de tickets, so "quantidade de servicos", que NAO e a mesma coisa — um
// ticket pode ter varios servicos). O dashboard mostra "—" nesses campos em
// vez de R$0,00 quando total_tickets vem vazio.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { lojaFromArquivo, bandeiraFromArquivo } = require('./parse_report');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error(`Não achei ${envPath}. Ver ideologica/README.md.`);
  }
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2];
  }
  return env;
}

function unzipXlsx(filePath) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'presence-xlsx-'));
  execFileSync('unzip', ['-o', filePath, '-d', dir], { stdio: 'ignore' });
  return dir;
}

function parseSharedStrings(xml) {
  const strings = [];
  const siRe = /<si>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = siRe.exec(xml))) {
    const text = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join('');
    strings.push(text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim());
  }
  return strings;
}

function colOf(ref) {
  return ref.match(/^[A-Z]+/)[0];
}

// Le sheet1.xml pra Map(rowNum -> Map(coluna -> valor)), resolvendo strings
// compartilhadas (t="s") pro texto real.
function parseSheet(xml, sharedStrings) {
  const rows = new Map();
  const rowRe = /<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rm;
  while ((rm = rowRe.exec(xml))) {
    const rowNum = Number(rm[1]);
    const cells = new Map();
    const cellRe = /<c r="([A-Z]+\d+)"([^>]*)>(?:<v>([^<]*)<\/v>)?<\/c>/g;
    let cm;
    while ((cm = cellRe.exec(rm[2]))) {
      const [, ref, attrs, v] = cm;
      if (v == null || v === '') continue;
      const isString = /t="s"/.test(attrs);
      cells.set(colOf(ref), isString ? sharedStrings[Number(v)] : Number(v));
    }
    if (cells.size) rows.set(rowNum, cells);
  }
  return rows;
}

// Extrai um ou mais blocos de loja do relatorio. As colunas ABSOLUTAS variam
// (mesma logica do parser do Allegro.Net) — acha "Grupo"/"Qtde Servicos"/
// "Total venda" pelo texto do cabecalho, mas a coluna da LOJA nao bate com a
// do cabecalho "Nome Loja" nesse export (fica numa celula mesclada vizinha) —
// entao acha a coluna da loja pela POSICAO REAL: a primeira linha que tem
// "Grupo" preenchido tambem tem o rotulo da loja ("NN - NOME") em outra
// coluna da MESMA linha.
function extractStores(rows) {
  let grupoCol = null, qtdeCol = null, totalCol = null;
  for (const cells of rows.values()) {
    for (const [col, val] of cells) {
      if (val === 'Grupo') grupoCol = col;
      if (val === 'Qtde Serviços') qtdeCol = col;
      if (val === 'Total venda') totalCol = col;
    }
  }
  if (!grupoCol || !qtdeCol || !totalCol) {
    throw new Error('Não achei os cabeçalhos esperados (Grupo / Qtde Serviços / Total venda) — layout mudou?');
  }

  const codePattern = /^\d+\s*-\s*\S/; // "27 - TEUTÔNIA", "03 - LAVANDERIA"
  const rowNums = [...rows.keys()].sort((a, b) => a - b);

  let lojaCol = null;
  for (const rn of rowNums) {
    const cells = rows.get(rn);
    if (!codePattern.test(String(cells.get(grupoCol) || ''))) continue;
    for (const [col, val] of cells) {
      if (col !== grupoCol && typeof val === 'string' && codePattern.test(val)) { lojaCol = col; break; }
    }
    if (lojaCol) break;
  }
  if (!lojaCol) throw new Error('Não achei a coluna do nome da loja — layout mudou?');

  const stores = [];
  let cur = null;
  for (const rn of rowNums) {
    const cells = rows.get(rn);
    const lojaVal = cells.get(lojaCol);
    const grupoVal = cells.get(grupoCol);
    if (typeof lojaVal === 'string') {
      const t = lojaVal.trim();
      if (/\sTotal$/.test(t)) {
        if (cur) { cur.totalQtde = cells.get(qtdeCol); cur.totalVenda = cells.get(totalCol); }
      } else if (codePattern.test(t)) {
        cur = { label: t, itens: [], totalQtde: null, totalVenda: null };
        stores.push(cur);
      }
    }
    if (cur && typeof grupoVal === 'string' && codePattern.test(grupoVal)) {
      cur.itens.push({ grupo: grupoVal.trim().replace(/^\d+\s*-\s*/, ''), qtde: cells.get(qtdeCol), venda: cells.get(totalCol) });
    }
  }
  return stores;
}

function toRelatorio(store, consultor, periodoInicio, periodoFim, arquivoOrigem) {
  const fatServ = store.itens.reduce((s, it) => s + Number(it.venda || 0), 0);
  const volServ = store.itens.reduce((s, it) => s + Number(it.qtde || 0), 0);
  // total_venda/qtde da linha "X Total" do proprio arquivo servem de conferencia
  // contra a soma dos itens — se não bater, algo no parsing ficou errado.
  if (store.totalVenda != null && Math.abs(store.totalVenda - fatServ) > 0.01) {
    throw new Error(`"${store.label}": total do arquivo (${store.totalVenda}) não bate com a soma dos itens (${fatServ}).`);
  }
  // loja vem do nome do ARQUIVO, igual ao pipeline do Allegro.Net (ver
  // lojaFromArquivo em parse_report.js) — não do rótulo dentro da planilha —
  // pra bater com a grafia já usada nos outros cortes da mesma loja e entrar
  // no mesmo agrupamento no dashboard (senão vira uma loja "nova" separada).
  const relatorio = {
    loja: lojaFromArquivo(arquivoOrigem) || store.label.replace(/^\d+\s*-\s*/, ''),
    consultor,
    loja_interna: store.label,
    periodo_inicio: periodoInicio,
    periodo_fim: periodoFim,
    total_faturado: Math.round(fatServ * 100) / 100,
    total_taxa_adicional: 0,
    valor_anulado: 0,
    total_tickets: null,
    total_volume: volServ,
    arquivo_origem: arquivoOrigem,
    gerado_em: null,
    bandeira: bandeiraFromArquivo(arquivoOrigem),
  };
  const itens = store.itens.map(it => ({
    tipo: 'servico',
    categoria: it.grupo,
    faturamento: Math.round(Number(it.venda || 0) * 100) / 100,
    percentual: null,
    volume: it.qtde != null ? Math.round(it.qtde) : null,
    percentual_volume: null,
    media_servico: it.qtde ? Math.round((it.venda / it.qtde) * 100) / 100 : null,
    tickets: null,
    media_ticket: null,
  }));
  return { relatorio, itens };
}

async function main() {
  const [, , filePath, consultor, periodoInicio, periodoFim, ...rest] = process.argv;
  const dryRun = rest.includes('--dry-run');
  if (!filePath || !consultor || !periodoInicio || !periodoFim) {
    console.error('Uso: node import_presence_report.js <arquivo.xlsx> <consultor> <periodo_inicio YYYY-MM-DD> <periodo_fim YYYY-MM-DD> [--dry-run]');
    process.exit(1);
  }

  const dir = unzipXlsx(filePath);
  const shared = fs.existsSync(path.join(dir, 'xl', 'sharedStrings.xml')) ? fs.readFileSync(path.join(dir, 'xl', 'sharedStrings.xml'), 'utf8') : '<sst></sst>';
  const sheet = fs.readFileSync(path.join(dir, 'xl', 'worksheets', 'sheet1.xml'), 'utf8');
  const sharedStrings = parseSharedStrings(shared);
  const rows = parseSheet(sheet, sharedStrings);
  const stores = extractStores(rows);
  fs.rmSync(dir, { recursive: true, force: true });

  if (!stores.length) throw new Error('Nenhuma loja encontrada no arquivo.');

  const arquivoOrigem = path.basename(filePath);
  const env = dryRun ? null : loadEnv();
  for (const store of stores) {
    const { relatorio, itens } = toRelatorio(store, consultor, periodoInicio, periodoFim, arquivoOrigem);
    console.log(JSON.stringify(relatorio, null, 2));
    console.log(`${itens.length} itens (sem tickets — ver PRESENCE_REPORT_CONTEXT.md)`);
    if (dryRun) { console.log('--dry-run: nada foi salvo no Supabase.'); continue; }
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/salvar_faturamento`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_token: env.FATURAMENTO_RPC_TOKEN, p_relatorio: relatorio, p_itens: itens }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`RPC salvar_faturamento falhou (${res.status}): ${text}`);
    console.log('Salvo no Supabase, id =', text);
  }
}

main().catch(e => {
  console.error('ERRO:', e.message);
  process.exit(1);
});
