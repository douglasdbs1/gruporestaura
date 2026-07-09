-- Faturamento (Ideologica/Allegro.Net) — schema inicial
-- Cole tudo no SQL Editor do Supabase (mesmo projeto do presence-control) e execute.
--
-- Fluxo de dados:
--   1. Consultores exportam o "Demonstrativo de Faturamento" (.xls) do Ideologica/Allegro.Net
--      para a pasta do Drive do respectivo consultor (Faturamento/<Nome do Consultor>/).
--   2. Uma rotina agendada (Claude, cron nos dias 1, 2, 15 e 16 de cada mês) lê os arquivos
--      novos, extrai os dados e grava aqui usando a service_role key (nunca exposta no site).
--   3. O dashboard (ideologica/index.html) só lê, com a anon key pública, filtrando e
--      agregando por loja, consultor e período.

-- 1. Um relatório = uma loja + um período (um arquivo .xls exportado)
create table if not exists faturamento_relatorios (
  id bigint generated always as identity primary key,
  loja text not null,
  consultor text,
  periodo_inicio date not null,
  periodo_fim date not null,
  total_faturado numeric not null default 0,
  total_taxa_adicional numeric not null default 0,
  valor_anulado numeric not null default 0,
  total_tickets int not null default 0,
  total_volume int not null default 0,
  arquivo_origem text,
  gerado_em timestamptz,
  importado_em timestamptz not null default now(),
  unique (loja, periodo_inicio, periodo_fim)
);

create index if not exists idx_fr_loja on faturamento_relatorios (loja);
create index if not exists idx_fr_consultor on faturamento_relatorios (consultor);
create index if not exists idx_fr_periodo on faturamento_relatorios (periodo_inicio, periodo_fim);

-- 2. Itens de cada relatório: uma linha por categoria, nas duas tabelas do .xls
--    (Serviço: Costura, Lavanderia, Tingimento... / Produto: marca/origem da peça)
create table if not exists faturamento_itens (
  id bigint generated always as identity primary key,
  relatorio_id bigint not null references faturamento_relatorios(id) on delete cascade,
  tipo text not null check (tipo in ('servico','produto')),
  categoria text not null,
  faturamento numeric not null default 0,
  percentual numeric,
  volume int,
  percentual_volume numeric,
  media_servico numeric,
  tickets int,
  media_ticket numeric
);

create index if not exists idx_fi_relatorio on faturamento_itens (relatorio_id);
create index if not exists idx_fi_tipo_categoria on faturamento_itens (tipo, categoria);

-- 3. RLS: leitura pública (o dashboard usa a anon key), escrita só via service_role
--    (a rotina agendada usa a service_role key, que ignora RLS — por isso não existe
--    policy de insert/update aqui, igual não existia RPC de leitura no presence_control).
alter table faturamento_relatorios enable row level security;
alter table faturamento_itens enable row level security;

drop policy if exists "faturamento_relatorios leitura publica" on faturamento_relatorios;
create policy "faturamento_relatorios leitura publica"
  on faturamento_relatorios for select
  using (true);

drop policy if exists "faturamento_itens leitura publica" on faturamento_itens;
create policy "faturamento_itens leitura publica"
  on faturamento_itens for select
  using (true);

-- ────────────────────────────────────────────────────────────────
-- COMO A ROTINA DEVE GRAVAR (upsert por loja+período):
--
--   insert into faturamento_relatorios
--     (loja, consultor, periodo_inicio, periodo_fim, total_faturado,
--      total_taxa_adicional, valor_anulado, total_tickets, total_volume,
--      arquivo_origem, gerado_em)
--   values (...)
--   on conflict (loja, periodo_inicio, periodo_fim)
--   do update set
--     consultor = excluded.consultor,
--     total_faturado = excluded.total_faturado,
--     total_taxa_adicional = excluded.total_taxa_adicional,
--     valor_anulado = excluded.valor_anulado,
--     total_tickets = excluded.total_tickets,
--     total_volume = excluded.total_volume,
--     arquivo_origem = excluded.arquivo_origem,
--     gerado_em = excluded.gerado_em,
--     importado_em = now()
--   returning id;
--
--   -- Depois, para reimportação idempotente, apagar os itens antigos e reinserir:
--   delete from faturamento_itens where relatorio_id = :id;
--   insert into faturamento_itens (relatorio_id, tipo, categoria, faturamento, percentual,
--     volume, percentual_volume, media_servico, tickets, media_ticket) values (...);
-- ────────────────────────────────────────────────────────────────
