import JSZip from "jszip";

export async function downloadDocumentsAsZip(
  files: { url: string; fileName: string }[],
  zipName: string,
) {
  const zip = new JSZip();
  const used = new Set<string>();
  for (const f of files) {
    const res = await fetch(f.url);
    if (!res.ok) continue;
    const blob = await res.blob();
    let name = f.fileName;
    let n = 1;
    while (used.has(name)) { name = `${n++}_${f.fileName}`; }
    used.add(name);
    zip.file(name, blob);
  }
  const content = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(content);
  a.download = zipName.endsWith(".zip") ? zipName : `${zipName}.zip`;
  a.click();
  URL.revokeObjectURL(a.href);
}
