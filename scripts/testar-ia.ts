import "dotenv/config";
import { Client } from "pg";
import { z } from "zod";
import { mascararDadosPessoais } from "../src/lib/ia/mascaramento";
import { dividirEmTrechos, extrairTexto } from "../src/lib/ia/texto";
import { conferirCitacoes, type TrechoRef } from "../src/lib/ia/citacoes";
import { custoEmbeddingsUsd, custoTextoUsd, limiteAtingido } from "../src/lib/ia/precos";
import { esquemaJson } from "../src/lib/ia/provedor";
import { processarAnalise, solicitarAnalise } from "../src/lib/ia/analises";
import { aceitarSugestao, rejeitarSugestao } from "../src/lib/ia/revisao";
import { removerArquivo, salvarArquivo } from "../src/lib/armazenamento";
import type { ContextoCliente } from "../src/lib/db";

// IA de análise de documentos com o provedor falso (determinístico, sem chamar a OpenAI).
// Regras puras + fluxo completo no banco (requer migrações e seed). Rodar com a condição react-server
// (ver npm run test:ia) por causa do "server-only".
process.env.IA_PROVEDOR = "falso";

const dono = new Client({ connectionString: process.env.DATABASE_URL });
let falhas = 0;

function conferir(descricao: string, condicao: boolean) {
  console.log(`${condicao ? "OK   " : "FALHA"} ${descricao}`);
  if (!condicao) falhas++;
}

async function erroDe(fn: () => Promise<unknown>) {
  try {
    await fn();
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

function mascaramento() {
  const m = (t: string) => mascararDadosPessoais(t).texto;
  conferir("CPF formatado com rótulo", m("CPF: 123.456.789-09.") === "CPF: [CPF].");
  conferir("CPF sem pontuação após 'nº'", m("portador do CPF nº 12345678909, residente") === "portador do CPF nº [CPF], residente");
  conferir("CPF solto formatado", m("inscrito sob 123.456.789-09 na") === "inscrito sob [CPF] na");
  conferir("e-mail", m("contato: joao.silva+x@gmail.com.br hoje") === "contato: [E-MAIL] hoje");
  conferir("telefone com rótulo", m("Tel.: (71) 99999-8888.") === "Tel.: [TELEFONE].");
  conferir("telefone fixo com DDD entre parênteses", m("ligar para (71) 3333-4444") === "ligar para [TELEFONE]");
  conferir("celular sem DDD", m("número 98877-6655 do") === "número [TELEFONE] do");
  conferir("RG com órgão emissor", m("RG nº 12.345.678-9 SSP/BA") === "RG nº [RG] SSP/BA");
  conferir("cartão SUS (CNS) com espaços", m("Cartão SUS: 898 0012 3456 7890") === "Cartão SUS: [CNS]");
  conferir("CNS solto (15 dígitos)", m("CNS 700000000000005") === "CNS [CNS]");
  conferir("data de nascimento com rótulo", m("Data de nascimento: 01/02/1980") === "Data de nascimento: [DATA DE NASCIMENTO]");
  conferir("nascido em por extenso", m("nascido em 3 de março de 1975, natural") === "nascido em [DATA DE NASCIMENTO], natural");
  conferir("nome após 'Paciente:'", m("Paciente: Maria da Silva Santos, internada") === "Paciente: [NOME], internada");
  conferir("nome em maiúsculas após rótulo", m("PACIENTE: JOSÉ DOS SANTOS\nLeito 3") === "PACIENTE: [NOME]\nLeito 3");
  conferir("nome da mãe", m("Nome da mãe: Ana Souza") === "Nome da mãe: [NOME]");
  conferir("nome para antes de palavra minúscula", m("Requerente: João Pereira solicita") === "Requerente: [NOME] solicita");
  const r = mascararDadosPessoais("CPF 111.222.333-44 e CPF 555.666.777-88; e-mail a@b.com");
  conferir("contagem por tipo", r.contagem.cpf === 2 && r.contagem.email === 1);
  const publico = "Lei nº 1.234, de 10/05/2020, art. 74 da Constituição; CNPJ 12.345.678/0001-90; exercício 2024-2025; R$ 1.500.000,00.";
  conferir("não mascara datas de lei, CNPJ, exercícios e valores", m(publico) === publico);
}

/** PDF mínimo com uma página por texto (Helvetica). Página com texto vazio fica sem camada de texto. */
function pdfMinimo(paginas: string[]) {
  const objetos: string[] = [];
  const kids = paginas.map((_, i) => `${4 + i * 2} 0 R`).join(" ");
  objetos.push("<< /Type /Catalog /Pages 2 0 R >>");
  objetos.push(`<< /Type /Pages /Kids [${kids}] /Count ${paginas.length} >>`);
  objetos.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  for (const [i, texto] of paginas.entries()) {
    const fluxo = texto ? `BT /F1 12 Tf 72 720 Td (${texto}) Tj ET` : "";
    objetos.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`);
    objetos.push(`<< /Length ${fluxo.length} >>\nstream\n${fluxo}\nendstream`);
  }
  let corpo = "%PDF-1.4\n";
  const posicoes: number[] = [];
  objetos.forEach((o, i) => {
    posicoes.push(corpo.length);
    corpo += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = corpo.length;
  corpo += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n${posicoes.map((p) => `${String(p).padStart(10, "0")} 00000 n \n`).join("")}`;
  corpo += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(corpo, "latin1");
}

async function extracaoETrechos() {
  const txt = await extrairTexto(Buffer.from("Primeira página do texto.\fSegunda   página\r\ncom quebra."), "text/plain", "a.txt");
  conferir("TXT: quebra de página (form feed) vira paginação", txt.ok && txt.paginado && txt.paginas.length === 2 && txt.paginas[1] === "Segunda página\ncom quebra.");
  const simples = await extrairTexto(Buffer.from("Sem quebra de página."), "text/plain", "b.txt");
  conferir("TXT sem form feed: uma página, sem paginação", simples.ok && !simples.paginado && simples.paginas.length === 1);

  const pdf = await extrairTexto(pdfMinimo(["Lei de criacao da controladoria municipal", "Atribuicoes do controle interno"]), "application/pdf", "lei.pdf");
  conferir(
    "PDF simples: texto por página",
    pdf.ok && pdf.paginado && pdf.paginas.length === 2 && pdf.paginas[0].includes("controladoria municipal") && pdf.paginas[1].includes("controle interno"),
  );
  const escaneado = await extrairTexto(pdfMinimo(["", ""]), "application/pdf", "scan.pdf");
  conferir("PDF sem camada de texto: marcado como sem texto extraível", !escaneado.ok && /sem texto/i.test(escaneado.motivo));
  const imagem = await extrairTexto(Buffer.from([0x89, 0x50, 0x4e, 0x47]), "image/png", "foto.png");
  conferir("imagem: sem extração (OCR pendente)", !imagem.ok);

  const frase = "O controle interno acompanha a execução orçamentária e emite parecer. ";
  const longa = frase.repeat(50).trim();
  const paginas = ["Página curta.", longa];
  const trechos = dividirEmTrechos(paginas, { tamanho: 500, sobreposicao: 80 });
  conferir("chunking: página curta vira um trecho da página 1", trechos[0].pagina === 1 && trechos[0].texto === "Página curta.");
  const daSegunda = trechos.filter((t) => t.pagina === 2);
  conferir("chunking: página longa dividida em vários trechos da página 2", daSegunda.length >= 7);
  conferir("chunking: nenhum trecho passa do tamanho", trechos.every((t) => t.texto.length <= 500));
  conferir("chunking: posição aponta para o texto original da página", trechos.every((t) => paginas[t.pagina! - 1].slice(t.posicao, t.posicao + t.texto.length) === t.texto));
  conferir("chunking: ordem sequencial", trechos.every((t, i) => t.ordem === i));
  conferir("chunking: há sobreposição entre trechos consecutivos", daSegunda[1].posicao < daSegunda[0].posicao + daSegunda[0].texto.length);
  conferir("chunking: corta em fim de frase", daSegunda[0].texto.endsWith("parecer."));
  const semPagina = dividirEmTrechos(["texto de docx"], { paginado: false });
  conferir("chunking: formato sem paginação grava página nula", semPagina[0].pagina === null);
}

function citacoes() {
  const trechos: TrechoRef[] = [
    { ref: "T1", id: "a", documentoId: "d", documentoNome: "Lei 10/2020", pagina: 3, texto: "Art. 2º A Controladoria Geral do Município fica vinculada diretamente ao Prefeito." },
    { ref: "T2", id: "b", documentoId: "d", documentoNome: "Lei 10/2020", pagina: 4, texto: "Art. 5º Compete à Controladoria realizar auditorias internas  anuais." },
  ];
  const r = conferirCitacoes(
    [
      { trecho: "T1", texto: "fica vinculada diretamente ao Prefeito" },
      { trecho: "T1", texto: "Compete à Controladoria realizar auditorias internas anuais" },
      { trecho: "T2", texto: "A Controladoria tem autonomia financeira plena" },
      { trecho: "T1", texto: "Art. 2º" },
      { trecho: "T1", texto: "“A CONTROLADORIA GERAL DO MUNICÍPIO”" },
      { trecho: "T1", texto: "fica vinculada diretamente ao Prefeito" },
    ],
    trechos,
  );
  conferir("citação literal é aceita com página", r.validas[0]?.trechoId === "a" && r.validas[0].pagina === 3);
  conferir("citação com rótulo errado é atribuída ao trecho certo (espaços normalizados)", r.validas[1]?.trechoId === "b" && r.validas[1].pagina === 4);
  conferir("citação inexistente e citação curta são descartadas", r.descartadas === 2);
  conferir("aspas tipográficas e caixa são ignoradas", r.validas.some((c) => c.texto.includes("CONTROLADORIA GERAL")));
  conferir("citação repetida não duplica", r.validas.length === 3);
}

function custos() {
  conferir("custo: gpt-4.1-mini 1M entrada + 1M saída = US$ 2,00", Math.abs(custoTextoUsd("gpt-4.1-mini", 1e6, 1e6) - 2.0) < 1e-9);
  conferir("custo: versão datada usa o preço do modelo base", custoTextoUsd("gpt-4.1-mini-2025-04-14", 1e6, 0) === custoTextoUsd("gpt-4.1-mini", 1e6, 0));
  conferir("custo: gpt-4.1 não pega o preço do gpt-4.1-mini", custoTextoUsd("gpt-4.1", 1e6, 0) === 2.0);
  conferir("custo: embeddings small = US$ 0,02 por 1M", Math.abs(custoEmbeddingsUsd("text-embedding-3-small", 1e6) - 0.02) < 1e-12);
  conferir("custo: modelo desconhecido usa estimativa conservadora", custoTextoUsd("modelo-novo", 1e6, 0) > 0);
  conferir("limite: atingido quando gasto >= limite; sem limite nunca", limiteAtingido(10, 10) && !limiteAtingido(9.99, 10) && !limiteAtingido(1e9, null));
  const js = esquemaJson(z.object({ a: z.string(), b: z.array(z.object({ c: z.boolean() })) })) as {
    required: string[];
    additionalProperties: boolean;
    properties: { b: { items: { required: string[]; additionalProperties: boolean } } };
  };
  conferir(
    "esquema JSON estrito: todas as propriedades obrigatórias, sem extras (também aninhado)",
    js.required.join() === "a,b" && js.additionalProperties === false && js.properties.b.items.required.join() === "c" && js.properties.b.items.additionalProperties === false,
  );
}

async function fluxoCompleto() {
  const { rows: cl } = await dono.query("SELECT id FROM clientes WHERE tipo = 'PREFEITURA' ORDER BY criado_em LIMIT 1");
  const { rows: us } = await dono.query("SELECT id FROM usuarios WHERE email LIKE 'controlador%' LIMIT 1");
  const clienteId = cl[0].id as string;
  const usuarioId = us[0].id as string;
  const ctx: ContextoCliente = { clienteId, usuarioId, perfil: "CONTROLADOR" };

  // Requisitos avaliáveis com palavras-chave distintas, de uma mesma norma.
  const { rows: reqs } = await dono.query(
    `SELECT r.id, r.norma_id, r.codigo, r.titulo, r.palavras_chave FROM requisitos r
      WHERE r.avaliavel AND cardinality(r.palavras_chave) > 0
        AND r.norma_id = (SELECT norma_id FROM requisitos WHERE avaliavel AND cardinality(palavras_chave) > 0 GROUP BY norma_id ORDER BY count(*) DESC LIMIT 1)
      ORDER BY r.ordem LIMIT 4`,
  );
  if (reqs.length < 3) {
    conferir("seed com requisitos e palavras-chave para o fluxo", false);
    return;
  }
  const { rows: ci } = await dono.query(
    `INSERT INTO ciclos_avaliacao (id, cliente_id, norma_id, nome, data_inicio, status, criado_por_id)
     VALUES (gen_random_uuid(), $1, $2, 'Teste automático da IA', current_date, 'EM_ANDAMENTO', $3) RETURNING id`,
    [clienteId, reqs[0].norma_id, usuarioId],
  );
  const cicloId = ci[0].id as string;
  const respostas = new Map<string, string>();
  for (const r of reqs) {
    const { rows } = await dono.query(
      "INSERT INTO respostas_requisito (id, cliente_id, ciclo_id, requisito_id) VALUES (gen_random_uuid(), $1, $2, $3) RETURNING id",
      [clienteId, cicloId, r.id],
    );
    respostas.set(r.codigo, rows[0].id);
  }

  // Documento: uma página por requisito (os dois primeiros), com dados pessoais para conferir o mascaramento.
  const pagina = (r: (typeof reqs)[number]) => `${r.titulo}. Fica estabelecido que ${(r.palavras_chave as string[]).join(", ")} são tratados neste ato municipal.`;
  const texto = `${pagina(reqs[0])}\nResponsável: Carlos Alberto Nunes, CPF 123.456.789-09, e-mail carlos@prefeitura.ba.gov.br.\f${pagina(reqs[1])}`;
  const salvo = await salvarArquivo(clienteId, "teste-ia.txt", Buffer.from(texto, "utf8"));
  const { rows: dc } = await dono.query(
    `INSERT INTO documentos (id, cliente_id, nome, mime_type, tamanho, sha256, storage_key, enviado_por_id)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [clienteId, salvo.nome, salvo.mimeType, salvo.tamanho, salvo.sha256, salvo.storageKey, usuarioId],
  );
  const documentoId = dc[0].id as string;
  const analises: string[] = [];
  let configOriginal: Record<string, unknown> | null = null;
  let configMexida = false;

  try {
    const idAnalise = await solicitarAnalise(ctx, { tipo: "COMPARAR_NORMA", cicloId, documentoIds: [documentoId] });
    analises.push(idAnalise);
    const { rows: pend } = await dono.query("SELECT status FROM analises_ia WHERE id = $1", [idAnalise]);
    conferir("análise entra na fila como PENDENTE", pend[0].status === "PENDENTE");
    await processarAnalise(ctx, idAnalise);
    await processarAnalise(ctx, idAnalise);
    const { rows: an } = await dono.query("SELECT status, erro, resumo, provedor, tokens_entrada, custo_usd FROM analises_ia WHERE id = $1", [idAnalise]);
    conferir(`análise concluída (${an[0].status}${an[0].erro ? `: ${an[0].erro}` : ""})`, an[0].status === "CONCLUIDO");
    conferir("provedor falso registrado, tokens contados e custo zero", an[0].provedor === "falso" && an[0].tokens_entrada > 0 && Number(an[0].custo_usd) === 0);

    const { rows: ex } = await dono.query("SELECT status, paginas, mascaramentos, processado_em FROM extracoes_documento WHERE documento_id = $1", [documentoId]);
    conferir("extração concluída com 2 páginas", ex[0]?.status === "CONCLUIDA" && ex[0].paginas === 2);
    conferir("mascaramento contado na extração (CPF, e-mail, nome)", ex[0]?.mascaramentos.cpf === 1 && ex[0].mascaramentos.email === 1 && ex[0].mascaramentos.nome === 1);
    const { rows: tr } = await dono.query(
      "SELECT pagina, texto, vector_dims(embedding) AS dims FROM trechos_documento WHERE documento_id = $1 ORDER BY ordem",
      [documentoId],
    );
    const todos = tr.map((t) => t.texto).join(" ");
    conferir("trechos gravados sem o dado pessoal original", tr.length >= 2 && !todos.includes("123.456.789-09") && !todos.includes("Carlos Alberto") && todos.includes("[CPF]"));
    conferir("trechos com página e embedding de 1536 dimensões", tr[0].pagina === 1 && tr[tr.length - 1].pagina === 2 && tr.every((t) => t.dims === 1536));

    const { rows: sug } = await dono.query(
      `SELECT s.id, s.status, s.citacoes, s.citacoes_descartadas, s.conteudo, s.resposta_requisito_id FROM sugestoes_ia s WHERE s.analise_id = $1 ORDER BY s.criado_em`,
      [idAnalise],
    );
    conferir(`sugestões criadas para os requisitos tratados no documento (${sug.length})`, sug.length >= 2);
    conferir("todas as sugestões ficam pendentes de revisão", sug.every((s) => s.status === "PENDENTE_REVISAO"));
    conferir("toda sugestão tem citação conferida com página", sug.every((s) => s.citacoes.length >= 1 && s.citacoes.every((c: { pagina: number }) => c.pagina >= 1)));
    conferir("citação inventada pelo modelo foi descartada", sug.every((s) => s.citacoes_descartadas >= 1));
    const { rows: nada } = await dono.query("SELECT count(*)::int AS n FROM respostas_requisito WHERE ciclo_id = $1 AND situacao <> 'NAO_AVALIADO'", [cicloId]);
    conferir("nada é aplicado sem revisão", nada[0].n === 0);

    const [primeira, segunda] = sug;
    await aceitarSugestao(ctx, primeira.id);
    const { rows: ap } = await dono.query("SELECT situacao, observacao, evidencia, respondido_por_id FROM respostas_requisito WHERE id = $1", [primeira.resposta_requisito_id]);
    conferir("aceitar aplica a situação sugerida", ap[0].situacao === primeira.conteudo.situacao);
    conferir("aceitar grava justificativa, evidência (citação) e quem respondeu", !!ap[0].observacao && ap[0].evidencia?.includes("teste-ia.txt, p.") && ap[0].respondido_por_id === usuarioId);
    const { rows: st1 } = await dono.query("SELECT status, revisado_por_id, conteudo_aplicado FROM sugestoes_ia WHERE id = $1", [primeira.id]);
    conferir("sugestão aceita registra revisor e conteúdo aplicado", st1[0].status === "ACEITA" && st1[0].revisado_por_id === usuarioId && !!st1[0].conteudo_aplicado);
    const { rows: lg } = await dono.query(
      "SELECT count(*)::int AS n FROM log_auditoria WHERE entidade_id = $1 AND acao = 'ia.sugestao.aceita'",
      [primeira.id],
    );
    conferir("aceite registrado na trilha de auditoria", lg[0].n === 1);
    conferir("sugestão já revisada não é aceita de novo", /já foi revisada/.test((await erroDe(() => aceitarSugestao(ctx, primeira.id))) ?? ""));

    await rejeitarSugestao(ctx, segunda.id, "Documento não trata do tema");
    const { rows: rj } = await dono.query("SELECT situacao FROM respostas_requisito WHERE id = $1", [segunda.resposta_requisito_id]);
    const { rows: st2 } = await dono.query("SELECT status, motivo_rejeicao FROM sugestoes_ia WHERE id = $1", [segunda.id]);
    conferir("rejeitar não aplica a resposta", rj[0].situacao === "NAO_AVALIADO");
    conferir("rejeição guarda o motivo", st2[0].status === "REJEITADA" && st2[0].motivo_rejeicao === "Documento não trata do tema");

    // Avaliação de evidência: o documento passa a ser anexo do primeiro requisito.
    const respostaEvid = respostas.get(reqs[0].codigo)!;
    await dono.query("UPDATE documentos SET resposta_requisito_id = $1 WHERE id = $2", [respostaEvid, documentoId]);
    const idEvid = await solicitarAnalise(ctx, { tipo: "AVALIAR_EVIDENCIA", respostaRequisitoId: respostaEvid });
    analises.push(idEvid);
    await processarAnalise(ctx, idEvid);
    const { rows: ev } = await dono.query(
      "SELECT a.status, a.tokens_embeddings, s.id, s.conteudo FROM analises_ia a LEFT JOIN sugestoes_ia s ON s.analise_id = a.id WHERE a.id = $1",
      [idEvid],
    );
    conferir("avaliação de evidência concluída com sugestão", ev[0].status === "CONCLUIDO" && !!ev[0].id);
    conferir("avaliação de evidência diz se comprova e o que falta", ev[0].conteudo?.comprova === "PARCIALMENTE" && ev[0].conteudo.faltantes.length > 0);
    const erroJust = await erroDe(() => aceitarSugestao(ctx, ev[0].id, { situacao: "PARCIALMENTE_ATENDIDO", justificativa: "" }));
    conferir("edição sem justificativa para 'atende parcialmente' é recusada", /Justificativa obrigatória/.test(erroJust ?? ""));
    await aceitarSugestao(ctx, ev[0].id, { situacao: "PARCIALMENTE_ATENDIDO", justificativa: "Ajustado pelo controlador.", evidencia: "Lei anexa" });
    const { rows: ed } = await dono.query("SELECT situacao, observacao, evidencia FROM respostas_requisito WHERE id = $1", [respostaEvid]);
    const { rows: st3 } = await dono.query("SELECT status FROM sugestoes_ia WHERE id = $1", [ev[0].id]);
    conferir("editar aplica a versão ajustada", ed[0].situacao === "PARCIALMENTE_ATENDIDO" && ed[0].observacao === "Ajustado pelo controlador." && ed[0].evidencia === "Lei anexa");
    conferir("sugestão editada fica com status EDITADA", st3[0].status === "EDITADA");
    const { rows: ex2 } = await dono.query("SELECT processado_em FROM extracoes_documento WHERE documento_id = $1", [documentoId]);
    conferir("extração reaproveitada na segunda análise (documento não é reprocessado)", ex2[0].processado_em.getTime() === ex[0].processado_em.getTime());

    conferir(
      "satélite não aciona a IA",
      /exclusivo da controladoria/.test((await erroDe(() => solicitarAnalise({ ...ctx, perfil: "SATELITE" }, { tipo: "COMPARAR_NORMA", cicloId, documentoIds: [documentoId] }))) ?? ""),
    );

    // Limite mensal: com o gasto do mês acima do limite, novas análises são bloqueadas.
    const { rows: cfg } = await dono.query("SELECT * FROM configuracoes_ia WHERE id = 1");
    configOriginal = cfg[0] ?? null;
    configMexida = true;
    await dono.query(
      `INSERT INTO configuracoes_ia (id, habilitada, limite_mensal_usd, atualizado_em) VALUES (1, false, 0.01, now())
       ON CONFLICT (id) DO UPDATE SET limite_mensal_usd = 0.01`,
    );
    const { rows: caro } = await dono.query(
      `INSERT INTO analises_ia (id, cliente_id, tipo, status, solicitado_por_id, documento_ids, provedor, custo_usd)
       VALUES (gen_random_uuid(), $1, 'COMPARAR_NORMA', 'CONCLUIDO', $2, ARRAY[$3]::uuid[], 'openai', 0.02) RETURNING id`,
      [clienteId, usuarioId, documentoId],
    );
    analises.push(caro[0].id);
    const erroLimite = await erroDe(() => solicitarAnalise(ctx, { tipo: "COMPARAR_NORMA", cicloId, documentoIds: [documentoId] }));
    conferir(`limite mensal de gasto bloqueia novas análises (${erroLimite ?? "não bloqueou"})`, /limite mensal/i.test(erroLimite ?? ""));
  } finally {
    if (configMexida) {
      if (configOriginal) await dono.query("UPDATE configuracoes_ia SET limite_mensal_usd = $1 WHERE id = 1", [configOriginal.limite_mensal_usd]);
      else await dono.query("DELETE FROM configuracoes_ia WHERE id = 1");
    }
    await dono.query("DELETE FROM analises_ia WHERE id = ANY($1)", [analises]);
    await dono.query("DELETE FROM ciclos_avaliacao WHERE id = $1", [cicloId]);
    await dono.query("DELETE FROM documentos WHERE id = $1", [documentoId]);
    await removerArquivo(salvo.storageKey);
  }
}

async function main() {
  mascaramento();
  await extracaoETrechos();
  citacoes();
  custos();
  await dono.connect();
  await fluxoCompleto();
  await dono.end();
  console.log(falhas ? `\n${falhas} verificação(ões) falharam.` : "\nTodas as verificações passaram.");
  process.exit(falhas ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
