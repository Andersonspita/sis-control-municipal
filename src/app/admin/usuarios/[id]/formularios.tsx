"use client";

import { useEffect, useState, useTransition } from "react";
import { KeyRound, Link2, Loader2, Pencil, Save } from "lucide-react";
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
import { PERFIL } from "@/lib/rotulos";
import type { Perfil } from "@/generated/prisma/enums";
import { CLASSE_SELECT } from "../../comum";
import { editarUsuario, listarUnidadesDoCliente, redefinirSenha, salvarVinculo, type UnidadeEscopo } from "../actions";
import { CampoSenha, CamposUsuario, type UsuarioEditavel } from "../campos-usuario";

export function FormEditarUsuario({ usuario }: { usuario: UsuarioEditavel }) {
  const { pendente, formRef, onSubmit } = useAcaoFormulario(editarUsuario);

  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid gap-4" aria-busy={pendente}>
      <input type="hidden" name="id" value={usuario.id} />
      <CamposUsuario prefixo="edicao" usuario={usuario} />
      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
          Salvar dados
        </Button>
      </div>
    </form>
  );
}

export function FormSenha({ usuarioId }: { usuarioId: string }) {
  const { pendente, formRef, onSubmit } = useAcaoFormulario(redefinirSenha);

  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid gap-4" aria-busy={pendente}>
      <input type="hidden" name="id" value={usuarioId} />
      <CampoSenha prefixo="senha" rotulo="Nova senha (mínimo de 10 caracteres)" />
      <CampoSenha prefixo="senha" rotulo="Confirme a nova senha" nome="confirmacao" />
      <p className="text-xs text-muted-foreground">Todas as sessões ativas do usuário serão encerradas.</p>
      <div className="flex justify-end">
        <Button type="submit" size="lg" variant="outline" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" aria-hidden="true" /> : <KeyRound aria-hidden="true" />}
          Redefinir senha
        </Button>
      </div>
    </form>
  );
}

type ClienteOpcao = { id: string; nome: string; municipio: string; uf: string };
export type VinculoEditavel = { clienteId: string; clienteNome: string; perfil: Perfil; cargo: string | null; unidadeIds: string[] };

export function DialogoVinculo({
  usuarioId,
  clientes,
  vinculo,
}: {
  usuarioId: string;
  clientes: ClienteOpcao[];
  vinculo?: VinculoEditavel;
}) {
  const [aberto, setAberto] = useState(false);
  const [clienteId, setClienteId] = useState(vinculo?.clienteId ?? "");
  const [perfil, setPerfil] = useState<Perfil | "">(vinculo?.perfil ?? "");
  const [unidades, setUnidades] = useState<UnidadeEscopo[] | null>(null);
  const [carregando, iniciar] = useTransition();
  const { pendente, formRef, onSubmit } = useAcaoFormulario(salvarVinculo, {
    aoConcluir: () => {
      setAberto(false);
      if (!vinculo) {
        setClienteId("");
        setPerfil("");
      }
    },
  });
  const p = vinculo ? `vin-${vinculo.clienteId}` : "vin-novo";
  const satelite = perfil === "SATELITE";

  useEffect(() => {
    if (!aberto || !satelite || !clienteId) return;
    let cancelado = false;
    iniciar(async () => {
      const lista = await listarUnidadesDoCliente(clienteId);
      if (!cancelado) setUnidades(lista);
    });
    return () => {
      cancelado = true;
    };
  }, [aberto, satelite, clienteId]);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      {vinculo ? (
        <DialogTrigger render={<Button variant="ghost" size="sm" aria-label={`Editar vínculo com ${vinculo.clienteNome}`} />}>
          <Pencil aria-hidden="true" /> Editar
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button className="h-9" />}>
          <Link2 aria-hidden="true" /> Vincular a cliente
        </DialogTrigger>
      )}
      <DialogContent showCloseButton={false} className="sm:max-w-lg">
        <form ref={formRef} onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{vinculo ? `Vínculo com ${vinculo.clienteNome}` : "Vincular a cliente"}</DialogTitle>
            <DialogDescription>O perfil define o que o usuário pode fazer dentro do cliente.</DialogDescription>
          </DialogHeader>
          <input type="hidden" name="usuarioId" value={usuarioId} />
          {vinculo ? (
            <input type="hidden" name="clienteId" value={vinculo.clienteId} />
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor={`${p}-cliente`}>
                Cliente <span aria-hidden="true">*</span>
              </Label>
              <select
                id={`${p}-cliente`}
                name="clienteId"
                required
                value={clienteId}
                onChange={(e) => {
                  setClienteId(e.target.value);
                  setUnidades(null);
                }}
                className={CLASSE_SELECT}
              >
                <option value="" disabled>
                  Selecione…
                </option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} ({c.municipio}/{c.uf})
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${p}-perfil`}>
                Perfil <span aria-hidden="true">*</span>
              </Label>
              <select
                id={`${p}-perfil`}
                name="perfil"
                required
                value={perfil}
                onChange={(e) => setPerfil(e.target.value as Perfil)}
                className={CLASSE_SELECT}
              >
                <option value="" disabled>
                  Selecione…
                </option>
                {Object.entries(PERFIL).map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>
                    {rotulo}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${p}-cargo`}>Cargo</Label>
              <Input id={`${p}-cargo`} name="cargo" maxLength={120} defaultValue={vinculo?.cargo ?? ""} className="h-9" />
            </div>
          </div>
          {satelite && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">
                Unidades do escopo <span aria-hidden="true">*</span>
              </legend>
              <p className="text-xs text-muted-foreground">
                O satélite vê as unidades marcadas e todas as subordinadas a elas.
              </p>
              {!clienteId ? (
                <p className="text-sm text-muted-foreground">Selecione o cliente primeiro.</p>
              ) : carregando || !unidades ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Carregando unidades…
                </p>
              ) : unidades.length === 0 ? (
                <p className="text-sm text-muted-foreground">Este cliente ainda não tem unidades cadastradas.</p>
              ) : (
                <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-2">
                  {unidades.map((u) => (
                    <label
                      key={u.id}
                      className="flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted"
                      style={{ paddingLeft: `${0.25 + u.nivel * 1.25}rem` }}
                    >
                      <input
                        type="checkbox"
                        name="unidadeIds"
                        value={u.id}
                        defaultChecked={vinculo?.unidadeIds.includes(u.id)}
                        className="size-4 accent-primary"
                      />
                      {u.sigla ? `${u.sigla} — ${u.nome}` : u.nome}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          )}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" size="lg" />}>Voltar</DialogClose>
            <Button type="submit" size="lg" disabled={pendente || (satelite && carregando)}>
              {pendente && <Loader2 className="animate-spin" aria-hidden="true" />}
              Salvar vínculo
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
