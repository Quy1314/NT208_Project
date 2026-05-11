function safeFilename(title: string): string {
  const cleaned = title
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 120);
  return cleaned || "project";
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
  const html = `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
  </head>
  <body>
    <h1>${title}</h1>
    <h2>Prompt</h2>
    <pre>${prompt}</pre>
    <h2>Noi dung AI</h2>
    <pre>${content}</pre>
  </body>
</html>`;
  const blob = new Blob([html], { type: "application/msword;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeFilename(title)}.doc`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function downloadPdf(title: string, prompt: string, content: string): Promise<void> {
  const printWindow = window.open("", "_blank", "noopener,noreferrer,width=1024,height=768");
  if (!printWindow) {
    throw new Error("Không thể mở cửa sổ in PDF. Hãy cho phép popup và thử lại.");
  }

  const html = `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      body { font-family: "Segoe UI", Arial, sans-serif; margin: 32px; color: #0f172a; }
      h1 { margin: 0 0 14px 0; }
      h2 { margin: 18px 0 8px 0; font-size: 16px; }
      pre { white-space: pre-wrap; word-break: break-word; font-family: inherit; margin: 0; }
    </style>
  </head>
  <body>
    <h1>${title}</h1>
    <h2>Prompt</h2>
    <pre>${prompt}</pre>
    <h2>Noi dung AI</h2>
    <pre>${content}</pre>
  </body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
  printWindow.close();
}
