// Prompts e ferramentas da IA do PREDIC. Ficam no servidor para o navegador não poder trocá-los.
import { z } from 'zod';

const BASE = `Você é o analista sênior do PREDIC, uma plataforma brasileira de estudos de viabilidade para incorporação imobiliária. Você conhece a fundo incorporação (Lei 4.591/64, patrimônio de afetação, RET), financiamento à produção (SFH, plano empresário, crédito associativo, MCMV), formação de preço, VSO, permutas física e financeira, due diligence de terrenos e aprovação de projetos nos municípios brasileiros.

Escreva em português do Brasil, com números no padrão brasileiro (R$ 1,2 M; 18,4%; 3.200 m²). Seja direto, como um consultor experiente falando com o comitê de investimento: conclusão primeiro, depois os números que a sustentam.

O estudo atual chega em JSON dentro de <estudo>. Os indicadores são calculados pelo motor financeiro do próprio PREDIC (fluxo mensal com curva de obra, financiamento à produção, distratos e INCC); confie neles e não recalcule de cabeça. Os campos em "dadosReais" vêm de APIs públicas (Banco Central, IBGE, SINAPI, OpenStreetMap); o restante são premissas digitadas pelo analista e podem estar erradas. Quando um dado não estiver no estudo, diga que falta em vez de inventar.`;

export const SYSTEM_CHAT = `${BASE}

Você está no painel lateral de conversa. Use as ferramentas quando elas resolverem a pergunta melhor do que texto:
- simular_cenario para testar hipóteses sem alterar o estudo (pode chamar várias vezes para comparar alternativas);
- buscar_meta para descobrir o valor de uma premissa que atinge uma TIR, margem ou VPL alvo;
- aplicar_alteracoes, adicionar_registros, adicionar_concorrentes e registrar_parecer alteram o estudo; o usuário confirma cada uma antes de valer, então só use quando ele pedir ou quando a mudança for claramente a próxima etapa do que ele pediu;
- navegar para levar o usuário à seção relevante;
- web_search (quando disponível) para pesquisar lançamentos, preços de concorrentes, notícias do mercado local e legislação. Cite as fontes.

Respostas curtas por padrão (até ~200 palavras), em Markdown simples: parágrafos curtos, listas e tabelas pequenas quando ajudarem. Ao recomendar uma mudança de premissa, mostre o efeito simulado na TIR, margem e exposição.`;

export const SYSTEM_PARECER = `${BASE}

Redija o parecer técnico do estudo para o comitê de investimento, em Markdown, com estas seções:
## Síntese e recomendação
## Produto e mercado
## Resultado econômico-financeiro
## Riscos e sensibilidade
## Aspectos legais e de aprovação
## Condicionantes e próximos passos

Use os números do estudo, compare com as metas do comitê e com o mercado, e aponte fragilidades das premissas com honestidade. Tom formal, objetivo, sem floreios; de 600 a 1.000 palavras. Termine com a recomendação explícita (aprovar, aprovar com ressalvas ou reprovar) e as condições.`;

export const SYSTEM_AUDITORIA = `${BASE}

Faça uma auditoria crítica das premissas do estudo, como um revisor do comitê procurando o que pode estar otimista demais, inconsistente ou faltando. Confronte: preço × concorrência e renda local; VSO × mediana do mercado e absorção; custo de obra × SINAPI/CUB e padrão; prazo de obra × porte; terreno/VGV; capital próprio e exposição; uso do potencial construtivo; itens jurídicos críticos; cenário pessimista. Liste também o que está bem fundamentado (severidade "ok"). Entre 5 e 12 achados, do mais grave para o menos grave. Quando um ajuste numérico resolver o achado, preencha "ajuste" com a variável e o valor sugerido; caso contrário use variavel "nenhuma" e valor null.`;

export const SYSTEM_EXTRACAO = `${BASE}

Você recebe documentos do processo de viabilidade (matrícula do imóvel, certidões, consulta prévia/zoneamento, tabela de vendas ou book de concorrentes, IPTU, laudos). Extraia somente o que estiver escrito nos documentos, sem supor. Campos ausentes ficam null. Para due diligence, classifique cada achado: "ok" regular, "at" exige atenção, "cr" impede escritura/registro, "na" não verificável no documento. Em "alertas", resuma em frases curtas o que o analista precisa saber (ônus, divergência de área, restrições, prazos vencidos).`;

export const SYSTEM_PRODUTOS = `${BASE}

Proponha alternativas de produto para o terreno do estudo, coerentes com zoneamento (CA, TO, gabarito), área do terreno, renda e perfil do público, concorrência e programa (mercado ou MCMV). Cada alternativa deve ser diferente das outras de verdade (tipologia, padrão ou densidade), com mix realista de unidades, áreas privativas, preço por m² ancorado na concorrência e custo de obra coerente com o padrão e o SINAPI. O PREDIC vai calcular a viabilidade de cada uma com o motor financeiro; explique o racional em uma ou duas frases.`;

const VARS = ['preco_m2', 'custo_obra_m2', 'vso', 'prazo_obra', 'tma', 'permuta_financeira_pct', 'terreno_dinheiro', 'financiamento_pct', 'juros_financiamento'];
const VARS_DESC = 'preco_m2: preço médio de venda em R$/m² (reescala todo o mix); custo_obra_m2: R$/m² equivalente; vso: % do estoque vendido por mês; prazo_obra: meses; tma: % a.a.; permuta_financeira_pct: % do VGV pago ao dono do terreno; terreno_dinheiro: R$ pagos em dinheiro pelo terreno; financiamento_pct: % da obra financiada; juros_financiamento: % a.a.';
const alteracoes = {
  type: 'array',
  description: 'Lista de premissas a mudar, com valores absolutos. ' + VARS_DESC,
  items: {
    type: 'object',
    properties: { variavel: { type: 'string', enum: VARS }, valor: { type: 'number' } },
    required: ['variavel', 'valor'],
    additionalProperties: false
  }
};

// Ferramentas executadas no navegador (o motor financeiro roda lá).
export const CHAT_TOOLS = [
  {
    name: 'simular_cenario',
    description: 'Recalcula o produto selecionado com premissas alteradas, sem mudar o estudo. Devolve TIR, VPL, margem, lucro, exposição, payback e veredito do comitê antes e depois. Use para testar hipóteses e comparar alternativas.',
    input_schema: { type: 'object', properties: { alteracoes }, required: ['alteracoes'], additionalProperties: false }
  },
  {
    name: 'buscar_meta',
    description: 'Encontra o valor de uma premissa que faz um indicador atingir um alvo, mantendo o resto no cenário base. Ex.: preço por m² mínimo para TIR de 20% a.a.; custo de obra máximo para margem de 15%.',
    input_schema: {
      type: 'object',
      properties: {
        variavel: { type: 'string', enum: ['preco_m2', 'custo_obra_m2', 'vso', 'prazo_obra', 'permuta_financeira_pct', 'terreno_dinheiro'] },
        indicador: { type: 'string', enum: ['tir', 'margem', 'vpl'], description: 'tir e margem em % (ex.: 20 para 20%); vpl em R$' },
        alvo: { type: 'number' }
      },
      required: ['variavel', 'indicador', 'alvo'],
      additionalProperties: false
    }
  },
  {
    name: 'aplicar_alteracoes',
    description: 'Altera premissas do produto selecionado no estudo. O usuário vê a lista e confirma antes de aplicar.',
    input_schema: { type: 'object', properties: { alteracoes, justificativa: { type: 'string', description: 'Uma frase explicando o motivo' } }, required: ['alteracoes', 'justificativa'], additionalProperties: false }
  },
  {
    name: 'adicionar_registros',
    description: 'Adiciona linhas a uma lista do estudo após confirmação do usuário. riscosMercado: riscos de mercado (nivel ok=baixo, at=médio, cr=alto); condicionantes: condicionantes para aprovação; pareceres: condições do parecer jurídico; condUrb: condicionantes de urbanização.',
    input_schema: {
      type: 'object',
      properties: {
        lista: { type: 'string', enum: ['riscosMercado', 'condicionantes', 'pareceres', 'condUrb'] },
        itens: {
          type: 'array',
          items: {
            type: 'object',
            properties: { texto: { type: 'string' }, valor: { type: 'string', description: 'valor curto, ex.: "R$ 380 mil", "médio"' }, nivel: { type: 'string', enum: ['ok', 'at', 'cr'] } },
            required: ['texto', 'valor', 'nivel'],
            additionalProperties: false
          }
        }
      },
      required: ['lista', 'itens'],
      additionalProperties: false
    }
  },
  {
    name: 'adicionar_concorrentes',
    description: 'Adiciona empreendimentos concorrentes à pesquisa de mercado após confirmação do usuário. Use números de fontes citáveis; deixe 0 quando o dado não for conhecido.',
    input_schema: {
      type: 'object',
      properties: {
        itens: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              nome: { type: 'string' }, tipo: { type: 'string', description: 'tipologia, ex.: "2 e 3 dorm."' }, padrao: { type: 'string' },
              m2: { type: 'number', description: 'R$/m²' }, ticket: { type: 'number', description: 'ticket médio em R$ mil' },
              vso: { type: 'number', description: '% a.m.' }, estoque: { type: 'number', description: 'unidades em estoque' }, fonte: { type: 'string' }
            },
            required: ['nome', 'tipo', 'padrao', 'm2', 'ticket', 'vso', 'estoque', 'fonte'],
            additionalProperties: false
          }
        }
      },
      required: ['itens'],
      additionalProperties: false
    }
  },
  {
    name: 'registrar_parecer',
    description: 'Grava um texto no campo "Recomendações finais do analista" após confirmação do usuário.',
    input_schema: { type: 'object', properties: { texto: { type: 'string' }, modo: { type: 'string', enum: ['substituir', 'acrescentar'] } }, required: ['texto', 'modo'], additionalProperties: false }
  },
  {
    name: 'navegar',
    description: 'Abre uma seção do estudo na tela do usuário.',
    input_schema: { type: 'object', properties: { secao: { type: 'string', enum: ['painel', 'local', 'legis', 'mercado', 'produto', 'orcamento', 'financeiro', 'sensibilidade', 'conclusao'] } }, required: ['secao'], additionalProperties: false }
  }
].map(t => ({ ...t, eager_input_streaming: true }));

export const WEB_SEARCH_TOOL = { type: 'web_search_20260209', name: 'web_search', max_uses: 6, user_location: { type: 'approximate', country: 'BR', timezone: 'America/Sao_Paulo' } };

// Saídas estruturadas
const nivel = z.enum(['ok', 'at', 'cr', 'na']);
export const SCHEMAS = {
  auditoria: z.object({
    resumo: z.string().describe('2 a 3 frases com a avaliação geral das premissas'),
    nota: z.number().describe('0 a 100: robustez das premissas'),
    achados: z.array(z.object({
      titulo: z.string(),
      severidade: z.enum(['critico', 'atencao', 'ok']),
      secao: z.enum(['local', 'legis', 'mercado', 'produto', 'orcamento', 'financeiro', 'sensibilidade']),
      explicacao: z.string(),
      sugestao: z.string(),
      ajuste: z.object({ variavel: z.enum([...VARS, 'nenhuma']), valor: z.number().nullable() })
    }))
  }),
  extracao: z.object({
    tipo_documento: z.enum(['matricula', 'certidao', 'zoneamento', 'tabela_vendas', 'iptu', 'outro']),
    resumo: z.string(),
    campos_estudo: z.object({
      endereco: z.string().nullable(), matricula: z.string().nullable(), cartorio: z.string().nullable(),
      area: z.number().nullable().describe('área do terreno em m²'), zona: z.string().nullable(),
      ca: z.number().nullable().describe('coeficiente de aproveitamento'), to: z.number().nullable().describe('taxa de ocupação em %'),
      gabarito: z.number().nullable().describe('altura máxima em metros'), lote: z.string().nullable().describe('descrição curta do lote')
    }),
    proprietarios: z.array(z.string()),
    itens_due_diligence: z.array(z.object({ grupo: z.enum(['Imóvel', 'Proprietários', 'Fiscal']), item: z.string(), fonte: z.string(), nivel, situacao: z.string() })),
    concorrentes: z.array(z.object({ nome: z.string(), tipo: z.string(), padrao: z.string(), m2: z.number(), ticket: z.number().describe('R$ mil'), vso: z.number(), estoque: z.number() })),
    alertas: z.array(z.string())
  }),
  produtos: z.object({
    analise: z.string().describe('2 a 4 frases sobre o terreno e a demanda'),
    produtos: z.array(z.object({
      nome: z.string(), descricao: z.string(), racional: z.string(),
      padrao: z.enum(['econômico', 'médio', 'médio-alto', 'alto', 'luxo']),
      tipoEdif: z.enum(['torre residencial', 'duas torres residenciais', 'condomínio de casas', 'edifício baixo (até 4 pav.)', 'uso misto (residencial + lojas)']),
      programa: z.enum(['mercado', 'mcmv']),
      pavimentos: z.number(), unAndar: z.number(), custo_obra_m2: z.number(), vso: z.number(), prazo_obra: z.number(),
      area_comum: z.number(), area_garagem: z.number(), vagas: z.number(),
      mix: z.array(z.object({ tipo: z.string(), un: z.number(), area: z.number(), preco: z.number().describe('R$/m²') })),
      lazer: z.array(z.string())
    }))
  })
};
export const JSON_TASKS = {
  auditoria: { system: SYSTEM_AUDITORIA, schema: SCHEMAS.auditoria, effort: 'high', pedido: 'Audite as premissas deste estudo.' },
  extracao: { system: SYSTEM_EXTRACAO, schema: SCHEMAS.extracao, effort: 'medium', pedido: 'Extraia os dados destes documentos para o estudo.' },
  produtos: { system: SYSTEM_PRODUTOS, schema: SCHEMAS.produtos, effort: 'high', pedido: 'Proponha 3 alternativas de produto para este terreno.' }
};
