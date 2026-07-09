# Faturamento — Ideologica

Dashboard de faturamento das lojas em transição do sistema Ideologica (Allegro.Net) para o Presence.

O projeto é uma aplicação web estática (HTML, CSS e JS puro, sem build), publicada dentro do mesmo repositório e do mesmo GitHub Pages do `presence-control`, em `/ideologica/`. Os dados vêm do mesmo projeto Supabase do presence-control, numa tabela própria.

## Link

`https://douglasdbs1.github.io/presence-control/ideologica/`

## Fluxo de dados

1. **Exportação**: cada consultor exporta do Ideologica/Allegro.Net o relatório "Demonstrativo de Faturamento" (`.xls`) de cada loja sob sua responsabilidade, nos ciclos de faturamento (dias 1, 2, 15 e 16 de cada mês).
2. **Upload**: o consultor sobe os arquivos na própria pasta do Google Drive (`Faturamento/<Nome do Consultor>/`). O nome da subpasta é o que identifica o consultor — o arquivo em si só tem o nome da loja.
3. **Rotina agendada (Claude)**: uma rotina na nuvem (cron nos dias 1, 2, 15, 16) lê os arquivos novos via conector do Google Drive, extrai os dados de cada `.xls` e grava no Supabase (tabelas `faturamento_relatorios` e `faturamento_itens`) usando a `service_role` key — essa chave nunca aparece no site.
4. **Dashboard**: este site lê os dados com a `anon key` pública (só leitura) e permite filtrar por loja, consultor e período.

## Estrutura do relatório `.xls` (Ideologica/Allegro.Net)

Cada arquivo é uma loja + um período, com duas tabelas internas:

- **Por Serviço**: Costura, Couro, Lavanderia, Tingimento etc. — faturamento, %, volume, tickets, médias.
- **Por Produto**: marca/origem da peça (ex. Bella Luna, Restaura Jeans, Supre) — mesmas colunas.
- **Totais**: faturamento final, taxa adicional, valor anulado no período.

O nome da loja e o período vêm escritos dentro do próprio arquivo (linhas de cabeçalho), não dependem do nome do arquivo.

## Arquivos principais

- `index.html`: dashboard (filtros, KPIs, ranking por consultor/loja, tabela detalhada).
- `js/config.js`: config do Supabase (mesma URL do presence-control, anon key pública).
- `js/dashboard.js`: busca os dados, aplica filtros e renderiza.
- `css/style.css`: visual consistente com o presence-control.
- `supabase/schema.sql`: tabelas, índices e políticas de RLS. Cole no SQL Editor do Supabase para criar.

## O que falta para colocar no ar

1. Rodar `supabase/schema.sql` no SQL Editor do Supabase (mesmo projeto do presence-control).
2. Criar a estrutura de pastas no Google Drive (`Faturamento/<Consultor>/`) e compartilhar com cada consultor.
3. Configurar a rotina agendada (`/schedule`) — conector do Google Drive, `service_role` key do Supabase, cron `0 11 1,2,15,16 * *` (11h UTC = 8h em América/São_Paulo), prompt de extração e upsert.
4. Commitar e dar push nesta pasta para o repositório `presence-control` — como o Pages já serve o repo inteiro, não precisa de nenhuma configuração nova.

## Cuidados

- A `service_role` key do Supabase é bem mais poderosa que a `anon key` — ela só deve existir na configuração da rotina agendada (nunca em HTML/JS público).
- Reimportações do mesmo arquivo (loja + período) devem sobrescrever o relatório existente (upsert), não duplicar — ver comentário no final de `supabase/schema.sql`.
