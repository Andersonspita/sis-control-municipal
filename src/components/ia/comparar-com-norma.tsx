"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { compararDocumentoComNorma } from "@/app/(controle)/ia/actions";
import { CLASSE_SELECT } from "@/app/(controle)/demandas/filtros";

type Opcao = { id: string; nome: string };

/**
 * Documento × norma: escolhe o ciclo (no detalhe do documento) ou o documento (no ciclo) e enfileira a análise.
 * Com a IA indisponível, o botão fica desabilitado e o motivo aparece no AvisoIA da página.
 */
export function CompararComNorma({
  ciclos,
  documentos,
  disponivel,
}: {
  ciclos: Opcao[];
  documentos: Opcao[];
  disponivel: boolean;
}) {
  const [cicloId, setCicloId] = useState(ciclos.length === 1 ? ciclos[0].id : "");
  const [documentoId, setDocumentoId] = useState(documentos.length === 1 ? documentos[0].id : "");
  const [pendente, iniciar] = useTransition();
  const escolherCiclo = ciclos.length > 1;
  const escolherDocumento = documentos.length > 1;
  const semOpcoes = !ciclos.length || !documentos.length;

  function enviar() {
    if (!cicloId || !documentoId) {
      toast.error(!cicloId ? "Escolha o ciclo de autoavaliação." : "Escolha o documento.");
      return;
    }
    iniciar(async () => {
      const r = await compararDocumentoComNorma({ cicloId, documentoIds: [documentoId] });
      if (r.ok) toast.success(r.mensagem);
      else toast.error(r.erro);
    });
  }

  return (
    <div className="space-y-3">
      {escolherCiclo && (
        <div className="space-y-1.5">
          <Label htmlFor="ia-ciclo">Ciclo de autoavaliação em andamento</Label>
          <select id="ia-ciclo" value={cicloId} onChange={(e) => setCicloId(e.target.value)} className={CLASSE_SELECT} disabled={!disponivel}>
            <option value="">Escolha…</option>
            {ciclos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
      )}
      {escolherDocumento && (
        <div className="space-y-1.5">
          <Label htmlFor="ia-documento">Documento</Label>
          <select id="ia-documento" value={documentoId} onChange={(e) => setDocumentoId(e.target.value)} className={CLASSE_SELECT} disabled={!disponivel}>
            <option value="">Escolha…</option>
            {documentos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nome}
              </option>
            ))}
          </select>
        </div>
      )}
      {!ciclos.length && <p className="text-sm text-muted-foreground">Nenhum ciclo de autoavaliação em andamento para comparar.</p>}
      {!documentos.length && <p className="text-sm text-muted-foreground">Nenhum documento enviado ainda. Envie em Documentos.</p>}
      <Button onClick={enviar} disabled={!disponivel || pendente || semOpcoes} className="w-full sm:w-auto">
        {pendente ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Sparkles aria-hidden="true" />}
        Analisar com IA
      </Button>
      <p className="text-xs text-muted-foreground">
        Dados pessoais (CPF, RG, e-mail, telefone, cartão SUS, nomes rotulados) são mascarados antes do envio. As sugestões só
        valem depois da sua revisão.
      </p>
    </div>
  );
}
