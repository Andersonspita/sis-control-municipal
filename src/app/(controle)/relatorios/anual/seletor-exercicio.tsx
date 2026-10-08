"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";

const CLASSE_SELECT =
  "h-9 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Escolha do exercício para personalizar o texto de um ano específico. */
export function SeletorExercicio({ anoInicial, primeiroAno = 2020 }: { anoInicial: number; primeiroAno?: number }) {
  const router = useRouter();
  const [ano, setAno] = useState(anoInicial);
  const anos = Array.from({ length: anoInicial + 1 - primeiroAno + 1 }, (_, i) => anoInicial + 1 - i);

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(`/relatorios/anual/${ano}`);
      }}
    >
      <label htmlFor="exercicio" className="text-sm text-muted-foreground">
        Exercício
      </label>
      <select id="exercicio" value={ano} onChange={(e) => setAno(Number(e.target.value))} className={CLASSE_SELECT}>
        {anos.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
      <Button type="submit" variant="outline" className="h-9">
        <PencilLine aria-hidden="true" /> Personalizar o ano
      </Button>
    </form>
  );
}
