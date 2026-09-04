# Robô do Jornal de Mercado

Este é um robô simples e gratuito que roda sozinho duas vezes por dia, busca as notícias e
cotações do Jornal de Mercado do painel, e deixa tudo salvo num arquivo (`dados/jornal.json`)
que o painel principal (`Dashboard Locacao UFVs - ATUALIZAVEL.html`) vai ler.

Isso resolve três problemas de uma vez:
- **Atualiza sozinho**, todo dia às 6h e às 18h (horário de Brasília), sem ninguém precisar abrir nada.
- **Fica igual pra todo mundo** que abrir o painel — não é mais um arquivo "local" de cada computador.
- **Fica com imagem de verdade** nas notícias mais recentes de cada categoria, e guarda um
  **histórico** (não desaparece quando fecha o navegador).

Não custa nada e não precisa saber programar — só seguir os passos abaixo uma vez.

## Passo a passo (fazer uma única vez)

### 1. Criar o repositório no GitHub

1. Entre em [github.com/new](https://github.com/new) já logado na sua conta.
2. Nome do repositório: `jornal-de-mercado-cemig` (pode ser outro nome, só anote).
3. Deixe marcado **Public**.
4. Não marque nenhuma das opções de "Initialize this repository with..." (sem README, sem
   .gitignore, sem license) — os arquivos já vêm prontos desta pasta.
5. Clique em **Create repository**.

### 2. Subir os arquivos desta pasta pro repositório

A forma mais simples, sem instalar nada: na página do repositório recém-criado, clique em
**"uploading an existing file"** e arraste todo o conteúdo desta pasta (`robo-jornal-mercado/`),
mantendo a estrutura de subpastas (`.github/workflows/atualizar.yml` e
`scripts/atualizar_jornal.mjs`). O GitHub preserva as subpastas automaticamente ao arrastar.

Se preferir usar Git pela linha de comando (só se você já tiver Git instalado):
```bash
cd robo-jornal-mercado
git init
git add .
git commit -m "Robo do jornal de mercado"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/jornal-de-mercado-cemig.git
git push -u origin main
```

### 3. Rodar pela primeira vez

1. Na página do repositório, vá na aba **Actions**.
2. Se aparecer um aviso pedindo pra habilitar Actions, clique para habilitar.
3. Clique no workflow **"Atualizar Jornal de Mercado"** na lista à esquerda.
4. Clique no botão **"Run workflow"** (do lado direito) e depois de novo em **"Run workflow"**
   na caixinha que abrir.
5. Espere uns 1-2 minutos e atualize a página — deve aparecer um ✅ verde. Se aparecer um ❌
   vermelho, clique nele para ver o log e me mande o erro.
6. Depois de rodar com sucesso, confira se apareceu o arquivo `dados/jornal.json` no
   repositório (aba **Code**).

A partir daqui, ele roda sozinho todo dia às 6h e às 18h (horário de Brasília) — sem precisar
fazer mais nada. Você também pode repetir o passo 3 a qualquer momento pra forçar uma
atualização na hora.

### 4. Me avisar a URL para eu ligar ao painel

Depois que o `dados/jornal.json` aparecer no repositório, me manda o link dele — algo como:

```
https://github.com/SEU-USUARIO/jornal-de-mercado-cemig/blob/main/dados/jornal.json
```

Eu transformo isso na URL "crua" (`raw.githubusercontent.com`) e atualizo o painel para
carregar o Jornal de Mercado a partir daí, automaticamente, igual para todo mundo que abrir o
arquivo.

## O que tem em cada arquivo

- `scripts/atualizar_jornal.mjs` — o script que busca as notícias (Google Notícias, por
  categoria) e cotações (Yahoo Finance), tenta pegar uma imagem de verdade das notícias mais
  recentes, e junta tudo com o que já existia no arquivo (sem duplicar, sem perder histórico).
- `.github/workflows/atualizar.yml` — a "receita" que diz ao GitHub para rodar o script todo
  dia às 6h e às 18h e salvar o resultado automaticamente.
- `dados/jornal.json` — onde o resultado fica salvo. É criado/atualizado sozinho a cada
  execução — você não precisa mexer nele.
