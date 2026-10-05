import type { Metadata } from "next";
import { TriangleAlert } from "lucide-react";
import { comAdmin, exigirAdmin } from "@/lib/admin";
import { criptografiaDisponivel } from "@/lib/cripto";
import { db } from "@/lib/db";
import { formatarDataHora } from "@/lib/datas";
import {
  mascararChave,
  MODELO_EMBEDDINGS_PADRAO,
  MODELO_TEXTO_PADRAO,
  SUGESTOES_MODELO_EMBEDDINGS,
  SUGESTOES_MODELO_TEXTO,
} from "@/lib/ia/config";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormConfigIA } from "./formulario";

export const metadata: Metadata = { title: "Inteligência artificial" };

export default async function ConfiguracaoIA() {
  const sessao = await exigirAdmin();
  const config = await comAdmin(sessao.usuario.id, (tx) =>
    tx.configuracaoIA.findUnique({
      where: { id: 1 },
      select: {
        habilitada: true,
        chaveFinal: true,
        modeloTexto: true,
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
  const chaveAmbiente = Boolean(process.env.OPENAI_API_KEY?.trim());

  return (
    <>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Inteligência artificial</h1>
        <p className="text-sm text-muted-foreground">
          Chave e modelos da OpenAI usados pela controladoria na análise de documentos. O satélite nunca usa a IA.
        </p>
      </div>

      {!cifragemOk && (
        <Alert variant="destructive">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Criptografia não configurada</AlertTitle>
          <AlertDescription>
            A variável de ambiente CHAVE_CRIPTOGRAFIA está ausente ou não tem 32 bytes em base64. Sem ela a chave da API
            não pode ser guardada com segurança e nada será salvo. Veja o arquivo .env.example.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>OpenAI</CardTitle>
          <CardDescription>
            {config?.chaveFinal ? (
              <>
                Chave cadastrada: <span className="font-mono">{mascararChave(config.chaveFinal)}</span>
              </>
            ) : chaveAmbiente ? (
              "Nenhuma chave cadastrada; em uso a chave OPENAI_API_KEY do ambiente do servidor."
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
            config={{
              habilitada: config?.habilitada ?? false,
              temChave: Boolean(config?.chaveFinal),
              modeloTexto: config?.modeloTexto ?? MODELO_TEXTO_PADRAO,
              modeloEmbeddings: config?.modeloEmbeddings ?? MODELO_EMBEDDINGS_PADRAO,
              limiteMensalUsd: config?.limiteMensalUsd ? config.limiteMensalUsd.toFixed(2).replace(".", ",") : "",
            }}
            sugestoesTexto={SUGESTOES_MODELO_TEXTO}
            sugestoesEmbeddings={SUGESTOES_MODELO_EMBEDDINGS}
            bloqueado={!cifragemOk}
          />
        </CardContent>
      </Card>
    </>
  );
}
