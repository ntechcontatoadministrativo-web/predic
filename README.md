# PREDIC · Viabilidade imobiliária com IA

Plataforma para estudos de viabilidade de incorporação imobiliária: localização, legislação, mercado, produto, orçamento, fluxo de caixa mensal, cenários, sensibilidade e parecer para o comitê, com dados públicos ao vivo e um assistente de IA (Claude, da Anthropic) que lê o estudo inteiro.

## Como usar (Windows)

1. Instale o [Node.js 20+](https://nodejs.org).
2. Dê dois cliques em **`iniciar.bat`**. Na primeira vez ele instala as dependências e cria o arquivo `.env`.
3. Abra o `.env` num editor de texto e coloque sua chave em `ANTHROPIC_API_KEY=` (crie a chave em [console.anthropic.com](https://console.anthropic.com)). Feche e abra o `iniciar.bat` de novo.
4. O navegador abre em `http://localhost:8787`.

Em outros sistemas: `npm install`, `cp .env.example .env`, preencha a chave e rode `npm start`.

Sem a chave, o PREDIC funciona normalmente (cálculos, mapas, dados públicos, planilhas, relatório); só os recursos de IA ficam desligados.

## O que a IA faz

| Recurso | Onde | Como |
|---|---|---|
| **Assistente** | botão *Assistente IA* (Ctrl+I) | Conversa sobre o estudo. Simula cenários no motor financeiro, encontra metas (ex.: preço mínimo para TIR de 20%), pesquisa concorrentes e notícias na web com fontes, e propõe mudanças (premissas, riscos, concorrentes, condicionantes, parecer) que só valem depois que você clica em **Aplicar**. Aceita PDFs e imagens anexados. |
| **Leitura de documentos** | Localização, Legislação, Mercado | Envie matrícula, certidões, consulta prévia, IPTU ou tabela de vendas. A IA extrai área, matrícula, zoneamento, CA/TO/gabarito, ônus, itens de due diligence e concorrentes; você escolhe o que aplicar. |
| **Sugestão de produtos** | Característica do produto | Três alternativas de produto para o terreno; o motor do PREDIC calcula VGV, TIR, margem e veredito de cada uma antes de você incluir. |
| **Auditoria de premissas** | Recomendações finais | Nota de robustez e achados (crítico/atenção/adequado) com ajuste aplicável num clique. |
| **Parecer técnico** | Recomendações finais | Parecer completo para o comitê, em Markdown, que entra no relatório impresso. |

Todas as alterações feitas pela IA podem ser desfeitas com **Ctrl+Z**.

A chave da API fica só no servidor; o navegador nunca a vê. O modelo padrão é `claude-opus-5-5` (troque em `PREDIC_MODEL`). Quando os filtros de segurança do modelo recusam um pedido por engano, o servidor refaz a chamada automaticamente no modelo de reserva recomendado pela Anthropic (`fallbacks: "default"`).

## Base de dados e padrões

Seção 05 do estudo. Importe qualquer planilha de mercado (.xlsx, .xls, .ods, .csv ou dados colados do Excel): pesquisa de campo, tabela de vendas, book de concorrentes, exportação de portal. Vários arquivos e várias abas se somam na mesma análise (até 15 mil linhas por estudo).

- **Mapeamento automático**: as colunas são reconhecidas pelo título e pelo conteúdo (empreendimento, bairro, tipologia, dormitórios, vagas, padrão, área, preço, R$/m², data, VSO, unidades totais/vendidas, estoque, latitude/longitude). Ajuste em *Colunas*. Números em qualquer formato (`R$ 1.150.000,00`, `850 mil`, `4,1%`), preços em R$ mil e VSO em fração são convertidos; R$/m², ticket, estoque e VSO são calculados quando faltam.
- **Padrões**: estatística descritiva, outliers (mediana e desvio absoluto), efeito escala área × R$/m², tendência anual comparada ao IPCA e ao INCC, faixa de ticket mais líquida, tipologias com muita venda e pouca oferta, efeito do preço na VSO, gradiente de preço pela distância ao terreno e matriz de correlações.
- **Modelo de preço (hedônico)**: regressão do log do R$/m² sobre área, dormitórios, vagas, padrão, bairro, data e distância. Mostra quanto cada atributo agrega e prevê o preço de cada tipologia do mix com faixa de 80%.
- **Comparáveis**: os registros mais parecidos com o produto (área, dormitórios, padrão, distância, recência).
- **Aplicação no estudo**: preços do mix, VSO, concorrentes e alertas de risco num clique (Ctrl+Z desfaz); exportação da análise em .xlsx; botão *Interpretar com IA*, e o assistente passa a enxergar o resumo da base.
- **Filtros** por bairro, tipologia, padrão, período e raio do terreno. *Modelo de planilha* e *Base de exemplo* ajudam a começar.

## Outros recursos

- **Biblioteca de estudos**: vários estudos, com busca, duplicação, backup (.json) e importação/exportação de planilha (.xlsx).
- **Dados públicos ao vivo**: Selic, INCC, IPCA e juros imobiliários (Banco Central); população e PIB (IBGE); SINAPI; altimetria (Copernicus); serviços num raio de 1 km (OpenStreetMap).
- **Relatório PDF** com capa, logotipo e nome da sua empresa (Configurações).
- **Tema claro/escuro**, desfazer/refazer, salvamento automático, uso no celular e instalação como aplicativo (PWA).
- **Versão de arquivo único**: `npm run build` gera `dist/PREDIC.html`, que abre sem servidor (sem IA).

## Publicar para clientes

### Render (recomendado)

1. No [Render](https://render.com), clique em **New > Blueprint** e escolha este repositório. O `render.yaml` cria o serviço com disco persistente para o banco (plano *starter*; disco não existe no plano gratuito).
2. Informe `ANTHROPIC_API_KEY` quando o Render pedir.
3. Depois do deploy, acesse o endereço `https://predic-xxxx.onrender.com` e crie a empresa e o administrador. Quem abrir o link primeiro vira administrador, então faça isso logo após o deploy.
4. O administrador convida os demais usuários em *Configurações > Usuários*.

### Docker

```bash
docker build -t predic .
docker run -p 8787:8787 -v predic-dados:/app/dados -e ANTHROPIC_API_KEY=... -e TRUST_PROXY=1 predic
```

Coloque o servidor atrás de HTTPS (Caddy, Nginx ou o balanceador do provedor) e defina `TRUST_PROXY=1`. Os estudos, usuários e o uso da IA ficam no banco SQLite em `PREDIC_DATA_DIR`; faça backup dessa pasta. `PREDIC_COTA_MENSAL_USD` limita o gasto mensal com IA por empresa e `PREDIC_RATE_PER_HOUR` limita chamadas por IP.

## Estrutura

```
app/            front-end (React + htm, sem etapa de compilação)
  js/core.js      motor financeiro, cenários, sensibilidade, modelo calculado
  js/ia-core.js   simulação, busca de meta e contexto do estudo para a IA
  js/padroes.js   planilhas livres, mapeamento de colunas e motor de padrões (estatística, regressão, comparáveis)
  js/padroes-ui.js seção Base de dados e padrões (importação, gráficos, mapa, aplicação ao estudo)
  js/data.js      APIs públicas, IndexedDB, imagens, planilhas
  js/ui.js        componentes, gráficos, mapa, Markdown
  js/sections.js  as seções do estudo
  js/ai.js        assistente, leitura de documentos, produtos, parecer, auditoria
  js/app.js       biblioteca, configurações, desfazer, relatório
server/         servidor Node: arquivos estáticos + ponte segura com a API da Anthropic
tests/          testes do motor e do servidor (npm test)
```

## Testes

```bash
npm test
```

Os testes do servidor usam uma API Anthropic simulada; não gastam créditos.
