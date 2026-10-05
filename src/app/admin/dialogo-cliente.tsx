"use client";

import { useState, useTransition } from "react";
import { Loader2, Pencil, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAcaoFormulario } from "@/components/use-acao-formulario";
import { mascararCnpj } from "@/lib/documentos-br";
import { caminhoAcessoMunicipio } from "@/lib/municipios";
import { TIPO_CLIENTE } from "@/lib/rotulos";
import type { TipoCliente } from "@/generated/prisma/enums";
import { buscarPopulacaoIbge, salvarCliente } from "./actions";
import { CLASSE_SELECT } from "./comum";
import { CamposMunicipio, type MunicipioCadastrado } from "./campos-municipio";

export type ClienteEditavel = {
  id: string;
  nome: string;
  tipo: TipoCliente;
  cnpj: string;
  municipioId: string | null;
  populacao: number | null;
};

export function DialogoCliente({ cliente, municipios }: { cliente?: ClienteEditavel; municipios: MunicipioCadastrado[] }) {
  const [aberto, setAberto] = useState(false);
  const [cnpj, setCnpj] = useState(cliente ? mascararCnpj(cliente.cnpj) : "");
  const [municipioId, setMunicipioId] = useState(cliente?.municipioId ?? "");
  const [codigoNovo, setCodigoNovo] = useState("");
  const [populacao, setPopulacao] = useState(cliente?.populacao?.toString() ?? "");
  const [infoIbge, setInfoIbge] = useState<string | null>(null);
  const [buscando, iniciarBusca] = useTransition();
  const { pendente, formRef, onSubmit } = useAcaoFormulario(salvarCliente, {
    aoConcluir: () => {
      setAberto(false);
      if (!cliente) {
        setCnpj("");
        setMunicipioId("");
        setCodigoNovo("");
        setPopulacao("");
        setInfoIbge(null);
      }
    },
  });
  const p = cliente ? `cli-${cliente.id}` : "cli-novo";
  const existente = municipios.find((m) => m.id === municipioId);
  const codigoIbge = existente ? (existente.codigoIbge ?? "") : codigoNovo;

  function consultarPopulacao(codigo: string) {
    iniciarBusca(async () => {
      const r = await buscarPopulacaoIbge(codigo);
      if (r.populacao) {
        setPopulacao(String(r.populacao));
        setInfoIbge(`${r.descricao}: ${r.populacao.toLocaleString("pt-BR")} habitantes.`);
      } else setInfoIbge(r.erro ?? null);
    });
  }
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      {cliente ? (
        <DialogTrigger render={<Button variant="ghost" size="sm" aria-label={`Editar ${cliente.nome}`} />}>
          <Pencil aria-hidden="true" /> Editar
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button className="h-9" />}>
          <Plus aria-hidden="true" /> Novo cliente
        </DialogTrigger>
      )}
      <DialogContent showCloseButton={false} className="sm:max-w-xl">
        <form ref={formRef} onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{cliente ? "Editar cliente" : "Novo cliente"}</DialogTitle>
            <DialogDescription>
              Cada entidade (Prefeitura, Câmara, autarquia…) é um cliente com dados isolados. As entidades do mesmo
              município compartilham o link de acesso.
            </DialogDescription>
          </DialogHeader>
          {cliente && <input type="hidden" name="id" value={cliente.id} />}
          <div className="space-y-1.5">
            <Label htmlFor={`${p}-nome`}>
              Nome da entidade <span aria-hidden="true">*</span>
            </Label>
            <Input
              id={`${p}-nome`}
              name="nome"
              required
              minLength={3}
              maxLength={200}
              defaultValue={cliente?.nome}
              className="h-9"
              placeholder="Ex.: Prefeitura Municipal de Exemplo"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${p}-tipo`}>
                Tipo <span aria-hidden="true">*</span>
              </Label>
              <select id={`${p}-tipo`} name="tipo" required defaultValue={cliente?.tipo ?? ""} className={CLASSE_SELECT}>
                <option value="" disabled>
                  Selecione…
                </option>
                {Object.entries(TIPO_CLIENTE).map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>
                    {rotulo}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${p}-cnpj`}>
                CNPJ <span aria-hidden="true">*</span>
              </Label>
              <Input
                id={`${p}-cnpj`}
                name="cnpj"
                required
                value={cnpj}
                onChange={(e) => setCnpj(mascararCnpj(e.target.value))}
                inputMode="text"
                autoComplete="off"
                className="h-9 font-mono"
                placeholder="00.000.000/0000-00"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${p}-municipio`}>
              Município <span aria-hidden="true">*</span>
            </Label>
            <select
              id={`${p}-municipio`}
              name="municipioId"
              required
              value={municipioId}
              onChange={(e) => {
                setMunicipioId(e.target.value);
                setInfoIbge(null);
              }}
              className={CLASSE_SELECT}
            >
              <option value="" disabled>
                Selecione…
              </option>
              {municipios.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}/{m.uf}
                  {m.ativo ? "" : " (link inativo)"}
                </option>
              ))}
              <option value="novo">+ Novo município…</option>
            </select>
            {existente && (
              <p className="text-xs text-muted-foreground">
                Link de acesso: <span className="font-mono">{caminhoAcessoMunicipio(existente.slug)}</span>
                {existente.codigoIbge ? ` · IBGE ${existente.codigoIbge}` : " · sem código IBGE"}
              </p>
            )}
          </div>

          {municipioId === "novo" && (
            <CamposMunicipio prefixo={`${p}-mun`} aoAlterarCodigo={setCodigoNovo} aoEscolherDoIbge={consultarPopulacao} />
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${p}-populacao`}>População</Label>
              <div className="flex gap-2">
                <Input
                  id={`${p}-populacao`}
                  name="populacao"
                  inputMode="numeric"
                  pattern="\d*"
                  maxLength={9}
                  value={populacao}
                  onChange={(e) => setPopulacao(e.target.value.replace(/\D/g, ""))}
                  className="h-9"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-9"
                  disabled={buscando || codigoIbge.length !== 7}
                  onClick={() => consultarPopulacao(codigoIbge)}
                  aria-label="Buscar população no IBGE"
                  title="Buscar população no IBGE"
                >
                  {buscando ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Search aria-hidden="true" />}
                </Button>
              </div>
            </div>
            <p className="self-end text-xs text-muted-foreground" aria-live="polite">
              {infoIbge ?? "A população oficial vem do IBGE pelo código do município."}
            </p>
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" size="lg" />}>Voltar</DialogClose>
            <Button type="submit" size="lg" disabled={pendente}>
              {pendente && <Loader2 className="animate-spin" aria-hidden="true" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
