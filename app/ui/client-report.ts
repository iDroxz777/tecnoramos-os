import type { OrderRecord } from "../types";
import { formatDate, formatDuration, formatOrderNumber, minutesBetween, orderTimestamp } from "./format.ts";
import { describeService, orderParts, orderSubtitle, summarize } from "./insights.ts";

const NAVY: [number, number, number] = [11, 27, 68];
const BLUE: [number, number, number] = [31, 79, 214];
const INK: [number, number, number] = [32, 40, 60];
const MUTED: [number, number, number] = [110, 118, 140];
const LINE: [number, number, number] = [214, 220, 232];

export const COMPANY = {
  legalName: "TECNORAMOS INSTALAÇÃO E MANUTENÇÃO DE SISTEMAS DE REFRIGERAÇÃO LTDA",
  cnpj: "00.000.000/0001-00",
  stateRegistration: "000.000.000.000",
};

/** Draws an SVG asset onto a canvas so jsPDF can embed it as PNG. */
export async function rasterizeImage(url: string, width: number) {
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  await image.decode();
  const ratio = image.naturalHeight / image.naturalWidth || 0.12;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = Math.round(width * ratio);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas indisponível.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return { dataUrl: canvas.toDataURL("image/png"), ratio };
}

export function clientReportFilename(clientName: string, month: string) {
  const clean = clientName.replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ").replace(/\s+/g, " ").trim() || "Cliente";
  const [year, monthNumber] = month.split("-");
  return `Relatorio ${clean} ${monthNumber}-${year}.pdf`;
}

export async function buildClientReport({
  clientName,
  month,
  monthLabel,
  orders,
}: {
  clientName: string;
  month: string;
  monthLabel: string;
  orders: OrderRecord[];
}): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const logo = await rasterizeImage("/brand/logo-tecnoramos.svg", 1400).catch(() => null);
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const sorted = [...orders].sort((left, right) => orderTimestamp(left) - orderTimestamp(right));
  const summary = summarize(sorted);
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const periodText = `01/${String(monthNumber).padStart(2, "0")}/${year} a ${lastDay}/${String(monthNumber).padStart(2, "0")}/${year}`;

  const setColor = (color: [number, number, number]) => pdf.setTextColor(color[0], color[1], color[2]);

  // Header
  let y = margin;
  if (logo) {
    const logoWidth = 68;
    pdf.addImage(logo.dataUrl, "PNG", margin, y, logoWidth, logoWidth * logo.ratio);
  }
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  setColor(NAVY);
  pdf.text("Relatório mensal de atendimentos", pageWidth - margin, y + 4, { align: "right" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  setColor(BLUE);
  pdf.text(monthLabel, pageWidth - margin, y + 10, { align: "right" });
  y += 18;
  pdf.setDrawColor(NAVY[0], NAVY[1], NAVY[2]);
  pdf.setLineWidth(0.6);
  pdf.line(margin, y, pageWidth - margin, y);

  // Client block
  y += 8;
  pdf.setFontSize(8);
  setColor(MUTED);
  pdf.text("CLIENTE", margin, y);
  pdf.text("PERÍODO", margin + contentWidth * 0.62, y);
  y += 5;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  setColor(INK);
  pdf.text(pdf.splitTextToSize(clientName, contentWidth * 0.58)[0], margin, y);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text(periodText, margin + contentWidth * 0.62, y);

  // Summary boxes
  y += 8;
  const boxes = [
    { label: "Atendimentos", value: String(summary.total) },
    { label: "Horas em campo", value: formatDuration(summary.totalMinutes) },
    { label: "Tempo médio", value: formatDuration(summary.averageMinutes) },
    { label: "Técnicos", value: String(summary.byTechnician.length) },
  ];
  const gap = 3;
  const boxWidth = (contentWidth - gap * (boxes.length - 1)) / boxes.length;
  boxes.forEach((box, index) => {
    const x = margin + index * (boxWidth + gap);
    pdf.setFillColor(243, 246, 252);
    pdf.setDrawColor(LINE[0], LINE[1], LINE[2]);
    pdf.setLineWidth(0.2);
    pdf.roundedRect(x, y, boxWidth, 17, 1.5, 1.5, "FD");
    pdf.setFontSize(7.5);
    setColor(MUTED);
    pdf.text(box.label.toUpperCase(), x + 4, y + 6);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    setColor(NAVY);
    pdf.text(box.value, x + 4, y + 13.5);
    pdf.setFont("helvetica", "normal");
  });
  y += 25;

  // Orders table
  const columns = [
    { title: "OS", width: 15 },
    { title: "Data", width: 13 },
    { title: "Horário", width: 19 },
    { title: "Atendimento", width: 28 },
    { title: "Serviço realizado", width: contentWidth - 15 - 13 - 19 - 28 - 40 - 24 },
    { title: "Peças e materiais", width: 40 },
    { title: "Técnicos", width: 24 },
  ];
  const drawTableHeader = () => {
    pdf.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
    pdf.rect(margin, y, contentWidth, 7, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.5);
    pdf.setTextColor(255, 255, 255);
    let x = margin;
    for (const column of columns) {
      pdf.text(column.title, x + 2, y + 4.7);
      x += column.width;
    }
    pdf.setFont("helvetica", "normal");
    y += 7;
  };
  drawTableHeader();

  const lineHeight = 3.6;
  sorted.forEach((order, index) => {
    const minutes = minutesBetween(order.arrivalTime, order.departureTime);
    const cells = [
      formatOrderNumber(order.orderNumber).replace("OS ", ""),
      formatDate(orderTimestamp(order), { day: "2-digit", month: "2-digit" }),
      `${order.arrivalTime}–${order.departureTime}\n${formatDuration(minutes)}`,
      orderSubtitle(order),
      describeService(order.data.procedures, order.data.procedureOther, order.data.procedureText),
      orderParts(order.data).join("; ") || "—",
      order.technicians.filter(Boolean).join(", "),
    ];
    pdf.setFontSize(7.4);
    const wrapped = cells.map((cell, cellIndex) => pdf.splitTextToSize(cell, columns[cellIndex].width - 4) as string[]);
    const rowHeight = Math.max(...wrapped.map((lines) => lines.length)) * lineHeight + 3.5;
    if (y + rowHeight > pageHeight - 18) {
      pdf.addPage();
      y = margin;
      drawTableHeader();
    }
    if (index % 2 === 1) {
      pdf.setFillColor(247, 249, 253);
      pdf.rect(margin, y, contentWidth, rowHeight, "F");
    }
    let x = margin;
    wrapped.forEach((lines, cellIndex) => {
      pdf.setFont("helvetica", cellIndex === 0 ? "bold" : "normal");
      setColor(cellIndex === 0 ? NAVY : INK);
      pdf.text(lines, x + 2, y + 4.4, { lineHeightFactor: 1.25 });
      x += columns[cellIndex].width;
    });
    y += rowHeight;
    pdf.setDrawColor(LINE[0], LINE[1], LINE[2]);
    pdf.setLineWidth(0.15);
    pdf.line(margin, y, pageWidth - margin, y);
  });

  if (!sorted.length) {
    pdf.setFontSize(9);
    setColor(MUTED);
    pdf.text("Nenhum atendimento registrado neste período.", margin + 2, y + 7);
  }

  // Footer on every page
  const pages = pdf.getNumberOfPages();
  const issued = formatDate(Date.now(), { dateStyle: "short" });
  for (let page = 1; page <= pages; page += 1) {
    pdf.setPage(page);
    pdf.setDrawColor(LINE[0], LINE[1], LINE[2]);
    pdf.setLineWidth(0.2);
    pdf.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
    pdf.setFontSize(6.8);
    setColor(MUTED);
    pdf.text(`${COMPANY.legalName} · CNPJ ${COMPANY.cnpj}`, margin, pageHeight - 7.5);
    pdf.text(`Emitido em ${issued} · Página ${page} de ${pages}`, pageWidth - margin, pageHeight - 7.5, { align: "right" });
  }

  return pdf.output("blob");
}

/** Offers the file through the phone's share sheet, falling back to a download. */
export async function shareOrDownload(blob: Blob, filename: string, text: string) {
  const file = new File([blob], filename, { type: "application/pdf" });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: filename, text });
      return "shared" as const;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled" as const;
    }
  }
  downloadBlob(blob, filename);
  return "downloaded" as const;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
