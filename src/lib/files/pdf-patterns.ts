// What the server refuses inside a PDF. Shared with the browser, which uses it to make sure a
// PDF it builds from a photo can't trip the check by chance (JPEG bytes are random-looking).

export const PDF_RISKS: [RegExp, string][] = [
  [/\/JavaScript\b/, "JavaScript"],
  [/\/JS[\s/<([]/, "JavaScript"],
  [/\/Launch\b/, "a launch action"],
  [/\/EmbeddedFiles?\b/, "an embedded file"],
  [/\/RichMedia\b/, "embedded media"],
  [/\/XFA\b/, "an XFA form"],
  [/\/Encrypt\b/, "password protection"],
];

/** PDF names can be written with #xx escapes (e.g. /J#61vaScript); undo that before searching. */
export function decodeNames(text: string): string {
  return text.replace(/\/[^\s/<>[\]()]+/g, (name) =>
    name.replace(/#([0-9a-fA-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16))),
  );
}

/** Bytes read as latin1 text, the way the server reads them. */
export function latin1(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return s;
}

export function risksIn(text: string): string[] {
  const decoded = decodeNames(text);
  return [...new Set(PDF_RISKS.filter(([re]) => re.test(decoded)).map(([, label]) => label))];
}
