"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CircleCheck, CircleX, Loader2, PlugZap, Save, Trash2 } from "lucide-react";
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
import {
  DIMENSOES_EMBEDDING,
  EXEMPLOS_URL_COMPATIVEL,
  INFO_PROVEDOR,
  mascararChave,
  PROVEDORES_EMBEDDINGS,
  PROVEDORES_IA,
  type TipoProvedor,
  type TipoProvedorEmbeddings,
} from "@/lib/ia/provedores";
import { removerChaveIA, salvarConfigIA, testarConexaoIA, type EstadoTeste } from "./actions";

const CLASSE_SELECT =
  "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";

export type ConfigEditavel = {
  habilitada: boolean;
  provedor: TipoProvedor;
  urlBase: string;
  chaveFinal: string | null;
  modeloTexto: string;
  provedorEmbeddings: TipoProvedorEmbeddings | "";
  urlBaseEmbeddings: string;
  chaveEmbeddingsFinal: string | null;
  modeloEmbeddings: string;
  limiteMensalUsd: string;
};

/** Ao trocar de provedor, troca o modelo se ele ainda for o padrão/sugestão do provedor anterior. */
function proximoModelo(atual: string, anteriores: string[], novo: string) {
  return !atual.trim() || anteriores.includes(atual.trim()) ? novo : atual;
}

function CampoChave({
  id,
  name,
  rotulo,
  provedor,
  final,
  salvaDeOutro,
  bloqueado,
}: {
  id: string;
  name: string;
  rotulo: string;
  provedor: TipoProvedor;
  final: string | null;
  salvaDeOutro: boolean;
  bloqueado: boolean;
}) {
  const info = INFO_PROVEDOR[provedor];
  const temSalva = Boolean(final) && !salvaDeOutro;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      <Input
        id={id}
        name={name}
        type="password"
        autoComplete="new-password"
        spellCheck={false}
        placeholder={temSalva ? `Em branco mantém a chave atual (${mascararChave(final, provedor)})` : info.exemploChave}
        disabled={bloqueado}
        className="font-mono"
        aria-describedby={`${id}-ajuda`}
      />
      <p id={`${id}-ajuda`} className="text-xs text-muted-foreground">
        {info.ajuda} Gravada cifrada; depois de salva, só os 4 últimos caracteres ficam visíveis.
        {info.variavelAmbiente && ` Sem chave cadastrada, vale a variável ${info.variavelAmbiente} do servidor, se existir.`}
        {salvaDeOutro && final && (
          <span className="block text-amber-700">A chave salva é de outro provedor e será descartada se nenhuma nova for digitada.</span>
        )}
      </p>
    </div>
  );
}

function CampoUrl({
  id,
  name,
  provedor,
  valor,
  bloqueado,
}: {
  id: string;
  name: string;
  provedor: TipoProvedor;
  valor: string;
  bloqueado: boolean;
}) {
  const compativel = provedor === "OPENAI_COMPATIVEL";
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>URL base {compativel ? "(obrigatória)" : "(opcional)"}</Label>
      <Input
        id={id}
        name={name}
        type="url"
        list={compativel ? "ia-exemplos-url" : undefined}
        defaultValue={valor}
        required={compativel}
        spellCheck={false}
        placeholder={INFO_PROVEDOR[provedor].urlPadrao ?? "https://api.groq.com/openai/v1"}
        disabled={bloqueado}
        className="font-mono"
        aria-describedby={`${id}-ajuda`}
      />
      <p id={`${id}-ajuda`} className="text-xs text-muted-foreground">
        {compativel
          ? `Endereço da API, normalmente terminando em /v1. Exemplos: ${EXEMPLOS_URL_COMPATIVEL.map((e) => e.nome).join(", ")} (escolha na lista).`
          : "Em branco usa o endereço oficial. Preencha só para proxy ou gateway corporativo."}
      </p>
    </div>
  );
}

export function FormConfigIA({ config, bloqueado }: { config: ConfigEditavel; bloqueado: boolean }) {
  const [teste, setTeste] = useState<EstadoTeste | null>(null);
  const [testando, iniciarTeste] = useTransition();
  const [provedor, setProvedor] = useState<TipoProvedor>(config.provedor);
  const [provedorEmb, setProvedorEmb] = useState<TipoProvedorEmbeddings | "">(config.provedorEmbeddings);
  const [modeloTexto, setModeloTexto] = useState(config.modeloTexto);
  const [modeloEmb, setModeloEmb] = useState(config.modeloEmbeddings);
  const { pendente, formRef, onSubmit } = useAcaoFormulario(salvarConfigIA, { aoConcluir: () => setTeste(null) });

  const efetivoEmb: TipoProvedor = provedorEmb || provedor;
  const infoTexto = INFO_PROVEDOR[provedor];
  const infoEmb = INFO_PROVEDOR[efetivoEmb];

  function trocarProvedor(novo: TipoProvedor) {
    const anterior = INFO_PROVEDOR[provedor];
    setModeloTexto((m) => proximoModelo(m, [anterior.modeloTexto, ...anterior.sugestoesTexto], INFO_PROVEDOR[novo].modeloTexto));
    const novoEmb = novo === "ANTHROPIC" && !provedorEmb ? "OPENAI" : provedorEmb;
    trocarEmbeddings(novoEmb, provedorEmb || provedor, novoEmb || novo);
    setProvedor(novo);
    setTeste(null);
  }

  function trocarEmbeddings(novo: TipoProvedorEmbeddings | "", efetivoAnterior: TipoProvedor, efetivoNovo: TipoProvedor) {
    const anterior = INFO_PROVEDOR[efetivoAnterior];
    setModeloEmb((m) =>
      proximoModelo(m, [anterior.modeloEmbeddings ?? "", ...anterior.sugestoesEmbeddings], INFO_PROVEDOR[efetivoNovo].modeloEmbeddings ?? ""),
    );
    setProvedorEmb(novo);
  }

  function testar() {
    if (!formRef.current) return;
    const dados = new FormData(formRef.current);
    iniciarTeste(async () => {
      const r = await testarConexaoIA(dados);
      setTeste(r);
      if (r.ok) toast.success(r.mensagem);
      else toast.error(r.mensagem);
    });
  }

  return (
    <div className="grid gap-6">
      <form ref={formRef} onSubmit={onSubmit} className="grid gap-5" aria-busy={pendente}>
        <label className="flex w-fit cursor-pointer items-center gap-3">
          <span className="relative inline-flex">
            <input
              type="checkbox"
              role="switch"
              name="habilitada"
              defaultChecked={config.habilitada}
              disabled={bloqueado}
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className="h-5 w-9 rounded-full bg-input transition-colors peer-checked:bg-primary peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 peer-disabled:opacity-50"
            />
            <span
              aria-hidden="true"
              className="absolute top-0.5 left-0.5 size-4 rounded-full bg-background shadow-sm transition-transform peer-checked:translate-x-4"
            />
          </span>
          <span className="text-sm font-medium">IA habilitada</span>
        </label>

        <fieldset className="grid gap-5" disabled={bloqueado}>
          <legend className="mb-3 text-sm font-semibold">Texto (análises e sugestões)</legend>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ia-provedor">Provedor</Label>
              <select
                id="ia-provedor"
                name="provedor"
                value={provedor}
                onChange={(e) => trocarProvedor(e.target.value as TipoProvedor)}
                className={CLASSE_SELECT}
              >
                {PROVEDORES_IA.map((p) => (
                  <option key={p} value={p}>
                    {INFO_PROVEDOR[p].rotulo}
                  </option>
                ))}
              </select>
              {provedor === "OPENAI_COMPATIVEL" && <p className="text-xs text-muted-foreground">{infoTexto.ajuda}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ia-modelo-texto">Modelo de texto</Label>
              <Input
                id="ia-modelo-texto"
                name="modeloTexto"
                list="ia-sugestoes-texto"
                value={modeloTexto}
                onChange={(e) => setModeloTexto(e.target.value)}
                placeholder={infoTexto.sugestoesTexto[0]}
                required
                className="font-mono"
              />
              <datalist id="ia-sugestoes-texto">
                {infoTexto.sugestoesTexto.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>
          </div>
          <CampoChave
            id="ia-chave"
            name="chave"
            rotulo={`Chave da API — ${infoTexto.rotulo}`}
            provedor={provedor}
            final={config.chaveFinal}
            salvaDeOutro={provedor !== config.provedor}
            bloqueado={bloqueado}
          />
          <CampoUrl id="ia-url" name="urlBase" provedor={provedor} valor={config.urlBase} bloqueado={bloqueado} />
        </fieldset>

        <fieldset className="grid gap-5 border-t pt-5" disabled={bloqueado}>
          <legend className="sr-only">Embeddings</legend>
          <p className="text-sm font-semibold">Embeddings (busca nos documentos)</p>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ia-provedor-emb">Provedor de embeddings</Label>
              <select
                id="ia-provedor-emb"
                name="provedorEmbeddings"
                value={provedorEmb}
                onChange={(e) => {
                  const novo = e.target.value as TipoProvedorEmbeddings | "";
                  trocarEmbeddings(novo, efetivoEmb, novo || provedor);
                  setTeste(null);
                }}
                className={CLASSE_SELECT}
              >
                <option value="" disabled={provedor === "ANTHROPIC"}>
                  Mesmo provedor e chave do texto
                </option>
                {PROVEDORES_EMBEDDINGS.map((p) => (
                  <option key={p} value={p}>
                    {INFO_PROVEDOR[p].rotulo}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ia-modelo-embeddings">Modelo de embeddings</Label>
              <Input
                id="ia-modelo-embeddings"
                name="modeloEmbeddings"
                list="ia-sugestoes-embeddings"
                value={modeloEmb}
                onChange={(e) => setModeloEmb(e.target.value)}
                placeholder={infoEmb.sugestoesEmbeddings[0]}
                required
                className="font-mono"
              />
              <datalist id="ia-sugestoes-embeddings">
                {infoEmb.sugestoesEmbeddings.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>
          </div>
          {provedorEmb && (
            <>
              <CampoChave
                id="ia-chave-emb"
                name="chaveEmbeddings"
                rotulo={`Chave da API dos embeddings — ${INFO_PROVEDOR[provedorEmb].rotulo}`}
                provedor={provedorEmb}
                final={config.chaveEmbeddingsFinal}
                salvaDeOutro={provedorEmb !== config.provedorEmbeddings}
                bloqueado={bloqueado}
              />
              <CampoUrl id="ia-url-emb" name="urlBaseEmbeddings" provedor={provedorEmb} valor={config.urlBaseEmbeddings} bloqueado={bloqueado} />
            </>
          )}
          <p className="text-xs text-muted-foreground">
            A busca usa vetores de {DIMENSOES_EMBEDDING} dimensões. Os modelos text-embedding-3 (OpenAI) e gemini-embedding-001
            (Google) são reduzidos automaticamente; em serviços compatíveis o modelo precisa gerar {DIMENSOES_EMBEDDING} dimensões
            (o teste de conexão confere). Trocar o modelo de embeddings exige reprocessar os documentos já indexados.
          </p>
        </fieldset>

        <datalist id="ia-exemplos-url">
          {EXEMPLOS_URL_COMPATIVEL.map((e) => (
            <option key={e.nome} value={e.url} label={e.nome} />
          ))}
        </datalist>

        <div className="space-y-1.5 border-t pt-5 sm:max-w-xs">
          <Label htmlFor="ia-limite">Limite mensal de gasto (US$, opcional)</Label>
          <Input
            id="ia-limite"
            name="limiteMensalUsd"
            inputMode="decimal"
            placeholder="Ex.: 50,00"
            defaultValue={config.limiteMensalUsd}
            disabled={bloqueado}
            aria-describedby="ia-limite-ajuda"
          />
          <p id="ia-limite-ajuda" className="text-xs text-muted-foreground">
            Em dólares, moeda em que os provedores cobram (custo estimado pelos tokens). Em branco, sem limite.
          </p>
        </div>

        <div role="status" aria-live="polite">
          {teste && (
            <p className={`flex items-start gap-2 text-sm ${teste.ok ? "text-foreground" : "text-destructive"}`}>
              {teste.ok ? (
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              ) : (
                <CircleX className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              )}
              <span>
                {teste.mensagem}
                {teste.aviso && <span className="block text-muted-foreground">{teste.aviso}</span>}
              </span>
            </p>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" size="lg" variant="outline" onClick={testar} disabled={testando}>
            {testando ? <Loader2 className="animate-spin" aria-hidden="true" /> : <PlugZap aria-hidden="true" />}
            Testar conexão
          </Button>
          <Button type="submit" size="lg" disabled={pendente || bloqueado}>
            {pendente ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
            Salvar configuração
          </Button>
        </div>
      </form>

      {config.chaveFinal && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-sm text-muted-foreground">Apaga a chave cadastrada do provedor de texto e desabilita a IA.</p>
          <DialogoRemoverChave />
        </div>
      )}
    </div>
  );
}

function DialogoRemoverChave() {
  const [aberto, setAberto] = useState(false);
  const { pendente, formRef, onSubmit } = useAcaoFormulario(removerChaveIA, { aoConcluir: () => setAberto(false) });

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Trash2 aria-hidden="true" />
        Remover chave
      </DialogTrigger>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <form ref={formRef} onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Remover a chave da API?</DialogTitle>
            <DialogDescription>
              A chave cifrada é apagada do banco e a IA fica desabilitada até que uma nova chave seja cadastrada.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" size="lg" />}>Voltar</DialogClose>
            <Button type="submit" size="lg" variant="destructive" disabled={pendente}>
              {pendente && <Loader2 className="animate-spin" aria-hidden="true" />}
              Remover chave
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
