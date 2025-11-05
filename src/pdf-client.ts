import axios, { AxiosInstance, AxiosError } from "axios";
import FormData from "form-data";
import fs from "fs";
import crypto from "crypto";
import path from "path";
import os from "os";

export interface PdfClientOptions {
  apiKey: string;
  baseURL?: string;
  webhookSecret?: string;
}

export interface PdfConvertOptions {
  html?: string;
  url?: string;
  filePath?: string;
  pdfOptions?: Record<string, any>;
  webhookUrl?: string;
  pollIntervalMs?: number;
  timeoutMs?: number;
  saveTo?: string; // optional path to save file directly
}

export interface PdfJobResponse {
  jobId: string;
  status: "in_progress" | "queued" | "processing" | "completed" | "failed";
  downloadUrl?: string;
  errorMessage?: string;
}

export class PdfClient {
  private client: AxiosInstance;
  private apiKey: string;
  private webhookSecret?: string;

  constructor({ apiKey, baseURL, webhookSecret }: PdfClientOptions) {
    if (!apiKey) throw new Error("Missing apiKey");
    this.apiKey = apiKey;
    this.webhookSecret = webhookSecret;

    this.client = axios.create({
      baseURL: baseURL || "https://api.html2pdfconverter.com",
      headers: { "x-api-key": apiKey },
    });
  }

  /** Convert HTML/URL/File → PDF */
  async convert(options: PdfConvertOptions): Promise<string | Buffer | string> {
    const {
      html,
      url,
      filePath,
      pdfOptions = {},
      pollIntervalMs = 2000,
      timeoutMs = 300000,
      saveTo,
      webhookUrl,
    } = options;

    if (!html && !url && !filePath)
      throw new Error("You must provide html, url, or filePath");

    // --- 1️⃣ Create job ---
    let jobId: string;
    if (filePath || html) {
      let fileToSendPath = filePath;
      let cleanupTempFile = false;

      if (html) {
        // Create a temporary file for the HTML content
        const tempFileName = `temp-${crypto.randomBytes(16).toString("hex")}.html`;
        fileToSendPath = path.join(os.tmpdir(), tempFileName);
        await fs.promises.writeFile(fileToSendPath, html, "utf8");
        cleanupTempFile = true;
      }

      if (!fileToSendPath) {
        throw new Error("No file path to send for conversion.");
      }

      const form = new FormData();
      form.append("file", fs.createReadStream(fileToSendPath));
      form.append("options", JSON.stringify(pdfOptions));
      if (webhookUrl) form.append("webhookUrl", webhookUrl);

      try {
        const res = await this.client.post<PdfJobResponse>("/convert", form, {
          headers: form.getHeaders(),
          maxBodyLength: Infinity,
        });
        jobId = res.data.jobId;
      } catch (error: any) {
        if (axios.isAxiosError(error)) {
          const status = error.response?.status;
          const message = error.response?.data?.message || error.message;
          throw new Error(`PDF conversion failed (status: ${status}): ${message}`);
        } else {
          throw error;
        }
      } finally {
        if (cleanupTempFile && fileToSendPath) {
          await fs.promises.unlink(fileToSendPath);
        }
      }
    } else {
      try {
        const res = await this.client.post<PdfJobResponse>(
          "/convert",
          { url, options: pdfOptions, webhookUrl },
          { headers: { "Content-Type": "application/json" } }
        );
        jobId = res.data.jobId;
      } catch (error: any) {
        if (axios.isAxiosError(error)) {
          const status = error.response?.status;
          const message = error.response?.data?.message || error.message;
          throw new Error(`PDF conversion failed (status: ${status}): ${message}`);
        } else {
          throw error;
        }
      }
    }

    if (!jobId) throw new Error("Failed to create conversion job");

    if (webhookUrl) {
      return jobId;
    }
    
    // --- 2️⃣ Poll until done ---
    return this.getJob(jobId, { pollIntervalMs, timeoutMs, saveTo });
  }

  /** Retrieve job status and download PDF */
  async getJob(jobId: string, options?: { pollIntervalMs?: number; timeoutMs?: number; saveTo?: string }): Promise<Buffer | string> {
    const { pollIntervalMs = 2000, timeoutMs = 900000, saveTo } = options || {};
    const start = Date.now();

    while (true) {
      const { data: job } = await this.client.get<PdfJobResponse>(`/jobs/${jobId}`);

      if (job.status === "completed" && job.downloadUrl) {
        if (saveTo) {
          const writer = fs.createWriteStream(saveTo);
          const response = await axios.get(job.downloadUrl, {
            responseType: "stream",
          });
          await new Promise<void>((resolve, reject) => {
            response.data.pipe(writer);
            writer.on("finish", resolve);
            writer.on("error", reject);
          });
          return saveTo;
        } else {
          const response = await axios.get<ArrayBuffer>(job.downloadUrl, {
            responseType: "arraybuffer",
          });
          return Buffer.from(response.data);
        }
      }

      if (job.status === "failed") {
        throw new Error(`PDF conversion failed: ${job.errorMessage || "Unknown error"}`);
      }

      if (Date.now() - start > timeoutMs) {
        throw new Error(`PDF conversion timed out after ${timeoutMs / 1000} seconds waiting for completion`);
      }

      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
  }

  /** Verify webhook authenticity */
  verifyWebhook(rawBody: Buffer | string, signature: string): any {
    if (!this.webhookSecret)
      throw new Error("Missing webhookSecret in PdfClient constructor");

    const expectedSig =
      "sha256=" +
      crypto
        .createHmac("sha256", this.webhookSecret)
        .update(rawBody)
        .digest("hex");

    if (expectedSig !== signature)
      throw new Error("Invalid webhook signature");

    try {
      return typeof rawBody === "string"
        ? JSON.parse(rawBody)
        : JSON.parse(rawBody.toString());
    } catch {
      throw new Error("Invalid JSON in webhook payload");
    }
  }
}
