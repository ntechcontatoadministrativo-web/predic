'use strict';
/* PREDIC · seções do estudo */
/* ============================ seções ============================ */

const corEtapa = c => c === '#22212D' ? 'var(--ink2)' : c;

function ProdTabs({ ctx }) {
  const { st, set, M } = ctx;
  return html`<div className="seg noprint">${st.produtos.map((P, i) => html`<button key=${P.id} className=${i === M.sel ? 'on' : ''} onClick=${() => set({ prodSel: i })}>${P.nome}</button>`)}</div>`;
}

// Estudo sem endereço: o primeiro passo é o endereço, que preenche o restante.
function ComecePeloEndereco({ ctx }) {
  const [end, setEnd] = useState('');
  const ir = e => { e.preventDefault(); if (end.trim().length < 6) return; ctx.setE({ endereco: end.trim() }); setTimeout(() => ctx.abrirIA('pesquisa'), 60); };
  return html`<${Card} title="Comece pelo endereço do terreno" sub="o PREDIC busca mapa, IBGE, SINAPI e entorno, e a IA pesquisa zoneamento, CUB, renda, concorrentes e licenças">
    <form onSubmit=${ir} style=${{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <input className="in box lg" style=${{ flex: '1 1 280px' }} value=${end} onChange=${e => setEnd(e.target.value)} placeholder="Ex.: Av. Paulista, 1000, São Paulo, SP" autoFocus />
      <button className="btn ia lg" disabled=${end.trim().length < 6}><${Icon} n="ia" s=${15} />Preencher tudo</button>
    </form>
  <//>`;
}

function Painel({ ctx }) {
  const { st, M, set, setProd, real, capas } = ctx; const { R, PR, D, crit } = M; const E = st.estudo; const C = st.comite;
  const capa = capas[PR.id];
  return html`<div className="grid">
    ${!E.endereco && !st.exemplo ? html`<${ComecePeloEndereco} ctx=${ctx} />` : null}
    <${AjusteRapido} ctx=${ctx} />
    <div className="grid g6">
      <${Kpi} s="VGV" v=${milhoes(R.vgv)} l=${num(D.un) + ' unidades · ' + mil(D.preco) + '/m²'} t="g" />
      <${Kpi} s="CTE" v=${milhoes(M.CTE)} l=${pct(M.CTE / R.vgv, 0) + ' do VGV'} t="g" />
      <${Kpi} s="MARGEM" v=${pct(R.margem)} l=${'líquida · ' + milhoes(R.lucro)} t=${crit.margem ? 'g' : 'y'} />
      <${Kpi} s="TIR" v=${pct(R.tir)} l=${'meta ≥ ' + C.tirMin + '% a.a.'} t=${crit.tir ? 'g' : 'r'} />
      <${Kpi} s="EXPOSIÇÃO" v=${milhoes(Math.abs(R.expo))} l=${pct(Math.abs(R.expo) / R.vgv, 0) + ' do VGV · mês ' + R.expoMes} t=${crit.expo ? 'p' : 'y'} />
      <${Kpi} s="PAYBACK" v=${R.payback + ' meses'} l=${'RCE ' + num(R.lucro / Math.abs(R.expo || 1), 2) + '×'} t=${crit.payback ? 'p' : 'y'} />
    </div>
    <div className="grid g21">
      <${Card} title="Fluxo de caixa acumulado" sub="após financiamento à produção · cenário base · passe o mouse para ver cada mês">
        <${LineChart} series=${[{ name: 'Caixa acumulado', color: '#1E8F52', values: R.cum, area: true, width: 2.2 }]} markers=${[{ x: R.expoMes - 1, label: 'exposição máx. · M' + R.expoMes, color: '#B23A22' }, { x: Math.min(R.cum.length - 1, R.payback - 1), label: 'payback · M' + R.payback, color: '#1E8F52' }]} xLab=${i => 'M' + (i + 1)} />
        <div className="note" style=${{ marginTop: 8 }}>Exposição máxima de ${milhoes(Math.abs(R.expo))} no mês ${R.expoMes}; caixa volta a zero no mês ${R.payback}. Entrega das chaves no mês ${R.entrega}.</div>
      <//>
      <${Card} title="Critérios do comitê" sub="cenário base">
        ${[['TIR anual', '≥ ' + C.tirMin + '%', pct(R.tir), crit.tir], ['VPL @ TMA ' + num(st.tma, 1) + '%', '> 0', milhoes(R.vpl), crit.vpl], ['Margem / VGV', '≥ ' + C.margemMin + '%', pct(R.margem), crit.margem], ['Exposição / VGV', '≤ ' + C.expoMax + '%', pct(Math.abs(R.expo) / R.vgv), crit.expo], ['Payback', '≤ ' + C.paybackMax + ' m', R.payback + ' m', crit.payback]].map((c, i) => html`
          <div key=${i} className="kv"><span style=${{ display: 'flex', alignItems: 'center', gap: 8 }}><${Pill} k=${c[3] ? 'ok' : 'cr'}>${c[3] ? 'atende' : 'não atende'}<//>${c[0]} <span className="sub">${c[1]}</span></span><b>${c[2]}</b></div>`)}
        <div className=${'alert ' + M.verdictK} style=${{ marginTop: 10 }}><strong>${M.verdict[0]}.</strong> ${M.verdict[2]}</div>
      <//>
    </div>
    <div className="grid g3">
      <${Card} title="Localização" sub=${E.endereco || 'endereço não informado'}>
        <${MapaLote} lat=${real.geo?.lat} lon=${real.geo?.lon} small=${true} />
        <div style=${{ marginTop: 10 }}>
          <div className="kv"><span>Município</span><b>${real.ibge ? real.ibge.nome + ' / ' + real.ibge.uf : '—'}</b></div>
          <div className="kv"><span>População (Censo 2022)</span><b>${real.ibge?.pop ? num(real.ibge.pop.v) : '—'}</b></div>
          <div className="kv"><span>Serviços em 1 km (OSM)</span><b>${real.pois ? num(real.pois.itens.length) + ' pontos' : '—'}</b></div>
        </div>
      <//>
      <${Card} title="Mercado e macroeconomia" sub="dados reais · Banco Central e IBGE">
        <div className="kv"><span>Selic meta</span><b>${real.macro?.selic ? num(real.macro.selic.v, 2) + '% a.a.' : '—'}</b></div>
        <div className="kv"><span>INCC-M 12 meses</span><b>${real.macro?.incc ? num(real.macro.incc.v, 2) + '%' : '—'}</b></div>
        <div className="kv"><span>IPCA 12 meses</span><b>${real.macro?.ipca ? num(real.macro.ipca.v, 2) + '%' : '—'}</b></div>
        <div className="kv"><span>Juros imobiliário PF</span><b>${real.macro?.jurosImob ? num(real.macro.jurosImob.v, 2) + '% a.a.' : '—'}</b></div>
        <div className="kv"><span>SINAPI ${real.sinapi ? real.sinapi.uf : ''}</span><b>${real.sinapi ? mil(real.sinapi.v) + '/m²' : '—'}</b></div>
        <div className="kv"><span>Preço médio concorrência</span><b>${M.MK.preco ? mil(M.MK.preco) + '/m²' : '—'}</b></div>
      <//>
      <${Card} title=${'Produto · ' + PR.nome} sub=${PR.padrao + ' · ' + PR.pavimentos + ' pavimentos'}>
        <div className="imgbox" style=${{ marginBottom: 10 }}>${capa ? html`<img src=${capa} alt=${'Imagem do ' + PR.nome} />` : html`<span>Gere uma imagem na aba Característica do produto</span>`}</div>
        <div className="kv"><span>Unidades</span><b>${num(D.unT)}</b></div>
        <div className="kv"><span>Área privativa vendável</span><b>${num(D.ap)} m²</b></div>
        <div className="kv"><span>Ticket médio</span><b>${'R$ ' + num(R.ticket / 1000) + ' mil'}</b></div>
        <div className="kv"><span>Prazo de obra</span><b>${PR.prazo} meses</b></div>
      <//>
    </div>
    <${IACard} ctx=${ctx} />
    <${FontesCard} ctx=${ctx} />
  </div>`;
}

function AjusteRapido({ ctx }) {
  const { st, M, set, setProd } = ctx; const { PR, D } = M;
  const sl = (l, v, min, max, step, fmt, on) => html`<div className="field" style=${{ flex: '1 1 160px' }}><label>${l} · <span className="mono" style=${{ color: 'var(--ink)' }}>${fmt(v)}</span></label>
    <input type="range" min=${min} max=${max} step=${step} value=${v} onChange=${e => on(parseFloat(e.target.value))} style=${{ accentColor: '#2BB673' }} /></div>`;
  return html`<div className="card noprint" style=${{ padding: '12px 16px', display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-end' }}>
    ${sl('Preço médio R$/m²', Math.round(D.preco), Math.round(D.preco * 0.6), Math.round(D.preco * 1.4), 10, v => num(v), v => { const k = v / (D.preco || v); setProd({ mix: PR.mix.map(m => ({ ...m, preco: Math.round(m.preco * k) })) }); })}
    ${sl('Custo de obra R$/m²', PR.custo, Math.round(PR.custo * 0.6), Math.round(PR.custo * 1.5), 10, v => num(v), v => setProd({ custo: v }))}
    ${sl('VSO % a.m.', PR.vso, 0.5, 12, 0.1, v => num(v, 1) + '%', v => setProd({ vso: v }))}
    ${sl('TMA % a.a.', st.tma, 4, 30, 0.5, v => num(v, 1) + '%', v => set({ tma: v }))}
  </div>`;
}

function FontesCard({ ctx }) {
  const { real, carregarReais, status } = ctx;
  const linhas = [
    ['Selic, INCC-M, IPCA, juros imobiliários', 'Banco Central · SGS 432, 192, 433, 20772', real.macro, real.macro ? 'atualizado ' + horaBR(real.macro.em) : null],
    ['Geolocalização do endereço', 'OpenStreetMap · Nominatim', real.geo, real.geo?.display],
    ['População e PIB do município', 'IBGE · SIDRA 4709, 6579, 5938', real.ibge, real.ibge ? real.ibge.nome : null],
    ['Custo médio do m² (SINAPI)', 'IBGE/Caixa · SIDRA 2296', real.sinapi, real.sinapi ? real.sinapi.mes : null],
    ['Altimetria do lote e entorno', 'Open-Meteo Elevation (Copernicus DEM)', real.elev, real.elev ? 'lote a ' + num(real.elev.lote, 0) + ' m' : null],
    ['Serviços e equipamentos em 1 km', 'OpenStreetMap · ' + (real.pois?.fonte || 'Overpass'), real.pois, real.pois ? num(real.pois.itens.length) + ' pontos' : null]
  ];
  return html`<${Card} title="Fontes de dados reais" sub="consultadas ao vivo em APIs públicas e salvas no estudo" right=${html`<button className="btn sm noprint" disabled=${!!status.busy} onClick=${() => carregarReais(true)}>${status.busy ? 'Atualizando…' : '↻ Atualizar dados reais'}</button>`}>
    ${status.msg ? html`<div className=${'alert ' + (status.err ? 'cr' : 'na')} style=${{ marginBottom: 8 }}>${status.msg}</div>` : null}
    <div className="tblwrap"><table><thead><tr><th>DADO</th><th>FONTE</th><th>SITUAÇÃO</th></tr></thead><tbody>
      ${linhas.map((l, i) => html`<tr key=${i}><td>${l[0]}</td><td className="src">${l[1]}</td><td>${l[2] ? html`<${Pill} k="ok">${String(l[3] || 'ok').slice(0, 60)}<//>` : html`<${Pill} k="na">${status.erros?.[i] || 'pendente'}<//>`}</td></tr>`)}
    </tbody></table></div>
  <//>`;
}

function Local({ ctx }) {
  const { st, M, setE, setL, real, localizar, status } = ctx; const E = st.estudo; const L = st.listas; const { R, D } = M;
  const el = real.elev; const dif = el ? el.lote - el.media : null;
  return html`<div className="grid">
    <${Card} title="Terreno" sub="dados do lote · o endereço alimenta mapa, IBGE, SINAPI, altimetria e entorno" right=${html`<button className="btn ia sm noprint" onClick=${() => ctx.abrirIA('extracao')}><${Icon} n="doc" s=${14} />Ler matrícula / zoneamento com IA</button>`}>
      <div className="grid g4">
        <${Field} label="Endereço completo (rua, número, cidade, UF)" style=${{ gridColumn: 'span 3' }}><div style=${{ display: 'flex', gap: 6 }}><${Txt} className="box" value=${E.endereco} onChange=${v => setE({ endereco: v })} placeholder="Ex.: Av. Paulista, 1000, São Paulo, SP" /><button className="btn pri noprint" disabled=${status.busy} onClick=${localizar}>${status.busy ? 'Buscando…' : 'Localizar'}</button><button className="btn ia noprint" disabled=${!E.endereco} title="Busca dados públicos e pesquisa na internet zoneamento, CUB, renda, concorrentes e licenças" onClick=${() => ctx.abrirIA('pesquisa')}><${Icon} n="ia" s=${14} />Preencher tudo</button></div><//>
        <${Field} label="Nome do empreendimento"><${Txt} className="box" value=${E.nome} onChange=${v => setE({ nome: v })} /><//>
        <${Field} label="Descrição do lote" style=${{ gridColumn: 'span 2' }}><${Txt} className="box" value=${E.lote} onChange=${v => setE({ lote: v })} /><//>
        <${Field} label="Matrícula"><${Txt} className="box" value=${E.matricula} onChange=${v => setE({ matricula: v })} /><//>
        <${Field} label="Cartório"><${Txt} className="box" value=${E.cartorio} onChange=${v => setE({ cartorio: v })} /><//>
        <${Field} label="Área do terreno (m²)"><${Num} className="box" value=${E.area} onChange=${v => setE({ area: v })} min=${0} /><//>
        <${Field} label="Zoneamento"><${Txt} className="box" value=${E.zona} onChange=${v => setE({ zona: v })} /><//>
        <${Field} label="Coef. de aproveitamento"><${Num} className="box" value=${E.ca} onChange=${v => setE({ ca: v })} min=${0} /><//>
        <${Field} label="Taxa de ocupação (%)"><${Num} className="box" value=${E.to} onChange=${v => setE({ to: v })} min=${0} max=${100} /><//>
        <${Field} label="Gabarito máximo (m)"><${Num} className="box" value=${E.gabarito} onChange=${v => setE({ gabarito: v })} min=${0} /><//>
        <${Field} label="Classificação"><select className="in box" value=${E.classe} onChange=${e => setE({ classe: e.target.value })}>${['urbana', 'expansão urbana', 'rural'].map(o => html`<option key=${o}>${o}</option>`)}</select><//>
        <${Field} label="Código do estudo"><${Txt} className="box" value=${E.codigo} onChange=${v => setE({ codigo: v })} /><//>
      </div>
    <//>
    <div className="grid g4">
      <${Kpi} s="ÁREA DO TERRENO" v=${num(E.area) + ' m²'} l=${E.zona ? 'zona ' + E.zona : 'zoneamento não informado'} t="g" help="" />
      <${Kpi} s="POTENCIAL CONSTRUTIVO" v=${num(M.POT) + ' m²'} l=${'CA ' + num(E.ca, 1) + ' × área do terreno'} t="g" help="Área computável máxima: área do terreno × coeficiente de aproveitamento." />
      <${Kpi} s="USO DO POTENCIAL" v=${pct(M.usoCA, 0)} l=${num(M.computavel) + ' m² computáveis estimados (privativa + comum)'} t=${M.usoCA == null ? 'n' : M.usoCA > 1 ? 'r' : M.usoCA > 0.9 ? 'y' : 'g'} help="Estimativa: área privativa total + área comum, sobre o potencial construtivo. Acima de 100% exige outorga ou ajuste do produto." />
      <${Kpi} s="TERRENO / VGV" v=${pct(R.terrenoEq / R.vgv, 1)} l=${milhoes(R.terrenoEq) + ' · referência 10% a 20%'} t=${R.terrenoEq / R.vgv <= 0.15 ? 'g' : R.terrenoEq / R.vgv <= 0.2 ? 'y' : 'r'} help="Custo do terreno (dinheiro + permutas física e financeira) sobre o VGV." />
    </div>
    <div className="grid g21">
      <${Card} title="Mapa e entorno real" sub=${real.geo ? real.geo.display : 'endereço não localizado'}>
        <${MapaLote} lat=${real.geo?.lat} lon=${real.geo?.lon} pois=${real.pois} />
        <div style=${{ marginTop: 8 }}><${Legend} items=${API.POI_CATS.map(c => ({ l: c.l, color: c.cor, h: 8 }))} /></div>
        <${Src}>© OpenStreetMap contributors (ODbL) · ${real.pois ? real.pois.fonte + ' · ' + horaBR(real.pois.em) : 'aguardando consulta'}<//>
      <//>
      <${Card} title="Acessibilidade e entorno" sub="raio de 1 km · contagem real no OpenStreetMap">
        ${real.pois ? html`<table><thead><tr><th>CATEGORIA</th><th className="num">QTD.</th><th className="num">MAIS PRÓXIMO</th></tr></thead><tbody>
          ${real.pois.cats.map(c => { const d = API.POI_CATS.find(x => x.k === c.k); return html`<tr key=${c.k}><td><span style=${{ display: 'flex', gap: 7, alignItems: 'center' }}><span className="dot" style=${{ background: d.cor }}></span><span>${d.l}<div className="sub">${c.pertoNome || d.d}</div></span></span></td><td className="num">${c.n}</td><td className="num">${c.perto != null ? num(c.perto) + ' m' : '—'}</td></tr>`; })}
          </tbody></table><div className="note" style=${{ marginTop: 8 }}>O OpenStreetMap é colaborativo: confirme em visita de campo itens que faltarem.</div>`
          : html`<div className="alert na">${status.busy ? 'Consultando serviços no entorno…' : 'Informe o endereço e clique em Localizar.'}</div>`}
      <//>
    </div>
    <div className="grid g2">
      <${Card} title="Altimetria do lote" sub="modelo digital de elevação · raio de 300 m">
        ${el ? html`<div className="grid g3" style=${{ marginBottom: 10 }}>
            <${Kpi} s="COTA DO LOTE" v=${num(el.lote, 0) + ' m'} l="acima do nível do mar" t="n" help="" />
            <${Kpi} s="MÉDIA DO ENTORNO" v=${num(el.media, 1) + ' m'} l=${'mín. ' + num(el.min, 0) + ' · máx. ' + num(el.max, 0) + ' m'} t="n" help="" />
            <${Kpi} s="DIFERENÇA" v=${(dif > 0 ? '+' : '') + num(dif, 1) + ' m'} l=${dif < -2 ? 'lote mais baixo: risco de acúmulo de água' : dif > 2 ? 'lote mais alto que o entorno' : 'lote em nível com o entorno'} t=${dif < -2 ? 'r' : dif < -0.5 ? 'y' : 'g'} help="" />
          </div>
          <div className="note">Resolução de ~90 m (Copernicus GLO-90). Serve de triagem: confirme com levantamento planialtimétrico e mapa de inundação do município.</div>`
          : html`<div className="alert na">Aguardando localização do endereço.</div>`}
        <${Src}>Open-Meteo Elevation API<//>
      <//>
      <${Card} title="Infraestrutura urbana" sub="disponibilidade no lote · informe após consulta às concessionárias">
        <${EditList} rows=${L.infra} onChange=${v => setL({ infra: v })} novo=${() => ({ nome: 'Novo item', status: 'a verificar', pct: '', k: 'na' })}
          cols=${[{ k: 'nome', l: 'ITEM' }, { k: 'status', l: 'SITUAÇÃO', w: 120 }, { k: 'pct', l: 'ATEND. %', t: 'num', w: 80 }, { k: 'k', l: 'NÍVEL', t: 'nivel', w: 110 }]} />
      <//>
    </div>
    <${Card} title="Condicionantes de urbanização" sub="obras exigidas, riscos e premissas">
      <${EditList} rows=${L.condUrb} groupBy="grupo" onChange=${v => setL({ condUrb: v })} novo=${() => ({ grupo: 'Obras exigidas', t: '', v: '', k: 'at' })}
        cols=${[{ k: 'grupo', l: 'GRUPO', w: 150 }, { k: 't', l: 'DESCRIÇÃO' }, { k: 'v', l: 'VALOR', w: 110 }, { k: 'k', l: 'NÍVEL', t: 'nivel', w: 110 }]} />
    <//>
  </div>`;
}

function Legis({ ctx }) {
  const { st, M, setE, setL } = ctx; const L = st.listas; const c = M.cnt;
  const nAt = c(L.dd, 'at') + c(L.restricoes, 'at'), nCr = c(L.dd, 'cr') + c(L.restricoes, 'cr');
  return html`<div className="grid">
    <div className="grid g4">
      <${Kpi} s="DUE DILIGENCE" v=${c(L.dd, 'ok') + ' de ' + L.dd.length} l=${'itens regulares · ' + c(L.dd, 'na') + ' não iniciados'} t="g" help="" />
      <${Kpi} s="ATENÇÃO" v=${String(nAt)} l=${c(L.dd, 'at') + ' no terreno · ' + c(L.restricoes, 'at') + ' nos órgãos'} t="y" help="" />
      <${Kpi} s="CRÍTICOS" v=${String(nCr)} l="impedem a escritura ou o registro" t=${nCr ? 'r' : 'g'} help="" />
      <div className="kpi t-p"><div className="s">PRAZO ATÉ O REGISTRO</div><div style=${{ display: 'flex', alignItems: 'center', gap: 4 }}><${Num} className="box" style=${{ width: 70, fontSize: 16 }} value=${st.estudo.prazoReg} onChange=${v => setE({ prazoReg: v })} min=${0} /><span>meses</span></div><div className="l">soma dos prazos de licenciamento: ${num(M.prazoLic)} dias (~${num(M.prazoLic / 30, 0)} meses)</div></div>
    </div>
    <div className="grid g21">
      <${Card} title="Due diligence do terreno" sub=${'matrícula ' + (st.estudo.matricula || '—') + ' · ' + (st.estudo.cartorio || '—')} right=${html`<button className="btn ia sm noprint" onClick=${() => ctx.abrirIA('extracao')}><${Icon} n="doc" s=${14} />Analisar certidões com IA</button>`}>
        <${EditList} rows=${L.dd} groupBy="grupo" onChange=${v => setL({ dd: v })} novo=${() => ({ grupo: 'Imóvel', nome: '', fonte: '', k: 'na', status: '' })}
          cols=${[{ k: 'nome', l: 'ITEM' }, { k: 'fonte', l: 'FONTE', w: 110 }, { k: 'status', l: 'SITUAÇÃO', w: 110 }, { k: 'k', l: 'NÍVEL', t: 'nivel', w: 115 }, { k: 'grupo', l: 'GRUPO', w: 110 }]} />
      <//>
      <${Card} title="Parecer jurídico" sub="condições para a aquisição">
        <div className="sub" style=${{ marginBottom: 6 }}>Gerado dos itens em atenção ou críticos:</div>
        ${M.autoParecer.length ? M.autoParecer.map((p, i) => html`<div key=${i} className="kv"><span>${p.t}<div className="sub">${p.v}</div></span><${Pill} k=${p.k}>${NIVTXT[p.k]}<//></div>`) : html`<div className="alert ok">Nenhum item em atenção ou crítico.</div>`}
        <div className="sub" style=${{ margin: '14px 0 6px' }}>Condições adicionais do jurídico:</div>
        <${EditList} rows=${L.pareceres} onChange=${v => setL({ pareceres: v })} novo=${() => ({ t: '', v: '', k: 'at' })} cols=${[{ k: 't', l: 'CONDIÇÃO', area: true }, { k: 'v', l: 'VALOR', w: 80 }, { k: 'k', l: 'NÍVEL', t: 'nivel', w: 105 }]} />
      <//>
    </div>
    <div className="grid g2">
      <${Card} title="Restrições e órgãos" sub="consultas prévias">
        <${EditList} rows=${L.restricoes} onChange=${v => setL({ restricoes: v })} novo=${() => ({ nome: '', fonte: '', k: 'na', status: '', desc: '' })}
          cols=${[{ k: 'nome', l: 'RESTRIÇÃO' }, { k: 'fonte', l: 'ÓRGÃO', w: 120 }, { k: 'status', l: 'SITUAÇÃO', w: 100 }, { k: 'k', l: 'NÍVEL', t: 'nivel', w: 110 }]} />
      <//>
      <${Card} title="Licenciamento · caminho crítico" sub="prazos em dias">
        <${EditList} rows=${L.licencas} onChange=${v => setL({ licencas: v })} novo=${() => ({ nome: '', fonte: '', prazo: 30, k: 'na', status: '' })}
          cols=${[{ k: 'nome', l: 'ETAPA' }, { k: 'fonte', l: 'ÓRGÃO', w: 110 }, { k: 'prazo', l: 'DIAS', t: 'num', w: 60 }, { k: 'status', l: 'SITUAÇÃO', w: 95 }, { k: 'k', l: 'NÍVEL', t: 'nivel', w: 110 }]} />
      <//>
    </div>
  </div>`;
}

function Mercado({ ctx }) {
  const { st, M, set, setE, setL, real } = ctx; const { MK, R, D, PR, aff } = M; const E = st.estudo; const ib = real.ibge;
  const setConcs = v => set({ concs: v });
  const barras = st.concs.filter(c => c.m2 > 0).map(c => [c.nome, c.m2, false]).concat([[PR.nome + ' (este estudo)', D.preco, true]]).sort((a, b) => b[1] - a[1]);
  const bmx = Math.max(...barras.map(b => b[1])) || 1;
  return html`<div className="grid">
    <div className="grid g4">
      <div className="kpi t-g"><div className="s">DEMANDA<span className="help" title=${GLOSS.DEMANDA}>?</span></div><div style=${{ display: 'flex', gap: 4, alignItems: 'center' }}><${Num} className="box" style=${{ fontSize: 16, width: 110 }} value=${E.demanda} onChange=${v => setE({ demanda: v })} min=${0} /></div><div className="l">domicílios-alvo por ano (estudo de demanda)</div></div>
      <div className="kpi t-g"><div className="s">RENDA MÉDIA</div><div style=${{ display: 'flex', gap: 4, alignItems: 'center' }}><span>R$</span><${Num} className="box" style=${{ fontSize: 16, width: 80 }} value=${E.renda} onChange=${v => setE({ renda: v })} min=${0} /><span>mil</span></div><div className="l">domiciliar mensal do público-alvo</div></div>
      <${Kpi} s="POPULAÇÃO" v=${ib?.popEst ? num(ib.popEst.v) : ib?.pop ? num(ib.pop.v) : '—'} l=${ib ? ib.nome + ' · ' + (ib.popEst ? 'estimativa ' + ib.popEst.per : 'Censo ' + ib.pop?.per) : 'localize o endereço'} t="p" help="Fonte: IBGE." />
      <${Kpi} s="PIB PER CAPITA" v=${ib?.pibPc ? mil(ib.pibPc) : '—'} l=${ib?.pib ? 'IBGE · PIB municipal ' + ib.pib.per : 'IBGE'} t="p" help="PIB municipal a preços correntes dividido pela população." />
      <${Kpi} s="PREÇO MÉDIO" v=${MK.preco ? mil(MK.preco) : '—'} l="por m² · ponderado pelo estoque" t="y" />
      <${Kpi} s="VSO" v=${MK.vso ? num(MK.vso, 1) + '% a.m.' : '—'} l=${'mediana de ' + MK.n + ' empreendimentos'} t="y" />
      <${Kpi} s="ABSORÇÃO" v=${MK.abs ? num(MK.abs, 0) + ' meses' : '—'} l=${num(MK.est) + ' un. em estoque · ' + num(MK.vel, 0) + ' vendas/mês'} t="y" />
      <${Kpi} s="RENDA NECESSÁRIA" v=${aff ? mil(aff.renda) : '—'} l=${aff ? '1ª parcela SAC ' + mil(aff.parc) + ' · juros ' + num(real.macro.jurosImob.v, 2) + '% a.a. (BCB)' : 'aguardando juros do Banco Central'} t=${!aff || aff.ratio == null ? 'n' : aff.ratio <= 1 ? 'g' : aff.ratio <= 1.3 ? 'y' : 'r'} help="Renda familiar para comprar o ticket médio: 80% financiado em 360 meses no SAC, parcela de até 30% da renda, juros médios reais do financiamento imobiliário (BCB série 20772)." />
    </div>
    <${Card} title="Concorrência direta" sub=${st.concs.length + ' empreendimentos · pesquisa de campo (edite a tabela)'} right=${html`<div className="noprint" style=${{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button className="btn sm" onClick=${() => set({ sec: 'dados' })}><${Icon} n="dados" s=${14} />${st.bases?.length ? 'Base de dados (' + num(st.bases.reduce((a, b) => a + b.rows.length, 0)) + ' linhas)' : 'Importar base de dados'}</button>
        <button className="btn sm" onClick=${() => ctx.abrirIA('extracao')}><${Icon} n="doc" s=${14} />Importar tabela de vendas</button>
        <button className="btn ia sm" onClick=${() => ctx.perguntar('Pesquise na web lançamentos e empreendimentos residenciais à venda num raio de até 3 km de ' + (E.endereco || 'meu terreno') + ', com tipologia, padrão, preço por m², ticket e estoque quando houver. Depois proponha adicioná-los à concorrência.', { web: true })}><${Icon} n="globe" s=${14} />Pesquisar concorrentes na web</button></div>`}>
      <${EditList} rows=${st.concs} onChange=${setConcs} novo=${() => ({ nome: 'Novo empreendimento', tipo: '', padrao: '', m2: 0, ticket: 0, vso: 0, estoque: 0 })} addLabel="+ Inserir empreendimento"
        cols=${[{ k: 'nome', l: 'EMPREENDIMENTO' }, { k: 'tipo', l: 'TIPOLOGIA', w: 120 }, { k: 'padrao', l: 'PADRÃO', w: 100 }, { k: 'm2', l: 'R$/M²', t: 'num', w: 85 }, { k: 'ticket', l: 'TICKET MIL', t: 'num', w: 85 }, { k: 'vso', l: 'VSO %', t: 'num', w: 70 }, { k: 'estoque', l: 'ESTOQUE', t: 'num', w: 75 }]} />
      <div className="kv" style=${{ background: 'var(--gbg)', borderRadius: 8, padding: '8px 10px', marginTop: 8 }}><span><strong>${PR.nome}</strong> (este estudo) · ${PR.mix.map(m => m.tipo).join(', ')}</span><b>${mil(D.preco)}/m² · R$ ${num(R.ticket / 1000)} mil · ${num(PR.vso, 1)}% · ${num(D.un)} un.</b></div>
    <//>
    <div className="grid g2">
      <${Card} title="Preço por m² · comparativo" sub="este estudo destacado">
        ${barras.map((b, i) => html`<div key=${i} className="hbar" style=${{ gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,2fr) 80px' }}><span style=${{ fontWeight: b[2] ? 600 : 400 }}>${b[0]}</span><div className="tr"><i style=${{ width: (b[1] / bmx * 100) + '%', background: b[2] ? 'var(--g2)' : 'var(--zero)' }}></i></div><span className="mono" style=${{ textAlign: 'right', fontSize: 11 }}>${mil(b[1])}</span></div>`)}
      <//>
      <${Card} title="Oferta por tipologia" sub=${'estoque de ' + num(MK.est) + ' un.'}>
        ${MK.tip.length ? html`<div style=${{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}><${Donut} data=${MK.tip} />
          <table style=${{ flex: 1, minWidth: 200 }}><thead><tr><th>TIPOLOGIA</th><th className="num">OFERTA</th><th className="num">R$/M²</th></tr></thead><tbody>
          ${MK.tip.map((t, i) => html`<tr key=${i}><td><span style=${{ display: 'flex', gap: 7, alignItems: 'center' }}><span className="dot" style=${{ background: CAT[i] }}></span>${t.tipo}</span></td><td className="num">${pct(t.share, 0)}</td><td className="num">${num(t.m2)}</td></tr>`)}</tbody></table></div>` : html`<div className="alert na">Cadastre concorrentes com estoque e preço.</div>`}
      <//>
    </div>
    <div className="grid g2">
      <${Card} title="Premissas de mercado" sub="calculadas a partir dos dados do estudo">
        ${M.premissas.length ? M.premissas.map((p, i) => html`<div key=${i} className="kv"><span style=${{ display: 'flex', gap: 8, alignItems: 'flex-start' }}><${Pill} k=${p.k}>${NIVM[p.k]}<//><span>${p.t}</span></span><b>${p.v}</b></div>`) : html`<div className="alert na">Preencha concorrência, demanda e renda.</div>`}
      <//>
      <${Card} title="Riscos de mercado" sub="avaliação do analista">
        <${EditList} rows=${st.listas.riscosMercado} onChange=${v => setL({ riscosMercado: v })} novo=${() => ({ t: '', v: '', k: 'at' })} cols=${[{ k: 't', l: 'RISCO', area: true }, { k: 'v', l: 'VALOR', w: 90 }, { k: 'k', l: 'NÍVEL', t: 'nivelM', w: 90 }]} />
        <div style=${{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
          <${Field} label="Perfil local" style=${{ flex: 1 }}><${Txt} className="box" value=${E.perfil} onChange=${v => setE({ perfil: v })} /><//>
          <${Field} label="Descrição do perfil" style=${{ flex: 2 }}><${Txt} className="box" value=${E.perfilDesc} onChange=${v => setE({ perfilDesc: v })} /><//>
        </div>
      <//>
    </div>
  </div>`;
}

function Produto({ ctx }) {
  const { st, M, set, setProd } = ctx; const { PR, D, R } = M;
  const mixUpd = (i, patch) => setProd({ mix: PR.mix.map((m, j) => j === i ? { ...m, ...patch } : m) });
  const permTipo = [D.perm > 0 && 'física', PR.permFin > 0 && 'financeira', PR.terrenoCash > 0 && 'dinheiro'].filter(Boolean);
  const acimaTeto = PR.programa === 'mcmv' ? PR.mix.filter(m => m.area * m.preco > (PR.teto || 0)) : [];
  const ader = Math.round(ADER_CRIT.reduce((a, _, i) => a + (PR.ader[i] ?? 50), 0) / ADER_CRIT.length);
  const addProd = () => set(s => { const b = clone(s.produtos[M.sel]); const np = { ...b, id: uid(), nome: 'Produto ' + String.fromCharCode(65 + s.produtos.length), descr: '', capa: null }; return { produtos: s.produtos.concat([np]), prodSel: s.produtos.length }; });
  const delProd = () => { if (st.produtos.length > 1 && confirmar('Remover ' + PR.nome + '?')) set(s => ({ produtos: s.produtos.filter((_, j) => j !== M.sel), prodSel: 0 })); };
  return html`<div className="grid">
    <${Card} title="Dados do produto" right=${html`<div className="noprint" style=${{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><button className="btn ia sm" onClick=${() => ctx.abrirIA('produtos')}><${Icon} n="ia" s=${14} />Sugerir produtos com IA</button><button className="btn sm" onClick=${addProd}>+ Inserir produto (cópia)</button>${st.produtos.length > 1 ? html`<button className="btn sm" onClick=${delProd}>Remover</button>` : null}</div>`}>
      <div className="grid g4">
        <${Field} label="Nome"><${Txt} className="box" value=${PR.nome} onChange=${v => setProd({ nome: v })} /><//>
        <${Field} label="Tipo de edificação"><select className="in box" value=${PR.tipoEdif} onChange=${e => setProd({ tipoEdif: e.target.value })}>${['torre residencial', 'duas torres residenciais', 'condomínio de casas', 'edifício baixo (até 4 pav.)', 'uso misto (residencial + lojas)'].map(o => html`<option key=${o}>${o}</option>`)}</select><//>
        <${Field} label="Padrão"><select className="in box" value=${PR.padrao} onChange=${e => setProd({ padrao: e.target.value })}>${['econômico', 'médio', 'médio-alto', 'alto', 'luxo'].map(o => html`<option key=${o}>${o}</option>`)}</select><//>
        <${Field} label="Programa"><select className="in box" value=${PR.programa} onChange=${e => { const v = e.target.value; setProd(v === 'mcmv' ? { programa: 'mcmv', faixa: PR.faixa || 3, teto: PR.teto || M.PM.tetoMcmv[PR.faixa || 3], custos: { ...PR.custos, ret: 1 } } : { programa: 'mercado', custos: { ...PR.custos, ret: 4 } }); }}><option value="mercado">Mercado (SBPE)</option><option value="mcmv">Minha Casa Minha Vida</option></select><//>
        <${Field} label="Pavimentos-tipo"><${Num} className="box" value=${PR.pavimentos} onChange=${v => setProd({ pavimentos: v })} min=${1} /><//>
        <${Field} label="Unidades por andar"><${Num} className="box" value=${PR.unAndar} onChange=${v => setProd({ unAndar: v })} min=${1} /><//>
        <${Field} label="Área comum (m²)"><${Num} className="box" value=${PR.comum} onChange=${v => setProd({ comum: v })} min=${0} /><//>
        <${Field} label="Área de garagem (m²) · vagas"><div style=${{ display: 'flex', gap: 4 }}><${Num} className="box" value=${PR.garagem} onChange=${v => setProd({ garagem: v })} min=${0} /><${Num} className="box" value=${PR.vagas} onChange=${v => setProd({ vagas: v })} min=${0} /></div><//>
        ${PR.programa === 'mcmv' ? html`<${Field} label="Faixa MCMV"><select className="in box" value=${PR.faixa} onChange=${e => { const f = +e.target.value; setProd({ faixa: f, teto: M.PM.tetoMcmv[f] }); }}>${[1, 2, 3, 4].map(f => html`<option key=${f} value=${f}>Faixa ${f}</option>`)}</select><//>
          <${Field} label="Teto por unidade (R$)"><${Num} className="box" value=${PR.teto} onChange=${v => setProd({ teto: v })} min=${1} /><//>
          <div className=${'alert ' + (acimaTeto.length ? 'cr' : 'ok')} style=${{ gridColumn: 'span 2' }}>${acimaTeto.length ? acimaTeto.length + ' tipologia(s) acima do teto: ' + acimaTeto.map(m => m.tipo).join(', ') + '.' : 'Todas as tipologias dentro do teto; RET de 1% aplicado.'} Confira tetos vigentes no regulamento do programa.</div>` : null}
        <${Field} label="Descrição" style=${{ gridColumn: '1 / -1' }}><${Txt} area className="box" value=${PR.descr} onChange=${v => setProd({ descr: v })} /><//>
      </div>
    <//>
    <${Card} title="Mix de unidades" sub=${'VGV vendável ' + milhoes(D.vgv) + ' · ' + num(D.unT) + ' unidades · ' + num(D.ap) + ' m² · ticket médio R$ ' + num(D.vgv / D.un / 1000) + ' mil'}>
      <div className="tblwrap"><table><thead><tr><th>TIPOLOGIA</th><th className="num">UNID.</th><th className="num">ÁREA M²</th><th className="num">R$/M²</th><th className="num">TICKET</th><th className="num">PERMUTA</th><th className="num">% VGV</th><th></th></tr></thead><tbody>
        ${PR.mix.map((m, i) => { const vg = (m.un - m.perm) * m.area * m.preco; return html`<tr key=${i}><td><${Txt} value=${m.tipo} onChange=${v => mixUpd(i, { tipo: v })} /></td>
          <td style=${{ width: 80 }}><${Num} value=${m.un} onChange=${v => mixUpd(i, { un: v, perm: Math.min(m.perm, v) })} min=${1} /></td><td style=${{ width: 90 }}><${Num} value=${m.area} onChange=${v => mixUpd(i, { area: v })} min=${1} /></td>
          <td style=${{ width: 100 }}><${Num} value=${m.preco} onChange=${v => mixUpd(i, { preco: v })} min=${1} /></td><td className="num" style=${{ color: PR.programa === 'mcmv' && m.area * m.preco > (PR.teto || 0) ? 'var(--r)' : '' }}>${'R$ ' + num(m.area * m.preco / 1000) + ' mil'}</td>
          <td style=${{ width: 80 }}><${Num} value=${m.perm} onChange=${v => mixUpd(i, { perm: Math.min(v, m.un) })} min=${0} /></td><td className="num">${pct(vg / (D.vgv || 1), 0)}</td>
          <td className="noprint"><button className="rowx" onClick=${() => PR.mix.length > 1 && setProd({ mix: PR.mix.filter((_, j) => j !== i) })}>×</button></td></tr>`; })}
      </tbody></table></div>
      <button className="add" onClick=${() => setProd({ mix: PR.mix.concat([{ tipo: 'Nova tipologia', un: 1, area: 60, preco: Math.round(D.preco || 8000), perm: 0 }]) })}>+ tipologia</button>
    <//>
    <div className="grid g2">
      <${Card} title="Pagamento do terreno" sub=${'modalidade: ' + (permTipo.length ? permTipo.join(' + ') : 'não definida') + ' · permuta física na coluna PERMUTA do mix'}>
        <div className="grid g2" style=${{ marginBottom: 10 }}>
          <${Field} label="Permuta financeira (% do VGV)"><${Num} className="box" value=${PR.permFin} onChange=${v => setProd({ permFin: v })} min=${0} max=${99} /><//>
          <${Field} label="Pagamento em dinheiro (R$)"><${Num} className="box" dec=${0} value=${PR.terrenoCash} onChange=${v => setProd({ terrenoCash: v })} min=${0} /><//>
        </div>
        <div className="kv"><span>Unidades / área permutadas</span><b>${num(D.perm)} un. · ${num(D.areaPerm)} m²</b></div>
        <div className="kv"><span>VGV permutado (física)</span><b>${milhoes(D.vgvPerm)}</b></div>
        <div className="kv"><span>Permuta financeira</span><b>${milhoes(R.terrenoFin)}</b></div>
        <div className="kv"><span>Custo total do terreno</span><b>${milhoes(R.terrenoEq)} · ${pct(R.terrenoEq / (D.vgv + D.vgvPerm), 1)} do VGV</b></div>
      <//>
      <${Card} title="Quadro de áreas">
        <div className="kv"><span>Área do terreno</span><b>${num(st.estudo.area)} m²</b></div>
        <div className="kv"><span>Área privativa total / vendável</span><b>${num(D.apT)} / ${num(D.ap)} m²</b></div>
        <div className="kv"><span>Área construída total</span><b>${num(D.ac)} m²</b></div>
        <div className="kv"><span>Área equivalente de custo (×0,87)</span><b>${num(D.aeq)} m²</b></div>
        <div className="kv"><span>Unidades previstas por pavimentos × andar</span><b style=${{ color: PR.pavimentos * PR.unAndar < D.unT ? 'var(--r)' : '' }}>${num(PR.pavimentos * PR.unAndar)} (mix: ${num(D.unT)})</b></div>
        <div className="kv"><span>Vagas por unidade</span><b>${num(PR.vagas / (D.unT || 1), 2)}</b></div>
        <div className="kv"><span>CTE / m² de venda</span><b>${mil(M.CTE / D.ap)}</b></div>
      <//>
    </div>
    <div className="grid g2">
      <${Card} title="Lazer e diferenciais" sub=${PR.lazer.length + ' itens · clique para incluir ou remover'}>
        <div className="chips">${[...new Set(LAZER_OPCOES.concat(PR.lazer))].map(o => { const on = PR.lazer.includes(o); return html`<button key=${o} className=${'chip' + (on ? ' on' : '')} onClick=${() => setProd({ lazer: on ? PR.lazer.filter(x => x !== o) : PR.lazer.concat([o]) })}>${o}</button>`; })}</div>
        <div style=${{ display: 'flex', gap: 6, marginTop: 10 }} className="noprint"><input id="novoLazer" className="in box" placeholder="Outro item…" onKeyDown=${e => { if (e.key === 'Enter' && e.target.value.trim()) { setProd({ lazer: PR.lazer.concat([e.target.value.trim()]) }); e.target.value = ''; } }} /></div>
      <//>
      <${Card} title="Aderência produto × demanda" sub=${ader + '/100 · ' + (ader >= 80 ? 'alta' : ader >= 60 ? 'média' : 'baixa')}>
        ${ADER_CRIT.map((c, i) => { const n = PR.ader[i] ?? 50; return html`<div key=${i} style=${{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1.5fr) 34px', gap: 10, alignItems: 'center', padding: '5px 0' }}>
          <span style=${{ fontSize: 12 }}>${c}</span><input type="range" min="0" max="100" value=${n} style=${{ accentColor: n >= 80 ? '#1E8F52' : n >= 60 ? '#D89B26' : '#E0644A' }} onChange=${e => setProd({ ader: ADER_CRIT.map((_, j) => j === i ? +e.target.value : (PR.ader[j] ?? 50)) })} /><b className="mono" style=${{ textAlign: 'right' }}>${n}</b></div>`; })}
        <div className="note">Nota de 0 a 100 por critério, dada pelo analista a partir do estudo de mercado. A aderência é a média.</div>
      <//>
    </div>
    <${ImagemIA} ctx=${ctx} />
  </div>`;
}


function ImagemIA({ ctx }) {
  const { st, set, M, real, imgs, addImg, delImg, setCapa, capas } = ctx; const { PR, D } = M;
  const cfg = st.img || {};
  const setCfg = p => set(s => ({ img: { ...s.img, ...p } }));
  const auto = promptImagem(st, PR, D, real.geo ? { cidade: real.ibge?.nome || real.geo.cidade, uf: real.ibge?.uf || real.geo.uf } : null);
  const [prompt, setPrompt] = useState(null);
  const [busy, setBusy] = useState(false), [err, setErr] = useState(''), [zoom, setZoom] = useState(null);
  const [chave, setChave] = useState(() => { try { return localStorage.getItem('predic-key-' + (cfg.provider || 'pollinations')) || ''; } catch (e) { return ''; } });
  useEffect(() => { try { setChave(localStorage.getItem('predic-key-' + (cfg.provider || 'pollinations')) || ''); } catch (e) { } }, [cfg.provider]);
  const salvarChave = v => { setChave(v); try { localStorage.setItem('predic-key-' + (cfg.provider || 'pollinations'), v); } catch (e) { } };
  const pr = prompt ?? auto;
  const minhas = imgs.filter(i => i.prodId === PR.id).sort((a, b) => b.em - a.em);
  const gerar = async () => {
    setBusy(true); setErr('');
    try {
      const seed = Math.floor(Math.random() * 1e6);
      const r = await gerarImagem({ prompt: pr, provider: cfg.provider || 'pollinations', formato: cfg.formato || '16:9', seed, chave });
      await addImg({ prodId: PR.id, ...r, prompt: pr, seed, provider: cfg.provider || 'pollinations', em: Date.now() });
    } catch (e) { setErr(e.message || String(e)); }
    setBusy(false);
  };
  const upload = e => { const f = e.target.files[0]; e.target.value = ''; if (f) addImg({ prodId: PR.id, blob: f, prompt: 'Imagem enviada: ' + f.name, provider: 'upload', em: Date.now() }); };
  return html`<${Card} title="Imagem do produto · gerada por IA" sub="o prompt é montado com os dados do estudo; edite à vontade antes de gerar" className="noprint-gal">
    <div className="grid g12">
      <div className="grid" style=${{ alignContent: 'start' }}>
        <${Field} label="Cena"><select className="in box" value=${cfg.vista || 'fachada'} onChange=${e => { setCfg({ vista: e.target.value }); setPrompt(null); }}>${Object.entries(IMG_VISTAS).map(([k, l]) => html`<option key=${k} value=${k}>${l}</option>`)}</select><//>
        <${Field} label="Estilo arquitetônico"><select className="in box" value=${cfg.estilo || 'contemporâneo'} onChange=${e => { setCfg({ estilo: e.target.value }); setPrompt(null); }}>${IMG_ESTILOS.map(o => html`<option key=${o}>${o}</option>`)}</select><//>
        <${Field} label="Formato"><${Seg} opts=${Object.keys(IMG_FORMATOS).map(k => [k, k])} value=${cfg.formato || '16:9'} onChange=${v => setCfg({ formato: v })} /><//>
        <${Field} label="Pedido livre (cores, materiais, clima, horário…)"><${Txt} area rows=${2} className="box" value=${cfg.extra} onChange=${v => { setCfg({ extra: v }); setPrompt(null); }} placeholder="Ex.: fachada em concreto aparente e madeira, varandas com vidro, céu de fim de tarde" /><//>
        <${Field} label="Provedor"><select className="in box" value=${cfg.provider || 'pollinations'} onChange=${e => setCfg({ provider: e.target.value })}><option value="pollinations">Pollinations.ai (gratuito, sem cadastro)</option><option value="openai">OpenAI gpt-image-1 (sua chave, maior qualidade)</option></select><//>
        <${Field} label=${cfg.provider === 'openai' ? 'Chave da API OpenAI' : 'Token Pollinations (opcional, remove marca d’água)'}><input type="password" className="in box" value=${chave} onChange=${e => salvarChave(e.target.value)} placeholder=${cfg.provider === 'openai' ? 'sk-…' : 'opcional'} autoComplete="off" /><//>
        <div className="note">A chave fica só neste navegador e vai direto para o provedor escolhido.</div>
      </div>
      <div className="grid" style=${{ alignContent: 'start' }}>
        <${Field} label=${'Prompt enviado ao gerador' + (prompt != null ? ' (editado)' : ' (automático)')}>
          <textarea className="in box" rows="6" value=${pr} onChange=${e => setPrompt(e.target.value)}></textarea>
        <//>
        <div style=${{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn g" disabled=${busy || !pr.trim()} onClick=${gerar}>${busy ? 'Gerando…' : '✦ Gerar imagem'}</button>
          ${prompt != null ? html`<button className="btn" onClick=${() => setPrompt(null)}>Voltar ao prompt automático</button>` : null}
          <label className="btn" style=${{ cursor: 'pointer' }}>Enviar foto/render próprio<input type="file" accept="image/*" style=${{ display: 'none' }} onChange=${upload} /></label>
          ${busy ? html`<div className="spin"></div><span className="sub">pode levar de 10 a 60 segundos</span>` : null}
        </div>
        ${err ? html`<div className="alert cr">${err}</div>` : null}
        ${minhas.length ? html`<div className="gal">${minhas.map(im => html`<figure key=${im.key}>
          <img src=${im.url} alt=${im.prompt} title=${im.prompt} onClick=${() => setZoom(im.url)} />
          <figcaption>
            <button className=${'btn sm' + (capas[PR.id] === im.url ? ' g' : '')} onClick=${() => setCapa(PR.id, im.key)}>${capas[PR.id] === im.url ? '★ Capa' : 'Usar como capa'}</button>
            <a className="btn sm" href=${im.url} target="_blank" rel="noopener" download=${(PR.nome || 'produto') + '-' + im.key + '.png'}>${im.blob ? 'Baixar' : 'Abrir'}</a>
            <button className="btn sm" onClick=${() => setPrompt(im.prompt)} title="Reusar este prompt">Prompt</button>
            <button className="rowx" onClick=${() => delImg(im.key)} title="Excluir">×</button>
          </figcaption></figure>`)}</div>` : html`<div className="imgbox">Nenhuma imagem ainda para ${PR.nome}</div>`}
        <div className="note">Imagens geradas por IA são ilustrativas e não substituem o projeto de arquitetura.</div>
      </div>
    </div>
    ${zoom ? html`<div className="zoom" onClick=${() => setZoom(null)}><img src=${zoom} alt="ampliada" /></div>` : null}
  <//>`;
}

function Orcamento({ ctx }) {
  const { st, M, setProd, real } = ctx; const { PR, D, R } = M;
  const sin = real.sinapi; const cub = st.estudo.cub;
  const caps = [['sfh', 'Plano empresário (SFH)', 60, 10.5], ['sfh40', 'SFH conservador', 40, 11.5], ['auto', 'Autofinanciado', 0, 10.5], ['assoc', 'Crédito associativo', 0, 10.5], ['livre', 'Personalizado']];
  const fontes = (() => { const prop = Math.abs(R.expo), fin = R.sacado, perm = R.permPaga; const rec = Math.max(0, M.CTE - prop - fin - perm); return [['Recebíveis das vendas', rec, '#2BB673'], ['Financiamento à produção', fin, 'var(--ink2)'], ['Permuta financeira do terreno', perm, '#D89B26'], ['Capital próprio do incorporador', prop, '#7A6CBE']]; })();
  const cp = Math.abs(R.expo) / M.CTE;
  const PO = M.PM.preObra, rows = PR.crono.map(c => c.obra ? { ...c, ini: PO + 1, fim: PO + PR.prazo } : c);
  const T = Math.max(12, Math.ceil(Math.max(...rows.map(r => r.fim)) / 6) * 6);
  const updC = (id, p) => setProd({ crono: PR.crono.map(x => x.id === id ? { ...x, ...p } : x) });
  const c = R.cost.slice(1, R.cost.length - 1), tot = c.reduce((a, b) => a + b, 0) || 1; let acc = 0; const curva = c.map(v => (acc += v) / tot * 100);
  const mes = q => curva.findIndex(v => v >= q) + 1;
  return html`<div className="grid">
    <div className="grid g6">
      <${Kpi} s="CTE" v=${milhoes(M.CTE)} l=${pct(M.CTE / R.vgv, 0) + ' do VGV'} t="g" />
      <${Kpi} s="CTE / M² VENDA" v=${mil(M.CTE / D.ap)} l="custo total por m² privativo" t="g" help="" />
      <${Kpi} s="PRAZO" v=${PR.prazo + ' meses'} l=${'de obra · entrega no mês ' + (6 + PR.prazo)} t="p" help="Prazo de construção, do início da obra à entrega." />
      <${Kpi} s="SINAPI" v=${sin ? mil(sin.v) : '—'} l=${sin ? sin.uf + ' · ' + sin.mes + (sin.var12 != null ? ' · ' + (sin.var12 >= 0 ? '+' : '') + pct(sin.var12, 1) + ' em 12m' : '') : 'localize o endereço'} t="p" />
      <${Kpi} s="CUSTO / SINAPI" v=${sin ? num(PR.custo / sin.v, 2) + '×' : '—'} l="custo adotado sobre o SINAPI da UF" t=${!sin ? 'n' : PR.custo / sin.v < 1.2 ? 'r' : PR.custo / sin.v < 1.5 ? 'y' : 'g'} help="O SINAPI não inclui BDI, fundações especiais, elevadores, lazer e áreas comuns de padrão superior. Para edifícios de médio-alto padrão, custos abaixo de ~1,3× o SINAPI tendem a estar subestimados." />
      <${Kpi} s="CAPITAL PRÓPRIO / CTE" v=${pct(cp, 0)} l=${cp <= 0.25 ? 'risco baixo' : cp <= 0.4 ? 'risco moderado' : 'risco alto'} t=${cp <= 0.25 ? 'g' : cp <= 0.4 ? 'y' : 'r'} help="Exposição máxima de caixa sobre o custo total." />
    </div>
    <div className="grid g21">
      <${Card} title="Custo Total do Empreendimento" sub=${milhoes(M.CTE) + ' · ' + mil(M.CTE / D.ap) + '/m² de venda'}>
        <${HBars} rows=${M.usos} total=${M.CTE} />
      <//>
      <${Card} title="Premissas de custo">
        <div className="grid g2">
          <${Field} label="Custo de obra (R$/m² equiv.)"><${Num} className="box" value=${PR.custo} onChange=${v => setProd({ custo: v })} min=${1} /><//>
          <${Field} label="Prazo de obra (meses)"><${Num} className="box" value=${PR.prazo} onChange=${v => setProd({ prazo: Math.round(v) })} min=${6} max=${96} /><//>
          ${CUSTO_CAMPOS.map(([l, u, k, d]) => html`<${Field} key=${k} label=${l + ' (' + u + ')'}><${Num} className="box" value=${PR.custos?.[k] ?? d} onChange=${v => setProd({ custos: { ...PR.custos, [k]: v } })} min=${0} /><//>`)}
          <${Field} label="CUB de referência (R$/m², opcional)"><${Num} className="box" value=${cub || null} onChange=${v => ctx.setE({ cub: v })} min=${0} placeholder="Sinduscon" /><//>
        </div>
        <div className="note" style=${{ marginTop: 8 }}>Obra = ${num(D.aeq)} m² equivalentes × ${mil(PR.custo)}${cub ? ' · ' + num(PR.custo / cub, 2) + '× o CUB informado' : ''}.</div>
      <//>
    </div>
    <div className="grid g2">
      <${Card} title="Capitalização" sub="quadro de fontes">
        <div className="chips" style=${{ marginBottom: 10 }}>${caps.map(([k, l, f, j]) => html`<button key=${k} className=${'chip' + ((PR.capModelo || 'sfh') === k ? ' on' : '')} onClick=${() => setProd(k === 'livre' ? { capModelo: 'livre', assoc: false } : { capModelo: k, finPct: f, finJuros: j, assoc: k === 'assoc' })}>${l}</button>`)}</div>
        <div className="grid g2" style=${{ marginBottom: 10 }}>
          ${PR.assoc ? html`<${Field} label="Entrada do comprador (% do preço)"><${Num} className="box" value=${PR.entrada} onChange=${v => setProd({ entrada: v })} min=${0} max=${100} /><//>`
            : html`<${Field} label="Financiamento à produção (% da obra)"><${Num} className="box" value=${PR.finPct} onChange=${v => setProd({ finPct: v, capModelo: 'livre' })} min=${0} max=${90} /><//>
              <${Field} label="Juros do financiamento (% a.a.)"><${Num} className="box" value=${PR.finJuros} onChange=${v => setProd({ finJuros: v, capModelo: 'livre' })} min=${0} max=${40} /><//>`}
        </div>
        <${HBars} rows=${fontes} total=${fontes.reduce((a, f) => a + f[1], 0)} />
        <div className="kv" style=${{ marginTop: 6 }}><span>Juros pagos no ciclo</span><b>${milhoes(R.jurosTotal)}</b></div>
        <div className="kv"><span>RCE · resultado sobre capital exposto</span><b>${num(R.lucro / Math.abs(R.expo || 1), 2)}×</b></div>
      <//>
      <${Card} title="Curva S · desembolso acumulado" sub=${milhoes(tot) + ' no ciclo · 25% no mês ' + mes(25) + ', 50% no mês ' + mes(50) + ', 75% no mês ' + mes(75)}>
        <${LineChart} h=${200} series=${[{ name: 'Desembolso no mês', color: 'var(--zero)', values: c.map(v => v / tot * 100 * 8), type: 'bar' }, { name: 'Acumulado', color: '#1E8F52', values: curva, width: 2.4 }]} yMin=${0} yMax=${100} yFmt=${v => num(v, 0) + '%'} tipFmt=${v => num(v, 1) + '%'} xLab=${i => 'M' + (i + 1)} />
        <div className="note" style=${{ marginTop: 6 }}>Barras: desembolso mensal (escala relativa ×8 para leitura). Linha: % acumulado do CTE.</div>
      <//>
    </div>
    <${Card} title="Cronograma-mestre" sub="a etapa Obra define o prazo de construção; a etapa Lançamento define o início das vendas">
      <div className="tblwrap"><table><thead><tr><th>ETAPA</th><th className="num">INÍCIO</th><th className="num">FIM</th><th style=${{ width: '45%' }}>LINHA DO TEMPO · M0 A M${T}</th><th></th></tr></thead><tbody>
        ${rows.map(r => html`<tr key=${r.id}><td><${Txt} value=${r.nome} onChange=${v => updC(r.id, { nome: v })} /></td>
          <td style=${{ width: 70 }}>${r.obra ? html`<span className="mono" style=${{ display: 'block', textAlign: 'right', paddingRight: 6 }}>${PO + 1}</span>` : html`<${Num} value=${r.ini} onChange=${v => v <= r.fim && updC(r.id, { ini: v })} min=${0} />`}</td>
          <td style=${{ width: 70 }}><${Num} value=${r.fim} onChange=${v => { if (v <= r.ini) return; if (r.obra) setProd({ prazo: Math.max(6, v - PO) }); else updC(r.id, { fim: v }); }} min=${1} /></td>
          <td><div className="gantt-tr" title=${r.nome + ': M' + r.ini + ' – M' + r.fim}><i style=${{ left: (r.ini / T * 100) + '%', width: Math.max(1, (r.fim - r.ini) / T * 100) + '%', background: corEtapa(r.cor) }}></i></div></td>
          <td className="noprint">${r.obra ? null : html`<button className="rowx" onClick=${() => setProd({ crono: PR.crono.filter(x => x.id !== r.id) })}>×</button>`}</td></tr>`)}
      </tbody></table></div>
      <button className="add" onClick=${() => setProd({ crono: PR.crono.concat([{ id: uid(), nome: 'Nova etapa', ini: 0, fim: 6, cor: '#A6B1AB' }]) })}>+ etapa</button>
    <//>
  </div>`;
}

// Premissas do motor financeiro: regime de recebimento, distratos, curva de obra e tetos do MCMV.
function PremissasMotor({ ctx }) {
  const { st, M, set } = ctx; const P = M.PM;
  const [aberto, setAberto] = useState(false);
  const up = patch => set(s => ({ premissas: { ...premOf(s), ...patch } }));
  const chaves = Math.max(0, 100 - P.recAto - P.recObra);
  const mudou = st.premissas && JSON.stringify(premOf(st)) !== JSON.stringify(premOf({}));
  const F = (l, k, o = {}) => html`<${Field} label=${l}><${Num} className="box" value=${P[k]} onChange=${v => up({ [k]: v })} min=${o.min ?? 0} max=${o.max} /><//>`;
  return html`<${Card} title="Premissas do motor financeiro" sub=${'regime de recebimento, distratos, curva de obra e área equivalente' + (mudou ? ' · personalizadas neste estudo' : ' · padrão do PREDIC')}
    right=${html`<div className="noprint" style=${{ display: 'flex', gap: 6 }}>${mudou ? html`<button className="btn sm" onClick=${() => set({ premissas: null })}>Restaurar padrão</button>` : null}<button className="btn sm" onClick=${() => setAberto(a => !a)}>${aberto ? 'Ocultar' : 'Ver e editar'}</button></div>`}>
    ${aberto || ctx.printAll ? html`<div className="grid" style=${{ gap: 16 }}>
      <div><h3 className="minih">Vendas na planta (até a entrega)</h3><div className="grid g4">
        ${F('Ato / sinal (% do preço)', 'recAto', { max: 100 })}${F('Parcelas durante a obra (%)', 'recObra', { max: 100 })}
        <${Field} label="Chaves / repasse (%)"><div className="in box mono" style=${{ textAlign: 'right', opacity: .75 }}>${num(chaves, 1)}</div><//>
        ${F('Meses antes do início da obra', 'preObra', { max: 36 })}
      </div>${P.recAto + P.recObra > 100 ? html`<div className="alert cr" style=${{ marginTop: 8 }}>Ato + obra passam de 100%; o repasse foi zerado.</div>` : null}</div>
      <div><h3 className="minih">Vendas após a entrega</h3><div className="grid g4">
        ${F('À vista / entrada (%)', 'posAto', { max: 100 })}${F('Repasse do saldo (meses)', 'posRepasse', { max: 24 })}
      </div></div>
      <div><h3 className="minih">Distratos (Lei 13.786/18)</h3><div className="grid g4">
        ${F('Retenção sobre o pago (%)', 'distRetencao', { max: 100 })}${F('Custos do distrato (% do valor)', 'distCusto', { max: 30 })}
        ${F('Revenda das unidades (%)', 'distRevenda', { max: 100 })}${F('Prazo de revenda (meses)', 'distRevendaMeses', { min: 1, max: 36 })}
      </div></div>
      <div><h3 className="minih">Obra e áreas</h3><div className="grid g4">
        <${Field} label="Curva de desembolso da obra" style=${{ gridColumn: 'span 2' }}><select className="in box" value=${P.curva} onChange=${e => up({ curva: e.target.value })}>${Object.entries(CURVAS).map(([k, c]) => html`<option key=${k} value=${k}>${c[0]}</option>`)}</select><//>
        ${F('Área equivalente (% da construída)', 'aeqFator', { min: 30, max: 120 })}
      </div></div>
      <div><h3 className="minih">Tetos do Minha Casa Minha Vida (R$ por unidade)</h3><div className="grid g4">
        ${[1, 2, 3, 4].map(f => html`<${Field} key=${f} label=${'Faixa ' + f}><${Num} className="box" value=${P.tetoMcmv[f]} onChange=${v => up({ tetoMcmv: { ...P.tetoMcmv, [f]: v } })} min=${1} /><//>`)}
      </div><p className="note" style=${{ marginTop: 6 }}>Valores de referência ${P.tetoRef}. Os tetos mudam por portaria do Ministério das Cidades e variam por município nas faixas 1 e 2: confira a regra vigente antes de levar o estudo ao comitê.</p></div>
    </div>` : html`<div className="chips">${[
      'Planta: ' + num(P.recAto, 0) + '% ato · ' + num(P.recObra, 0) + '% obra · ' + num(chaves, 0) + '% chaves',
      'Pós-entrega: ' + num(P.posAto, 0) + '% + repasse em ' + P.posRepasse + ' m',
      'Distrato: retém ' + num(P.distRetencao, 0) + '% · revende ' + num(P.distRevenda, 0) + '%',
      (CURVAS[P.curva] || CURVAS.sino)[0], 'Área equivalente ' + num(P.aeqFator, 0) + '%'
    ].map((t, i) => html`<span key=${i} className="chip">${t}</span>`)}</div>`}
  <//>`;
}

function Financeiro({ ctx }) {
  const { st, M, set, real } = ctx; const { R, RR, esp, D } = M; const C = st.comite; const SC = st.cenarios;
  const cf = st.cenFluxo || 'base', RF = RR[KS.indexOf(cf)];
  const setScen = (k, f, v) => set(s => ({ cenarios: { ...s.cenarios, [k]: { ...s.cenarios[k], [f]: v } } }));
  const setCom = (k, v) => set(s => ({ comite: { ...s.comite, [k]: v } }));
  const mc = real.macro;
  const inccExc = mc?.incc && mc?.ipca ? Math.max(0, mc.incc.v - mc.ipca.v) : null;
  let ar = 0, ac2 = 0; const rc = [], cc = [], sc = []; for (let t = 1; t < RF.rec.length; t++) { ar += RF.rec[t]; ac2 += RF.cost[t]; rc.push(ar); cc.push(ac2); sc.push(ar - ac2); }
  const res = [
    ['TIR anual', r => r.tir, pct, v => ok(v) && v * 100 >= C.tirMin],
    ['VPL @ TMA', r => r.vpl, milhoes, v => v > 0],
    ['Margem líquida / VGV', r => r.margem, pct, v => v * 100 >= C.margemMin],
    ['Exposição máxima', r => Math.abs(r.expo), milhoes, (v, r) => v / r.vgv * 100 <= C.expoMax],
    ['Payback', r => r.payback, v => ok(v) ? Math.round(v) + ' m' : '—', v => v <= C.paybackMax],
    ['Resultado do incorporador', r => r.lucro, milhoes, v => v > 0]
  ];
  const cor = b => b == null ? '' : b ? 'var(--g)' : 'var(--r)';
  return html`<div className="grid">
    <div className="grid g6">
      <${Kpi} s="VGV" v=${milhoes(R.vgv)} l=${num(D.un) + ' unidades vendáveis'} t="g" />
      <${Kpi} s="TIR" v=${pct(R.tir)} l=${'cenário base · ponderada ' + pct(esp(r => r.tir))} t=${M.crit.tir ? 'g' : 'r'} />
      <${Kpi} s="VPL" v=${milhoes(R.vpl)} l=${'@ TMA ' + num(st.tma, 1) + '% · ponderado ' + milhoes(esp(r => r.vpl))} t=${R.vpl > 0 ? 'g' : 'r'} />
      <${Kpi} s="MARGEM" v=${pct(R.margem)} l=${'sobre o VGV · ' + milhoes(R.lucro)} t=${M.crit.margem ? 'g' : 'y'} />
      <${Kpi} s="EXPOSIÇÃO" v=${milhoes(Math.abs(R.expo))} l=${pct(Math.abs(R.expo) / R.vgv, 0) + ' do VGV · mês ' + R.expoMes} t=${M.crit.expo ? 'p' : 'y'} />
      <${Kpi} s="PAYBACK" v=${R.payback + ' meses'} l="equilíbrio de caixa" t="p" />
    </div>
    <div className="grid g2">
      <${Card} title="Taxas e critérios do comitê" sub="valem para todo o estudo">
        <div className="grid g3">
          <${Field} label="TMA (% a.a.)"><${Num} className="box" value=${st.tma} onChange=${v => set({ tma: v })} min=${0} max=${60} /><//>
          <${Field} label="TIR mínima (% a.a.)"><${Num} className="box" value=${C.tirMin} onChange=${v => setCom('tirMin', v)} min=${0} /><//>
          <${Field} label="Margem mínima (%)"><${Num} className="box" value=${C.margemMin} onChange=${v => setCom('margemMin', v)} /><//>
          <${Field} label="Exposição máx. (% VGV)"><${Num} className="box" value=${C.expoMax} onChange=${v => setCom('expoMax', v)} min=${0} /><//>
          <${Field} label="Payback máx. (meses)"><${Num} className="box" value=${C.paybackMax} onChange=${v => setCom('paybackMax', v)} min=${1} /><//>
          <${Field} label="Pesos P / B / O (%)"><div style=${{ display: 'flex', gap: 3 }}>${[0, 1, 2].map(i => html`<${Num} key=${i} className="box" value=${st.pesos[i]} onChange=${v => set(s => ({ pesos: s.pesos.map((x, j) => j === i ? v : x) }))} min=${0} />`)}</div><//>
        </div>
      <//>
      <${Card} title="Referências reais de mercado" sub="Banco Central · aplique com um clique">
        <div className="kv"><span>Selic meta vigente</span><b>${mc?.selic ? num(mc.selic.v, 2) + '% a.a.' : '—'}</b></div>
        ${mc?.selic ? html`<div style=${{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '4px 0 8px' }} className="noprint">${[3, 5, 7].map(p => html`<button key=${p} className="btn sm" onClick=${() => set({ tma: Math.round((mc.selic.v + p) * 2) / 2 })}>TMA = Selic + ${p} p.p. (${num(Math.round((mc.selic.v + p) * 2) / 2, 1)}%)</button>`)}</div>` : null}
        <div className="kv"><span>INCC-M 12m ${mc?.incc ? '(até ' + mc.incc.data + ')' : ''}</span><b>${mc?.incc ? num(mc.incc.v, 2) + '%' : '—'}</b></div>
        <div className="kv"><span>IPCA 12m ${mc?.ipca ? '(até ' + mc.ipca.data + ')' : ''}</span><b>${mc?.ipca ? num(mc.ipca.v, 2) + '%' : '—'}</b></div>
        ${inccExc != null ? html`<div style=${{ margin: '4px 0 8px' }} className="noprint"><button className="btn sm" onClick=${() => setScen('pessimista', 'incc', Math.round(inccExc * 10) / 10)}>INCC acima do previsto no pessimista = INCC − IPCA (${num(inccExc, 1)}% a.a.)</button></div>` : null}
        <div className="kv"><span>Juros imobiliário PF ${mc?.jurosImob ? '(' + mc.jurosImob.data + ')' : ''}</span><b>${mc?.jurosImob ? num(mc.jurosImob.v, 2) + '% a.a.' : '—'}</b></div>
        <${Src}>BCB/SGS séries 432, 192, 433 e 20772<//>
      <//>
    </div>
    <div className="grid g2">
      <${Card} title="Cenários" sub="variação sobre o cenário base (edite os valores)">
        <div className="tblwrap"><table><thead><tr><th>VARIÁVEL</th>${KS.map(k => html`<th key=${k} className="num">${KSL[k].toUpperCase()}</th>`)}</tr></thead><tbody>
          ${CEN_CAMPOS.map(([f, l, u, d]) => html`<tr key=${f}><td>${l}<div className="sub">${d} · ${u}</div></td>${KS.map(k => html`<td key=${k} style=${{ width: 90 }}><${Num} value=${SC[k][f]} onChange=${v => setScen(k, f, v)} /></td>`)}</tr>`)}
        </tbody></table></div>
        <button className="add" onClick=${() => set({ cenarios: clone(SCEN0) })}>Restaurar cenários padrão</button>
      <//>
      <${Card} title="Indicadores por cenário" sub=${'ponderado com pesos ' + st.pesos.join(' / ')}>
        <table><thead><tr><th>INDICADOR</th>${KS.map(k => html`<th key=${k} className="num">${KSL[k].toUpperCase()}</th>`)}<th className="num">PONDERADO</th></tr></thead><tbody>
          ${res.map(([l, f, fm, okf], i) => { const e = esp(f); return html`<tr key=${i}><td>${l}</td>${RR.map((r, j) => html`<td key=${j} className="num" style=${{ color: cor(okf(f(r), r)) }}>${fm(f(r))}</td>`)}<td className="num" style=${{ fontWeight: 600 }}>${fm(e)}</td></tr>`; })}
        </tbody></table>
        <div style=${{ marginTop: 14 }}><${LineChart} h=${170} series=${KS.map((k, j) => ({ name: KSL[k], color: KSC[k], values: RR[j].cum, width: j === 1 ? 2.4 : 1.8, dash: j === 1 ? '' : '5 4' }))} xLab=${i => 'M' + (i + 1)} /></div>
        <${Legend} items=${KS.map((k, j) => ({ l: KSL[k] + ' · TIR ' + pct(RR[j].tir), color: KSC[k] }))} />
      <//>
    </div>
    <${PremissasMotor} ctx=${ctx} />
    <${Card} title="Fluxo acumulado · receitas × CTE" sub="antes do financiamento à produção" right=${html`<${Seg} opts=${KS.map(k => [k, KSL[k]])} value=${cf} onChange=${v => set({ cenFluxo: v })} />`}>
      <${LineChart} h=${250} series=${[{ name: 'Receitas acumuladas', color: '#1E8F52', values: rc, width: 2.2 }, { name: 'CTE acumulado', color: 'var(--ink)', values: cc, width: 2.2 }, { name: 'Saldo acumulado', color: '#D89B26', values: sc, area: true, width: 1.8, dash: '6 4' }]} xLab=${i => 'M' + (i + 1)} />
      <div style=${{ marginTop: 8 }}><${Legend} items=${[{ l: 'Receitas · ' + milhoes(ar), color: '#1E8F52' }, { l: 'CTE · ' + milhoes(ac2), color: 'var(--ink)' }, { l: 'Saldo · mín. ' + milhoes(Math.min(...sc)) + ' · final ' + milhoes(ar - ac2), color: '#D89B26' }]} /></div>
    <//>
  </div>`;
}

function Sensib({ ctx }) {
  const { st, M, set } = ctx; const ind = st.sensInd || 'tir'; const nome = ind === 'margem' ? 'a margem líquida' : 'a TIR';
  const tMx = Math.max(...M.tornado.map(t => Math.max(Math.abs(t.neg), Math.abs(t.pos)))) || 1;
  const est = k => k === 'ok' ? 'atende o comitê' : k === 'at' ? 'fica abaixo da meta' : 'destrói valor';
  return html`<div className="grid">
    <div className="card noprint" style=${{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', padding: '12px 16px' }}>
      <${Seg} opts=${[['tir', 'TIR anual'], ['margem', 'Margem líquida']]} value=${ind} onChange=${v => set({ sensInd: v })} />
      <span className="sub">Eixos vão do extremo pessimista ao otimista dos cenários; as demais variáveis ficam no base.</span>
      <span style=${{ display: 'flex', gap: 6, marginLeft: 'auto' }}><${Pill} k="ok">atende o comitê<//><${Pill} k="at">abaixo da meta<//><${Pill} k="cr">${ind === 'margem' ? 'prejuízo' : 'abaixo da TMA'}<//></span>
    </div>
    <div className="grid g3">
      ${M.matrizes.map((m, j) => html`<${Card} key=${j} title=${'Combinação ' + (j + 1)} sub=${m.nome}>
        <div className="heat" style=${{ gridTemplateColumns: '54px repeat(5,minmax(0,1fr))' }}>
          <div className="hd">${m.eixoY.split(' ')[0]} ↓</div>${m.cols.map((c, i) => html`<div key=${i} className="hd">${c}</div>`)}
          ${m.rows.map((r, i) => [html`<div key=${'l' + i} className="hd" style=${{ textAlign: 'right' }}>${r.l}</div>`, ...r.cells.map((c, k) => html`<div key=${i + '-' + k} className=${'p-' + c.k} style=${{ outline: c.mk === 'B' ? '2px solid var(--ink)' : 'none' }} title=${m.eixoX + ' ' + m.cols[k] + ' · ' + m.eixoY + ' ' + r.l + ' → ' + c.txt}>${c.txt}${c.mk ? html`<span className="mk" style=${{ background: c.mk === 'P' ? '#B23A22' : c.mk === 'O' ? '#1E8F52' : '#3B3A4E' }}>${c.mk}</span>` : null}</div>`)])}
        </div>
        <div className="xt" style=${{ justifyContent: 'center' }}>${m.eixoX} →</div>
        <div className="note" style=${{ marginTop: 8 }}>No base (B), ${nome} é ${m.B.txt}. No extremo pessimista (P), vai para ${m.P.txt} e ${est(m.P.k)}; no otimista (O), ${m.O.txt}. ${m.nOk} das 25 combinações atendem o comitê.</div>
      <//>`)}
    </div>
    <div className="grid g2">
      <${Card} title="Qual variável mais pesa" sub=${(ind === 'margem' ? 'margem líquida' : 'TIR anual') + ' · variação em p.p.'}>
        ${M.tornado.map((t, i) => html`<div key=${i} style=${{ display: 'grid', gridTemplateColumns: '20px minmax(0,1.2fr) minmax(0,2fr) 90px', gap: 8, alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--line2)' }}>
          <b className="mono">${i + 1}</b><span>${t.l}<div className="sub">${t.faixa}</div></span>
          <div style=${{ display: 'flex', height: 14 }}><div style=${{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}><i style=${{ display: 'block', width: Math.abs(Math.min(t.neg, 0)) / tMx * 100 + '%', background: '#E0644A', borderRadius: '4px 0 0 4px' }}></i></div><div style=${{ width: 1, background: 'var(--ink)' }}></div><div style=${{ flex: 1 }}><i style=${{ display: 'block', height: '100%', width: Math.max(t.pos, 0) / tMx * 100 + '%', background: '#1E8F52', borderRadius: '0 4px 4px 0' }}></i></div></div>
          <span className="mono" style=${{ textAlign: 'right', fontSize: 11 }}>${num(t.neg, 1)} / +${num(t.pos, 1)}</span></div>`)}
      <//>
      <div className="grid">
        <${Card} title="Pontos de ruptura" sub=${'meta de TIR ' + st.comite.tirMin + '% a.a.'}>
          <div className="grid g3">${M.be.map((b, i) => html`<${Kpi} key=${i} s=${['PREÇO MÍNIMO', 'CUSTO MÁXIMO', 'VSO MÍNIMA'][i]} v=${b.v} l=${b.l} t="p" help="" />`)}</div>
        <//>
        <${Card} title="Variáveis macroeconômicas" sub="efeito de +1 ponto">
          ${M.macroFx.map((m, i) => html`<div key=${i} className="kv"><span>${m.l}<div className="sub">${m.d}</div></span><b>${m.v} <span className="sub">${m.u}</span><div className="sub">${m.ref}</div></b></div>`)}
        <//>
      </div>
    </div>
  </div>`;
}

function Conclusao({ ctx }) {
  const { st, M, set, setL } = ctx; const { R, RR, PR } = M; const pes = RR[0], oti = RR[2];
  const texto = 'No cenário base, o ' + PR.nome + ' tem TIR de ' + pct(R.tir) + ' ao ano, margem líquida de ' + pct(R.margem) + ' sobre o VGV e resultado de ' + milhoes(R.lucro) + '. A exposição máxima de caixa é de ' + milhoes(Math.abs(R.expo)) + ' (' + pct(Math.abs(R.expo) / R.vgv, 0) + ' do VGV) no mês ' + R.expoMes + ', com payback em ' + R.payback + ' meses. No pessimista, a TIR vai a ' + pct(pes.tir) + ' e o resultado a ' + milhoes(pes.lucro) + '; no otimista, a TIR sobe para ' + pct(oti.tir) + '. O preço pode cair até ' + pct(M.qP, 0) + ' e o custo de obra subir até ' + pct(M.qC, 0) + ' antes de o VPL zerar. Nível de risco: ' + M.riscoNivel[0].replace('RISCO ', '').toLowerCase() + '.' + (M.comp.length > 1 ? ' Entre os ' + M.comp.length + ' produtos estudados, o mais indicado é o ' + M.melhor.nome + '.' : '');
  return html`<div className="grid">
    <${Card} title="Comparativo entre produtos" sub="cenário base · recomendado = maior VPL ponderado ajustado ao risco">
      <div className="tblwrap"><table><thead><tr><th>PRODUTO</th><th className="num">VGV</th><th className="num">CTE</th><th className="num">MARGEM</th><th className="num">TIR</th><th className="num">EXPOSIÇÃO</th><th className="num">PAYBACK</th><th className="num">RESULTADO</th><th>RISCO</th></tr></thead><tbody>
        ${M.comp.map(c => html`<tr key=${c.i} style=${{ fontWeight: c === M.melhor && M.comp.length > 1 ? 600 : 400 }}><td>${c.nome} ${c === M.melhor && M.comp.length > 1 ? html`<${Pill} k="ok">recomendado<//>` : null}</td>
          <td className="num">${milhoes(c.rb.vgv)}</td><td className="num">${milhoes(c.rb.cte)}</td><td className="num">${pct(c.rb.margem)}</td><td className="num">${pct(c.rb.tir)}</td><td className="num">${milhoes(Math.abs(c.rb.expo))}</td><td className="num">${c.rb.payback} m</td><td className="num">${milhoes(c.rb.lucro)}</td><td><${Pill} k=${c.risco[1]}>${c.risco[0]}<//></td></tr>`)}
      </tbody></table></div>
      ${M.comp.length < 2 ? html`<div className="note" style=${{ marginTop: 8 }}>Há um único produto. Use “+ Inserir produto” na aba Característica do produto para comparar alternativas no mesmo terreno.</div>` : null}
    <//>
    <div className="card hero">
      <div className="k-mono">RECOMENDAÇÃO AO COMITÊ · produto ${M.melhor.nome}</div>
      <div style=${{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0' }}><span className="dot" style=${{ width: 12, height: 12, background: M.verdict[1] }}></span><h2 style=${{ fontSize: 18 }}>${M.verdict[0]} · ${PR.nome}</h2></div>
      <p style=${{ fontSize: 13, lineHeight: 1.65 }}>${texto}</p>
    </div>
    <div className="grid g2">
      <${Card} title=${'Riscos e considerações · ' + PR.nome} right=${html`<${Pill} k=${M.riscoNivel[1]}>${M.riscoNivel[0]}<//>`}>
        ${M.riscos.map((r, i) => html`<div key=${i} className="kv"><span>${r.l}<div className="sub">${r.d}</div></span><span style=${{ display: 'flex', gap: 8, alignItems: 'center' }}><b>${r.v}</b><${Pill} k=${r.k}>${({ ok: 'adequado', at: 'atenção', cr: 'crítico' })[r.k]}<//></span></div>`)}
      <//>
      <${Card} title="Condicionantes para aprovação">
        ${M.condAuto.map((t, i) => html`<div key=${i} className="kv" style=${{ justifyContent: 'flex-start' }}><b className="mono" style=${{ color: 'var(--g)' }}>${String(i + 1).padStart(2, '0')}</b><span>${t}</span></div>`)}
        <div className="sub" style=${{ margin: '12px 0 4px' }}>Condicionantes adicionais:</div>
        <${EditList} rows=${st.listas.condicionantes} onChange=${v => setL({ condicionantes: v })} novo=${() => ({ t: '' })} cols=${[{ k: 't', l: 'CONDICIONANTE', area: true }]} />
      <//>
    </div>
    <div className="grid g2">
      <${ParecerIA} ctx=${ctx} />
      <${AuditoriaIA} ctx=${ctx} />
    </div>
    <${Card} title="Recomendações finais do analista">
      <${Txt} area rows=${5} className="box" value=${st.notas} onChange=${v => set({ notas: v })} placeholder="Parecer, ressalvas e próximos passos…" />
    <//>
  </div>`;
}
