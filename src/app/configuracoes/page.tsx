import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleCheck, CircleX } from "lucide-react";
import { exigirUsuario, obterContexto } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { obterConfigIA } from "@/lib/ia/config";
import { INFO_PROVEDOR } from "@/lib/ia/provedores";
import { cn } from "@/lib/utils";
import { CabecalhoPagina } from "@/components/shell/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SecaoConfigIA } from "@/app/admin/ia/secao";
import { FormEmail, FormPerfil, FormSenha } from "./formularios";

export const metadata: Metadata = { title: "Configurações" };

/** Somente leitura para o controlador: nada de chave, nem mascarada. */
async function StatusIA() {
  let config: Awaited<ReturnType<typeof obterConfigIA>> | null = null;
  try {
    config = await obterConfigIA();
  } catch {
    config = null;
  }
  const linhas: [string, string][] = config
    ? [
        ["Provedor", INFO_PROVEDOR[config.provedor].rotulo],
        ["Modelo de texto", config.modeloTexto],
        [
          "Embeddings",
          config.embeddings
            ? `${INFO_PROVEDOR[config.embeddings.provedor].rotulo} · ${config.modeloEmbeddings}`
            : "Não configurados",
        ],
        ["Limite mensal", config.limiteMensalUsd ? `US$ ${config.limiteMensalUsd.toFixed(2).replace(".", ",")}` : "Sem limite"],
      ]
    : [];
  const ativa = Boolean(config?.habilitada);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Inteligência artificial</CardTitle>
        <CardDescription>
          Configurada pela administração HorizonAJ. Para trocar o provedor, a chave ou os modelos, fale com o suporte.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className={cn("flex items-center gap-2 text-sm font-medium", !ativa && "text-destructive")}>
          {ativa ? (
            <CircleCheck className="size-4 text-primary" aria-hidden="true" />
          ) : (
            <CircleX className="size-4" aria-hidden="true" />
          )}
          {!config
            ? "Não foi possível ler a configuração da IA."
            : ativa
              ? "IA habilitada"
              : `IA indisponível${config.pendencia ? `: ${config.pendencia}` : " (desabilitada pela administração)."}`}
        </p>
        {linhas.length > 0 && (
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
            {linhas.map(([rotulo, valor]) => (
              <div key={rotulo} className="contents">
                <dt className="text-muted-foreground">{rotulo}</dt>
                <dd className="font-medium break-all">{valor}</dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

export default async function Configuracoes({ searchParams }: PageProps<"/configuracoes">) {
  const sessao = await exigirUsuario();
  const ctx = await obterContexto();
  const { aba } = await searchParams;
  const admin = sessao.usuario.adminHorizon;
  const verIA = admin || ctx?.perfil === "CONTROLADOR";
  const abaAtual = aba === "ia" && verIA ? "ia" : "conta";

  const usuario = await db.usuario.findUnique({
    where: { id: sessao.usuario.id },
    select: { nome: true, email: true, cpf: true, telefone: true },
  });
  if (!usuario) notFound();
  const vinculo = ctx
    ? await db.vinculoCliente.findUnique({ where: { id: ctx.vinculoId }, select: { cargo: true } })
    : null;

  const abas = [
    { id: "conta", rotulo: "Minha conta", href: "/configuracoes" },
    ...(verIA ? [{ id: "ia", rotulo: "Inteligência artificial", href: "/configuracoes?aba=ia" }] : []),
  ];

  return (
    <>
      <CabecalhoPagina titulo="Configurações" descricao="Dados da sua conta, e-mail de acesso e senha." />
      {abas.length > 1 && (
        <nav aria-label="Seções das configurações" className="mb-6 flex gap-1 border-b">
          {abas.map((a) => (
            <Link
              key={a.id}
              href={a.href}
              aria-current={abaAtual === a.id ? "page" : undefined}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                abaAtual === a.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {a.rotulo}
            </Link>
          ))}
        </nav>
      )}

      {abaAtual === "ia" ? (
        <div className="grid gap-6">{admin ? <SecaoConfigIA /> : <StatusIA />}</div>
      ) : (
        <div className="grid max-w-3xl gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Perfil</CardTitle>
              <CardDescription>
                Seus dados pessoais. O perfil de acesso e as permissões são definidos pela administração.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormPerfil
                key={`${usuario.nome}|${usuario.cpf}|${usuario.telefone}|${vinculo?.cargo}`}
                perfil={{ nome: usuario.nome, cpf: usuario.cpf, telefone: usuario.telefone }}
                cargo={ctx ? { valor: vinculo?.cargo ?? "", entidade: ctx.cliente.nome } : undefined}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>E-mail de acesso</CardTitle>
              <CardDescription>
                O e-mail é o seu login. Depois de alterado, entre no sistema com o novo endereço.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormEmail key={usuario.email} email={usuario.email} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Alterar senha</CardTitle>
              <CardDescription>Após 5 tentativas com a senha atual incorreta, novas tentativas ficam bloqueadas por 15 minutos.</CardDescription>
            </CardHeader>
            <CardContent>
              <FormSenha />
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
