/** `app.log` → `app.scrubbed.log`; no name → `scrubbed.txt`. */
export const scrubbedName = (name: string | undefined): string => {
  if (!name) return "scrubbed.txt";
  const dot = name.lastIndexOf(".");
  return dot > 0 ? `${name.slice(0, dot)}.scrubbed${name.slice(dot)}` : `${name}.scrubbed.txt`;
};

/** Hands the text to the browser as a download; nothing leaves the tab. */
export const download = (text: string, name: string): void => {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};
