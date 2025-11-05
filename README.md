# 📄 HTML2PDFConverter SDK for Node.js

[![npm version](https://img.shields.io/npm/v/html2pdfconverter-sdk.svg?style=flat-square)](https://www.npmjs.com/package/html2pdfconverter-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js CI](https://img.shields.io/badge/Node.js-%3E%3D16-green)](https://nodejs.org/)
[![Downloads](https://img.shields.io/npm/dt/html2pdfconverter-sdk.svg?style=flat-square)](https://www.npmjs.com/package/html2pdfconverter-sdk)

> 🚀 Convert HTML, URLs, or uploaded `.html` files into high-quality PDFs effortlessly — powered by the [HTML2PDFConverter API](https://api.html2pdfconverter.com).

---

## 🧩 Overview

The **HTML2PDFConverter SDK** provides a simple, reliable interface for Node.js developers to integrate PDF conversion into their apps, scripts, and serverless functions.

With a single function call, you can:
- Convert HTML strings or public URLs into PDFs.
- Stream and upload large HTML files (up to 100MB).
- Automatically wait for the job to complete.
- Get the finished PDF as a `Buffer` or auto-save to disk.
- Optionally receive a `jobId` for asynchronous webhook processing.

---

## ⚙️ Installation

```bash
npm install html2pdfconverter-sdk
```
or with Yarn:

```bash
yarn add html2pdfconverter-sdk
```

## 🔑 Authentication

Every request must include your API key:

```bash
x-api-key: <YOUR_API_KEY>
```

## 🚀 Quick Start

Convert inline HTML directly to a PDF buffer and save it locally:

```ts
import { PdfClient } from "html2pdfconverter-sdk";
import fs from "fs";

const client = new PdfClient({
  apiKey: process.env.PDF_API_KEY!,
});

(async () => {
  const pdf = await client.convert({
    html: "<h1>Hello PDF!</h1>",
    pdfOptions: { format: "A4", printBackground: true },
  });

  fs.writeFileSync("output.pdf", pdf);
  console.log("✅ PDF saved as output.pdf");
})();
```

# 🧱 Usage Examples

## 🧱 Usage Examples

```ts
const pdf = await client.convert({
  url: "https://example.com/invoice",
  pdfOptions: { format: "A4" },
  saveTo: "invoice.pdf",
});
console.log("✅ Invoice downloaded");
```

## 2️⃣ Convert large HTML file via multipart upload

```ts
await client.convert({
  filePath: "./big-report.html",
  pdfOptions: { format: "A4", landscape: true },
  saveTo: "./report.pdf",
});
```

## 3️⃣ Asynchronous conversion with webhook

```ts
await client.convert({
  filePath: "./long.html",
  pdfOptions: { format: "A4" },
  webhookUrl: "https://yourapp.com/webhooks/pdf",
});
console.log("Job queued — will notify via webhook.");
```

## 4️⃣ Check job status manually

```ts
const pdf = await client.getJob("d7c3f1...");
fs.writeFileSync("downloaded.pdf", pdf);
console.log("✅ PDF downloaded via getJob");
```

## 5️⃣ Verify webhook authenticity

```ts
import express from "express";
import bodyParser from "body-parser";
import { PdfClient } from "html2pdfconverter-sdk";

const client = new PdfClient({
  apiKey: process.env.PDF_API_KEY!,
  webhookSecret: process.env.PDF_WEBHOOK_SECRET!,
});

const app = express();
app.post(
  "/webhooks/pdf",
  bodyParser.raw({ type: "application/json" }),
  (req, res) => {
    try {
      const signature = req.headers["x-pdf-service-signature"] as string;
      const event = client.verifyWebhook(req.body, signature);
      console.log("✅ Webhook verified:", event);
      res.sendStatus(200);
    } catch (err) {
      console.error("❌ Invalid signature:", err);
      res.sendStatus(401);
    }
  }
);
```

## 🧰 Options Reference

| Option           | Type     | Required | Description                                                   |
| ---------------- | -------- | -------- | ------------------------------------------------------------- |
| `html`           | `string` | ✖️       | Raw HTML string to convert                                    |
| `url`            | `string` | ✖️       | Publicly accessible webpage                                   |
| `filePath`       | `string` | ✖️       | Path to `.html` file (for large uploads)                      |
| `pdfOptions`     | `object` | ✖️       | Puppeteer-like PDF options (e.g. `format`, `margin`, etc.)    |
| `webhookUrl`     | `string` | ✖️       | Optional webhook for async notification                       |
| `pollIntervalMs` | `number` | ✖️       | How often to poll job status (default `2000`)                 |
| `timeoutMs`      | `number` | ✖️       | Max time to wait for completion (default `180000`)            |
| `saveTo`         | `string` | ✖️       | Save output PDF to path (returns file path instead of buffer) |


## 📦 Returned Object

### When `webhookUrl` is provided:
 - Returns `jobId: string`

### When conversion completes successfully (and `webhookUrl` is not provided):
 - If `saveTo` is not set → returns a `Buffer`.
 - If `saveTo` is set → returns the file path.
 - Throws on failure or timeout.

## 💬 Error Handling

The SDK throws clear, typed errors:

```ts
try {
  await client.convert({ html: "<bad>" });
} catch (err) {
  console.error("❌ Conversion failed:", err.message);
}
```

Common errors:
- Unauthorized: invalid API key
- File size exceeds plan limit
- Conversion timed out
- PDF conversion failed: Rendering error

## ⚡ Performance Tips

✅ Use multipart upload for HTML >5 MB
✅ Optimize images and fonts in HTML
✅ Prefer hosted URLs for heavy assets
✅ Use webhooks for long-running jobs
✅ Enable gzip compression on your client

## 📈 Plan Limits (per plan)

| Plan       | Max HTML Size | Max Timeout |
| ---------- | ------------- | ----------- |
| Free       | 5 MB          | 30 s        |
| Starter    | 10 MB         | 60 s        |
| Pro        | 25 MB         | 2 min       |
| Scale      | 50 MB         | 5 min       |
| Enterprise | 100 MB        | 5 min       |

## 🧩 TypeScript Support

This SDK is written in TypeScript and ships with full types.

```ts
import { PdfClient } from "html2pdfconverter-sdk";
```

## 🧑‍💻 Example CLI usage

You can even build a quick CLI:

```ts
npx html2pdfconverter-sdk convert ./file.html --save ./output.pdf
```

## 🧑‍🏫 FAQ
### Q: Can I convert local HTML files with images?
### Yes, but ensure images are accessible or embedded as base64.
### Q: How long are PDFs hosted?
### Files are available for a limited time via signed URLs (expires in 1 hour by default).
### Q: What about rate limits?
### Up to 100 requests per 15 minutes by default.
### Q: Can I use it in frontend apps?
### We recommend server-side usage since API keys must be kept secret.

## 🧾 License
MIT © [HTML2PDFConverter](https://api.html2pdfconverter.com).

## 🌟 Contribute

Issues and pull requests welcome at
👉 [https://github.com/html2pdfconverter/sdk](https://github.com/html2pdfconverter/sdk)