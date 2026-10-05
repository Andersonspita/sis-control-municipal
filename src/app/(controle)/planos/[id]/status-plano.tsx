"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { StatusPlano as Status } from "@/generated/prisma/browser";
import { STATUS_PLANO } from "@/lib/rotulos";
import { alterarStatusPlano } from "../actions";

export function StatusPlano({ planoId, status }: { planoId: string; status: Status }) {
  const [pendente, iniciar] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="status-plano" className="text-sm text-muted-foreground">
        Situação do plano
      </label>
      <select
        id="status-plano"
        value={status}
        disabled={pendente}
        onChange={(e) => {
          const novo = e.target.value as Status;
          iniciar(async () => {
            const r = await alterarStatusPlano({ planoId, status: novo });
            if (r.ok) toast.success(`Plano marcado como “${STATUS_PLANO[novo]}”.`);
            else toast.error(r.erro);
          });
        }}
        className="h-9 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {Object.entries(STATUS_PLANO).map(([v, r]) => (
          <option key={v} value={v}>
            {r}
          </option>
        ))}
      </select>
      {pendente && <Loader2 aria-label="Salvando" className="size-4 animate-spin text-muted-foreground" />}
    </div>
  );
}
