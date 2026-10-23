"use client";

import { forwardRef, useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { pdfContentLength, safePdfFilename } from "../domain";
import type { Client, FormState, OrderRecord } from "../types";
import { COMPANY, downloadBlob, shareOrDownload } from "./client-report";
import { formatOrderNumber } from "./format";
import { describeService, serviceTypeOf } from "./insights";
import { Icon } from "./icons";

type PdfState = { status: "preparing" } | { status: "ready"; blob: Blob } | { status: "failed" };

export function OSPreview({
  form,
  client,
  order,
  shareOnReady = false,
  onBack,
  notify,
}: {
  form: FormState;
  client: Client;
  order: OrderRecord;
  shareOnReady?: boolean;
  onBack: () => void;
  notify: (message: string) => void;
}) {
  const paperRef = useRef<HTMLElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pdf, setPdf] = useState<PdfState>({ status: "preparing" });
  const [shareHint, setShareHint] = useState(shareOnReady);
  const timestamp = order.finalizedAt || order.createdAt;
  const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date(timestamp));
  const length = pdfContentLength(form);
  const density = length > 3300 ? "ultra-compact" : length > 2200 ? "compact" : "";
  const filename = safePdfFilename(client.name, timestamp);
  const shareText = `Ordem de serviço ${formatOrderNumber(order.orderNumber)} · ${client.name} · ${date}`;

  const renderPdf = useCallback(async () => {
    const paper = paperRef.current;
    if (!paper) throw new Error("Folha não encontrada.");
    await document.fonts.ready;
    await Promise.all(Array.from(paper.querySelectorAll("img")).map((image) => {
      if (image.complete) return Promise.resolve();
      return new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      });
    }));
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import("html2canvas"),
      import("jspdf"),
    ]);
    const canvas = await html2canvas(paper, {
      backgroundColor: "#ffffff",
      logging: false,
      scale: 2,
      useCORS: true,
    });
    const document_ = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    const pageWidth = document_.internal.pageSize.getWidth();
    const pageHeight = document_.internal.pageSize.getHeight();
    const scale = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
    const imageWidth = canvas.width * scale;
    const imageHeight = canvas.height * scale;
    document_.addImage(
      canvas.toDataURL("image/jpeg", 0.94),
      "JPEG",
      (pageWidth - imageWidth) / 2,
      0,
      imageWidth,
      imageHeight,
      undefined,
      "FAST",
    );
    return document_.output("blob");
  }, []);

  useEffect(() => {
    const element = previewRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setZoom(Math.min(1, (entry.contentRect.width - 4) / 794));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // The file is prepared up front: phones only open the share sheet right
  // after a tap, so the PDF must already exist when "Enviar" is pressed.
  useEffect(() => {
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      renderPdf()
        .then((blob) => { if (!cancelled) setPdf({ status: "ready", blob }); })
        .catch(() => { if (!cancelled) setPdf({ status: "failed" }); });
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [renderPdf]);

  const confirmDense = () => length <= 4200 || window.confirm(
    "Esta OS tem bastante texto. O PDF continua em uma página, mas a fonte fica menor. Deseja continuar?",
  );

  const save = () => {
    if (pdf.status !== "ready" || !confirmDense()) return;
    downloadBlob(pdf.blob, filename);
    notify("PDF salvo no aparelho.");
  };

  const share = async () => {
    if (pdf.status !== "ready" || !confirmDense()) return;
    setShareHint(false);
    const result = await shareOrDownload(pdf.blob, filename, shareText);
    if (result === "downloaded") notify("Este navegador não abre o compartilhamento. O PDF foi salvo para você anexar.");
  };

  const retry = () => {
    setPdf({ status: "preparing" });
    renderPdf()
      .then((blob) => setPdf({ status: "ready", blob }))
      .catch(() => setPdf({ status: "failed" }));
  };

  return (
    <div className="pdf-screen">
      <div className="pdf-toolbar no-print">
        <button className="icon-button" type="button" onClick={onBack} aria-label="Voltar">
          <Icon name="chevronLeft" />
        </button>
        <div className="pdf-toolbar-title">
          <strong>{formatOrderNumber(order.orderNumber)} · {client.name}</strong>
          <span>
            {pdf.status === "preparing" && "Preparando o PDF…"}
            {pdf.status === "ready" && (shareHint ? "PDF pronto. Toque em Enviar para escolher o WhatsApp." : "Uma página A4, com a assinatura do cliente.")}
            {pdf.status === "failed" && "Não foi possível preparar o PDF."}
          </span>
        </div>
        {pdf.status === "failed" ? (
          <button className="button button-primary" type="button" onClick={retry}>
            <Icon name="restore" size={18} /> Tentar de novo
          </button>
        ) : (
          <div className="pdf-toolbar-actions">
            <button className="button button-ghost" type="button" disabled={pdf.status !== "ready"} onClick={save}>
              <Icon name="download" size={18} /> <span>Salvar</span>
            </button>
            <button className={`button button-whatsapp ${shareHint && pdf.status === "ready" ? "pulse" : ""}`} type="button" disabled={pdf.status !== "ready"} onClick={() => void share()}>
              <Icon name="share" size={18} /> <span>Enviar</span>
            </button>
          </div>
        )}
      </div>
      <div className="paper-preview" ref={previewRef} style={{ "--paper-zoom": zoom } as CSSProperties}>
        <PaperSheet form={form} client={client} order={order} date={date} density={density} />
      </div>
      {/* Full-size copy, off screen, so the PDF never depends on the phone's width. */}
      <div className="paper-capture" aria-hidden="true">
        <PaperSheet ref={paperRef} form={form} client={client} order={order} date={date} density={density} />
      </div>
    </div>
  );
}

type PaperProps = {
  form: FormState;
  client: Client;
  order: OrderRecord;
  date: string;
  density: string;
};

const PaperSheet = forwardRef<HTMLElement, PaperProps>(function PaperSheet({ form, client, order, date, density }, ref) {
  const legacy = Boolean(form.equipmentDescription.trim());
  // Free text alone is common now that the quick buttons are gone.
  const detail = (items: string[], other: string, text: string) => describeService(items, other, text.trim());
  const parts = form.parts.includes("Outro") && form.partOther
    ? [...form.parts.filter((part) => part !== "Outro"), form.partOther]
    : form.parts;
  return (
    <article ref={ref} className={`paper-os ${density}`}>
      <header>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="paper-logo" src="/brand/logo-tecnoramos.svg" alt="Tecnoramos — Refrigeração comercial e industrial" />
        <div>
          <strong>ORDEM DE SERVIÇO</strong>
          <span>Nº <b>{order.orderNumber ? String(order.orderNumber).padStart(5, "0") : "________"}</b></span>
          {order.revisionNumber > 1 && <em>REVISÃO {order.revisionNumber}</em>}
          <small>Data: {date}</small>
        </div>
      </header>
      <div className="company-line"><strong>{COMPANY.legalName}</strong></div>
      <div className="company-contact"><span>CNPJ: {COMPANY.cnpj}</span><span>Inscrição estadual: {COMPANY.stateRegistration}</span></div>
      <section className="paper-client">
        <div className="full"><span>Cliente</span><strong>{client.name}</strong></div>
        {/* Orders from before the simplified form keep their equipment and call. */}
        {legacy
          ? <div className="full"><span>Equipamento atendido</span><strong>{form.equipmentDescription}</strong></div>
          : <div className="full"><span>Tipo de atendimento</span><strong>{serviceTypeOf(form)}</strong></div>}
        <div><span>Técnicos responsáveis</span><strong>{form.technicians.filter(Boolean).join(" · ")}</strong></div>
        <div><span>Horário</span><strong>{form.arrivalTime} às {form.departureTime}</strong></div>
      </section>
      <section className="paper-service">
        {legacy && <div><h3>Descrição do chamado</h3><p>{detail(form.call, form.callOther, form.callText)}</p></div>}
        <div><h3>Defeitos constatados</h3><p>{detail(form.defects, form.defectsOther, form.defectText)}</p></div>
        <div><h3>Procedimento realizado</h3><p>{detail(form.procedures, form.procedureOther, form.procedureText)}</p></div>
        <div><h3>Peças e materiais utilizados</h3><p>{parts.length ? parts.join("; ") : "Nenhuma peça informada"}</p></div>
        {form.notes && <div><h3>Observações</h3><p>{form.notes}</p></div>}
        {order.revisionNumber > 1 && order.correctionReason && (
          <div className="paper-correction"><h3>Motivo da correção</h3><p>{order.correctionReason}</p></div>
        )}
      </section>
      <div className="paper-note">Peças substituídas deverão retornar à empresa para análise.</div>
      <footer>
        <div>
          <span>Hora de chegada</span><strong>{form.arrivalTime}</strong>
          <span>Hora de saída</span><strong>{form.departureTime}</strong>
        </div>
        <div>
          <span>Técnicos responsáveis</span><strong className="signature-line">{form.technicians.filter(Boolean).join(" · ")}</strong>
          <span>Assinatura do cliente / comprador</span>
          <div className="signature-proof">
            {form.signatureDataUrl
              // The signature is a client-generated data URL and cannot use Next Image.
              ? <img src={form.signatureDataUrl} alt="Assinatura digital do cliente" /> // eslint-disable-line @next/next/no-img-element
              : <em>Assinatura não registrada</em>}
          </div>
          <small className="signature-meta">
            Confirmado em {new Intl.DateTimeFormat("pt-BR", {
              dateStyle: "short",
              timeStyle: "short",
              timeZone: "America/Sao_Paulo",
            }).format(new Date(order.signedAt || order.finalizedAt || order.createdAt))}
          </small>
        </div>
      </footer>
    </article>
  );
});
