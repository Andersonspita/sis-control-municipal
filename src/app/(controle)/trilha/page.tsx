import type { Metadata } from "next";
import { format } from "date-fns";
import { ShieldCheck } from "lucide-react";
import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { comCliente, db } from "@/lib/db";
import { CabecalhoPagina } from "@/components/shell/app-shell";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Trilha de auditoria" };

const ACOES: Record<string, string> = {
  "cliente.selecionado": "Acessou a entidade",
  "unidade.criada": "Cadastrou unidade",
  "demanda.criada": "Criou demanda",
  "demanda.respondida": "Respondeu demanda",
  "demanda.visualizada": "Visualizou demanda",
  "demanda.em_analise": "Iniciou análise da resposta",
  "demanda.concluida": "Concluiu demanda",
  "demanda.devolvida": "Devolveu demanda para complementação",
  "demanda.cancelada": "Cancelou demanda",
  "demanda.comentada": "Comentou demanda",
  "demanda.prorrogacao_solicitada": "Pediu prorrogação de prazo",
  "demanda.prorrogacao_deferida": "Deferiu prorrogação de prazo",
  "demanda.prorrogacao_indeferida": "Indeferiu prorrogação de prazo",
  "documento.enviado": "Enviou documento",
  "documento.baixado": "Baixou documento",
};

export default async function Trilha() {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const logs = await comCliente(ctx, (tx) =>
    tx.logAuditoria.findMany({ orderBy: { criadoEm: "desc" }, take: 200 }),
  );
  const ids = [...new Set(logs.map((l) => l.usuarioId).filter((id): id is string => !!id))];
  const usuarios = new Map(
    (await db.usuario.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } })).map((u) => [u.id, u.nome]),
  );

  return (
    <>
      <CabecalhoPagina
        titulo="Trilha de auditoria"
        descricao="Registro permanente das operações realizadas nesta entidade. Os registros não podem ser alterados nem excluídos."
        acoes={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sucesso/12 px-3 py-1 text-xs font-medium text-sucesso">
            <ShieldCheck aria-hidden="true" className="size-3.5" /> Somente inclusão
          </span>
        }
      />
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <caption className="sr-only">Últimos 200 registros da trilha de auditoria</caption>
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th scope="col" className="px-5 py-3 font-medium">Data e hora</th>
                <th scope="col" className="px-3 py-3 font-medium">Usuário</th>
                <th scope="col" className="px-3 py-3 font-medium">Operação</th>
                <th scope="col" className="hidden px-5 py-3 font-medium lg:table-cell">Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id.toString()} className="border-b last:border-0">
                  <td className="whitespace-nowrap px-5 py-3 tabular-nums text-muted-foreground">
                    {format(l.criadoEm, "dd/MM/yyyy HH:mm:ss")}
                  </td>
                  <td className="px-3 py-3">{(l.usuarioId && usuarios.get(l.usuarioId)) ?? "Sistema"}</td>
                  <td className="px-3 py-3">{ACOES[l.acao] ?? l.acao}</td>
                  <td className="hidden max-w-md truncate px-5 py-3 font-mono text-xs text-muted-foreground lg:table-cell">
                    {l.dados ? JSON.stringify(l.dados) : ""}
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-10 text-center text-muted-foreground">
                    Nenhum registro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}
