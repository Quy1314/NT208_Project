import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";

function safeFilename(title: string): string {
  const cleaned = title
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 120);
  return cleaned || "project";
}

function paragraphsFromPlainText(text: string): Paragraph[] {
  const lines = text.split(/\n/);
  return lines.map(
    (line) =>
      new Paragraph({
        children: [new TextRun({ text: line || " " })],
      })
  );
}

export function buildMarkdownDocument(title: string, prompt: string, content: string): string {
  return `# ${title}\n\n## Prompt\n\n${prompt}\n\n## Nội dung AI\n\n${content}\n`;
}

export function downloadMarkdown(title: string, prompt: string, content: string): void {
  const body = buildMarkdownDocument(title, prompt, content);
  const blob = new Blob([body], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeFilename(title)}.md`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function downloadWord(title: string, prompt: string, content: string): Promise<void> {
  const children: Paragraph[] = [
    new Paragraph({
      text: title,
      heading: HeadingLevel.TITLE,
    }),
    new Paragraph({
      text: "Prompt",
      heading: HeadingLevel.HEADING_2,
    }),
    ...paragraphsFromPlainText(prompt),
    new Paragraph({
      text: "Nội dung AI",
      heading: HeadingLevel.HEADING_2,
    }),
    ...paragraphsFromPlainText(content),
  ];

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeFilename(title)}.docx`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function downloadPdf(title: string, prompt: string, content: string): Promise<void> {
  const html2pdf = (await import("html2pdf.js")).default;
  const wrapper = document.createElement("div");
  wrapper.style.padding = "28px";
  wrapper.style.fontFamily = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';
  wrapper.style.color = "#0f172a";
  wrapper.style.background = "#ffffff";
  wrapper.style.width = "794px";
  wrapper.style.boxSizing = "border-box";

  const h1 = document.createElement("h1");
  h1.style.fontSize = "22px";
  h1.style.margin = "0 0 16px 0";
  h1.textContent = title;

  const h2p = document.createElement("h2");
  h2p.style.fontSize = "14px";
  h2p.style.margin = "20px 0 8px 0";
  h2p.textContent = "Prompt";

  const preP = document.createElement("pre");
  preP.style.whiteSpace = "pre-wrap";
  preP.style.wordBreak = "break-word";
  preP.style.fontSize = "11px";
  preP.style.margin = "0 0 16px 0";
  preP.style.fontFamily = "inherit";
  preP.textContent = prompt;

  const h2c = document.createElement("h2");
  h2c.style.fontSize = "14px";
  h2c.style.margin = "20px 0 8px 0";
  h2c.textContent = "Nội dung AI";

  const preC = document.createElement("pre");
  preC.style.whiteSpace = "pre-wrap";
  preC.style.wordBreak = "break-word";
  preC.style.fontSize = "11px";
  preC.style.margin = "0";
  preC.style.fontFamily = "inherit";
  preC.textContent = content;

  wrapper.append(h1, h2p, preP, h2c, preC);
  wrapper.setAttribute("lang", "vi");
  document.body.appendChild(wrapper);

  try {
    await html2pdf()
      .set({
        margin: [12, 12, 12, 12],
        filename: `${safeFilename(title)}.pdf`,
        image: { type: "jpeg", quality: 0.92 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      })
      .from(wrapper)
      .save();
  } finally {
    document.body.removeChild(wrapper);
  }
}
