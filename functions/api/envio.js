// Sem Nuvem · recebe registros dos leitores (preço, medição, setup) e abre uma sugestão pública no GitHub.
// Nada vai direto para o site: a conferência semanal decide o que publicar.
// Variáveis no Cloudflare Pages: GITHUB_TOKEN (secreta; token com permissão só de Issues neste repositório),
// GITHUB_REPO (opcional, padrão Dinodied28/Camadas).
const TIPOS = { avistamentos: 'Preço', medicoes: 'Medição', setups: 'Setup' };
const LIMITE = 4000;

function resposta(status, corpo) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

export function montarIssue(tipo, item) {
  const nome = String(item.nome || item.maqNome || item.maq || '').replace(/[\r\n]+/g, ' ').slice(0, 60);
  // crases viram ` para que o texto do leitor não feche o bloco de código (e não vire menção ou link)
  const dados = JSON.stringify(item, null, 2).replace(/`/g, '\\u0060');
  return {
    title: `[Registro] ${TIPOS[tipo]}${nome ? ': ' + nome : ''}`,
    body: `### Tipo\n\n${tipo}\n\n### Dados\n\n\`\`\`json\n${dados}\n\`\`\`\n\n### Comentário (opcional)\n\n_Enviado pelo formulário do site, sem conta no GitHub._`,
    labels: ['registro'],
  };
}

export async function onRequestPost({ request, env }) {
  const origem = request.headers.get('Origin');
  if (origem && new URL(origem).host !== new URL(request.url).host) return resposta(403, { erro: 'origem' });
  const texto = await request.text();
  if (texto.length > LIMITE * 2) return resposta(413, { erro: 'grande' });
  let corpo;
  try { corpo = JSON.parse(texto); } catch { return resposta(400, { erro: 'formato' }); }
  if (!corpo || typeof corpo !== 'object') return resposta(400, { erro: 'formato' });
  if (corpo.hp) return resposta(201, { ok: true }); // campo invisível preenchido: robô
  const tipo = String(corpo.tipo || '');
  const item = corpo.item;
  if (!TIPOS[tipo]) return resposta(400, { erro: 'tipo' });
  if (!item || typeof item !== 'object' || Array.isArray(item)) return resposta(400, { erro: 'item' });
  if (JSON.stringify(item).length > LIMITE) return resposta(413, { erro: 'grande' });
  if (!env.GITHUB_TOKEN) return resposta(503, { erro: 'sem-token' });
  const repo = env.GITHUB_REPO || 'Dinodied28/Camadas';
  const r = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'semnuvem-envio',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(montarIssue(tipo, item)),
  });
  if (!r.ok) return resposta(502, { erro: 'github', status: r.status });
  const j = await r.json();
  return resposta(201, { ok: true, numero: j.number });
}

export function onRequest() {
  return resposta(405, { erro: 'metodo' });
}
