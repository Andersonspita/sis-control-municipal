"use client";

import { useActionState, useState } from "react";
import { CircleCheck, Loader2, Search, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { mascararCnpj } from "@/lib/documentos-br";
import { consultarSancoesCnpj } from "./actions";

const data = (v: string | null) => (v ? new Date(`${v.slice(0, 10)}T12:00:00Z`).toLocaleDateString("pt-BR") : "—");

export function ConsultaSancoes({ habilitada }: { habilitada: boolean }) {
  const [estado, acao, pendente] = useActionState(consultarSancoesCnpj, undefined);
  const [cnpj, setCnpj] = useState("");

  return (
    <div className="space-y-4">
      <form action={acao} className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1 space-y-1.5">
          <Label htmlFor="sancoes-cnpj">CNPJ do fornecedor</Label>
          <Input
            id="sancoes-cnpj"
            name="cnpj"
            required
            value={cnpj}
            onChange={(e) => setCnpj(mascararCnpj(e.target.value))}
            disabled={!habilitada}
            autoComplete="off"
            className="h-9 font-mono"
            placeholder="00.000.000/0000-00"
          />
        </div>
        <Button type="submit" variant="outline" size="lg" disabled={pendente || !habilitada}>
          {pendente ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Search aria-hidden="true" />}
          Consultar CEIS/CNEP
        </Button>
      </form>

      <div aria-live="polite">
        {estado?.erro && <p className="text-sm text-perigo">{estado.erro}</p>}
        {estado?.sancoes &&
          (estado.sancoes.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-sucesso">
              <CircleCheck className="size-4" aria-hidden="true" />
              Nenhuma sanção vigente ou histórica para {mascararCnpj(estado.cnpj ?? "")} no CEIS e no CNEP.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-sm font-medium text-perigo">
                <ShieldAlert className="size-4" aria-hidden="true" />
                {estado.sancoes.length} registro(s) de sanção para {mascararCnpj(estado.cnpj ?? "")}
              </p>
              <ul className="divide-y rounded-lg border text-sm">
                {estado.sancoes.map((s, i) => (
                  <li key={i} className="space-y-0.5 px-3 py-2">
                    <p className="font-medium">
                      {s.cadastro} — {s.tipo}
                    </p>
                    <p className="text-muted-foreground">
                      {s.sancionado} · {s.orgao}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Vigência: {data(s.inicio)} a {data(s.fim)}
                      {s.processo && ` · Processo ${s.processo}`}
                      {s.multa && ` · Multa ${s.multa}`}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </div>
    </div>
  );
}
