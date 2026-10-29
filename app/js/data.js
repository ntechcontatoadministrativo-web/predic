'use strict';
/* PREDIC · dados: APIs públicas, armazenamento local, imagens e planilhas */
/* ============================ dados reais (APIs públicas) ============================ */
const UFS = { AC: 12, AL: 27, AP: 16, AM: 13, BA: 29, CE: 23, DF: 53, ES: 32, GO: 52, MA: 21, MT: 51, MS: 50, MG: 31, PA: 15, PB: 25, PR: 41, PE: 26, PI: 22, RJ: 33, RN: 24, RS: 43, RO: 11, RR: 14, SC: 42, SP: 35, SE: 28, TO: 17 };
const UF_NOME = { 'acre': 'AC', 'alagoas': 'AL', 'amapa': 'AP', 'amazonas': 'AM', 'bahia': 'BA', 'ceara': 'CE', 'distrito federal': 'DF', 'espirito santo': 'ES', 'goias': 'GO', 'maranhao': 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG', 'para': 'PA', 'paraiba': 'PB', 'parana': 'PR', 'pernambuco': 'PE', 'piaui': 'PI', 'rio de janeiro': 'RJ', 'rio grande do norte': 'RN', 'rio grande do sul': 'RS', 'rondonia': 'RO', 'roraima': 'RR', 'santa catarina': 'SC', 'sao paulo': 'SP', 'sergipe': 'SE', 'tocantins': 'TO' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getJSONDireto(url, opt = {}, ms = 25000) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms);
  try { const r = await fetch(url, { ...opt, signal: ac.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
  finally { clearTimeout(t); }
}
// Com conta, BCB, IBGE, altimetria e Nominatim passam pelo servidor: cache compartilhado pela equipe e última resposta boa quando a fonte cai.
const VIA_SERVIDOR = /^(api\.bcb\.gov\.br|servicodados\.ibge\.gov\.br|apisidra\.ibge\.gov\.br|api\.open-meteo\.com|nominatim\.openstreetmap\.org)$/;
async function getJSON(url, opt = {}, ms = 25000) {
  if (typeof MODO !== 'undefined' && MODO.perfil && !opt.method && VIA_SERVIDOR.test(new URL(url).hostname)) {
    try { return await getJSONDireto('/api/dados?u=' + encodeURIComponent(url), {}, ms + 5000); } catch (e) { /* servidor sem resposta: tenta a fonte direto */ }
  }
  return getJSONDireto(url, opt, ms);
}
const API = {
  async bcb(serie, n) { const d = await getJSON(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serie}/dados/ultimos/${n}?formato=json`); return d.map(x => ({ data: x.data, v: parseFloat(x.valor) })); },
  async macro() {
    const acc = arr => arr.reduce((a, x) => a * (1 + x.v / 100), 1) - 1;
    const [selic, incc, ipca, jur] = await Promise.allSettled([API.bcb(432, 1), API.bcb(192, 12), API.bcb(433, 12), API.bcb(20772, 1)]);
    const out = { em: Date.now() };
    if (selic.status === 'fulfilled') out.selic = { v: selic.value[0].v, data: selic.value[0].data };
    if (incc.status === 'fulfilled' && incc.value.length) out.incc = { v: acc(incc.value) * 100, data: incc.value.at(-1).data.slice(3) };
    if (ipca.status === 'fulfilled' && ipca.value.length) out.ipca = { v: acc(ipca.value) * 100, data: ipca.value.at(-1).data.slice(3) };
    if (jur.status === 'fulfilled') out.jurosImob = { v: jur.value[0].v, data: jur.value[0].data.slice(3) };
    if (!out.selic && !out.incc && !out.ipca && !out.jurosImob) throw new Error('Banco Central indisponível');
    return out;
  },
  async geocode(q) {
    const d = await getJSON('https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&countrycodes=br&accept-language=pt-BR&q=' + encodeURIComponent(q));
    if (!d.length) throw new Error('Endereço não encontrado no OpenStreetMap. Inclua cidade e UF.');
    const a = d[0].address || {}; const iso = a['ISO3166-2-lvl4'] || '';
    const uf = iso.startsWith('BR-') ? iso.slice(3) : UF_NOME[norm(a.state)] || '';
    return { lat: +d[0].lat, lon: +d[0].lon, display: d[0].display_name, cidade: a.city || a.town || a.village || a.municipality || '', bairro: a.suburb || a.neighbourhood || a.quarter || '', uf };
  },
  async ibge(cidade, uf) {
    const lista = await getJSON(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`);
    const m = lista.find(x => norm(x.nome) === norm(cidade)) || lista.find(x => norm(cidade).includes(norm(x.nome)));
    if (!m) throw new Error('Município não encontrado no IBGE');
    const sidra = async (t, v) => { const d = await getJSON(`https://apisidra.ibge.gov.br/values/t/${t}/n6/${m.id}/v/${v}/p/last/f/n`); return d[1] ? { v: parseFloat(d[1].V), per: d[1].D3N } : null; };
    const [pop, est, pib] = await Promise.allSettled([sidra(4709, 93), sidra(6579, 9324), sidra(5938, 37)]);
    const P = pop.value, ES = est.value, PI = pib.value;
    const popRef = ES || P;
    return { cod: m.id, nome: m.nome, uf, pop: P, popEst: ES, pib: PI, pibPc: PI && popRef ? PI.v * 1000 / (P || popRef).v : null };
  },
  async sinapi(uf) {
    const d = await getJSON(`https://apisidra.ibge.gov.br/values/t/2296/n3/${UFS[uf]}/v/48/p/last%2013/f/n`);
    const rows = d.slice(1).map(r => ({ v: parseFloat(r.V), mes: r.D3N })).filter(r => ok(r.v));
    if (!rows.length) throw new Error('SINAPI sem dados');
    const ult = rows.at(-1), ant = rows.length >= 13 ? rows[0] : null;
    return { uf, v: ult.v, mes: ult.mes, var12: ant ? ult.v / ant.v - 1 : null };
  },
  async elevacao(lat, lon) {
    const d = 300 / 111320, dl = d / Math.cos(lat * Math.PI / 180);
    const pts = [[0, 0]].concat([0, 45, 90, 135, 180, 225, 270, 315].map(a => [Math.sin(a * Math.PI / 180) * d, Math.cos(a * Math.PI / 180) * dl]));
    const r = await getJSON(`https://api.open-meteo.com/v1/elevation?latitude=${pts.map(p => (lat + p[0]).toFixed(5)).join(',')}&longitude=${pts.map(p => (lon + p[1]).toFixed(5)).join(',')}`);
    const e = r.elevation; const viz = e.slice(1); const media = viz.reduce((a, b) => a + b, 0) / viz.length;
    return { lote: e[0], media, min: Math.min(...viz), max: Math.max(...viz) };
  },
  POI_CATS: [
    { k: 'transp', l: 'Transporte público', d: 'pontos de ônibus e estações', osm: ['node["highway"="bus_stop"]', 'nwr["public_transport"="station"]', 'nwr["railway"~"station|halt|tram_stop"]'], nm: ['bus stop', 'bus station'], cor: '#007AFF' },
    { k: 'escola', l: 'Escolas', d: 'educação infantil ao ensino médio', osm: ['nwr["amenity"~"^(school|kindergarten)$"]'], nm: ['school', 'kindergarten'], cor: '#FF9F0A' },
    { k: 'saude', l: 'Saúde', d: 'hospitais, clínicas e UBS', osm: ['nwr["amenity"~"^(hospital|clinic|doctors)$"]', 'nwr["healthcare"~"^(hospital|clinic|centre)$"]'], nm: ['hospital', 'clinic'], cor: '#FF3B30' },
    { k: 'farm', l: 'Farmácias', d: 'redes e independentes', osm: ['nwr["amenity"="pharmacy"]'], nm: ['pharmacy'], cor: '#AF52DE' },
    { k: 'merc', l: 'Supermercados', d: 'supermercados e atacarejos', osm: ['nwr["shop"~"^(supermarket|wholesale)$"]'], nm: ['supermarket'], cor: '#34C759' },
    { k: 'lazer', l: 'Lazer e esporte', d: 'praças, parques, academias', osm: ['nwr["leisure"~"^(park|playground|sports_centre|fitness_centre|pitch)$"]'], nm: ['park', 'playground'], cor: '#00C7BE' },
    { k: 'banco', l: 'Bancos', d: 'agências e lotéricas', osm: ['nwr["amenity"="bank"]'], nm: ['bank'], cor: '#636366' },
    { k: 'shop', l: 'Shopping e comércio', d: 'shoppings e restaurantes', osm: ['nwr["shop"="mall"]', 'nwr["amenity"~"^(restaurant|cafe|fast_food)$"]'], nm: ['mall', 'restaurant'], cor: '#A2845E' }
  ],
  dist(a, b, c, d) { const R = 6371000, x = (c - a) * Math.PI / 180, y = (d - b) * Math.PI / 180; const h = Math.sin(x / 2) ** 2 + Math.cos(a * Math.PI / 180) * Math.cos(c * Math.PI / 180) * Math.sin(y / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); },
  classify(tags) {
    const t = tags || {};
    if (t.highway === 'bus_stop' || t.public_transport === 'station' || /station|halt|tram_stop/.test(t.railway || '')) return 'transp';
    if (/^(school|kindergarten)$/.test(t.amenity || '')) return 'escola';
    if (/^(hospital|clinic|doctors)$/.test(t.amenity || '') || /^(hospital|clinic|centre)$/.test(t.healthcare || '')) return 'saude';
    if (t.amenity === 'pharmacy') return 'farm';
    if (/^(supermarket|wholesale)$/.test(t.shop || '')) return 'merc';
    if (/^(park|playground|sports_centre|fitness_centre|pitch)$/.test(t.leisure || '')) return 'lazer';
    if (t.amenity === 'bank') return 'banco';
    if (t.shop === 'mall' || /^(restaurant|cafe|fast_food)$/.test(t.amenity || '')) return 'shop';
    return null;
  },
  async pois(lat, lon, raio = 1000, onStatus) {
    const q = '[out:json][timeout:30];(' + API.POI_CATS.flatMap(c => c.osm.map(s => `${s}(around:${raio},${lat},${lon});`)).join('') + ');out center tags 600;';
    const mirrors = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
    let itens = null, fonte = '';
    for (const m of mirrors) {
      try { onStatus && onStatus('Consultando OpenStreetMap (' + new URL(m).host + ')…'); const d = await getJSON(m, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, 35000);
        itens = d.elements.map(e => ({ lat: e.lat ?? e.center?.lat, lon: e.lon ?? e.center?.lon, nome: e.tags?.name || '', cat: API.classify(e.tags) })).filter(e => e.cat && ok(e.lat)); fonte = 'Overpass API'; break; } catch (e) { /* tenta o próximo espelho */ }
    }
    if (!itens) {
      // servidores Overpass sobrecarregados: busca categoria a categoria no Nominatim (1 requisição/s)
      itens = []; fonte = 'Nominatim';
      const dLat = raio / 111320, dLon = dLat / Math.cos(lat * Math.PI / 180);
      const vb = [lon - dLon, lat + dLat, lon + dLon, lat - dLat].map(x => x.toFixed(5)).join(',');
      for (const c of API.POI_CATS) for (const term of c.nm) {
        onStatus && onStatus('Buscando ' + c.l.toLowerCase() + ' no Nominatim…');
        try { const d = await getJSON(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=50&bounded=1&viewbox=${vb}&q=${encodeURIComponent(term)}`); d.forEach(x => itens.push({ lat: +x.lat, lon: +x.lon, nome: x.name || '', cat: c.k })); } catch (e) { }
        await sleep(1100);
      }
      if (!itens.length) throw new Error('OpenStreetMap indisponível no momento');
    }
    const seen = new Set();
    itens = itens.map(i => ({ ...i, d: Math.round(API.dist(lat, lon, i.lat, i.lon)) })).filter(i => i.d <= raio * 1.05).filter(i => { const k = i.cat + i.lat.toFixed(4) + i.lon.toFixed(4); if (seen.has(k)) return false; seen.add(k); return true; });
    const cats = API.POI_CATS.map(c => { const l = itens.filter(i => i.cat === c.k).sort((a, b) => a.d - b.d); return { k: c.k, n: l.length, perto: l[0] ? l[0].d : null, pertoNome: l[0] ? l[0].nome : '' }; });
    return { itens: itens.slice(0, 400), cats, raio, fonte, em: Date.now() };
  }
};

/* ============================ IndexedDB (imagens e conversas) ============================ */
const IDB = {
  db: null,
  open() { return this.db || (this.db = new Promise((res, rej) => { const r = indexedDB.open('predic-v2', 2); r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('img')) d.createObjectStore('img'); if (!d.objectStoreNames.contains('chat')) d.createObjectStore('chat'); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); })); },
  async run(store, mode, fn) { const db = await this.open(); return new Promise((res, rej) => { const tx = db.transaction(store, mode); const q = fn(tx.objectStore(store)); tx.oncomplete = () => res(q && q.result); tx.onerror = () => rej(tx.error); }); },
  put(k, v, store = 'img') { return this.run(store, 'readwrite', s => s.put(v, k)).catch(() => null); },
  get(k, store = 'img') { return this.run(store, 'readonly', s => s.get(k)).catch(() => null); },
  del(k, store = 'img') { return this.run(store, 'readwrite', s => s.delete(k)).catch(() => null); },
  all(store = 'img') { return this.open().then(db => new Promise(res => { const out = []; const tx = db.transaction(store, 'readonly'); const c = tx.objectStore(store).openCursor(); c.onsuccess = () => { const cur = c.result; if (cur) { out.push({ key: cur.key, ...cur.value }); cur.continue(); } }; tx.oncomplete = () => res(out); tx.onerror = () => res([]); })).catch(() => []); }
};

/* ============================ geração de imagem ============================ */
const IMG_ESTILOS = ['contemporâneo', 'moderno minimalista', 'tropical modernista', 'neoclássico', 'industrial', 'biofílico com muita vegetação'];
const IMG_VISTAS = { fachada: 'fachada vista da rua, à luz do dia', entardecer: 'fachada ao entardecer, iluminação acesa', aerea: 'vista aérea em drone mostrando o entorno urbano', lazer: 'área de lazer no embasamento com piscina e paisagismo', interior: 'living integrado decorado de um apartamento tipo', hall: 'hall de entrada e portaria' };
const IMG_FORMATOS = { '16:9': [1344, 768, '1536x1024'], '4:3': [1152, 864, '1536x1024'], '1:1': [1024, 1024, '1024x1024'], '3:4': [864, 1152, '1024x1536'] };
function promptImagem(st, P, D, local) {
  const cfg = st.img || {}; const E = st.estudo;
  const tip = P.mix.map(m => m.tipo).join(', ');
  const lz = (P.lazer || []).slice(0, 7).join(', ');
  const cidade = local ? local.cidade + (local.uf ? ' - ' + local.uf : '') : '';
  const clima = /^(AM|PA|AP|RR|AC|RO|TO|MA|PI|CE|RN|PB|PE|AL|SE|BA)$/.test(local?.uf || '') ? 'clima tropical, vegetação tropical exuberante' : 'paisagismo urbano';
  const partes = [
    'Renderização arquitetônica fotorrealista do empreendimento "' + (E.nome || P.nome) + '"',
    (P.tipoEdif || 'edifício residencial') + ' de padrão ' + (P.padrao || 'médio') + ' com ' + (P.pavimentos || '?') + ' pavimentos e ' + (P.unAndar || '?') + ' apartamentos por andar, total de ' + D.unT + ' unidades (' + tip + ')',
    'estilo arquitetônico ' + (cfg.estilo || 'contemporâneo'),
    'cena: ' + (IMG_VISTAS[cfg.vista] || IMG_VISTAS.fachada),
    lz ? 'lazer: ' + lz : '',
    cidade ? 'localizado em ' + cidade + ', Brasil, ' + clima : clima,
    E.lote ? 'terreno: ' + E.lote : '',
    cfg.extra || '',
    'alta qualidade, iluminação natural, lente 24mm, sem texto, sem marca d\'água'
  ];
  return partes.filter(Boolean).map(x => x.trim().replace(/\.+$/, '')).join('. ').replace(/\s+/g, ' ');
}
async function gerarImagem({ prompt, provider, formato, seed, chave }) {
  const f = IMG_FORMATOS[formato] || IMG_FORMATOS['16:9'];
  if (provider === 'openai') {
    if (!chave) throw new Error('Informe sua chave da OpenAI para usar este provedor.');
    const r = await fetch('https://api.openai.com/v1/images/generations', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + chave }, body: JSON.stringify({ model: 'gpt-image-1', prompt, size: f[2], n: 1 }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('OpenAI: ' + (j.error?.message || 'HTTP ' + r.status));
    const b = atob(j.data[0].b64_json); const u8 = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u8[i] = b.charCodeAt(i);
    return { blob: new Blob([u8], { type: 'image/png' }) };
  }
  const url = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt.slice(0, 1500)) + `?width=${f[0]}&height=${f[1]}&seed=${seed}`;
  if (chave) {
    // com token: baixa a imagem sem marca d'água e guarda o arquivo no navegador
    try { const r = await fetch(url + '&nologo=true', { headers: { Authorization: 'Bearer ' + chave } }); if (r.ok) { const b = await r.blob(); if (/^image\//.test(b.type)) return { blob: b }; } } catch (e) { }
  }
  // sem token: o Pollinations só libera a imagem para carregamento direto em <img> (a chamada fetch exige verificação anti-robô)
  await new Promise((res, rej) => {
    const im = new Image(); const t = setTimeout(() => { im.src = ''; rej(new Error('O gerador demorou mais de 2 minutos. Tente de novo.')); }, 120000);
    im.onload = () => { clearTimeout(t); res(); }; im.onerror = () => { clearTimeout(t); rej(new Error('O Pollinations não devolveu a imagem (limite gratuito ou instabilidade). Tente de novo em instantes.')); };
    im.src = url;
  });
  return { url };
}

/* ============================ planilha (importar / exportar) ============================ */
const EST_CAMPOS = [['Nome do empreendimento', 'nome'], ['Código do estudo', 'codigo'], ['Cidade/UF', 'cidade'], ['Endereço', 'endereco'], ['Descrição do lote', 'lote'], ['Matrícula', 'matricula'], ['Cartório', 'cartorio'], ['Área do terreno (m²)', 'area', 1], ['Zoneamento', 'zona'], ['Classificação da área (urbana/rural/expansão)', 'classe'], ['Coeficiente de aproveitamento', 'ca', 1], ['Taxa de ocupação (%)', 'to', 1], ['Gabarito máximo (m)', 'gabarito', 1], ['Prazo até o registro da incorporação (meses)', 'prazoReg', 1], ['Demanda (domicílios-alvo por ano)', 'demanda', 1], ['Renda média domiciliar (R$ mil)', 'renda', 1], ['Perfil local', 'perfil'], ['Descrição do perfil', 'perfilDesc'], ['CUB de referência (R$/m²)', 'cub', 1], ['Fonte do CUB', 'cubFonte']];
const PLAN_PROD = ['Produto', 'Descrição', 'Prazo de obra (meses)', 'Custo de obra (R$/m²)', 'VSO (% a.m.)', 'Área comum (m²)', 'Área de garagem (m²)', 'Vagas', 'Permuta financeira (% VGV)', 'Terreno em dinheiro (R$)', 'Financiamento (% da obra)', 'Juros do financiamento (% a.a.)', 'Programa (mercado/MCMV)', 'Faixa MCMV (1 a 4)', 'Teto MCMV (R$)', 'Crédito associativo (sim/não)', 'Entrada do comprador (%)', 'Pavimentos', 'Unidades por andar', 'Padrão'];
function exportarPlanilha(st) {
  const X = window.XLSX; if (!X) throw new Error('Biblioteca de planilha não carregou (verifique a internet).');
  const E = st.estudo, L = st.listas, wb = X.utils.book_new();
  const add = (nome, titulo, head, rows, widths) => { const aoa = (titulo ? [[titulo]] : []).concat([head], rows); const ws = X.utils.aoa_to_sheet(aoa); ws['!cols'] = (widths || head.map(() => 18)).map(w => ({ wch: w })); X.utils.book_append_sheet(wb, ws, nome); };
  add('Leia-me', null, ['PREDIC · Planilha de entrada do estudo de viabilidade'], [[''], ['1. Não renomeie as abas nem os títulos das colunas.'], ['2. Cada produto é uma linha na aba Produtos; o nome liga Mix, Custos, Cronograma, Lazer e Aderência.'], ['3. Números sem "R$" e sem "%". Decimais com vírgula ou ponto.'], ['4. Nível: regular, atenção, crítico ou não iniciado (riscos de mercado: baixo, médio, alto).'], ['5. Cronograma: a etapa "Obra" define o prazo; a etapa "Lançamento" define o início das vendas.'], ['6. No PREDIC, use "Importar planilha" na barra lateral.']], [90]);
  add('Empreendimento', null, ['Campo', 'Valor'], EST_CAMPOS.map(([l, k]) => [l, E[k] ?? '']).concat([['TMA (% a.a.)', st.tma]]), [46, 70]);
  add('Produtos', 'Produtos do estudo · uma linha por produto', PLAN_PROD, st.produtos.map(p => [p.nome, p.descr, p.prazo, p.custo, p.vso, p.comum, p.garagem, p.vagas, p.permFin || 0, p.terrenoCash || 0, p.finPct ?? 60, p.finJuros ?? 10.5, p.programa === 'mcmv' ? 'MCMV' : 'mercado', p.faixa || '', p.teto || '', p.assoc ? 'sim' : 'não', p.entrada ?? 10, p.pavimentos || '', p.unAndar || '', p.padrao || '']));
  add('Mix', 'Mix de unidades', ['Produto', 'Tipologia', 'Unidades', 'Área privativa (m²)', 'Preço (R$/m²)', 'Unidades em permuta'], st.produtos.flatMap(p => p.mix.map(m => [p.nome, m.tipo, m.un, m.area, m.preco, m.perm])));
  add('Custos', 'Premissas de custo por produto', ['Produto'].concat(CUSTO_CAMPOS.map(c => c[0] + ' (' + c[1] + ')')), st.produtos.map(p => [p.nome].concat(CUSTO_CAMPOS.map(c => p.custos?.[c[2]] ?? c[3]))));
  add('Cronograma', 'Cronograma-mestre', ['Produto', 'Etapa', 'Início (mês)', 'Fim (mês)'], st.produtos.flatMap(p => p.crono.map(c => [p.nome, c.nome, c.obra ? premOf(st).preObra + 1 : c.ini, c.obra ? premOf(st).preObra + p.prazo : c.fim])));
  add('Cenários', 'Cenários · variação sobre o base', ['Variável', 'Pessimista', 'Base', 'Otimista'], CEN_CAMPOS.map(([k, l, u]) => [l + ' (' + u + ')', st.cenarios.pessimista[k], st.cenarios.base[k], st.cenarios.otimista[k]]).concat([['Peso na ponderação (%)'].concat(st.pesos)]));
  add('Lazer', 'Lazer e diferenciais', ['Produto', 'Item'], st.produtos.flatMap(p => p.lazer.map(x => [p.nome, x])));
  add('Aderência', 'Aderência produto × demanda', ['Produto', 'Critério', 'Nota (0 a 100)'], st.produtos.flatMap(p => ADER_CRIT.map((c, i) => [p.nome, c, p.ader[i] ?? 50])));
  add('Concorrentes', 'Concorrência direta', ['Empreendimento', 'Tipologia', 'Padrão', 'R$/m²', 'Ticket (R$ mil)', 'VSO (% a.m.)', 'Estoque (un.)'], st.concs.map(c => [c.nome, c.tipo, c.padrao, c.m2, c.ticket, c.vso, c.estoque]));
  add('Riscos de mercado', null, ['Risco', 'Valor', 'Nível (baixo/médio/alto)'], L.riscosMercado.map(r => [r.t, r.v, NIVM[r.k]]));
  add('Infraestrutura', null, ['Item', 'Situação', 'Atendimento (%)'], L.infra.map(r => [r.nome, r.status, r.pct]));
  add('Condicionantes urbanização', null, ['Grupo', 'Texto', 'Valor', 'Nível'], L.condUrb.map(r => [r.grupo, r.t, r.v, NIVTXT[r.k]]));
  add('Due diligence', null, ['Grupo', 'Item', 'Fonte', 'Nível', 'Situação'], L.dd.map(r => [r.grupo, r.nome, r.fonte, NIVTXT[r.k], r.status]));
  add('Restrições e órgãos', null, ['Item', 'Órgão', 'Nível', 'Situação', 'Descrição'], L.restricoes.map(r => [r.nome, r.fonte, NIVTXT[r.k], r.status, r.desc]));
  add('Licenciamento', null, ['Etapa', 'Órgão', 'Prazo (dias)', 'Nível', 'Situação'], L.licencas.map(r => [r.nome, r.fonte, r.prazo, NIVTXT[r.k], r.status]));
  add('Parecer jurídico', null, ['Condição', 'Valor', 'Nível'], L.pareceres.map(r => [r.t, r.v, NIVTXT[r.k]]));
  add('Condicionantes aprovação', null, ['Condicionante'], L.condicionantes.map(r => [r.t]));
  X.writeFile(wb, 'PREDIC - ' + (E.nome || 'estudo') + '.xlsx');
}
function importarPlanilha(buf, st) {
  const X = window.XLSX; if (!X) throw new Error('Biblioteca de planilha não carregou.');
  const wb = X.read(buf, { type: 'array' });
  const rows = n => { if (!wb.Sheets[n]) return []; const all = X.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '' }); const hi = all.findIndex(r => r.filter(v => v !== '').length >= 2 || /^(campo|condicionante)$/i.test(String(r[0]).trim())); return all.slice((hi < 0 ? 0 : hi) + 1).filter(r => r.some(v => v !== '')); };
  const N = v => { const x = parseNum(v); return isNaN(x) ? 0 : x; };
  const S = v => String(v ?? '').trim();
  const pr = rows('Produtos'); if (!pr.length) throw new Error('A aba Produtos está vazia ou não existe.');
  const avisos = [];
  const mixR = rows('Mix'), crR = rows('Cronograma'), cuR = rows('Custos'), lz = rows('Lazer'), ad = rows('Aderência');
  const cores = ['#8E8E93', '#636366', '#FF9F0A', '#34C759', '#22212D', '#AF52DE', '#00C7BE', '#AEAEB2'];
  const produtos = pr.map((r, i) => {
    const nome = S(r[0]) || 'Produto ' + String.fromCharCode(65 + i);
    const mix = mixR.filter(m => S(m[0]) === nome).map(m => ({ tipo: S(m[1]), un: N(m[2]), area: N(m[3]), preco: N(m[4]), perm: N(m[5]) })).filter(m => m.un > 0 && m.area > 0);
    if (!mix.length) throw new Error('O produto "' + nome + '" não tem linhas válidas na aba Mix.');
    let prazo = N(r[2]) || 30;
    let crono = crR.filter(c => S(c[0]) === nome).map((c, j) => ({ id: uid(), nome: S(c[1]), ini: N(c[2]), fim: N(c[3]), cor: cores[j % cores.length] }));
    crono = crono.map(c => /obra/i.test(c.nome) && !/p[óo]s/i.test(c.nome) ? (prazo = Math.max(6, c.fim - premOf(st).preObra), { ...c, ini: premOf(st).preObra + 1, obra: true, cor: '#22212D' }) : /lan[çc]amento/i.test(c.nome) ? { ...c, vendas: true, cor: '#34C759' } : c);
    if (!crono.length) crono = CRONO0();
    const P = novoProduto(nome, false);
    Object.assign(P, { descr: S(r[1]), prazo, custo: N(r[3]) || 3000, vso: N(r[4]) || 3, comum: N(r[5]), garagem: N(r[6]), vagas: N(r[7]), permFin: N(r[8]), terrenoCash: N(r[9]),
      finPct: r[10] === '' ? 60 : N(r[10]), finJuros: r[11] === '' ? 10.5 : N(r[11]), programa: /mcmv/i.test(S(r[12])) ? 'mcmv' : 'mercado', faixa: N(r[13]) || null, teto: N(r[14]) || null,
      assoc: /^s/i.test(S(r[15])), entrada: r[16] === '' || r[16] == null ? 10 : N(r[16]), pavimentos: N(r[17]) || P.pavimentos, unAndar: N(r[18]) || P.unAndar, padrao: S(r[19]) || P.padrao, mix, crono, capModelo: /^s/i.test(S(r[15])) ? 'assoc' : 'livre' });
    const cr = cuR.find(x => S(x[0]) === nome); if (cr) CUSTO_CAMPOS.forEach((c, j) => { if (cr[j + 1] !== '') P.custos[c[2]] = N(cr[j + 1]); });
    const l2 = lz.filter(x => S(x[0]) === nome).map(x => S(x[1])).filter(Boolean); if (l2.length) P.lazer = l2;
    const a2 = ad.filter(x => S(x[0]) === nome); if (a2.length) P.ader = ADER_CRIT.map((c, j) => { const f = a2.find(x => norm(x[1]) === norm(c)); return f ? N(f[2]) : 50; });
    return P;
  });
  const nomes = produtos.map(p => p.nome);
  ['Mix', 'Custos', 'Cronograma', 'Lazer', 'Aderência'].forEach(n => { const sem = [...new Set(rows(n).map(r => S(r[0])).filter(x => x && !nomes.includes(x)))]; if (sem.length) avisos.push(n + ' cita produto inexistente: ' + sem.join(', ')); });
  const estudo = { ...EST_VAZIO, ...st.estudo }; let tma = st.tma;
  rows('Empreendimento').forEach(r => { const l = S(r[0]); if (/tma/i.test(l)) { tma = N(r[1]) || tma; return; } const f = EST_CAMPOS.find(([c]) => norm(c) === norm(l)); if (f && r[1] !== '') estudo[f[1]] = f[2] ? N(r[1]) : S(r[1]); else if (l && !f) avisos.push('campo não reconhecido: "' + l + '"'); });
  const L = { ...st.listas };
  const L1 = (n, k, fn) => { const rr = rows(n); if (rr.length) L[k] = rr.map(fn); };
  L1('Infraestrutura', 'infra', r => { const p = N(r[2]); return { id: uid(), nome: S(r[0]), status: S(r[1]), pct: r[2] === '' ? '' : p, k: r[2] === '' ? NIV(r[1]) : p >= 90 ? 'ok' : p >= 40 ? 'at' : 'cr' }; });
  L1('Due diligence', 'dd', r => it(S(r[0]) || 'Geral', S(r[1]), S(r[2]), NIV(r[3]), S(r[4])));
  L1('Restrições e órgãos', 'restricoes', r => it('', S(r[0]), S(r[1]), NIV(r[2]), S(r[3]), { desc: S(r[4]) }));
  L1('Licenciamento', 'licencas', r => it('', S(r[0]), S(r[1]), NIV(r[3]), S(r[4]), { prazo: N(r[2]) }));
  L1('Parecer jurídico', 'pareceres', r => ({ id: uid(), t: S(r[0]), v: S(r[1]), k: NIV(r[2]) }));
  L1('Riscos de mercado', 'riscosMercado', r => ({ id: uid(), t: S(r[0]), v: S(r[1]), k: NIV(r[2]) }));
  L1('Condicionantes aprovação', 'condicionantes', r => ({ id: uid(), t: S(r[0]) }));
  L1('Condicionantes urbanização', 'condUrb', r => ({ id: uid(), grupo: S(r[0]) || 'Condicionantes', t: S(r[1]), v: S(r[2]), k: NIV(r[3]) }));
  let cenarios = st.cenarios, pesos = st.pesos; const ce = rows('Cenários');
  if (ce.length) { cenarios = clone(st.cenarios); ce.forEach(r => { const f = CEN_CAMPOS.find(c => norm(r[0]).startsWith(norm(c[1]))); if (f) KS.forEach((k, j) => { cenarios[k][f[0]] = N(r[j + 1]); }); else if (/peso/i.test(S(r[0]))) pesos = [N(r[1]), N(r[2]), N(r[3])]; }); }
  const co = rows('Concorrentes').map(c => ({ id: uid(), nome: S(c[0]), tipo: S(c[1]), padrao: S(c[2]), m2: N(c[3]), ticket: N(c[4]), vso: N(c[5]), estoque: N(c[6]) }));
  const mudouEnd = norm(estudo.endereco) !== norm(st.estudo.endereco);
  return { st: { ...st, exemplo: false, estudo, produtos, prodSel: 0, tma, cenarios, pesos, listas: L, concs: co.length ? co : st.concs, real: mudouEnd ? { macro: st.real.macro } : st.real }, avisos };
}
