import "dotenv/config";
import { randomUUID } from "node:crypto";
import { verify } from "@node-rs/argon2";
import { Client } from "pg";
import { alterarEmailProprio, alterarSenhaPropria, atualizarPerfilProprio } from "../src/lib/auth/conta";
import { gerarHashSenha } from "../src/lib/auth/senha";

// Verifica o autoatendimento da conta (Configurações › Minha conta): troca de senha com encerramento das
// outras sessões e bloqueio contra força bruta, edição do perfil e troca de e-mail.
// Cria usuários temporários (removidos ao final). Rodar com a condição react-server (npm run test:senha).

const dono = new Client({ connectionString: process.env.DATABASE_URL });
let falhas = 0;

function conferir(descricao: string, condicao: boolean) {
  console.log(`${condicao ? "OK   " : "FALHA"} ${descricao}`);
  if (!condicao) falhas++;
}

function gerarCpf(base: string) {
  const dv = (s: string) => ((([...s].reduce((t, d, i) => t + Number(d) * (s.length + 1 - i), 0) * 10) % 11) % 10).toString();
  const d1 = dv(base);
  return base + d1 + dv(base + d1);
}

const SENHA_A = "senha-inicial-123";
const SENHA_B = "outra-senha-456";

async function criarUsuario(sufixo: string, senha: string) {
  const id = randomUUID();
  await dono.query(
    "INSERT INTO usuarios (id, nome, email, senha_hash, atualizado_em) VALUES ($1, $2, $3, $4, now())",
    [id, `Teste ${sufixo}`, `teste-conta-${sufixo}-${id.slice(0, 8)}@exemplo.gov.br`, await gerarHashSenha(senha)],
  );
  return id;
}

async function criarSessao(usuarioId: string) {
  const id = randomUUID().replace(/-/g, "");
  await dono.query("INSERT INTO sessoes (id, usuario_id, expira_em) VALUES ($1, $2, now() + interval '1 day')", [id, usuarioId]);
  return id;
}

async function usuario(id: string) {
  const { rows } = await dono.query("SELECT nome, email, cpf, telefone, senha_hash, admin_horizon FROM usuarios WHERE id = $1", [id]);
  return rows[0] as { nome: string; email: string; cpf: string | null; telefone: string | null; senha_hash: string; admin_horizon: boolean };
}

async function main() {
  await dono.connect();
  const a = await criarUsuario("a", SENHA_A);
  const b = await criarUsuario("b", SENHA_B);
  let vinculo: string | null = null;

  try {
    // ── Troca de senha ──
    const atualA = await criarSessao(a);
    const outrasA = [await criarSessao(a), await criarSessao(a)];
    const sessaoB = await criarSessao(b);
    const trocar = (senhaAtual: string, novaSenha: string, confirmacao = novaSenha) =>
      alterarSenhaPropria({ usuarioId: a, sessaoAtualId: atualA, senhaAtual, novaSenha, confirmacao });

    const errada = await trocar("senha-errada-000", "nova-senha-forte-1");
    conferir("senha atual errada é recusada", !errada.ok && errada.erro === "Senha atual incorreta.");
    const curta = await trocar(SENHA_A, "curta");
    conferir("nova senha com menos de 10 caracteres é recusada", !curta.ok && /10 caracteres/.test(curta.erro));
    const igual = await trocar(SENHA_A, SENHA_A);
    conferir("nova senha igual à atual é recusada", !igual.ok && /diferente da atual/.test(igual.erro));
    const confirmacao = await trocar(SENHA_A, "nova-senha-forte-1", "nova-senha-forte-2");
    conferir("confirmação diferente é recusada", !confirmacao.ok && /confirmação/.test(confirmacao.erro));
    conferir("nenhuma tentativa recusada alterou o hash", await verify((await usuario(a)).senha_hash, SENHA_A));

    const nova = "nova-senha-forte-1";
    const ok = await trocar(SENHA_A, nova);
    conferir("troca com a senha atual correta é aceita", ok.ok);
    const hash = (await usuario(a)).senha_hash;
    conferir("hash gravado é Argon2id com os parâmetros OWASP", hash.startsWith("$argon2id$v=19$m=19456,t=2,p=1$"));
    conferir("hash confere com a nova senha e não com a antiga", (await verify(hash, nova)) && !(await verify(hash, SENHA_A)));
    const { rows: sessoes } = await dono.query("SELECT id FROM sessoes WHERE usuario_id = ANY($1)", [[a, b]]);
    const ids = sessoes.map((s) => s.id as string);
    conferir("a sessão atual continua ativa", ids.includes(atualA));
    conferir("as outras sessões do usuário foram encerradas", outrasA.every((s) => !ids.includes(s)));
    conferir("sessões de outros usuários não foram tocadas", ids.includes(sessaoB));
    const { rows: logs } = await dono.query(
      "SELECT dados::text AS dados FROM log_auditoria WHERE usuario_id = $1 AND acao = 'usuario.senha_alterada'",
      [a],
    );
    conferir("log usuario.senha_alterada registrado sem a senha", logs.length === 1 && !logs[0].dados.includes(nova));

    for (let i = 0; i < 5; i++) await trocar(`errada-${i}-xxxxxx`, "mais-uma-senha-9");
    const bloqueada = await trocar(nova, "mais-uma-senha-9");
    conferir("após 5 erros, até a senha correta é recusada (bloqueio de 15 min)", !bloqueada.ok && /Muitas tentativas/.test(bloqueada.erro));
    conferir("o bloqueio vale também para a troca de e-mail", !(await alterarEmailProprio(a, { email: "x-novo@exemplo.gov.br", senhaAtual: nova })).ok);
    conferir("o bloqueio não alterou a senha", await verify((await usuario(a)).senha_hash, nova));
    const { rows: erros } = await dono.query(
      "SELECT count(*)::int AS n FROM log_auditoria WHERE usuario_id = $1 AND acao = 'usuario.senha_incorreta'",
      [a],
    );
    conferir("cada senha incorreta foi registrada na trilha", erros[0].n === 6);

    // ── Perfil ──
    const cpfA = gerarCpf("529982247");
    await dono.query("UPDATE usuarios SET cpf = $1 WHERE id = $2", [cpfA, a]);
    const perfil = (campos: Record<string, unknown>) => atualizarPerfilProprio(b, { nome: "Teste B", ...campos }, null);

    const vazio = await perfil({ nome: "  " });
    conferir("nome vazio é recusado", !vazio.ok && /nome completo/.test(vazio.erro));
    const cpfRuim = await perfil({ cpf: "123.456.789-00" });
    conferir("CPF inválido é recusado", !cpfRuim.ok && cpfRuim.erro === "CPF inválido.");
    const cpfDup = await perfil({ cpf: cpfA });
    conferir("CPF de outro usuário é recusado", !cpfDup.ok && /já está cadastrado/.test(cpfDup.erro));
    const telRuim = await perfil({ telefone: "1234" });
    conferir("telefone sem DDD é recusado", !telRuim.ok);

    const cpfB = gerarCpf("111444777");
    const salvo = await perfil({
      nome: "Teste B Atualizado",
      cpf: cpfB.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4"),
      telefone: "(71) 99876-5432",
      adminHorizon: "on",
      admin_horizon: true,
      email: "invasao@exemplo.gov.br",
      perfil: "CONTROLADOR",
    });
    const depois = await usuario(b);
    conferir("perfil válido é salvo (nome, CPF e telefone normalizados)", salvo.ok && depois.nome === "Teste B Atualizado" && depois.cpf === cpfB && depois.telefone === "71998765432");
    conferir("o usuário não consegue se tornar administrador", depois.admin_horizon === false);
    conferir("o e-mail não muda pelo formulário de perfil", depois.email.startsWith("teste-conta-b-"));
    const { rows: logPerfil } = await dono.query(
      "SELECT dados FROM log_auditoria WHERE usuario_id = $1 AND acao = 'usuario.perfil_atualizado'",
      [b],
    );
    conferir("log usuario.perfil_atualizado lista os campos alterados", logPerfil.length === 1 && logPerfil[0].dados.campos.includes("cpf"));

    const { rows: cli } = await dono.query("SELECT id, nome FROM clientes WHERE ativo LIMIT 1");
    if (cli[0]) {
      vinculo = randomUUID();
      await dono.query("INSERT INTO vinculos_cliente (id, usuario_id, cliente_id, perfil, cargo) VALUES ($1, $2, $3, 'EQUIPE', 'Analista')", [
        vinculo,
        b,
        cli[0].id,
      ]);
      const ctx = { clienteId: cli[0].id as string, usuarioId: b, perfil: "EQUIPE" as const, vinculoId: vinculo };
      const cargo = await atualizarPerfilProprio(b, { nome: "Teste B Atualizado", cpf: cpfB, telefone: "71998765432", cargo: "Auditor de Controle" }, ctx);
      const { rows: v } = await dono.query("SELECT cargo FROM vinculos_cliente WHERE id = $1", [vinculo]);
      const { rows: logCargo } = await dono.query(
        "SELECT count(*)::int AS n FROM log_auditoria WHERE cliente_id = $1 AND usuario_id = $2 AND acao = 'usuario.cargo_alterado'",
        [cli[0].id, b],
      );
      conferir("cargo do vínculo é atualizado e registrado na trilha do cliente", cargo.ok && v[0].cargo === "Auditor de Controle" && logCargo[0].n === 1);
    }

    // ── E-mail ──
    const emailA = (await usuario(a)).email;
    const emailNovo = `teste-conta-b-novo-${b.slice(0, 8)}@exemplo.gov.br`;
    const dup = await alterarEmailProprio(b, { email: emailA.toUpperCase(), senhaAtual: SENHA_B });
    conferir("e-mail de outro usuário é recusado", !dup.ok && /já é usado/.test(dup.erro));
    const semSenha = await alterarEmailProprio(b, { email: emailNovo, senhaAtual: "senha-errada-xx" });
    conferir("troca de e-mail com senha errada é recusada", !semSenha.ok && semSenha.erro === "Senha atual incorreta.");
    const invalido = await alterarEmailProprio(b, { email: "nao-e-email", senhaAtual: SENHA_B });
    conferir("e-mail inválido é recusado", !invalido.ok);
    const trocaEmail = await alterarEmailProprio(b, { email: emailNovo, senhaAtual: SENHA_B });
    conferir("troca de e-mail com a senha correta é aceita", trocaEmail.ok && (await usuario(b)).email === emailNovo);
    const { rows: logEmail } = await dono.query(
      "SELECT count(*)::int AS n FROM log_auditoria WHERE usuario_id = $1 AND acao = 'usuario.email_alterado'",
      [b],
    );
    conferir("log usuario.email_alterado registrado", logEmail[0].n === 1);
  } finally {
    await dono.query("DELETE FROM usuarios WHERE id = ANY($1)", [[a, b]]);
  }

  await dono.end();
  console.log(falhas ? `\n${falhas} verificação(ões) falharam.` : "\nTodas as verificações passaram.");
  process.exit(falhas ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
