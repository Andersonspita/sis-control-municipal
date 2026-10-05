import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ClipboardCheck, ListTodo, TriangleAlert } from "lucide-react";
import { z } from "zod";
import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { comCliente } from "@/lib/db";
import { buscarOrigemAcao, buscarOrigemRequisito } from "@/lib/dados/demandas";
import { CabecalhoPagina } from "@/components/shell/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { hojeComoDataSimples, paraCampoData, somarDias } from "@/lib/datas";
import { FormDemanda, type ValoresIniciais } from "./form-demanda";

export const metadata: Metadata = { title: "Nova demanda" };

const CLASSE_LINK = "font-medium text-primary underline-offset-4 hover:underline";

function cortar(texto: string, limite: number) {
  return texto.length > limite ? `${texto.slice(0, limite - 1).trimEnd()}…` : texto;
}

/** Texto numa linha só, para assunto e rótulos. */
function resumir(texto: string, limite: number) {
  return cortar(texto.replace(/\s+/g, " ").trim(), limite);
}

function parametro(valor: string | string[] | undefined) {
  const v = Array.isArray(valor) ? valor[0] : valor;
  return v || undefined;
}

type Origem = { tipo: "requisito" | "acao"; href: string; rotulo: string; detalhe: string };

export default async function NovaDemanda(props: PageProps<"/demandas/nova">) {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const busca = await props.searchParams;
  const idRequisito = parametro(busca.requisito);
  const idAcao = idRequisito ? undefined : parametro(busca.acao);
  const hoje = hojeComoDataSimples();
  const prazoMinimo = paraCampoData(hoje);

  const { unidades, origem, iniciais, aviso } = await comCliente(ctx, async (tx) => {
    const unidades = await tx.unidade.findMany({
      where: { ativo: true },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, sigla: true, responsavelNome: true },
    });
    let origem: Origem | null = null;
    let iniciais: ValoresIniciais = {};
    let aviso: string | null = null;

    if (idRequisito) {
      const r = z.uuid().safeParse(idRequisito).success ? await buscarOrigemRequisito(tx, idRequisito) : null;
      if (!r?.ok) aviso = r?.motivo ?? "O requisito de origem informado é inválido.";
      else {
        const { requisito, ciclo, cicloId } = r.origem;
        origem = {
          tipo: "requisito",
          href: `/autoavaliacao/${cicloId}#req-${requisito.id}`,
          rotulo: `Requisito ${requisito.codigo} — ${requisito.titulo}`,
          detalhe: `Autoavaliação “${ciclo.nome}”. Os documentos da resposta aceita viram evidência do requisito.`,
        };
        iniciais = {
          respostaRequisitoId: r.origem.id,
          assunto: resumir(`Evidência: ${requisito.codigo} — ${resumir(requisito.titulo, 120)}`, 200),
          descricao: cortar(
            [
              `Para a autoavaliação “${ciclo.nome}”, solicitamos documento(s) que comprove(m) o atendimento ao requisito ${requisito.codigo} — ${requisito.titulo}.`,
              requisito.descricao,
              requisito.orientacao && `Evidências esperadas: ${requisito.orientacao}`,
              "Anexe à resposta desta demanda os documentos comprobatórios (atos, relatórios, registros ou publicações).",
            ]
              .filter(Boolean)
              .join("\n\n"),
            10000,
          ),
        };
      }
    } else if (idAcao) {
      const r = z.uuid().safeParse(idAcao).success ? await buscarOrigemAcao(tx, idAcao) : null;
      if (!r?.ok) aviso = r?.motivo ?? "A ação de origem informada é inválida.";
      else {
        const acao = r.origem;
        origem = {
          tipo: "acao",
          href: `/planos/${acao.planoId}`,
          rotulo: `Ação: ${resumir(acao.oQue, 160)}`,
          detalhe: `Plano de ação “${acao.plano.titulo}”. Os documentos da resposta aceita viram evidência da ação.`,
        };
        const prazoAcao = acao.prazo ? paraCampoData(acao.prazo) : null;
        iniciais = {
          acaoId: acao.id,
          assunto: resumir(acao.oQue, 200),
          descricao: cortar(
            [
              `Ação do plano de ação “${acao.plano.titulo}”: ${acao.oQue}`,
              acao.porQue && `Por quê: ${acao.porQue}`,
              acao.como && `Como: ${acao.como}`,
              "Informe o andamento da execução e anexe os documentos que comprovem a realização da ação.",
            ]
              .filter(Boolean)
              .join("\n\n"),
            10000,
          ),
          unidadeDestinoId: unidades.find((u) => u.id === acao.unidadeResponsavelId)?.id,
          prazo: prazoAcao && prazoAcao >= prazoMinimo ? prazoAcao : undefined,
          prioridade: acao.prioridade,
        };
      }
    }
    return { unidades, origem, iniciais, aviso };
  });

  return (
    <>
      <CabecalhoPagina
        titulo="Nova demanda"
        descricao="A unidade destinatária recebe a demanda na caixa dela e responde com texto e anexos dentro do prazo."
        acoes={
          <Link href="/demandas" className={buttonVariants({ variant: "outline", size: "lg" })}>
            <ArrowLeft aria-hidden="true" />
            Voltar às demandas
          </Link>
        }
      />
      <div className="max-w-3xl space-y-4">
        {aviso && (
          <Alert className="border-alerta/50 bg-alerta/10">
            <TriangleAlert aria-hidden="true" className="text-alerta" />
            <AlertTitle>A origem indicada foi ignorada</AlertTitle>
            <AlertDescription>{aviso} A demanda será criada sem vínculo.</AlertDescription>
          </Alert>
        )}
        {origem && (
          <Alert role="status" className="border-primary/35 bg-primary/5">
            {origem.tipo === "requisito" ? <ClipboardCheck aria-hidden="true" className="text-primary" /> : <ListTodo aria-hidden="true" className="text-primary" />}
            <AlertTitle>
              Origem:{" "}
              <Link href={origem.href} className={CLASSE_LINK}>
                {origem.rotulo}
              </Link>
            </AlertTitle>
            <AlertDescription>{origem.detalhe}</AlertDescription>
          </Alert>
        )}
        <Card>
          <CardContent>
            {unidades.length === 0 ? (
              <p className="py-6 text-center text-muted-foreground">
                Cadastre ao menos uma{" "}
                <Link href="/unidades" className={CLASSE_LINK}>
                  unidade
                </Link>{" "}
                antes de enviar demandas.
              </p>
            ) : (
              <FormDemanda
                unidades={unidades}
                prazoMinimo={prazoMinimo}
                prazoPadrao={paraCampoData(somarDias(hoje, 15))}
                iniciais={iniciais}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
