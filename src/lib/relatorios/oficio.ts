import "server-only";
import { z } from "zod";
import { comCliente } from "@/lib/db";
import { formatarDataSimples } from "@/lib/datas";
import { numeroDemanda } from "@/lib/demandas";
import { PRIORIDADE } from "@/lib/rotulos";
import { html, paragrafos } from "@/lib/pdf/html";
import {
  assinante,
  blocoAssinatura,
  dadosEntidade,
  exigirControle,
  localEData,
  nomeArquivo,
  rotuloUnidade,
  type ContextoRelatorio,
  type RelatorioMontado,
} from "./comum";

/** Ofício formal de encaminhamento de uma demanda à unidade destinatária. */
export async function montarOficioDemanda(ctx: ContextoRelatorio, params: { demandaId: string }): Promise<RelatorioMontado | null> {
  exigirControle(ctx);
  if (!z.uuid().safeParse(params.demandaId).success) return null;
  const d = await comCliente(ctx, (tx) =>
    tx.demanda.findUnique({
      where: { id: params.demandaId },
      select: {
        id: true,
        numero: true,
        ano: true,
        assunto: true,
        descricao: true,
        prazo: true,
        prioridade: true,
        criadoEm: true,
        unidadeDestino: { select: { nome: true, sigla: true, responsavelNome: true } },
      },
    }),
  );
  if (!d) return null;
  const [entidade, quem] = await Promise.all([dadosEntidade(ctx.clienteId), assinante(ctx)]);
  const numero = numeroDemanda(d.numero, d.ano);
  const responsavel = d.unidadeDestino.responsavelNome?.trim();

  const corpo = html`<div class="oficio">
<p class="sem-recuo"><strong>Ofício CI nº ${numero}</strong></p>
<p class="sem-recuo direita">${localEData(entidade.municipio, entidade.uf)}</p>

<div class="sem-recuo" style="margin:6mm 0">
<p>${responsavel ? html`Ao(À) Senhor(a)<br><strong>${responsavel}</strong><br>Responsável pela unidade` : "Ao(À) Responsável pela unidade"}<br>
<strong>${rotuloUnidade(d.unidadeDestino)}</strong><br>${entidade.nome}</p>
</div>

<p class="sem-recuo"><strong>Assunto:</strong> ${d.assunto}<br>
<strong>Referência:</strong> Demanda nº ${numero} · Prioridade ${PRIORIDADE[d.prioridade].toLowerCase()}</p>

<p class="sem-recuo" style="margin-top:6mm">${responsavel ? "Senhor(a) Responsável," : "Prezado(a) Senhor(a),"}</p>

<p>No exercício das atribuições de controle interno, a Controladoria solicita a Vossa Senhoria as providências e informações descritas a seguir:</p>

<div style="margin:3mm 0 3mm 12mm">${paragrafos(d.descricao)}</div>

<p>A resposta, acompanhada dos documentos comprobatórios, deverá ser encaminhada até <strong>${formatarDataSimples(d.prazo)}</strong>, preferencialmente por meio do sistema de controle interno, na área da unidade, onde esta demanda está registrada sob o nº ${numero}.</p>

<p>Eventual impossibilidade de atendimento no prazo deverá ser justificada, com pedido de prorrogação, antes do vencimento.</p>

<p>Atenciosamente,</p>

${blocoAssinatura(quem)}
</div>`;

  return {
    tipo: "oficio",
    titulo: `Ofício CI nº ${numero}`,
    arquivo: nomeArquivo("oficio", numero.replace("/", "-")),
    corpo,
    referencia: { entidade: "Demanda", id: d.id },
    filtros: { demandaId: d.id },
  };
}
