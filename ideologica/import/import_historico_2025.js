#!/usr/bin/env node
// IMPORT DE UMA VEZ SÓ: histórico completo de 2025 (12 meses fechados),
// vindo de IDEOLÓGICA SISTEMA/DADOS ANTIGOS/<MES> 2025.xlsx (formato moderno,
// não é o .xls legado do parse_report.js) — usado como base de comparação
// ano-a-ano. Ver memória "ideologica-historico-2025" (27/07/2026) pro
// contexto completo da análise e das cidades deixadas de fora.
//
// Reusa a MESMA tabela faturamento_relatorios/faturamento_itens (a pedido do
// Douglas, sem tabela nova) — cada linha entra marcada com arquivo_origem
// começando em "HISTORICO_2025_", exatamente como o prefixo "AMOSTRA_" já
// existente é usado pra marcar dado de teste. O dashboard.js (Visão Geral,
// filtro TODOS) passa a excluir esse prefixo, então nada muda lá — só o
// comparativo.html (que sempre pede 2 datas explícitas, nunca "TODOS") passa
// a enxergar jan-dez/2025 nas pills de mês.
//
// Cada arquivo = 1 mês FECHADO por loja (não é corte parcial 15/20/30 como o
// resto do sistema) — periodo_inicio/periodo_fim = 1º e último dia do mês.
//
// MAPEAMENTO: só as lojas abaixo, verificadas manualmente (UF+Cidade+Bairro
// batendo, E a bandeira do "Grupo Principal" do legado batendo com a
// bandeira da loja atual — sem isso, "PR Curitiba - Minha Lavanderia" quase
// virou "RJ Portão" só por serem da mesma cidade). Cidades onde o legado
// tinha 1 registro só e hoje são 2-3 lojas com donos diferentes (Caxias do
// Sul, Passo Fundo) ficam de fora até decisão do Douglas — ver a memória.
//
// Uso:
//   npm install --no-save xlsx   (não é dependência do projeto, só deste script)
//   node import_historico_2025.js "G:\Meu Drive\IDEOLÓGICA SISTEMA\DADOS ANTIGOS" --dry-run
//   node import_historico_2025.js "G:\Meu Drive\IDEOLÓGICA SISTEMA\DADOS ANTIGOS"

const fs = require('fs');
const path = require('path');
let XLSX;
try {
  XLSX = require('xlsx');
} catch (e) {
  console.error('Falta o pacote "xlsx". Rode: npm install --no-save xlsx');
  process.exit(1);
}

// nome exato da linha "Loja" no arquivo antigo -> nome da loja no sistema atual.
const MAPEAMENTO = {
  'BA SALVADOR': 'RJ Salvador',
  'MG BELO HORIZONTE': 'RJ Belo Horizonte',
  'MT CUIABÁ': 'RJ CUIABÁ',
  'PA PARAUAPEBAS': 'RJ Parauapebas',
  'PE RECIFE - MINHA LAVANDERIA': 'ML RECIFE',
  'PR FRANCISCO BELTRÃO - MEGA': 'Mega Franscisco Beltrão',
  'RN MOSSORÓ - MINHA LAVANDERIA': 'ML Mossoró',
  'RS CAMAQUÃ STORE': 'RJ Camaqua',
  'RS CARAZINHO': 'RJ Carazinho',
  'RS CASSINO': 'RJ Cassino',
  'RS PELOTAS': 'RJ Pelotas',
  'RS SANTA CRUZ DO SUL': 'RJ Santa Cruz do Sul',
  'RS SANTA MARIA - MEGA': 'Mega Santa Maria',
  'RS TEUTÔNIA - MINHA LAVANDERIA': 'ML teutonia',
  'SÃO PAULO - HIGIENÓPOLIS - MEGA': 'Mega higienópolis',
  'SÃO PAULO - JAÇANÃ': 'RJ Jacana',
  'SÃO PAULO - PENHA': 'RJ Penha',
  'SÃO PAULO - PONTE RASA': 'RJ Ponte Rasa',
  'SÃO PAULO - SAUDE': 'RJ Saúde',
  'SÃO PAULO - SILVA BUENO': 'RJ Silva Bueno',
  'SÃO PAULO - VILA CARRÃO': 'RJ Vila Carrão',
  'SÃO PAULO - VILA MATILDE': 'RJ Vila Matilde',
  'SP BARRETOS - MINHA LAVANDERIA': 'ML Barretos',
  'SP BOTUCATU - MINHA LAVANDERIA': 'ML Botucatu',
  'SP CAMPINAS CAMBUÍ - MEGA': 'Mega Campinas Cambuí',
  'SP CAMPINAS JARDIM AURELIA - MEGA': 'Mega campinas JD Aurélia',
  'SP INDAIATUBA - MINHA LAVANDERIA': 'ML Indaiatuba',
  'SP LIMEIRA': 'RJ Limeira',
  'SP SÃO JOSÉ DOS CAMPOS': 'RJ São José dos Campos',
  'SP SOROCABA - MINHA LAVANDERIA': 'ML Sorocaba',
  'SP VARGEM GRANDE - MINHA LAVANDERIA': 'ML VARGEM GRANDE',
};

const MES_NUM = { JAN: 1, FEV: 2, MAR: 3, ABR: 4, MAI: 5, JUN: 6, JUL: 7, AGO: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12 };
const DIAS_NO_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function isLeap(ano) { return (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0; }
function ultimoDia(ano, mesNum) {
  if (mesNum === 2) return isLeap(ano) ? 29 : 28;
  return DIAS_NO_MES[mesNum - 1];
}
function pad2(n) { return String(n).padStart(2, '0'); }

function brandFromLojaAtual(loja) {
  const l = (loja || '').toLowerCase();
  const isRJ = l.startsWith('rj ') || l.includes('restaura jeans') || l.includes('jeans');
  const isML = l.startsWith('ml ') || l.includes('lavanderia');
  if ((isRJ && isML) || l.includes('mega')) return 'mega';
  if (isML) return 'ml';
  if (isRJ) return 'rj';
  return null;
}
function slug(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2];
  }
  return env;
}

async function salvar(env, relatorio, itens) {
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
  return text;
}

async function main() {
  const [, , rootArg, ...rest] = process.argv;
  const dryRun = rest.includes('--dry-run');
  if (!rootArg) {
    console.error('Uso: node import_historico_2025.js "<pasta DADOS ANTIGOS>" [--dry-run]');
    process.exit(1);
  }

  const files = fs.readdirSync(rootArg).filter(f => /\.xlsx$/i.test(f));
  let imported = 0, skipped = 0, failed = 0;
  const naoMapeadas = new Set();
  const env = dryRun ? null : loadEnv();

  for (const file of files.sort()) {
    const mesAbbr = file.slice(0, 3).toUpperCase();
    const anoMatch = file.match(/(\d{4})/);
    if (!MES_NUM[mesAbbr] || !anoMatch) {
      console.log(`ignorado (nome fora do padrão "MES AAAA.xlsx"): ${file}`);
      continue;
    }
    const ano = Number(anoMatch[1]);
    const mesNum = MES_NUM[mesAbbr];
    const periodoInicio = `${ano}-${pad2(mesNum)}-01`;
    const periodoFim = `${ano}-${pad2(mesNum)}-${pad2(ultimoDia(ano, mesNum))}`;

    const wb = XLSX.readFile(path.join(rootArg, file));
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true }).slice(1).filter(r => r && r[0]);

    for (const r of rows) {
      const nomeLegado = String(r[0]).trim();
      const lojaAtual = MAPEAMENTO[nomeLegado];
      if (!lojaAtual) { naoMapeadas.add(nomeLegado); continue; }

      const tickets = Number(r[5]) || 0;
      const pecas = Number(r[6]) || 0;
      const fatServ = Number(r[9]) || 0;
      const fatProd = Number(r[10]) || 0;
      const total = Number(r[11]) || 0;

      const relatorio = {
        loja: lojaAtual,
        consultor: 'Histórico 2025',
        periodo_inicio: periodoInicio,
        periodo_fim: periodoFim,
        total_faturado: total,
        total_taxa_adicional: 0,
        valor_anulado: 0,
        total_tickets: Math.round(tickets),
        total_volume: Math.round(pecas),
        arquivo_origem: `HISTORICO_2025_${mesAbbr}_${slug(lojaAtual)}.xlsx`,
        gerado_em: null,
        bandeira: brandFromLojaAtual(lojaAtual),
      };
      const itens = [
        { tipo: 'servico', categoria: 'Serviços (histórico 2025)', faturamento: fatServ, percentual: null, volume: null, percentual_volume: null, media_servico: null, tickets: null, media_ticket: null },
        { tipo: 'produto', categoria: 'Produtos (histórico 2025)', faturamento: fatProd, percentual: null, volume: null, percentual_volume: null, media_servico: null, tickets: null, media_ticket: null },
      ];

      if (dryRun) {
        console.log(`[seria importado] ${lojaAtual} · ${periodoInicio} → ${periodoFim} · R$ ${total.toFixed(2)} (arquivo_origem=${relatorio.arquivo_origem})`);
        imported++;
        continue;
      }
      try {
        const id = await salvar(env, relatorio, itens);
        console.log(`[importado] id=${id} ${lojaAtual} · ${periodoInicio} → ${periodoFim} · R$ ${total.toFixed(2)}`);
        imported++;
      } catch (e) {
        failed++;
        console.log(`ERRO ao salvar ${lojaAtual} (${file}): ${e.message}`);
      }
    }
  }

  console.log('');
  console.log(`Resumo: ${imported} ${dryRun ? 'seriam importados (dry-run, nada gravado)' : 'importados'}, ${failed} com erro.`);
  console.log(`Lojas do legado SEM mapeamento (não fazem parte do MAPEAMENTO, ignoradas de propósito): ${naoMapeadas.size} nomes distintos.`);
}

main().catch(e => {
  console.error('ERRO FATAL:', e.message);
  process.exit(1);
});
