# Publicacao no Cloudflare Pages

O pacote publicado e gerado em `dist-cloudflare/`. Ele contem apenas os arquivos
necessarios para executar o Hall, Presence e Ideologica. Scripts de importacao,
SQL, backups, documentacao interna e metadados do Git nao entram no deploy.

## Gerar e validar o pacote

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-cloudflare.ps1
```

## Primeiro deploy

Depois de autenticar a maquina com `npx wrangler login`:

```powershell
npx wrangler pages project create gruporestaura
npx wrangler pages deploy .\dist-cloudflare --project-name gruporestaura --branch main
```

Deploys seguintes usam somente o segundo comando. A ultima versao publicada
continua servida se um deploy novo falhar.

## Protecao de acesso

No painel Cloudflare Zero Trust, criar uma aplicacao Access do tipo
`Self-hosted` para o hostname do sistema. A politica deve permitir apenas os
e-mails corporativos autorizados. Nao tornar o endereco `pages.dev` publico
depois que o dominio protegido estiver validado.

O login local atual continua sendo apenas uma conveniencia de interface. A
etapa seguinte e substitui-lo por Supabase Auth e politicas RLS, removendo as
senhas e o token administrativo dos arquivos enviados ao navegador.
