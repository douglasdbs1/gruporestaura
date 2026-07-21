# Relatório "resumo" direto do sistema Presence — contexto

Registrado em 21/07/2026. Primeiro arquivo: `MARCELO/JULHO/ML teutonia 20.xlsx`.

## O que é

A partir de 21/07/2026 apareceu, na mesma pasta do Drive dos relatórios da
Ideologica (Allegro.Net), um arquivo `.xlsx` moderno — diferente de todos os
outros, que são `.xls` legado (BIFF/OLE2, ver README.md desta pasta). Esse
`.xlsx` vem direto do sistema **Presence** (não é o Allegro.Net/Ideologica de
sempre), exportado por um consultor (Marcelo) na mesma pasta e seguindo a
mesma convenção de nome de arquivo dos outros (`<Bandeira> <Loja> <corte>.xlsx`).

## O que o relatório da Presence traz

Por loja, uma linha por "Grupo" de serviço:

```
27 - TEUTÔNIA
  03 - LAVANDERIA          → 398 serviços · R$ 18.350,84
  04 - TINGIMENTO          →   4 serviços · R$    235,60
  07 - TAPETES E ESTOFADOS →  14 serviços · R$  1.663,86
  Total                    → 416 serviços · R$ 20.250,30
```

Colunas: Nome Loja, Grupo, Qtde Serviços, Total venda. Só isso — sem seção de
Produto, sem quebra por serviço/produto separado.

## O que falta comparado ao relatório da Ideologica/Allegro.Net

- **Tickets / ticket médio** — não existe contagem de ticket, só "quantidade
  de serviços" (não é a mesma coisa: um ticket pode ter vários serviços).
- **Período** — o arquivo não tem "Período de X até Y" nem "Geração: data"
  em lugar nenhum. `import_presence_report.js` exige período_inicio/fim como
  parâmetro na hora de importar (não tenta adivinhar pelo nome do arquivo,
  frágil demais sem confirmar com quem importou).
- **Produto** — só tem Serviço.
- **Percentual, %Volume, Taxa Adicional, Valor Anulado**.
- **Categorias diferentes**: "LAVANDERIA / TINGIMENTO / TAPETES E ESTOFADOS"
  (esse último nem existe na Ideologica); não separa "LAVANDERIA (QUILO/
  CESTO)" nem tem Costura/Couro/Sapataria.

## Decisão tomada (21/07/2026, a pedido do Douglas)

Misturar/somar mesmo assim no `faturamento_relatorios`/`faturamento_itens` —
o que interessa (principalmente peças de Tingimento captadas e faturamento
total) já está lá. Especificamente:

1. **Importado como relatório normal** via
   `ideologica/import/import_presence_report.js` (novo script, só pra esse
   formato — não mexe no `import_all.js`/`parse_report.js` do Allegro.Net).
   `total_tickets` e os `tickets`/`media_ticket` de cada item ficam `null`
   (viram `0` em `total_tickets` porque a coluna é `not null default 0` no
   schema — ver `ideologica/supabase/schema.sql`).
2. **A loja usa o mesmo nome derivado do arquivo** (`lojaFromArquivo`, igual
   ao pipeline do Allegro.Net) — não o rótulo de dentro da planilha
   ("27 - TEUTÔNIA") — pra cair no mesmo agrupamento dos outros cortes dessa
   loja no dashboard, em vez de virar uma loja "nova" separada.
3. **`.xlsx` é o sinal de "veio da Presence"** — não criei coluna nova no
   banco pra isso; toda a Ideologica sai em `.xls` legado, então checar a
   extensão do `arquivo_origem` já basta (`isPresenceReport()` em
   `dashboard.js`). Se um dia isso deixar de ser verdade (ex. a Ideologica
   também passar a exportar `.xlsx`), essa premissa quebra e precisa de uma
   coluna de verdade.
4. **Dashboard**: quando abre o detalhe de uma loja cujo corte mais recente
   veio da Presence, aparece um selo "Presence" ao lado do título (ver
   `isPresenceReport`/`lojaDetailHtml` em `dashboard.js`). Qualquer
   ticket/ticket médio que ficaria "R$ 0,00" (porque não tem dado, não
   porque é zero de verdade) mostra "—" — `fmtMoneyOrDash`/`fmtNumOrDash`
   em `dashboard.js` e `fmtNumOrDash` em `comparativo.js`.

## Limitação que fica (não resolvida agora)

O KPI agregado de "Ticket médio" no topo do dashboard (`kpi-ticket-medio`)
soma `total_faturado` e `total_tickets` de TODOS os relatórios filtrados —
uma loja vinda da Presence contribui faturamento real mas zero tickets, o
que sub-estima ligeiramente esse KPI global quando ela está no filtro. Não
mexi nisso porque é uma correção estatística mais sutil (não um "R$0,00"
óbvio) e o pedido foi especificamente sobre a tela de abrir a loja.

## Pra quando o relatório da Presence for ajustado/melhorado

Se um dia o sistema Presence passar a exportar com mais detalhe (ticket,
produto, período, etc.):

- **Recuperar o que já foi importado no formato reduzido**: dá pra achar
  esses relatórios no Supabase filtrando `arquivo_origem like '%.xlsx'` — se
  o relatório antigo (Allegro.Net) daquele mesmo corte ainda existir seria
  melhor usar ele como fonte de verdade; senão, reimportar via
  `import_presence_report.js` de novo assim que o formato novo tiver os
  campos que faltam (adaptar o parser pros campos novos).
- **Implementar de forma corretiva**: se o formato novo tiver as mesmas
  colunas do Allegro.Net só que em `.xlsx`, dá pra aposentar
  `import_presence_report.js` e escrever um parser `.xlsx` de verdade (usando
  a mesma extração de `sharedStrings.xml`/`sheet1.xml` já feita aqui, ou uma
  lib tipo `xlsx`/`exceljs` se valer a pena a dependência) que devolva os
  mesmos campos do `parseReport()` do Allegro — aí some a necessidade do
  selo "Presence" e do fallback de "—".

## Curiosidade que pode virar chave de cruzamento

O código "27" da loja no relatório da Presence bate com os 2 últimos dígitos
do número da loja já usado no Presence Control pra RS TEUTÔNIA (nº 2327).
Vale investigar se o sistema Presence usa esse código como ID interno de
loja — se sim, dá pra cruzar com mais confiança do que por nome/acento.
