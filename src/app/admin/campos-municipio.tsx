"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UFS } from "@/lib/documentos-br";
import { caminhoAcessoMunicipio, gerarSlugMunicipio, slugMunicipioValido } from "@/lib/municipios";
import { buscarMunicipiosIbge, type MunicipioOpcao } from "./actions";
import { CLASSE_SELECT } from "./comum";

export type MunicipioCadastrado = {
  id: string;
  slug: string;
  nome: string;
  uf: string;
  codigoIbge: string | null;
  ativo: boolean;
};

const normalizar = (nome: string) =>
  nome
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

/**
 * Nome, UF, código IBGE e link (slug) do município. O slug acompanha nome e UF até ser editado à mão.
 * Campos enviados: municipioNome, uf, codigoIbge, slug.
 */
export function CamposMunicipio({
  prefixo,
  inicial,
  aoAlterarCodigo,
  aoEscolherDoIbge,
}: {
  prefixo: string;
  inicial?: MunicipioCadastrado;
  aoAlterarCodigo?: (codigo: string) => void;
  aoEscolherDoIbge?: (codigo: string) => void;
}) {
  const [uf, setUf] = useState(inicial?.uf ?? "");
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [codigoIbge, setCodigoIbge] = useState(inicial?.codigoIbge ?? "");
  const [slug, setSlug] = useState(inicial?.slug ?? "");
  const [slugManual, setSlugManual] = useState(Boolean(inicial));
  const [opcoes, setOpcoes] = useState<MunicipioOpcao[]>([]);
  const [erroIbge, setErroIbge] = useState<string | null>(null);

  useEffect(() => {
    if (!uf) return;
    let ativo = true;
    buscarMunicipiosIbge(uf).then((r) => {
      if (!ativo) return;
      setOpcoes(r.municipios ?? []);
      setErroIbge(r.erro ?? null);
    });
    return () => {
      ativo = false;
    };
  }, [uf]);

  function alterarCodigo(codigo: string) {
    setCodigoIbge(codigo);
    aoAlterarCodigo?.(codigo);
  }

  function atualizar(novoNome: string, novaUf: string) {
    setNome(novoNome);
    setUf(novaUf);
    if (!slugManual && novoNome.trim() && novaUf) setSlug(gerarSlugMunicipio(novoNome, novaUf));
    const encontrado = opcoes.find((m) => normalizar(m.nome) === normalizar(novoNome));
    if (encontrado && encontrado.codigo !== codigoIbge) {
      alterarCodigo(encontrado.codigo);
      aoEscolherDoIbge?.(encontrado.codigo);
    }
  }

  const slugInvalido = slug !== "" && !slugMunicipioValido(slug);

  return (
    <div className="grid gap-4 rounded-lg border bg-muted/30 p-4">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_6rem]">
        <div className="space-y-1.5">
          <Label htmlFor={`${prefixo}-nome`}>
            Nome do município <span aria-hidden="true">*</span>
          </Label>
          <Input
            id={`${prefixo}-nome`}
            name="municipioNome"
            required
            minLength={2}
            maxLength={120}
            value={nome}
            onChange={(e) => atualizar(e.target.value, uf)}
            list={`${prefixo}-opcoes`}
            autoComplete="off"
            className="h-9"
          />
          <datalist id={`${prefixo}-opcoes`}>
            {opcoes.map((m) => (
              <option key={m.codigo} value={m.nome} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${prefixo}-uf`}>
            UF <span aria-hidden="true">*</span>
          </Label>
          <select
            id={`${prefixo}-uf`}
            name="uf"
            required
            value={uf}
            onChange={(e) => {
              setOpcoes([]);
              atualizar(nome, e.target.value);
            }}
            className={CLASSE_SELECT}
          >
            <option value="" disabled>
              —
            </option>
            {UFS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${prefixo}-ibge`}>Código IBGE</Label>
          <Input
            id={`${prefixo}-ibge`}
            name="codigoIbge"
            inputMode="numeric"
            pattern="\d{7}"
            maxLength={7}
            value={codigoIbge}
            onChange={(e) => alterarCodigo(e.target.value.replace(/\D/g, ""))}
            className="h-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${prefixo}-slug`}>
            Link de acesso <span aria-hidden="true">*</span>
          </Label>
          <Input
            id={`${prefixo}-slug`}
            name="slug"
            required
            maxLength={80}
            value={slug}
            onChange={(e) => {
              setSlugManual(true);
              setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
            }}
            aria-invalid={slugInvalido || undefined}
            aria-describedby={`${prefixo}-slug-ajuda`}
            autoComplete="off"
            className="h-9 font-mono"
          />
        </div>
      </div>
      <p id={`${prefixo}-slug-ajuda`} className="text-xs text-muted-foreground" aria-live="polite">
        {slugInvalido
          ? "Use de 3 a 80 letras minúsculas, números e hífens (sem hífen no início ou no fim)."
          : erroIbge ?? (slug ? `Endereço: ${caminhoAcessoMunicipio(slug)}` : "Escolha o município na lista do IBGE para preencher o código.")}
      </p>
    </div>
  );
}
