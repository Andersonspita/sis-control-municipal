import "dotenv/config";
import assert from "node:assert/strict";
import { Client } from "pg";
import { db } from "../src/lib/db";
import { gravarPreferencia, preferenciasDaPagina } from "../src/lib/preferencias";
import { lerPreferencias } from "../src/lib/preferencias-esquema";
import { BLOCOS_PAINEL, blocosVisiveis } from "../src/lib/painel/blocos";

// Preferências de exibição por usuário (painel personalizável e blocos recolhidos).
// Requer migrações + seed. Rodar com a condição react-server (npm run test:preferencias).
// Usa o controlador do seed e restaura as preferências dele ao final.

const dono = new Client({ connectionString: process.env.DATABASE_URL });
let falhas = 0;

async function caso(nome: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`OK    ${nome}`);
  } catch (err) {
    falhas++;
    console.log(`FALHA ${nome}\n      ${err instanceof Error ? err.message : err}`);
  }
}

async function main() {
  await caso("leitura tolera JSON inválido e descarta ids fora do padrão", () => {
    assert.deepEqual(lerPreferencias(null), {});
    assert.deepEqual(lerPreferencias([1, 2]), {});
    assert.deepEqual(lerPreferencias({ painel: { recolhidos: ["indices"], ocultos: "x" }, outra: {} }), {});
    assert.deepEqual(lerPreferencias({ painel: { recolhidos: ["indices"] }, alertas: { recolhidos: ["Inválido!"] } }), {
      painel: { recolhidos: ["indices"] },
    });
  });

  await caso("blocos visíveis seguem a ordem do catálogo e ignoram ids antigos", () => {
    assert.deepEqual(blocosVisiveis([]), BLOCOS_PAINEL.map((b) => b.id));
    const v = blocosVisiveis(["demandas", "inexistente"]);
    assert.ok(!v.includes("demandas"));
    assert.equal(v.length, BLOCOS_PAINEL.length - 1);
  });

  await dono.connect();
  const { rows } = await dono.query("SELECT id, preferencias FROM usuarios WHERE email LIKE 'controlador%' ORDER BY criado_em LIMIT 1");
  const usuario = rows[0] as { id: string; preferencias: unknown };
  assert.ok(usuario, "controlador do seed não encontrado");

  try {
    await dono.query("UPDATE usuarios SET preferencias = '{}' WHERE id = $1", [usuario.id]);

    await caso("sem preferência: tudo visível e expandido", async () => {
      assert.deepEqual(await preferenciasDaPagina(usuario.id, "painel"), { recolhidos: [], ocultos: [] });
    });

    await caso("grava recolhidos e ocultos sem sobrescrever o outro campo nem outra página", async () => {
      await gravarPreferencia(usuario.id, "painel", "recolhidos", ["indices", "planos", "indices"]);
      await gravarPreferencia(usuario.id, "painel", "ocultos", ["unidades"]);
      await gravarPreferencia(usuario.id, "dados-externos", "recolhidos", ["fontes"]);
      assert.deepEqual(await preferenciasDaPagina(usuario.id, "painel"), { recolhidos: ["indices", "planos"], ocultos: ["unidades"] });
      assert.deepEqual((await preferenciasDaPagina(usuario.id, "dados-externos")).recolhidos, ["fontes"]);
    });

    await caso("gravações simultâneas em páginas diferentes não se perdem", async () => {
      await Promise.all([
        gravarPreferencia(usuario.id, "alertas", "recolhidos", ["painel"]),
        gravarPreferencia(usuario.id, "painel", "recolhidos", ["demandas"]),
        gravarPreferencia(usuario.id, "dados-externos", "recolhidos", []),
      ]);
      assert.deepEqual((await preferenciasDaPagina(usuario.id, "alertas")).recolhidos, ["painel"]);
      assert.deepEqual(await preferenciasDaPagina(usuario.id, "painel"), { recolhidos: ["demandas"], ocultos: ["unidades"] });
      assert.deepEqual((await preferenciasDaPagina(usuario.id, "dados-externos")).recolhidos, []);
    });

    await caso("CHECK do banco recusa preferências que não sejam objeto", async () => {
      await assert.rejects(dono.query("UPDATE usuarios SET preferencias = '[]' WHERE id = $1", [usuario.id]));
    });
  } finally {
    await dono.query("UPDATE usuarios SET preferencias = $2 WHERE id = $1", [usuario.id, JSON.stringify(usuario.preferencias ?? {})]);
    await dono.end();
    await db.$disconnect();
  }

  console.log(falhas ? `\n${falhas} verificação(ões) falharam.` : "\nTodas as verificações passaram.");
  if (falhas) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
