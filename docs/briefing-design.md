# Briefing de design — Sistema de Controladoria Municipal

Documento para entregar a um assistente de design (v0, Lovable, Figma Make, Google Stitch, Claude, ChatGPT etc.) criar **uma quarta proposta de layout**, diferente das três já existentes.

**Anexe junto com este briefing:**

- `docs/propostas-visuais.pdf` — as três propostas atuais;
- `docs/design/proposta-1-institucional.png`, `proposta-2-petroleo.png`, `proposta-3-grafite.png` — a mesma tela em cada proposta.

---

## 1. Prompt pronto para colar

> Crie a identidade visual e o layout de um sistema web chamado **Sistema de Controladoria Municipal**, usado por controladores internos de prefeituras, câmaras municipais e autarquias da Bahia (Brasil) para acompanhar a conformidade com normas do Tribunal de Contas, gerir planos de ação, auditorias e pedidos de documentos às secretarias. É um sistema de gestão pública: precisa transmitir **seriedade, confiança e clareza**, mas sem parecer antiquado. Todo o texto da interface é em **português do Brasil**.
>
> Já existem três propostas (anexadas): azul-marinho com dourado, verde-petróleo claro e grafite com âmbar. **Crie uma quarta direção visualmente distinta das três** — outra paleta, outra tipografia e, se fizer sentido, outra organização da navegação.
>
> Regras: **somente modo claro**; contraste mínimo **WCAG 2.1 AA** (padrão eMAG do governo federal); tipografia do Google Fonts com suporte a acentos; interface densa o bastante para tabelas e formulários longos, que são o uso principal; foco visível em todos os elementos interativos; cores de situação nunca podem ser a única forma de transmitir informação (sempre com texto ou ícone).
>
> Desenhe estas telas com os dados de exemplo do briefing: (1) login, (2) painel do controlador, (3) árvore de requisitos de uma norma, (4) autoavaliação de um requisito, (5) plano de ação 5W2H, (6) demanda com histórico de tramitação, (7) área simplificada do satélite (também no celular).
>
> Entregue também a **tabela de tokens** (cores em hexadecimal, fontes, raio de canto, sombras) no formato da seção 7 do briefing, para que possamos aplicar no sistema real.

---

## 2. O produto

**O que é.** Plataforma SaaS da **HorizonAJ** para o controle interno de entidades públicas municipais. Cada entidade (Prefeitura, Câmara, autarquia, fundação, consórcio) é um cliente separado, com dados totalmente isolados.

**Problema que resolve.** O controlador interno precisa provar ao Tribunal de Contas dos Municípios da Bahia (TCM-BA) que a controladoria cumpre as normas, acompanhar o que falta, cobrar documentos das secretarias com prazo e registro, conduzir auditorias e produzir relatórios oficiais. Hoje isso é feito em planilhas, e-mail e papel.

**Normas carregadas:**

- **Orientação Técnica 05/2024** da Rede de Controle da Gestão Pública da Bahia — 8 condições para o funcionamento da controladoria (24 requisitos avaliáveis);
- **Resolução TCM-BA nº 1.120/2005** — sistemas de controle interno municipais (118 requisitos avaliáveis para Prefeitura; 91 para Câmara).

## 3. Quem usa

| Perfil | Quem é | Como usa |
|---|---|---|
| **Controlador** | Controlador(a) interno(a) da entidade, servidor efetivo, perfil técnico (contábil, jurídico, administração) | Uso diário e prolongado, em computador (telas de 1366 a 1920 px). Lê muito texto normativo, preenche formulários longos, consulta tabelas. Acesso total aos dados da sua entidade |
| **Equipe da controladoria** | Auditores e assistentes | Igual ao controlador, com permissões ajustáveis |
| **Satélite** | Secretários, diretores e chefes de setor (Saúde, Educação, Finanças...) | Uso **eventual**, muitas vezes pelo celular. Só vê as demandas enviadas à sua unidade: lê o pedido, responde, anexa documentos, pede prorrogação. Precisa ser extremamente simples |
| **Administrador HorizonAJ** | Suporte da plataforma | Cadastra entidades e usuários, mantém catálogos de normas |

Um mesmo controlador pode atender mais de uma entidade e alterna entre elas por um seletor no topo da tela (ex.: "Prefeitura Municipal de Exemplo" ↔ "Câmara Municipal de Exemplo").

## 4. Navegação atual

Menu lateral fixo, agrupado:

- **Painel**
- **Conformidade:** Normas · Autoavaliação · Planos de ação
- **Atuação:** Demandas · Auditorias · Medidas
- **Gestão:** Documentos · Relatórios · Unidades · Trilha de auditoria

Cabeçalho: seletor de entidade (nome + tipo + município/UF) e menu do usuário (nome, cargo, sair).

Área do satélite: menu mínimo — **Minhas demandas** e **Painel da unidade**.

A quarta proposta pode reorganizar isso (menu superior, menu recolhível, trilho de ícones etc.), desde que os grupos continuem claros e funcione em telas menores.

## 5. Telas a desenhar (com dados de exemplo)

### 5.1 Login
Nome do sistema, e-mail, senha, "Entrar". Mensagem de erro genérica ("E-mail ou senha inválidos."). Pode ter área institucional ao lado. Rodapé: "HorizonAJ".

### 5.2 Painel do controlador
Entidade: **Prefeitura Municipal de Exemplo** — Município Exemplo/BA.

- Indicadores: **Demandas em aberto 12** · **Vencidas 3** · **Aguardando análise 4** · **Ações atrasadas 5** · **Unidades 6**.
- **Aderência às normas** (barra de progresso por norma): OT 05 — Rede de Controle **62%**; Resolução TCM-BA 1.120/2005 **41%**.
- **Tramitações recentes** (lista): "Secretaria de Saúde respondeu a demanda 001/2026 — Lista de espera da regulação — há 2 horas"; "Demanda 002/2026 enviada ao Gabinete — ontem".
- Prazos próximos (ações e demandas que vencem nos próximos 7 dias).
- Filtro por unidade.

### 5.3 Norma e árvore de requisitos
"Resolução TCM-BA nº 1.120/2005 — Sistemas de Controle Interno Municipais", 91 requisitos avaliáveis para câmara municipal, link "Texto oficial".

Árvore hierárquica **artigo → inciso → alínea**, cada item com código ("Art. 12, XII"), título curto, texto literal da norma e etiquetas:

- **avaliável** (pode receber resposta);
- **não se aplica a câmara municipal** (item esmaecido, exclusivo do Executivo).

Exemplos: "Art. 1º — Implantação e manutenção integrada do Sistema de Controle Interno"; "Art. 5º — Órgão Central criado por lei e diretamente subordinado ao chefe do Poder"; "Art. 12, XII — Acompanhamento da Dívida Ativa" (não se aplica à Câmara).

Precisa ser confortável para **leitura de textos jurídicos longos**.

### 5.4 Autoavaliação de um requisito
Ciclo "Autoavaliação 2026". Requisito "OT 05, I — Controladoria criada por lei específica".

- Situação: **Atende · Atende parcialmente · Não atende · Não se aplica** (seleção única, muito visível);
- Justificativa (texto longo);
- Evidências anexadas (ex.: "Lei Municipal nº 1.234/2019.pdf — 2,1 MB");
- Botão "Solicitar documento a uma unidade" (gera demanda);
- Sugestão da IA marcada como **"pendente de revisão"**, com o trecho citado e a página do documento;
- Progresso do ciclo (ex.: 18 de 24 respondidos) e navegação anterior/próximo.

### 5.5 Plano de ação (5W2H)
Lista de ações com: título, origem (requisito, auditoria, medida ou determinação do TCM), responsável, unidade, prazo, prioridade, % de execução, situação.

Detalhe da ação nos campos **O quê, Por quê, Onde, Quem, Quando, Como, Quanto custa**. Exemplo: "Encaminhar à Câmara projeto de lei de reestruturação da controladoria" — Por quê: não atende OT 05, item I — Quem: Gabinete do Prefeito — Quando: 30/11/2026 — Prioridade alta — 40%.

### 5.6 Demanda e tramitação
"Demanda 001/2026 — Lista de espera da regulação", enviada à **Secretaria Municipal de Saúde (SESAU)**, prazo **15/10/2026**, prioridade alta.

Histórico imutável em linha do tempo: Enviada (controladora, 01/10 09:12) → Visualizada (secretário, 01/10 14:30) → Respondida com 2 anexos (02/10 10:05) → Em análise. Ações do controlador: **Aceitar e concluir** · **Devolver para complementação**.

### 5.7 Área do satélite (desktop e celular)
Usuário: secretário de Saúde. "Minhas demandas": cartões com número, assunto, prazo e quantos dias faltam ("vence em 3 dias", "vencida há 2 dias"), situação. Ao abrir: pedido, documentos solicitados, campo de resposta, anexar arquivos, "Pedir prorrogação" (com justificativa), "Enviar resposta". **Sem jargão, sem menus extras.**

## 6. Situações e cores semânticas

Toda situação precisa de **cor + texto** (e de preferência ícone):

| Grupo | Situações |
|---|---|
| Requisito | Não avaliado · Atende · Atende parcialmente · Não atende · Não se aplica |
| Demanda | Enviada · Visualizada · Respondida · Em análise · Devolvida · Concluída · Cancelada · Vencida |
| Ação | Não iniciada · Em andamento · Concluída · Atrasada · Cancelada |
| Prioridade | Baixa · Média · Alta · Urgente |
| Risco (probabilidade × impacto, 1 a 25) | Baixo (< 6) · Médio (6–9) · Alto (10–14) · Crítico (≥ 15) |

Cores semânticas necessárias: **sucesso**, **alerta**, **perigo**, **informação** e uma cor de **destaque** da marca.

## 7. Entregável: tabela de tokens

O sistema usa Tailwind CSS v4 com componentes shadcn/ui; a proposta será aplicada trocando estas variáveis. Entregue os valores em hexadecimal:

| Token | Uso |
|---|---|
| `background` / `foreground` | Fundo da página / texto principal |
| `card` / `card-foreground` | Cartões, tabelas, painéis |
| `primary` / `primary-foreground` | Botão principal, links, seleção |
| `secondary` / `secondary-foreground` | Botão secundário, etiquetas neutras |
| `muted` / `muted-foreground` | Áreas de apoio / texto secundário |
| `accent` / `accent-foreground` | Item em foco, hover |
| `destaque` / `destaque-foreground` | Cor de marca de destaque |
| `sucesso`, `alerta`, `perigo`, `info` | Situações |
| `border`, `input`, `ring` | Bordas, campos, contorno de foco |
| `sidebar`, `sidebar-foreground`, `sidebar-primary`, `sidebar-accent`, `sidebar-border` | Menu de navegação |
| `chart-1` a `chart-5` | Gráficos |
| `radius` | Raio de canto base (ex.: 6 px) |
| Fonte de texto / fonte de títulos | Nome no Google Fonts |

Para referência, os valores das três propostas atuais estão no PDF anexo.

## 8. Restrições e preferências

- **Modo claro apenas.**
- **Acessibilidade:** WCAG 2.1 AA / eMAG — contraste de 4,5:1 para texto, foco visível, alvos de toque de pelo menos 24 px (44 px no satélite), não depender só de cor.
- **Densidade:** o controlador trabalha com muita informação; prefira layouts eficientes a muito espaço em branco. A área do satélite, ao contrário, deve ser espaçosa e simples.
- **Tom:** institucional e confiável, sem ser burocrático. Evitar visual "startup de cripto", gradientes chamativos, ilustrações infantis e excesso de animação.
- **Marca:** ainda sem logotipo definitivo. O atual é um emblema de escudo/brasão com "Sistema de Controladoria Municipal". Pode propor um. Os relatórios levarão o brasão de cada entidade, então a marca do sistema deve conviver bem com brasões municipais.
- **Ícones:** biblioteca Lucide.
- **Formatos brasileiros:** datas dd/mm/aaaa, moeda R$ 1.234,56, CNPJ 00.000.000/0001-91.
- **Responsividade:** controlador priorizando desktop (mas utilizável em tablet); satélite totalmente funcional no celular.

## 9. O que esperamos receber

1. Nome e descrição curta da direção visual (2–3 frases, como as do PDF).
2. As 7 telas da seção 5.
3. A tabela de tokens da seção 7.
4. Componentes base: botões (principal, secundário, contorno, perigo), campos, seleção, etiquetas de situação, tabela, cartão de indicador, linha do tempo, menu.
5. Se possível, o código em HTML + Tailwind ou React — facilita a aplicação.
