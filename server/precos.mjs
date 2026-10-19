// PREDIC · preços da API Anthropic (US$ por milhão de tokens, tabela de outubro de 2026) para estimar o custo de cada chamada.
// A cobrança oficial é a do Console da Anthropic; aqui o valor serve para cota e acompanhamento.
const TABELA = {
  'claude-fable-5-1': { ent: 10, sai: 50, lei: 0.25, esc: 12.5 },
  'claude-opus-5-5': { ent: 4, sai: 20, lei: 0.20, esc: 5 },
  'claude-opus-5': { ent: 5, sai: 25, lei: 0.50, esc: 6.25 },
  'claude-opus-4-8': { ent: 5, sai: 25, lei: 0.50, esc: 6.25 },
  'claude-sonnet-5-5': { ent: 2, sai: 10, lei: 0.20, esc: 2.5 },
  'claude-sonnet-5': { ent: 2, sai: 10, lei: 0.20, esc: 2.5 },
  'claude-haiku-5-5': { ent: 0.10, sai: 0.50, lei: 0.01, esc: 0.125 }
};
const BUSCA_USD = 10 / 1000; // pesquisa na web: US$ 10 por mil buscas

export function precoDe(modelo) {
  const m = String(modelo || '');
  return TABELA[m] || TABELA[Object.keys(TABELA).find(k => m.startsWith(k))] || TABELA['claude-opus-5-5'];
}
export function custoUso(modelo, u = {}) {
  const p = precoDe(modelo);
  const buscas = u.server_tool_use?.web_search_requests || 0;
  const usd = ((u.input_tokens || 0) * p.ent + (u.output_tokens || 0) * p.sai + (u.cache_read_input_tokens || 0) * p.lei + (u.cache_creation_input_tokens || 0) * p.esc) / 1e6 + buscas * BUSCA_USD;
  return { usd, buscas };
}
