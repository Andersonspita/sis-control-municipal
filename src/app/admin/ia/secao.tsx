import { TriangleAlert } from "lucide-react";
import { comAdmin, exigirAdmin } from "@/lib/admin";
import { criptografiaDisponivel } from "@/lib/cripto";
import { db } from "@/lib/db";
import { formatarDataHora } from "@/lib/datas";
import { chaveDoAmbiente, MODELO_EMBEDDINGS_PADRAO, MODELO_TEXTO_PADRAO } from "@/lib/ia/config";
import { ehProvedor, ehProvedorEmbeddings, INFO_PROVEDOR, mascararChave } from "@/lib/ia/provedores";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormConfigIA } from "./formulario";

/** Configuração editável da IA (só administrador HorizonAJ); usada em /admin/ia e em /configuracoes?aba=ia. */
export async function SecaoConfigIA() {
  const sessao = await exigirAdmin();
  const config = await comAdmin(sessao.usuario.id, (tx) =>
    tx.configuracaoIA.findUnique({
      where: { id: 1 },
      select: {
        habilitada: true,
        provedor: true,
        urlBase: true,
        chaveFinal: true,
        modeloTexto: true,
        provedorEmbeddings: true,
        urlBaseEmbeddings: true,
        chaveEmbeddingsFinal: true,
        modeloEmbeddings: true,
        limiteMensalUsd: true,
        alteradoPorId: true,
        atualizadoEm: true,
      },
    }),
  );
  const alteradoPor = config?.alteradoPorId
    ? await db.usuario.findUnique({ where: { id: config.alteradoPorId }, select: { nome: true } })
    : null;
  const cifragemOk = criptografiaDisponivel();
  const provedor = ehProvedor(config?.provedor) ? config.provedor : "OPENAI";
  const provedorEmbeddings = ehProvedorEmbeddings(config?.provedorEmbeddings) ? config.provedorEmbeddings : "";
  const info = INFO_PROVEDOR[provedor];
  const chaveAmbiente = Boolean(chaveDoAmbiente(provedor));

  return (
    <>
      {!cifragemOk && (
        <Alert variant="destructive">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Criptografia não configurada</AlertTitle>
          <AlertDescription>
            A variável de ambiente CHAVE_CRIPTOGRAFIA está ausente ou não tem 32 bytes em base64. Sem ela as chaves de API
            não podem ser guardadas com segurança e nada será salvo. Veja o arquivo .env.example.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Provedor de IA</CardTitle>
          <CardDescription>
            Em uso: {info.rotulo}.{" "}
            {config?.chaveFinal ? (
              <>
                Chave cadastrada: <span className="font-mono">{mascararChave(config.chaveFinal, provedor)}</span>
              </>
            ) : chaveAmbiente ? (
              `Nenhuma chave cadastrada; em uso a variável ${info.variavelAmbiente} do ambiente do servidor.`
            ) : (
              "Nenhuma chave cadastrada."
            )}
            {config && (
              <>
                {" "}
                · alterado {alteradoPor ? `por ${alteradoPor.nome} ` : ""}em {formatarDataHora(config.atualizadoEm)}
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormConfigIA
            key={config?.atualizadoEm.toISOString() ?? "nova"}
            config={{
              habilitada: config?.habilitada ?? false,
              provedor,
              urlBase: config?.urlBase ?? "",
              chaveFinal: config?.chaveFinal ?? null,
              modeloTexto: config?.modeloTexto ?? MODELO_TEXTO_PADRAO,
              provedorEmbeddings,
              urlBaseEmbeddings: config?.urlBaseEmbeddings ?? "",
              chaveEmbeddingsFinal: config?.chaveEmbeddingsFinal ?? null,
              modeloEmbeddings: config?.modeloEmbeddings ?? MODELO_EMBEDDINGS_PADRAO,
              limiteMensalUsd: config?.limiteMensalUsd ? config.limiteMensalUsd.toFixed(2).replace(".", ",") : "",
            }}
            bloqueado={!cifragemOk}
          />
        </CardContent>
      </Card>
    </>
  );
}
