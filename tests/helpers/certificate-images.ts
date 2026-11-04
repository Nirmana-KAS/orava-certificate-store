import type { Browser } from "@playwright/test";

// Makes certificate scans for the tests by drawing made-up reports in the browser and taking a
// picture at about 300 dpi. No real certificate or customer data is used.

const A4 = { width: 1240, height: 1754 };

const page = (body: string, css = "") => `<!doctype html><html><head><style>
  * { box-sizing: border-box; margin: 0; }
  body { background: #fff; color: #111; font-family: Arial, Helvetica, sans-serif; }
  ${css}
</style></head><body>${body}</body></html>`;

/** An "AIGS Analysis Short Report": letterhead, title and a two-column table with borders. */
export function aigsShortReport(v: { reportNo: string; customer: string; stone: string }) {
  const rows: [string, string][] = [
    ["Report No", v.reportNo],
    ["Customer", v.customer],
    ["Reference", "LAB000123"],
    ["Date of Submission", "5 May 2026"],
    ["Description", "1 lot of gemstones, unset"],
    ["Total weight", "12.40 cts."],
    ["Shape and cut", "Fancy, Faceted"],
    ["Quantity (pieces)", "40 pieces"],
    ["Identification", `40 pieces : ${v.stone}`],
    ["Date of Issue", "9 May 2026"],
  ];
  return page(
    `<div class="sheet">
      <p class="logo">AIGS Lab Co Ltd</p>
      <p class="sub">Asian Institute of Gemological Sciences</p>
      <p class="title">ANALYSIS SHORT REPORT: Identification Check</p>
      <table>${rows.map(([l, x]) => `<tr><th>${l}</th><td>${x}</td></tr>`).join("")}</table>
      <p class="note">*Unsigned and picture-less form</p>
    </div>`,
    `.sheet { width: ${A4.width}px; height: ${A4.height}px; padding: 90px 130px; }
     .logo { font-size: 56px; font-weight: 700; }
     .sub { font-size: 26px; margin-top: 8px; }
     .title { font-size: 22px; font-weight: 700; text-align: center; margin: 120px 0 50px; }
     table { width: 100%; border-collapse: collapse; font-size: 20px; }
     th, td { border: 2px solid #444; padding: 20px 14px; text-align: left; }
     th { width: 33%; }
     .note { margin-top: 40px; font-size: 18px; font-weight: 700; }`,
  );
}

/** A "Bellerophon Gemmological Report": dotted leaders, scanned sideways like a folded booklet. */
export function bellerophonReport(v: { reportNo: string; stone: string }) {
  const rows: [string, string][] = [
    ["Description", "One loose gemstone"],
    ["Weight", "1.050 ct"],
    ["Measurements", "7.20 x 5.10 x 3.30 mm"],
    ["Cut &amp; Shape", "Faceted Cushion"],
    ["Identification", v.stone],
    ["Color", "Vivid Pink"],
    ["Clarity", "Transparent"],
    ["Comment", "No indications of heating"],
    ["Provenance", "Burma (Myanmar)"],
  ];
  const dots = ".".repeat(400);
  return page(
    `<div class="turn"><div class="half">
      <p class="logo">Bellerophon</p>
      <div class="head"><span>GEMMOLOGICAL REPORT | RAPPORT GEMMOLOGIQUE</span><span>REPORT No. &nbsp; ${v.reportNo}</span></div>
      <p class="date">March 3, 2026</p>
      ${rows.map(([l, x]) => `<p class="row"><span>${l}</span><span class="dots">${dots}</span><span>${x}</span></p>`).join("")}
    </div></div>`,
    `.turn { width: ${A4.height}px; height: ${A4.width}px; transform-origin: 0 0;
             transform: translateX(${A4.width}px) rotate(90deg); }
     .half { width: 50%; padding: 70px 60px; }
     .logo { font-size: 54px; text-align: center; margin-bottom: 40px; }
     .head { display: flex; justify-content: space-between; font-size: 17px; color: #555; }
     .date { text-align: right; font-size: 17px; margin-bottom: 50px; }
     .row { display: flex; gap: 10px; font-size: 21px; margin: 20px 0; white-space: nowrap; }
     .dots { flex: 1; overflow: hidden; letter-spacing: 3px; color: #333; }`,
  );
}

/** A page with no certificate on it. */
export const notACertificate = () =>
  page(
    `<div style="padding: 150px; font-size: 40px;">Shopping list<br>Milk<br>Bread<br>Coffee beans</div>`,
  );

export async function scan(browser: Browser, html: string): Promise<Buffer> {
  const context = await browser.newContext({ viewport: A4, deviceScaleFactor: 2 });
  try {
    const p = await context.newPage();
    await p.setContent(html);
    return await p.screenshot({ type: "png" });
  } finally {
    await context.close();
  }
}
