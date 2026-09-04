// Robô do "Jornal de Mercado" — busca cotações e notícias direto (sem navegador, sem
// r.jina.ai) e grava dados/jornal.json. Roda sozinho, agendado pelo GitHub Actions
// (.github/workflows/atualizar.yml) — ver o LEIA-ME deste repositório para o passo a passo.
//
// Por que isto é mais confiável que o painel buscando ao vivo do navegador: aqui não existe
// bloqueio de CORS (isso é uma regra de navegador, não existe pra um script rodando em
// servidor) — então busca-se o RSS do Google Notícias e o site de cada matéria direto, sem
// precisar de nenhum "leitor" de terceiro (era o r.jina.ai que ficava sujeito ao limite
// anônimo compartilhado, documentado no LEIA-ME do painel, §24 e §33).
//
// Node 18+ (o runner do GitHub Actions já vem com Node 20). Sem dependências externas.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const ARQUIVO_SAIDA = new URL("../dados/jornal.json", import.meta.url);
const MAX_POR_CATEGORIA = 300;       // teto do arquivo histórico por categoria
const TENTAR_IMAGEM_NAS_PRIMEIRAS = 3; // só tenta buscar imagem real das N mais recentes de cada categoria — não vale a pena (nem é gentil com os sites) tentar em todas

const TICKERS = ["AURE3.SA", "NEE", "ENPH", "FSLR", "BEP", "CMIG4.SA"];

const CATEGORIAS = [
  { id: "gd", l: "Geração Distribuída", q: '"geração distribuída" energia solar' },
  { id: "tarifas", l: "Tarifas", q: "tarifa de energia elétrica OR bandeira tarifária" },
  { id: "regulacao", l: "Regulação", q: "ANEEL OR regulação setor elétrico OR resolução normativa energia" },
  { id: "mea", l: "Players & Mercado", q: "fusão aquisição energia solar OR M&A energia renovável OR transação usina solar" },
  { id: "tendencias", l: "Tendências", q: "tendências mercado de energia solar Brasil" }
];

function comTimeout(ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, limpar: () => clearTimeout(t) };
}

async function buscarTexto(url, ms = 12000) {
  const { signal, limpar } = comTimeout(ms);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA }, signal, redirect: "follow" });
    if (!r.ok) return null;
    return { texto: await r.text(), urlFinal: r.url };
  } catch (e) {
    return null;
  } finally {
    limpar();
  }
}

// --- entidades XML/HTML básicas (o RSS do Google usa &amp; &lt; &gt; &quot; &#39;) ---
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function desescapa(s) {
  if (!s || s.indexOf("&") < 0) return s || "";
  return s.replace(/&(amp|lt|gt|quot|apos|#x?[0-9a-fA-F]+);/g, (m, g) => {
    if (ENT[g] !== undefined) return ENT[g];
    return g[0] === "x" || g[0] === "X"
      ? String.fromCodePoint(parseInt(g.slice(1), 16))
      : String.fromCodePoint(parseInt(g.slice(1), 10));
  });
}

// --- RSS do Google Notícias: <item><title>H - Fonte</title><link>...</link>
//     <pubDate>...</pubDate><source url="...">Fonte</source></item> ---
function parseRss(xml) {
  const itens = [];
  const blocos = xml.split("<item>").slice(1);
  for (const bloco of blocos) {
    const corpo = bloco.split("</item>")[0];
    const titulo = /<title>([\s\S]*?)<\/title>/.exec(corpo);
    const link = /<link>([\s\S]*?)<\/link>/.exec(corpo);
    const pubDate = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(corpo);
    const source = /<source[^>]*>([\s\S]*?)<\/source>/.exec(corpo);
    if (!titulo || !link) continue;
    let tituloTxt = desescapa(titulo[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim());
    let fonte = source ? desescapa(source[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim()) : "";
    if (!fonte) {
      // nem todo item tem <source> preenchido — cai pro mesmo truque do painel: o
      // título do Google Notícias sempre termina em " - Fonte"
      const corte = tituloTxt.lastIndexOf(" - ");
      if (corte > 0) { fonte = tituloTxt.slice(corte + 3); tituloTxt = tituloTxt.slice(0, corte); }
    }
    itens.push({
      titulo: tituloTxt,
      link: desescapa(link[1].trim()),
      fonte,
      data: pubDate ? new Date(pubDate[1].trim()).toISOString() : null
    });
  }
  return itens;
}

async function buscarCategoria(cat) {
  const url = "https://news.google.com/rss/search?q=" + encodeURIComponent(cat.q) + "&hl=pt-BR&gl=BR&ceid=BR:pt-BR";
  const resp = await buscarTexto(url);
  if (!resp) { console.log(`  [${cat.id}] falhou ao buscar RSS`); return []; }
  const itens = parseRss(resp.texto).map(n => ({ ...n, catId: cat.id, catLabel: cat.l }));
  console.log(`  [${cat.id}] ${itens.length} itens no RSS`);
  return itens;
}

// --- imagem real: segue o link do Google até a matéria de verdade e lê og:image ---
async function resolverImagem(linkGoogle) {
  const resp = await buscarTexto(linkGoogle, 8000);
  if (!resp) return null;
  if (resp.urlFinal.includes("news.google.com")) return null; // não conseguiu sair do Google
  const html = resp.texto;
  const m =
    /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i.exec(html) ||
    /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["']/i.exec(html) ||
    /<meta[^>]+name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i.exec(html);
  return m ? desescapa(m[1]) : null;
}

async function buscarCotacao(sym) {
  const resp = await buscarTexto(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}`, 8000);
  if (!resp) return null;
  try {
    const j = JSON.parse(resp.texto);
    const m = j?.chart?.result?.[0]?.meta;
    if (!m || m.regularMarketPrice == null) return null;
    return { preco: m.regularMarketPrice, pct: m.regularMarketChangePercent, moeda: m.currency };
  } catch (e) { return null; }
}

// --- arquivo histórico: junta o que já existia com o que chegou agora, sem duplicar ---
function mesclar(existentes, novos) {
  const vistos = new Map();
  for (const n of [...novos, ...existentes]) {
    const chave = n.titulo.toLowerCase().trim();
    if (!vistos.has(chave)) vistos.set(chave, n);
  }
  return [...vistos.values()]
    .sort((a, b) => new Date(b.data || 0) - new Date(a.data || 0))
    .slice(0, MAX_POR_CATEGORIA);
}

async function main() {
  let anterior = { categorias: {} };
  if (existsSync(ARQUIVO_SAIDA)) {
    try { anterior = JSON.parse(await readFile(ARQUIVO_SAIDA, "utf8")); } catch (e) { /* arquivo novo ou corrompido — começa do zero */ }
  }

  console.log("Buscando cotações...");
  const cotacoes = {};
  for (const sym of TICKERS) {
    cotacoes[sym] = await buscarCotacao(sym);
    console.log(`  ${sym}: ${cotacoes[sym] ? "ok" : "falhou"}`);
  }

  console.log("Buscando notícias por categoria...");
  const categorias = {};
  for (const cat of CATEGORIAS) {
    const frescos = await buscarCategoria(cat);
    // imagem real só nas mais recentes — ver TENTAR_IMAGEM_NAS_PRIMEIRAS no topo
    for (let i = 0; i < Math.min(TENTAR_IMAGEM_NAS_PRIMEIRAS, frescos.length); i++) {
      frescos[i].imagem = await resolverImagem(frescos[i].link);
    }
    categorias[cat.id] = mesclar(anterior.categorias?.[cat.id] || [], frescos);
    console.log(`  [${cat.id}] ${categorias[cat.id].length} no arquivo depois de mesclar`);
  }

  const saida = { geradoEm: new Date().toISOString(), cotacoes, categorias };
  await mkdir(new URL("../dados/", import.meta.url), { recursive: true });
  await writeFile(ARQUIVO_SAIDA, JSON.stringify(saida, null, 1), "utf8");
  console.log("Gravado dados/jornal.json");
}

main().catch(err => { console.error(err); process.exit(1); });
