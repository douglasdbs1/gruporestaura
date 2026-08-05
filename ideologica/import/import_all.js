#!/usr/bin/env node
// Varre a pasta inteira sincronizada do Drive (IDEOLÓGICA SISTEMA/<Consultor>/
// <Mês>/*.xls) e importa só o que ainda não está no Supabase. Essencial pra
// escalar: com 100+ lojas, rodar "node import.js" arquivo por arquivo não é
// viável — isso aqui vira "roda um comando, importa só o que é novo".
//
// Uso:
//   node import_all.js "<caminho da pasta IDEOLÓGICA SISTEMA>" [--dry-run] [--force]
//
// Ex.: node import_all.js "G:\Meu Drive\IDEOLÓGICA SISTEMA"
//
// --dry-run  não grava nada, só mostra o que seria importado.
// --force    reimporta mesmo os que já existem (loja+período já visto) —
//            útil se um arquivo antigo foi corrigido/re-exportado com o
//            mesmo período.
//
// Credenciais vem de ideologica/.env (gitignored) — nunca hardcoded aqui,
// porque este arquivo (diferente de .env) é commitado no repo público.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseReport } = require('./parse_report');
const { canonicalGroupKey } = require('../js/loja-location');
const knownIssues = require('./known_issues.json');

// Lembretes de problemas já diagnosticados (ver known_issues.json) — evita
// repetir a investigação toda vez que o arquivo continuar dando erro, e some
// sozinho quando o arquivo for corrigido (o erro deixa de acontecer).
function knownIssueNote(arquivoOrigem) {
  const issue = knownIssues.find(k => k.arquivo.toLowerCase() === arquivoOrigem.toLowerCase());
  if (!issue) return null;
  const hoje = new Date().toISOString().slice(0, 10);
  if (issue.mostrarApartirDe && hoje < issue.mostrarApartirDe) return null;
  return issue.nota;
}

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error(`Não achei ${envPath}. Crie o arquivo com SUPABASE_URL, SUPABASE_ANON_KEY e FATURAMENTO_RPC_TOKEN (ver ideologica/README.md).`);
  }
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2];
  }
  for (const key of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'FATURAMENTO_RPC_TOKEN']) {
    if (!env[key]) throw new Error(`${key} ausente em ideologica/.env`);
  }
  return env;
}

function titleCase(s) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// Estrutura esperada: <root>/<Consultor>/<Mês>/*.xls (ou .xlsx por engano —
// o parser não entende esse formato, mas agora reporta em vez de sumir
// silenciosamente — ver ignoredXlsx e o caso real "Mega campinas JD
// Aurélia 31.xlsx", que ficou invisível várias checagens até alguém notar
// que faltava o corte 31 dessa loja).
// Pastas da raiz que NÃO são de consultor. Hoje elas já escapariam por não
// terem o nível de mês dentro, mas basta alguém criar uma subpasta pra um
// relatório errado voltar a ser importado — a exclusão explícita evita isso.
const PASTAS_FORA = ['ARQUIVOS ERRADOS', 'DADOS ANTIGOS', 'SISTEMA'];
function findXlsFiles(root) {
  const out = []; // {filePath, consultor}
  const ignoredXlsx = []; // {filePath, consultor} — .xlsx encontrado, não importado
  for (const consultorEntry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!consultorEntry.isDirectory()) continue;
    if (PASTAS_FORA.includes(consultorEntry.name.toUpperCase())) continue;
    const consultor = titleCase(consultorEntry.name);
    const consultorPath = path.join(root, consultorEntry.name);
    for (const mesEntry of fs.readdirSync(consultorPath, { withFileTypes: true })) {
      if (!mesEntry.isDirectory()) continue;
      const mesPath = path.join(consultorPath, mesEntry.name);
      for (const fileEntry of fs.readdirSync(mesPath, { withFileTypes: true })) {
        if (!fileEntry.isFile()) continue;
        if (/\.xls$/i.test(fileEntry.name)) {
          out.push({ filePath: path.join(mesPath, fileEntry.name), consultor });
        } else if (/\.xlsx$/i.test(fileEntry.name)) {
          ignoredXlsx.push({ filePath: path.join(mesPath, fileEntry.name), consultor });
        }
      }
    }
  }
  return { files: out, ignoredXlsx };
}

// O dashboard identifica a loja pelo NOME DO ARQUIVO (lojaFromArquivo), não
// pelo "Loja:" de dentro do relatório. Então dois cortes da mesma loja com
// grafias diferentes no nome do arquivo ("RJ Portao 15 julho.xls" x "RJ
// Portao 31.xls") viram DUAS lojas — e como cada corte é acumulado desde o
// dia 1, o mês inteiro passa a ser contado em dobro (o corte 15 soma junto
// com o 31, que já inclui o 15). Aconteceu de verdade com Portão e Francisco
// Beltrão em julho/2026: +285 peças de tingimento fantasma só no Glávio,
// e ninguém percebeu até um consultor estranhar o número.
//
// Usar o "Loja:" interno como chave parece a saída óbvia (não depende do
// nome do arquivo), mas ele vem truncado por largura fixa do Crystal
// Reports e o corte é curto demais pra identificar: "MINHA LAVANDERIA  CA"
// casa igual com Caçador, Campinas e Caxias. Por isso a checagem compara os
// NOMES DERIVADOS DOS ARQUIVOS entre si e só reclama quando o dashboard
// realmente vai separá-los (canonicalGroupKey diferente) — grafias que já
// caem na mesma chave não são problema e não viram ruído.
function lojaInternaKey(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}
function tokensNome(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}
function distanciaEdicao(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}
// Palavra que só existe no nome do arquivo por causa de como o consultor
// salvou (corte, mês, cópia do Drive) — não faz parte do nome da loja.
const MESES_ARQ = ['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
function ruidoDeNome(t) {
  return /^\d+$/.test(t) || MESES_ARQ.includes(t) || ['b64','copia','final','novo','v2'].includes(t);
}
function provavelMesmaLoja(lojaA, lojaB) {
  const ta = tokensNome(lojaA), tb = tokensNome(lojaB);
  if (!ta.length || !tb.length) return false;
  const [menor, maior] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  // "RJ Portao" x "RJ Portao 15 julho", "ML CAXIAS" x "ML CAXIAS 31 (1)":
  // um é prefixo do outro E o que sobra é só corte/mês/cópia. Se o que sobra
  // for uma palavra de verdade são lojas IRMÃS, não a mesma ("ML Recife" x
  // "ML Recife Madalena", "RJ Passo Fundo" x "RJ Passo Fundo Centro").
  if (menor.every((t, i) => t === maior[i])) {
    return maior.slice(menor.length).every(ruidoDeNome);
  }
  // "Mega Franscisco Beltrao" x "Mega Francisco Beltrao" (erro de digitação),
  // "RJ CAXIAS SAO PELEGRINO" x "RJ Caxias S. Pelegrino" (abreviação). O
  // limite relativo evita casar loja curta e parecida mas diferente de
  // verdade — "RJ Penha" x "RJ AZENHA" é 1 letra em 9 (11%), enquanto
  // "franscisco" x "francisco" é 1 em 23 (4%).
  if (ta.length === tb.length) {
    const sa = ta.join(' '), sb = tb.join(' ');
    const d = distanciaEdicao(sa, sb);
    return d > 0 && d <= 3 && d / Math.max(sa.length, sb.length) <= 0.10;
  }
  return false;
}

function reportContentKey(relatorio, itens) {
  const normalizedItems = (itens || []).map(item => [
    item.tipo, item.categoria, Number(item.faturamento || 0),
    Number(item.percentual || 0), Number(item.volume || 0),
    Number(item.percentual_volume || 0), Number(item.media_servico || 0),
    Number(item.tickets || 0), Number(item.media_ticket || 0),
  ]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return JSON.stringify([
    relatorio.consultor, relatorio.periodo_inicio, relatorio.periodo_fim,
    Number(relatorio.total_faturado || 0), Number(relatorio.total_taxa_adicional || 0),
    Number(relatorio.valor_anulado || 0), Number(relatorio.total_tickets || 0),
    Number(relatorio.total_volume || 0), normalizedItems,
  ]);
}

async function fetchExistingKeys(env) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/faturamento_relatorios?select=loja,consultor,periodo_inicio,periodo_fim,total_faturado,total_taxa_adicional,valor_anulado,total_tickets,total_volume,arquivo_origem,itens:faturamento_itens(tipo,categoria,faturamento,percentual,volume,percentual_volume,media_servico,tickets,media_ticket)`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` },
  });
  if (!res.ok) throw new Error(`Falha ao buscar relatórios existentes (${res.status}): ${await res.text()}`);
  const rows = await res.json();
  return {
    byLoja: new Set(rows.map(r => `${r.loja}|||${r.periodo_inicio}|||${r.periodo_fim}`)),
    byArquivo: new Set(rows.filter(r => r.arquivo_origem).map(r => `${r.arquivo_origem}|||${r.periodo_inicio}|||${r.periodo_fim}`)),
    byContent: new Set(rows.map(r => reportContentKey(r, r.itens))),
  };
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
  const force = rest.includes('--force');

  if (!rootArg) {
    console.error('Uso: node import_all.js "<caminho da pasta IDEOLÓGICA SISTEMA>" [--dry-run] [--force]');
    process.exit(1);
  }
  if (!fs.existsSync(rootArg)) {
    throw new Error(`Pasta não encontrada: ${rootArg}`);
  }

  const env = loadEnv();
  const existing = force ? { byLoja: new Set(), byArquivo: new Set(), byContent: new Set() } : await fetchExistingKeys(env);
  const { files, ignoredXlsx } = findXlsFiles(rootArg);

  console.log(`${files.length} arquivo(s) .xls encontrado(s) em ${files.length ? new Set(files.map(f=>f.consultor)).size : 0} pasta(s) de consultor.`);

  let imported = 0, skipped = 0, failed = 0;
  const problems = [];
  const identidades = []; // {arquivoOrigem, consultor, loja, lojaInterna, mes} — p/ checar duplicidade de identidade no fim
  for (const f of ignoredXlsx) {
    problems.push(`aviso "${path.basename(f.filePath)}" (${f.consultor}): é .xlsx (formato moderno), não .xls — o parser não lê esse formato. Confira se não é um corte novo perdido e peça pra reexportar como .xls do Allegro.Net.`);
  }
  // Um mesmo relatório salvo com nomes de lojas diferentes duplica todas as
  // somas. Detecta pelo conteúdo bruto antes de confiar no nome do arquivo.
  const filesByHash = new Map();
  for (const file of files) {
    const hash = crypto.createHash('sha256').update(fs.readFileSync(file.filePath)).digest('hex');
    if (!filesByHash.has(hash)) filesByHash.set(hash, []);
    filesByHash.get(hash).push(file);
  }
  const duplicatePaths = new Set();
  for (const group of filesByHash.values()) {
    if (group.length < 2) continue;
    group.forEach(file => duplicatePaths.add(file.filePath));
    failed += group.length;
    problems.push(`ERRO DE DUPLICIDADE: arquivos com conteúdo idêntico bloqueados: ${group.map(file=>`"${path.basename(file.filePath)}"`).join(' e ')}.`);
  }

  for (const { filePath, consultor } of files) {
    if (duplicatePaths.has(filePath)) continue;
    const arquivoOrigem = path.basename(filePath);
    let relatorio, itens, warnings;
    try {
      const buf = fs.readFileSync(filePath);
      ({ relatorio, itens, warnings } = parseReport(buf, consultor, arquivoOrigem));
    } catch (e) {
      failed++;
      const nota = knownIssueNote(arquivoOrigem);
      problems.push(`ERRO ao ler "${arquivoOrigem}" (${consultor}): ${e.message}` + (nota ? ` — LEMBRETE: ${nota}` : ''));
      continue;
    }

    if (!relatorio.loja || !relatorio.periodo_inicio || !relatorio.periodo_fim) {
      failed++;
      problems.push(`ERRO "${arquivoOrigem}" (${consultor}): loja/período não identificados.`);
      continue;
    }
    if (!relatorio.bandeira) {
      problems.push(`aviso "${arquivoOrigem}": nome não começa com RJ/ML/MEGA — bandeira ficará em branco.`);
    }
    for (const w of warnings) problems.push(`aviso "${arquivoOrigem}": ${w}`);
    identidades.push({ arquivoOrigem, consultor, loja: relatorio.loja, lojaInterna: relatorio.loja_interna, mes: relatorio.periodo_inicio.slice(0, 7) });

    const key = `${relatorio.loja}|||${relatorio.periodo_inicio}|||${relatorio.periodo_fim}`;
    const internalKey = `${relatorio.loja_interna}|||${relatorio.periodo_inicio}|||${relatorio.periodo_fim}`;
    const arquivoKey = `${relatorio.arquivo_origem}|||${relatorio.periodo_inicio}|||${relatorio.periodo_fim}`;
    if (existing.byLoja.has(key) || existing.byLoja.has(internalKey) || existing.byArquivo.has(arquivoKey)) {
      skipped++;
      continue;
    }
    if (existing.byContent.has(reportContentKey(relatorio, itens))) {
      failed++;
      problems.push(`ERRO DE DUPLICIDADE "${arquivoOrigem}": conteúdo já existe no Supabase ligado a outro nome de loja/arquivo.`);
      continue;
    }

    if (dryRun) {
      console.log(`[novo] ${relatorio.loja} · ${relatorio.consultor} · ${relatorio.periodo_inicio} → ${relatorio.periodo_fim} · ${arquivoOrigem}`);
      imported++;
      continue;
    }

    try {
      const id = await salvar(env, relatorio, itens);
      console.log(`[importado] id=${id} ${relatorio.loja} · ${relatorio.consultor} · ${relatorio.periodo_inicio} → ${relatorio.periodo_fim}`);
      imported++;
    } catch (e) {
      failed++;
      problems.push(`ERRO ao salvar "${arquivoOrigem}" (${relatorio.loja}): ${e.message}`);
    }
  }

  // Duplicidade de IDENTIDADE (≠ duplicidade de conteúdo, checada lá em cima):
  // dois arquivos do mesmo mês que são a mesma loja, mas com nomes que o
  // dashboard vai ler como lojas diferentes — o que faz o mês contar em dobro.
  const porChave = new Map(); // canonicalGroupKey -> {loja, mes, arquivos[]}
  for (const it of identidades) {
    const k = it.mes + '||' + canonicalGroupKey(it.loja);
    if (!porChave.has(k)) porChave.set(k, { loja: it.loja, mes: it.mes, consultor: it.consultor, arquivos: [] });
    porChave.get(k).arquivos.push(it.arquivoOrigem);
  }
  const grupos = [...porChave.values()];
  const jaAvisado = new Set();
  for (let i = 0; i < grupos.length; i++) {
    for (let j = i + 1; j < grupos.length; j++) {
      const a = grupos[i], b = grupos[j];
      if (a.mes !== b.mes) continue;
      // "RJ MOINHOS" x "RJ Poa Moinhos" (palavra enfiada no meio) escapa da
      // comparação por nome, mas os dois trazem o MESMO "Loja:" interno —
      // igualdade exata do nome interno é prova suficiente de que é a mesma
      // loja. Só vale pra igualdade exata: nome truncado ("MINHA LAVANDERIA
      // JO") é curto demais pra servir de identidade (ver comentário acima).
      const internaIgual = a.lojaInterna && b.lojaInterna
        && lojaInternaKey(a.lojaInterna) === lojaInternaKey(b.lojaInterna);
      if (!internaIgual && !provavelMesmaLoja(a.loja, b.loja)) continue;
      const par = [a.loja, b.loja].sort().join('||') + a.mes;
      if (jaAvisado.has(par)) continue;
      jaAvisado.add(par);
      problems.push(`ATENÇÃO DUPLICIDADE DE LOJA (${a.consultor}, ${a.mes}): "${a.loja}" (${a.arquivos.join(', ')}) e "${b.loja}" (${b.arquivos.join(', ')}) parecem ser a MESMA loja, mas o dashboard vai contar como duas. Cada corte é acumulado desde o dia 1, então o mês inteiro conta em DOBRO. Renomeie os arquivos no Drive pro mesmo padrão, ou me peça pra cadastrar o apelido em ideologica/js/loja-location.js.`);
    }
  }

  console.log('');
  console.log(`Resumo: ${imported} novo(s) ${dryRun ? '(dry-run, nada gravado)' : 'importado(s)'}, ${skipped} já existente(s) (ignorado(s)), ${failed} com erro.`);
  if (problems.length) {
    console.log('');
    console.log('Avisos/erros:');
    for (const p of problems) console.log('  ' + p);
  }
}

main().catch(e => {
  console.error('ERRO FATAL:', e.message);
  process.exit(1);
});
