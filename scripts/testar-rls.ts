import "dotenv/config";
import { Client } from "pg";

// Verifica as políticas de isolamento conectando com o papel da aplicação (sem BYPASSRLS).
// Requer o seed de demonstração.

const app = new Client({ connectionString: process.env.APP_DATABASE_URL });
const dono = new Client({ connectionString: process.env.DATABASE_URL });
let falhas = 0;

function conferir(descricao: string, condicao: boolean) {
  console.log(`${condicao ? "OK   " : "FALHA"} ${descricao}`);
  if (!condicao) falhas++;
}

async function comContexto<T>(cliente: string | null, usuario: string | null, perfil: string | null, fn: () => Promise<T>) {
  await app.query("BEGIN");
  try {
    await app.query(
      "SELECT set_config('app.cliente_id', $1, true), set_config('app.usuario_id', $2, true), set_config('app.perfil', $3, true)",
      [cliente ?? "", usuario ?? "", perfil ?? ""],
    );
    return await fn();
  } finally {
    await app.query("ROLLBACK");
  }
}

async function contar(sql: string, params: unknown[] = []) {
  const { rows } = await app.query(`SELECT count(*)::int AS n FROM (${sql}) t`, params);
  return rows[0].n as number;
}

async function main() {
  await app.connect();
  await dono.connect();

  const { rows: clientes } = await dono.query("SELECT id, tipo FROM clientes ORDER BY criado_em");
  const pm = clientes.find((c) => c.tipo === "PREFEITURA")!.id as string;
  const cm = clientes.find((c) => c.tipo === "CAMARA")!.id as string;
  const { rows: us } = await dono.query("SELECT id, email FROM usuarios");
  const controlador = us.find((u) => u.email.startsWith("controlador"))!.id as string;
  const satelite = us.find((u) => u.email.startsWith("saude"))!.id as string;
  const { rows: tot } = await dono.query(
    "SELECT (SELECT count(*) FROM unidades WHERE cliente_id = $1)::int AS un_pm, (SELECT count(*) FROM demandas WHERE cliente_id = $1)::int AS dem_pm",
    [pm],
  );

  const { rows: papel } = await app.query("SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user");
  conferir("papel da aplicação não é superusuário nem ignora RLS", !papel[0].rolbypassrls && !papel[0].rolsuper);

  await comContexto(null, null, null, async () => {
    conferir("sem contexto: nenhuma unidade visível", (await contar("SELECT * FROM unidades")) === 0);
    conferir("sem contexto: nenhuma demanda visível", (await contar("SELECT * FROM demandas")) === 0);
  });

  await comContexto(pm, controlador, "CONTROLADOR", async () => {
    conferir("controlador na PM vê todas as unidades da PM", (await contar("SELECT * FROM unidades")) === tot[0].un_pm);
    conferir("controlador na PM não vê unidades da Câmara", (await contar("SELECT * FROM unidades WHERE cliente_id = $1", [cm])) === 0);
    conferir("controlador na PM vê todas as demandas da PM", (await contar("SELECT * FROM demandas")) === tot[0].dem_pm);
  });

  await comContexto(pm, controlador, "CONTROLADOR", async () => {
    let bloqueado = false;
    try {
      await app.query("SAVEPOINT s");
      await app.query("INSERT INTO unidades (id, cliente_id, nome) VALUES (gen_random_uuid(), $1, 'Intrusa')", [cm]);
    } catch {
      bloqueado = true;
      await app.query("ROLLBACK TO SAVEPOINT s");
    }
    conferir("inserção com cliente_id de outro cliente é bloqueada", bloqueado);
  });

  const { rows: escopo } = await dono.query(
    `SELECT
       (SELECT count(*) FROM demandas d JOIN unidades u ON u.id = d.unidade_destino_id
         WHERE d.cliente_id = $1 AND u.sigla IN ('SESAU', 'REG'))::int AS dem_saude,
       (SELECT count(*) FROM demandas d JOIN unidades u ON u.id = d.unidade_destino_id
         WHERE d.cliente_id = $1 AND u.sigla NOT IN ('SESAU', 'REG'))::int AS dem_outras,
       (SELECT array_agg(doc.id) FROM documentos doc JOIN demandas d ON d.id = doc.demanda_id
          JOIN unidades u ON u.id = d.unidade_destino_id
         WHERE doc.cliente_id = $1 AND u.sigla NOT IN ('SESAU', 'REG')) AS docs_outras,
       (SELECT array_agg(id) FROM documentos WHERE cliente_id = $1 AND demanda_id IS NULL) AS docs_avulsos,
       (SELECT array_agg(doc.id) FROM documentos doc JOIN tramitacoes_demanda t ON t.id = doc.tramite_id
         WHERE doc.cliente_id = $1 AND t.interno) AS docs_internos,
       (SELECT array_agg(doc.id) FROM documentos doc JOIN tramitacoes_demanda t ON t.id = doc.tramite_id
          JOIN demandas d ON d.id = t.demanda_id JOIN unidades u ON u.id = d.unidade_destino_id
         WHERE doc.cliente_id = $1 AND NOT t.interno AND u.sigla IN ('SESAU', 'REG')) AS docs_saude,
       (SELECT count(*) FROM tramitacoes_demanda WHERE cliente_id = $1 AND interno)::int AS tramites_internos,
       (SELECT d.id FROM demandas d JOIN unidades u ON u.id = d.unidade_destino_id
         WHERE d.cliente_id = $1 AND u.sigla IN ('SESAU', 'REG') AND d.status IN ('ENVIADA', 'VISUALIZADA', 'DEVOLVIDA')
         ORDER BY d.numero LIMIT 1) AS dem_saude_aberta,
       (SELECT d.id FROM demandas d JOIN unidades u ON u.id = d.unidade_destino_id
         WHERE d.cliente_id = $1 AND u.sigla NOT IN ('SESAU', 'REG') LIMIT 1) AS dem_outra`,
    [pm],
  );
  const e = escopo[0];

  await comContexto(pm, satelite, "SATELITE", async () => {
    const { rows } = await app.query("SELECT sigla FROM unidades ORDER BY sigla");
    const siglas = rows.map((r) => r.sigla).join(",");
    conferir(`satélite vê só a Saúde e subordinadas (${siglas})`, siglas === "REG,SESAU");
    const vistas = await contar("SELECT * FROM demandas");
    conferir(
      `satélite vê só as demandas da Saúde e subordinadas (${vistas} de ${e.dem_saude + e.dem_outras})`,
      vistas === e.dem_saude && e.dem_outras > 0,
    );
    conferir("satélite não vê ciclos de avaliação", (await contar("SELECT * FROM ciclos_avaliacao")) === 0);
    conferir("satélite não lê a trilha de auditoria", (await contar("SELECT * FROM log_auditoria")) === 0);
  });

  await comContexto(pm, satelite, "SATELITE", async () => {
    conferir(
      "satélite não lê documento de demanda de outra unidade",
      e.docs_outras?.length > 0 && (await contar("SELECT * FROM documentos WHERE id = ANY($1)", [e.docs_outras])) === 0,
    );
    conferir(
      "satélite não lê documentos avulsos da controladoria",
      e.docs_avulsos?.length > 0 && (await contar("SELECT * FROM documentos WHERE id = ANY($1)", [e.docs_avulsos])) === 0,
    );
    conferir(
      "satélite não vê comentários internos da controladoria",
      e.tramites_internos > 0 && (await contar("SELECT * FROM tramitacoes_demanda WHERE interno")) === 0,
    );
    conferir(
      "satélite não lê anexo de comentário interno",
      e.docs_internos?.length > 0 && (await contar("SELECT * FROM documentos WHERE id = ANY($1)", [e.docs_internos])) === 0,
    );
    conferir(
      "satélite lê os anexos das demandas da sua unidade",
      e.docs_saude?.length > 0 && (await contar("SELECT * FROM documentos WHERE id = ANY($1)", [e.docs_saude])) === e.docs_saude.length,
    );
  });

  // Trilha global: só o administrador HorizonAJ (conferido no banco) lê os registros sem cliente.
  const { rows: adm } = await dono.query(
    "SELECT (SELECT id FROM usuarios WHERE admin_horizon AND ativo LIMIT 1) AS id, (SELECT count(*) FROM log_auditoria WHERE cliente_id IS NULL)::int AS globais",
  );
  const globais = "SELECT * FROM log_auditoria WHERE cliente_id IS NULL";
  if (adm[0].id) {
    await comContexto(null, adm[0].id, "ADMIN_HORIZON", async () => {
      conferir("admin HorizonAJ lê a trilha global", (await contar(globais)) === adm[0].globais);
      conferir("admin HorizonAJ não lê trilha de cliente", (await contar("SELECT * FROM log_auditoria WHERE cliente_id IS NOT NULL")) === 0);
    });
    await comContexto(pm, adm[0].id, "ADMIN_HORIZON", async () => {
      conferir("admin com cliente no contexto não lê a trilha global", (await contar(globais)) === 0);
    });
  } else {
    console.log("AVISO nenhum admin HorizonAJ no seed; testes de leitura da trilha global pelo admin ignorados");
  }
  await comContexto(null, controlador, "ADMIN_HORIZON", async () => {
    conferir("perfil ADMIN_HORIZON forjado por não admin não lê a trilha global", (await contar(globais)) === 0);
  });
  await comContexto(pm, controlador, "CONTROLADOR", async () => {
    conferir("controlador não lê a trilha global", (await contar(globais)) === 0);
  });

  // Tentativas de escrita proibidas ao satélite (cada uma num savepoint).
  async function bloqueado(sql: string, params: unknown[] = []) {
    await app.query("SAVEPOINT s");
    try {
      const r = await app.query(sql, params);
      await app.query("ROLLBACK TO SAVEPOINT s");
      return r.rowCount === 0;
    } catch {
      await app.query("ROLLBACK TO SAVEPOINT s");
      return true;
    }
  }

  await comContexto(pm, satelite, "SATELITE", async () => {
    const id = e.dem_saude_aberta;
    conferir(
      "satélite não registra conclusão (trâmite exclusivo da controladoria)",
      await bloqueado(
        "INSERT INTO tramitacoes_demanda (id, cliente_id, demanda_id, tipo, usuario_id, usuario_nome) VALUES (gen_random_uuid(), $1, $2, 'CONCLUSAO', $3, 'x')",
        [pm, id, satelite],
      ),
    );
    conferir(
      "satélite não registra trâmite em nome de outro usuário",
      await bloqueado(
        "INSERT INTO tramitacoes_demanda (id, cliente_id, demanda_id, tipo, usuario_id, usuario_nome) VALUES (gen_random_uuid(), $1, $2, 'RESPOSTA', $3, 'x')",
        [pm, id, controlador],
      ),
    );
    conferir(
      "satélite não insere trâmite interno",
      await bloqueado(
        "INSERT INTO tramitacoes_demanda (id, cliente_id, demanda_id, tipo, usuario_id, usuario_nome, interno) VALUES (gen_random_uuid(), $1, $2, 'RESPOSTA', $3, 'x', true)",
        [pm, id, satelite],
      ),
    );
    conferir(
      "satélite não insere trâmite em demanda de outra unidade",
      await bloqueado(
        "INSERT INTO tramitacoes_demanda (id, cliente_id, demanda_id, tipo, usuario_id, usuario_nome) VALUES (gen_random_uuid(), $1, $2, 'RESPOSTA', $3, 'x')",
        [pm, e.dem_outra, satelite],
      ),
    );
    conferir("satélite não altera o prazo da demanda", await bloqueado("UPDATE demandas SET prazo = prazo + 30 WHERE id = $1", [id]));
    conferir("satélite não conclui a demanda", await bloqueado("UPDATE demandas SET status = 'CONCLUIDA' WHERE id = $1", [id]));
    conferir("satélite não altera demanda de outra unidade", await bloqueado("UPDATE demandas SET status = 'RESPONDIDA' WHERE id = $1", [e.dem_outra]));
    conferir(
      "satélite não cria demandas",
      await bloqueado(
        "INSERT INTO demandas (id, cliente_id, numero, ano, assunto, descricao, unidade_destino_id, prazo, criado_por_id, atualizado_em) SELECT gen_random_uuid(), $1, 999, 2000, 'x', 'x', unidade_destino_id, prazo, $2, now() FROM demandas WHERE id = $3",
        [pm, satelite, id],
      ),
    );
    conferir("satélite não exclui demandas", await bloqueado("DELETE FROM demandas WHERE id = $1", [id]));
    conferir(
      "satélite não registra documento sem trâmite",
      await bloqueado(
        "INSERT INTO documentos (id, cliente_id, nome, mime_type, tamanho, sha256, storage_key, enviado_por_id, demanda_id) VALUES (gen_random_uuid(), $1, 'x.txt', 'text/plain', 1, repeat('0', 64), gen_random_uuid()::text, $2, $3)",
        [pm, satelite, id],
      ),
    );
    conferir("satélite não exclui documentos", await bloqueado("DELETE FROM documentos WHERE id = ANY($1)", [e.docs_saude]));

    await app.query("SAVEPOINT s");
    let respondeu = false;
    try {
      const { rows: atual } = await app.query("SELECT status FROM demandas WHERE id = $1", [id]);
      if (atual[0].status === "ENVIADA" || atual[0].status === "VISUALIZADA" || atual[0].status === "DEVOLVIDA") {
        await app.query("UPDATE demandas SET status = 'RESPONDIDA', atualizado_em = now() WHERE id = $1", [id]);
        const { rows: t } = await app.query(
          "INSERT INTO tramitacoes_demanda (id, cliente_id, demanda_id, tipo, status_anterior, status_novo, usuario_id, usuario_nome) VALUES (gen_random_uuid(), $1, $2, 'RESPOSTA', $3, 'RESPONDIDA', $4, 'x') RETURNING id",
          [pm, id, atual[0].status, satelite],
        );
        await app.query(
          "INSERT INTO documentos (id, cliente_id, nome, mime_type, tamanho, sha256, storage_key, enviado_por_id, demanda_id, tramite_id) VALUES (gen_random_uuid(), $1, 'x.txt', 'text/plain', 1, repeat('0', 64), gen_random_uuid()::text, $2, $3, $4)",
          [pm, satelite, id, t[0].id],
        );
        respondeu = true;
      }
    } catch (err) {
      console.error(err);
    }
    await app.query("ROLLBACK TO SAVEPOINT s");
    conferir("satélite consegue responder demanda da sua unidade com anexo", respondeu);
  });

  await comContexto(cm, controlador, "CONTROLADOR", async () => {
    conferir("controlador na Câmara não lê documentos da Prefeitura", (await contar("SELECT * FROM documentos WHERE cliente_id = $1", [pm])) === 0);
    conferir("controlador na Câmara não lê trâmites da Prefeitura", (await contar("SELECT * FROM tramitacoes_demanda WHERE cliente_id = $1", [pm])) === 0);
  });

  await comContexto(pm, controlador, "CONTROLADOR", async () => {
    conferir("controlador vê comentários internos", (await contar("SELECT * FROM tramitacoes_demanda WHERE interno")) === e.tramites_internos);
    conferir(
      "controlador lê documentos avulsos e internos",
      (await contar("SELECT * FROM documentos WHERE id = ANY($1)", [[...(e.docs_avulsos ?? []), ...(e.docs_internos ?? [])]])) ===
        (e.docs_avulsos?.length ?? 0) + (e.docs_internos?.length ?? 0),
    );
  });

  await comContexto(cm, satelite, "SATELITE", async () => {
    conferir("satélite sem vínculo na Câmara não vê nada lá", (await contar("SELECT * FROM unidades")) === 0);
  });

  await comContexto(pm, controlador, "CONTROLADOR", async () => {
    let bloqueado = false;
    try {
      await app.query("SAVEPOINT s");
      await app.query("UPDATE tramitacoes_demanda SET texto = 'alterado'");
    } catch {
      bloqueado = true;
      await app.query("ROLLBACK TO SAVEPOINT s");
    }
    conferir("histórico de tramitação é imutável", bloqueado);
  });

  await testarMedidas(pm, cm, controlador, satelite);
  await testarAuditorias(pm, cm, controlador, satelite);
  await testarIA(pm, cm, controlador, satelite);
  await testarIntegracoes(pm, cm, controlador, satelite);

  await app.end();
  await dono.end();
  console.log(falhas ? `\n${falhas} verificação(ões) falharam.` : "\nTodas as verificações passaram.");
  process.exit(falhas ? 1 : 0);
}

/** Tenta executar o comando dentro de um savepoint; devolve true se o banco recusou. */
async function recusado(sql: string, params: unknown[] = []) {
  await app.query("SAVEPOINT s");
  try {
    await app.query(sql, params);
    await app.query("RELEASE SAVEPOINT s");
    return false;
  } catch {
    await app.query("ROLLBACK TO SAVEPOINT s");
    return true;
  }
}

// Dados externos: coletas das APIs públicas são da controladoria de cada cliente; o satélite não as vê.
async function testarIntegracoes(pm: string, cm: string, controlador: string, satelite: string) {
  const { rows: antes } = await dono.query(
    "SELECT cliente_id FROM coletas_integracao WHERE cliente_id = ANY($1) AND fonte = 'SICONFI'",
    [[pm, cm]],
  );
  const preexistentes = new Set(antes.map((r) => r.cliente_id as string));
  const inserir = `INSERT INTO coletas_integracao (id, cliente_id, fonte, status, dados, atualizado_em)
    VALUES (gen_random_uuid(), $1, 'SICONFI', 'SUCESSO', '{"teste": true}', now()) RETURNING id`;
  const criados: string[] = [];
  for (const c of [pm, cm]) {
    if (preexistentes.has(c)) continue;
    const { rows } = await dono.query(inserir, [c]);
    criados.push(rows[0].id);
  }

  try {
    await comContexto(pm, controlador, "CONTROLADOR", async () => {
      conferir("controlador na PM vê as coletas da PM", (await contar("SELECT * FROM coletas_integracao WHERE cliente_id = $1", [pm])) >= 1);
      conferir("controlador na PM não vê coletas da Câmara", (await contar("SELECT * FROM coletas_integracao WHERE cliente_id = $1", [cm])) === 0);
      conferir(
        "controlador não grava coleta em outro cliente",
        await recusado("INSERT INTO coletas_integracao (id, cliente_id, fonte, status, atualizado_em) VALUES (gen_random_uuid(), $1, 'IBGE', 'SUCESSO', now())", [cm]),
      );
      const { rowCount } = await app.query("UPDATE coletas_integracao SET erro = 'x' WHERE cliente_id = $1", [cm]);
      conferir("controlador não altera coletas da Câmara", rowCount === 0);
    });

    await comContexto(pm, satelite, "SATELITE", async () => {
      conferir("satélite não vê coletas de dados externos", (await contar("SELECT * FROM coletas_integracao")) === 0);
      conferir(
        "satélite não grava coletas",
        await recusado("INSERT INTO coletas_integracao (id, cliente_id, fonte, status, atualizado_em) VALUES (gen_random_uuid(), $1, 'IBGE', 'SUCESSO', now())", [pm]),
      );
      const { rowCount } = await app.query("UPDATE coletas_integracao SET erro = 'x' WHERE cliente_id = $1", [pm]);
      conferir("satélite não altera coletas", rowCount === 0);
    });
  } finally {
    if (criados.length) await dono.query("DELETE FROM coletas_integracao WHERE id = ANY($1)", [criados]);
  }
}

// Medidas: situações são internas da controladoria (o satélite não as vê, nem mesmo as da sua unidade).
async function testarMedidas(pm: string, cm: string, controlador: string, satelite: string) {
  const { rows: un } = await dono.query("SELECT id FROM unidades WHERE cliente_id = $1 AND sigla = 'SESAU' LIMIT 1", [pm]);
  const sesau = un[0]?.id as string | undefined;
  const inserir = `INSERT INTO situacoes (id, cliente_id, numero, ano, titulo, descricao, origem, unidade_id, probabilidade, impacto, status, criado_por_id, atualizado_em)
    VALUES (gen_random_uuid(), $1, $2, 1999, 'Teste RLS', 'Situação criada pelo teste de RLS', 'CONSTATACAO', $3, $4, $5, 'ABERTA', $6, now()) RETURNING id`;
  const { rows: sPm } = await dono.query(inserir, [pm, 990001, sesau ?? null, 4, 4, controlador]);
  const { rows: sCm } = await dono.query(inserir, [cm, 990001, null, 2, 2, controlador]);
  const idPm = sPm[0].id as string;
  const idCm = sCm[0].id as string;
  const { rows: doc } = await dono.query(
    `INSERT INTO documentos (id, cliente_id, nome, mime_type, tamanho, sha256, storage_key, enviado_por_id, situacao_id)
     VALUES (gen_random_uuid(), $1, 'teste-rls.pdf', 'application/pdf', 1, repeat('0', 64), 'teste-rls/' || gen_random_uuid(), $2, $3) RETURNING id`,
    [pm, controlador, idPm],
  );
  const idDoc = doc[0].id as string;

  try {
    const { rows: tot } = await dono.query("SELECT count(*)::int AS n FROM situacoes WHERE cliente_id = $1", [pm]);

    await comContexto(pm, controlador, "CONTROLADOR", async () => {
      conferir("controlador na PM vê as situações da PM", (await contar("SELECT * FROM situacoes")) === tot[0].n);
      conferir("controlador na PM vê a situação de teste", (await contar("SELECT * FROM situacoes WHERE id = $1", [idPm])) === 1);
      conferir("controlador na PM não vê situações da Câmara", (await contar("SELECT * FROM situacoes WHERE id = $1", [idCm])) === 0);
      conferir("controlador lê anexos de situação", (await contar("SELECT * FROM documentos WHERE id = $1", [idDoc])) === 1);
      conferir(
        "controlador não grava situação em outro cliente",
        await recusado(inserir.replace("RETURNING id", ""), [cm, 990002, null, 1, 1, controlador]),
      );
      conferir("CHECK recusa probabilidade 6", await recusado(inserir, [pm, 990003, null, 6, 3, controlador]));
      conferir("CHECK recusa impacto 0", await recusado(inserir, [pm, 990004, null, 3, 0, controlador]));
      conferir("aceita probabilidade e impacto de 1 a 5", !(await recusado(inserir, [pm, 990005, null, 5, 1, controlador])));
      conferir(
        "CHECK exige justificativa para resolver a situação",
        await recusado("UPDATE situacoes SET status = 'RESOLVIDA', encerrado_em = now() WHERE id = $1", [idPm]),
      );
      conferir(
        "CHECK recusa sigilo fora de denúncia",
        await recusado("UPDATE situacoes SET sigilosa = true WHERE id = $1", [idPm]),
      );
      conferir(
        "CHECK exige origem Medida no plano vinculado à situação",
        await recusado(
          "INSERT INTO planos_acao (id, cliente_id, situacao_id, titulo, origem, status, criado_por_id) VALUES (gen_random_uuid(), $1, $2, 'x', 'OUTRA', 'EM_EXECUCAO', $3)",
          [pm, idPm, controlador],
        ),
      );
    });

    await comContexto(pm, satelite, "SATELITE", async () => {
      conferir("satélite não vê situações (nem as da sua unidade)", (await contar("SELECT * FROM situacoes")) === 0);
      conferir("satélite não lê anexos de situação", (await contar("SELECT * FROM documentos WHERE id = $1", [idDoc])) === 0);
      conferir("satélite não registra situações", await recusado(inserir, [pm, 990006, sesau ?? null, 1, 1, satelite]));
      const { rowCount } = await app.query("UPDATE situacoes SET titulo = 'alterado' WHERE id = $1", [idPm]);
      conferir("satélite não altera situações", rowCount === 0);
    });
  } finally {
    await dono.query("DELETE FROM documentos WHERE id = $1", [idDoc]);
    await dono.query("DELETE FROM situacoes WHERE id = ANY($1)", [[idPm, idCm]]);
  }
}

// Auditorias: papéis de trabalho são da controladoria; o satélite só vê as solicitações (demandas) enviadas à sua unidade.
async function testarAuditorias(pm: string, cm: string, controlador: string, satelite: string) {
  const { rows: un } = await dono.query("SELECT id FROM unidades WHERE cliente_id = $1 AND sigla = 'SESAU' LIMIT 1", [pm]);
  const sesau = un[0].id as string;
  const inserir = `INSERT INTO auditorias (id, cliente_id, numero, ano, titulo, tipo, objetivo, unidade_id, status, criado_por_id, atualizado_em)
    VALUES (gen_random_uuid(), $1, $2, 1999, 'Teste RLS', 'CONFORMIDADE', 'Auditoria criada pelo teste de RLS', $3, $4, $5, now()) RETURNING id`;
  const { rows: aPm } = await dono.query(inserir, [pm, 990001, sesau, "PLANEJAMENTO", controlador]);
  const { rows: aCm } = await dono.query(inserir, [cm, 990001, null, "PLANEJAMENTO", controlador]);
  const idPm = aPm[0].id as string;
  const idCm = aCm[0].id as string;
  const { rows: ach } = await dono.query(
    `INSERT INTO achados (id, cliente_id, auditoria_id, numero, titulo, condicao, criterio, causa, efeito, probabilidade, impacto, criado_por_id, atualizado_em)
     VALUES (gen_random_uuid(), $1, $2, 1, 'Achado RLS', 'c', 'c', 'c', 'e', 3, 3, $3, now()) RETURNING id`,
    [pm, idPm, controlador],
  );
  const idAchado = ach[0].id as string;
  const { rows: doc } = await dono.query(
    `INSERT INTO documentos (id, cliente_id, nome, mime_type, tamanho, sha256, storage_key, enviado_por_id, auditoria_id)
     VALUES (gen_random_uuid(), $1, 'teste-rls.pdf', 'application/pdf', 1, repeat('0', 64), 'teste-rls/' || gen_random_uuid(), $2, $3) RETURNING id`,
    [pm, controlador, idPm],
  );
  const idDoc = doc[0].id as string;
  const { rows: dem } = await dono.query(
    `INSERT INTO demandas (id, cliente_id, numero, ano, assunto, descricao, unidade_destino_id, auditoria_id, prazo, criado_por_id, atualizado_em)
     VALUES (gen_random_uuid(), $1, 990001, 1999, 'Solicitação de auditoria (teste RLS)', 'Teste', $2, $3, current_date + 10, $4, now()) RETURNING id`,
    [pm, sesau, idPm, controlador],
  );
  const idDemanda = dem[0].id as string;

  try {
    await comContexto(pm, controlador, "CONTROLADOR", async () => {
      conferir("controlador na PM vê a auditoria de teste", (await contar("SELECT * FROM auditorias WHERE id = $1", [idPm])) === 1);
      conferir("controlador na PM não vê auditorias da Câmara", (await contar("SELECT * FROM auditorias WHERE id = $1", [idCm])) === 0);
      conferir("controlador lê achados e documentos da auditoria", (await contar("SELECT * FROM achados WHERE id = $1", [idAchado])) === 1 && (await contar("SELECT * FROM documentos WHERE id = $1", [idDoc])) === 1);
      conferir("controlador não grava auditoria em outro cliente", await recusado(inserir, [cm, 990002, null, "PLANEJAMENTO", controlador]));
      conferir(
        "controlador não grava modelo de checklist em outro cliente",
        await recusado("INSERT INTO modelos_checklist (id, cliente_id, nome, atualizado_em) VALUES (gen_random_uuid(), $1, 'Intruso', now())", [cm]),
      );
      conferir(
        "CHECK recusa probabilidade 6 no achado",
        await recusado(
          `INSERT INTO achados (id, cliente_id, auditoria_id, numero, titulo, condicao, criterio, causa, efeito, probabilidade, impacto, criado_por_id, atualizado_em)
           VALUES (gen_random_uuid(), $1, $2, 2, 'x', 'c', 'c', 'c', 'e', 6, 3, $3, now())`,
          [pm, idPm, controlador],
        ),
      );
      conferir(
        "CHECK recusa mês 13 no item do PAAI",
        await recusado(
          `WITH p AS (INSERT INTO planos_anuais_auditoria (id, cliente_id, ano, criado_por_id, atualizado_em) VALUES (gen_random_uuid(), $1, 1999, $2, now()) RETURNING id)
           INSERT INTO itens_plano_auditoria (id, cliente_id, plano_id, titulo, tipo, mes_inicio, mes_fim, probabilidade, impacto)
           SELECT gen_random_uuid(), $1, p.id, 'x', 'OPERACIONAL', 12, 13, 3, 3 FROM p`,
          [pm, controlador],
        ),
      );
      conferir("CHECK exige justificativa para cancelar a auditoria", await recusado("UPDATE auditorias SET status = 'CANCELADA' WHERE id = $1", [idPm]));
      conferir("trigger recusa auditoria que não começa no planejamento", await recusado(inserir, [pm, 990003, null, "EXECUCAO", controlador]));
      conferir(
        "CHECK exige origem Auditoria no plano vinculado à auditoria",
        await recusado(
          "INSERT INTO planos_acao (id, cliente_id, auditoria_id, titulo, origem, status, criado_por_id) VALUES (gen_random_uuid(), $1, $2, 'x', 'OUTRA', 'EM_EXECUCAO', $3)",
          [pm, idPm, controlador],
        ),
      );
    });

    await comContexto(pm, satelite, "SATELITE", async () => {
      conferir("satélite não vê auditorias (nem as da sua unidade)", (await contar("SELECT * FROM auditorias")) === 0);
      conferir("satélite não vê achados nem recomendações", (await contar("SELECT * FROM achados")) === 0 && (await contar("SELECT * FROM recomendacoes")) === 0);
      conferir(
        "satélite não vê PAAI, checklists nem matriz",
        (await contar("SELECT * FROM planos_anuais_auditoria")) === 0 &&
          (await contar("SELECT * FROM modelos_checklist")) === 0 &&
          (await contar("SELECT * FROM itens_checklist_auditoria")) === 0 &&
          (await contar("SELECT * FROM questoes_auditoria")) === 0,
      );
      conferir("satélite não lê documentos da auditoria", (await contar("SELECT * FROM documentos WHERE id = $1", [idDoc])) === 0);
      conferir("satélite vê a solicitação da auditoria enviada à sua unidade", (await contar("SELECT * FROM demandas WHERE id = $1", [idDemanda])) === 1);
      conferir("satélite não desvincula a solicitação da auditoria", await recusado("UPDATE demandas SET auditoria_id = NULL WHERE id = $1", [idDemanda]));
      conferir("satélite não registra auditorias", await recusado(inserir, [pm, 990004, sesau, "PLANEJAMENTO", satelite]));
    });
  } finally {
    await dono.query("DELETE FROM demandas WHERE id = $1", [idDemanda]);
    await dono.query("DELETE FROM documentos WHERE id = $1", [idDoc]);
    await dono.query("DELETE FROM auditorias WHERE id = ANY($1)", [[idPm, idCm]]);
  }
}

// IA: análises, sugestões, extrações e trechos são internos da controladoria e isolados por cliente.
async function testarIA(pm: string, cm: string, controlador: string, satelite: string) {
  const ids: Record<string, { doc: string; analise: string; sugestao: string }> = {};
  for (const cliente of [pm, cm]) {
    const { rows: d } = await dono.query(
      `INSERT INTO documentos (id, cliente_id, nome, mime_type, tamanho, sha256, storage_key, enviado_por_id)
       VALUES (gen_random_uuid(), $1, 'teste-rls-ia.txt', 'text/plain', 1, repeat('0', 64), 'teste-rls/' || gen_random_uuid(), $2) RETURNING id`,
      [cliente, controlador],
    );
    const doc = d[0].id as string;
    await dono.query("INSERT INTO extracoes_documento (id, cliente_id, documento_id, status) VALUES (gen_random_uuid(), $1, $2, 'CONCLUIDA')", [cliente, doc]);
    await dono.query(
      `INSERT INTO trechos_documento (id, cliente_id, documento_id, ordem, pagina, posicao, texto, embedding)
       VALUES (gen_random_uuid(), $1, $2, 0, 1, 0, 'trecho de teste', array_fill(0.01::real, ARRAY[1536])::vector)`,
      [cliente, doc],
    );
    const { rows: a } = await dono.query(
      `INSERT INTO analises_ia (id, cliente_id, tipo, solicitado_por_id, documento_ids, provedor)
       VALUES (gen_random_uuid(), $1, 'COMPARAR_NORMA', $2, ARRAY[$3]::uuid[], 'falso') RETURNING id`,
      [cliente, controlador, doc],
    );
    const { rows: s } = await dono.query(
      `INSERT INTO sugestoes_ia (id, cliente_id, analise_id, conteudo, citacoes) VALUES (gen_random_uuid(), $1, $2, '{}', '[]') RETURNING id`,
      [cliente, a[0].id],
    );
    ids[cliente] = { doc, analise: a[0].id, sugestao: s[0].id };
  }
  const tabelas = "SELECT id FROM analises_ia UNION ALL SELECT id FROM sugestoes_ia UNION ALL SELECT id FROM extracoes_documento UNION ALL SELECT id FROM trechos_documento";

  try {
    await comContexto(pm, controlador, "CONTROLADOR", async () => {
      conferir("controlador na PM vê análise e sugestão de IA da PM", (await contar("SELECT * FROM analises_ia WHERE id = $1", [ids[pm].analise])) === 1 && (await contar("SELECT * FROM sugestoes_ia WHERE id = $1", [ids[pm].sugestao])) === 1);
      conferir("controlador na PM vê trechos e extração da PM", (await contar("SELECT * FROM trechos_documento WHERE documento_id = $1", [ids[pm].doc])) === 1 && (await contar("SELECT * FROM extracoes_documento WHERE documento_id = $1", [ids[pm].doc])) === 1);
      conferir(
        "controlador na PM não vê IA da Câmara",
        (await contar("SELECT * FROM analises_ia WHERE id = $1", [ids[cm].analise])) === 0 &&
          (await contar("SELECT * FROM sugestoes_ia WHERE id = $1", [ids[cm].sugestao])) === 0 &&
          (await contar("SELECT * FROM trechos_documento WHERE documento_id = $1", [ids[cm].doc])) === 0,
      );
      conferir(
        "controlador na PM não grava análise na Câmara",
        await recusado("INSERT INTO analises_ia (id, cliente_id, tipo, solicitado_por_id, provedor) VALUES (gen_random_uuid(), $1, 'COMPARAR_NORMA', $2, 'falso')", [cm, controlador]),
      );
      conferir("sugestão aceita sem revisor é recusada (CHECK)", await recusado("UPDATE sugestoes_ia SET status = 'ACEITA' WHERE id = $1", [ids[pm].sugestao]));
    });

    await comContexto(pm, satelite, "SATELITE", async () => {
      conferir("satélite não lê análises nem sugestões de IA", (await contar("SELECT * FROM analises_ia")) === 0 && (await contar("SELECT * FROM sugestoes_ia")) === 0);
      conferir("satélite não lê trechos nem extrações de documentos", (await contar("SELECT * FROM trechos_documento")) === 0 && (await contar("SELECT * FROM extracoes_documento")) === 0);
      conferir(
        "satélite não aciona a IA (não grava análise)",
        await recusado("INSERT INTO analises_ia (id, cliente_id, tipo, solicitado_por_id, provedor) VALUES (gen_random_uuid(), $1, 'COMPARAR_NORMA', $2, 'falso')", [pm, satelite]),
      );
      const { rowCount } = await app.query("UPDATE sugestoes_ia SET motivo_rejeicao = 'x' WHERE id = $1", [ids[pm].sugestao]);
      conferir("satélite não revisa sugestões", rowCount === 0);
    });

    await comContexto(null, null, null, async () => {
      conferir("sem contexto: só a soma de gasto lê análises; sugestões e trechos invisíveis", (await contar(tabelas)) === (await contar("SELECT id FROM analises_ia")));
    });
  } finally {
    await dono.query("DELETE FROM analises_ia WHERE id = ANY($1)", [[ids[pm].analise, ids[cm].analise]]);
    await dono.query("DELETE FROM documentos WHERE id = ANY($1)", [[ids[pm].doc, ids[cm].doc]]);
  }
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
