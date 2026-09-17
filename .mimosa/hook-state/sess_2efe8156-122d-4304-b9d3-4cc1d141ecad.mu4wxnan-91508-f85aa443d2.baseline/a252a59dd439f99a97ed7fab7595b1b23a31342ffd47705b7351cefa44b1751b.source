import { saveAs } from "file-saver";

export const exportMarkdown = (content: string, filename = "document") => {
  const blob = new Blob([content ?? ""], { type: "text/markdown;charset=utf-8" });
  saveAs(blob, `${filename.replace(/[/\\?%*:|"<>]/g, "-")}.md`);
};
