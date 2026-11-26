import { unzipSync } from "fflate";
export function fileType(name: string, bytes: Uint8Array) {
  const ext = name.toLowerCase().split(".").pop();
  const starts = (...prefix: number[]) =>
    prefix.every((n, i) => bytes[i] === n);
  const text = new TextDecoder().decode(bytes.subarray(0, 16));
  if (ext === "pdf" && text.startsWith("%PDF-")) return "application/pdf";
  if (ext === "png" && starts(137, 80, 78, 71, 13, 10, 26, 10))
    return "image/png";
  if ((ext === "jpg" || ext === "jpeg") && starts(255, 216, 255))
    return "image/jpeg";
  if (ext === "webp" && text.startsWith("RIFF") && text.slice(8, 12) === "WEBP")
    return "image/webp";
  if (ext === "docx" || ext === "pptx") {
    const names = new Set<string>();
    try {
      unzipSync(bytes, {
        filter(entry) {
          names.add(entry.name);
          return false;
        },
      });
    } catch {
      return null;
    }
    if (
      !names.has("[Content_Types].xml") ||
      !names.has(ext === "docx" ? "word/document.xml" : "ppt/presentation.xml")
    )
      return null;
    return (
      "application/vnd.openxmlformats-officedocument." +
      (ext === "docx"
        ? "wordprocessingml.document"
        : "presentationml.presentation")
    );
  }
  if (ext === "md" || ext === "txt" || ext === "csv") {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return null;
    }
    if (bytes.includes(0)) return null;
    return { md: "text/markdown", txt: "text/plain", csv: "text/csv" }[ext];
  }
  return null;
}
