import { PdfClient, PdfClientOptions, PdfConvertOptions, PdfJobResponse } from './pdf-client';
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import os from 'os';
import axios from 'axios'; // Import axios for inspection
import { mockAxiosCreate, mockAxiosPost, mockAxiosGet, mockAxiosIsAxiosError, mockAxiosTopLevelGet } from './__mocks__/axios';

// Declare mock functions for form-data at the top level
const mockAppend = jest.fn();
const mockGetHeaders = jest.fn(() => ({ 'content-type': 'multipart/form-data' }));

// Manually mock form-data
jest.mock('form-data', () => {
  class MockFormData {
    append: jest.Mock;
    getHeaders: jest.Mock;

    constructor() {
      this.append = mockAppend;
      this.getHeaders = mockGetHeaders;
    }
  }

  // @ts-ignore - Override global FormData for tests
  global.FormData = MockFormData;

  return MockFormData;
});

jest.mock('fs', () => ({
  promises: {
    writeFile: jest.fn(),
    unlink: jest.fn(),
  },
  createReadStream: jest.fn(),
  createWriteStream: jest.fn(),
}));
jest.mock('path');
jest.mock('os', () => ({
  ...jest.requireActual('os'),
  tmpdir: jest.fn(),
  availableParallelism: jest.fn(() => 2),
}));
jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomBytes: jest.fn(() => Buffer.from('mockrandombytes12345')),
  createHmac: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  digest: jest.fn(() => 'mock-digest'),
}));

describe('PdfClient', () => {
  let client: PdfClient;
  const apiKey = 'test-api-key';
  const baseURL = 'https://api.html2pdfconverter.com';
  const webhookSecret = 'test-webhook-secret';

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mock implementations for axios
    mockAxiosCreate.mockClear();
    mockAxiosPost.mockClear();
    mockAxiosGet.mockClear();
    mockAxiosIsAxiosError.mockClear();
    mockAxiosTopLevelGet.mockClear();

    mockAxiosIsAxiosError.mockImplementation((error: any) => error && error.isAxiosError);

    // Reset mock implementations for FormData
    // The FormDataMock is the mocked class, not a Jest mock function itself.
    // We need to clear the internal mock functions instead.
    mockAppend.mockClear();
    mockGetHeaders.mockClear();
      
    client = new PdfClient({ apiKey, baseURL, webhookSecret });

  });

  it('should be defined', () => {
    expect(PdfClient).toBeDefined();
  });

  describe('convert', () => {
    it('should convert html to pdf via temporary file and form data when no webhookUrl is provided', async () => {
      const htmlContent = '<h1>Test HTML</h1>';
      const pdfBuffer = Buffer.from('PDF_DATA');
      const jobId = 'test-job-id';
      const tempFileName = 'temp-test.html';
      const tempFilePath = `/tmp/${tempFileName}`;

      // Mock dependencies
      (os.tmpdir as jest.Mock).mockReturnValue('/tmp');
      (path.join as jest.Mock).mockReturnValue(tempFilePath);
      (fs.promises.writeFile as jest.Mock).mockResolvedValue(undefined);
      (fs.createReadStream as jest.Mock).mockReturnValue('mock-read-stream');

      mockAxiosPost.mockResolvedValueOnce({
        data: { jobId, status: 'in_progress' },
      });
      mockAxiosGet.mockResolvedValueOnce({
        data: { jobId, status: 'completed', downloadUrl: 'http://example.com/download/get-job-pdf' },
      });
      mockAxiosTopLevelGet.mockResolvedValueOnce({
        data: pdfBuffer.buffer,
        headers: { 'content-type': 'application/pdf' },
        request: { responseURL: 'http://example.com/download/get-job-pdf' },
      });

      const options: PdfConvertOptions = {
        html: htmlContent,
        pdfOptions: { format: 'A4' },
      };

      const result = await client.convert(options);

      expect(os.tmpdir).toHaveBeenCalledTimes(1);
      expect(path.join).toHaveBeenCalledWith('/tmp', expect.stringContaining('.html'));
      expect(fs.promises.writeFile).toHaveBeenCalledWith(tempFilePath, htmlContent, 'utf8');
      expect(fs.createReadStream).toHaveBeenCalledWith(tempFilePath);
      expect(mockAppend).toHaveBeenCalledWith('file', 'mock-read-stream');
      expect(mockAppend).toHaveBeenCalledWith('options', JSON.stringify(options.pdfOptions));
      expect(mockAxiosPost).toHaveBeenCalledWith(
        `${baseURL}/convert`,
        expect.any(FormData),
        expect.objectContaining({
          headers: { 'content-type': 'multipart/form-data' },
          maxBodyLength: Infinity,
        })
      );
      expect(mockAxiosGet).toHaveBeenCalledWith(`${baseURL}/jobs/${jobId}`);
      expect(mockAxiosTopLevelGet).toHaveBeenCalledWith('http://example.com/download/get-job-pdf', expect.objectContaining({ responseType: 'arraybuffer' }));
      expect(fs.promises.unlink).toHaveBeenCalledWith(tempFilePath);
      expect(result).toEqual(Buffer.from(pdfBuffer.buffer));
    });

    it('should convert url to pdf via JSON payload when no webhookUrl is provided', async () => {
      const url = 'http://example.com/test';
      const pdfBuffer = Buffer.from('PDF_DATA');
      const jobId = 'test-job-id-url';

      mockAxiosPost.mockResolvedValueOnce({
        data: { jobId, status: 'in_progress' },
      });
      mockAxiosGet.mockResolvedValueOnce({
        data: { jobId, status: 'completed', downloadUrl: 'http://example.com/download/pdf-url' },
      });
      mockAxiosTopLevelGet.mockResolvedValueOnce({
        data: pdfBuffer.buffer,
        headers: { 'content-type': 'application/pdf' },
        request: { responseURL: 'http://example.com/download/pdf-url' },
      });

      const options: PdfConvertOptions = {
        url: url,
        pdfOptions: { format: 'Letter' },
      };

      const result = await client.convert(options);

      expect(mockAxiosPost).toHaveBeenCalledWith(
        `${baseURL}/convert`,
        { url, options: options.pdfOptions, webhookUrl: undefined },
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json' },
        })
      );
      expect(mockAxiosGet).toHaveBeenCalledWith(`${baseURL}/jobs/${jobId}`);
      expect(mockAxiosTopLevelGet).toHaveBeenCalledWith('http://example.com/download/pdf-url', expect.objectContaining({ responseType: 'arraybuffer' }));
      expect(result).toEqual(Buffer.from(pdfBuffer.buffer));
    });

    it('should convert filePath to pdf via form data when no webhookUrl is provided', async () => {
      const filePath = './test-file.html';
      const pdfBuffer = Buffer.from('PDF_DATA_FILE');
      const jobId = 'test-job-id-file';

      // Mock dependencies
      (fs.createReadStream as jest.Mock).mockReturnValue('mock-read-stream-file');
      mockAxiosPost.mockResolvedValueOnce({
        data: { jobId, status: 'in_progress' },
      });
      mockAxiosGet.mockResolvedValueOnce({
        data: { jobId, status: 'completed', downloadUrl: 'http://example.com/download/pdf-file' },
      });
      mockAxiosTopLevelGet.mockResolvedValueOnce({
        data: pdfBuffer.buffer,
        headers: { 'content-type': 'application/pdf' },
        request: { responseURL: 'http://example.com/download/pdf-file' },
      });

      const options: PdfConvertOptions = {
        filePath: filePath,
        pdfOptions: { format: 'A3' },
      };

      const result = await client.convert(options);

      expect(fs.createReadStream).toHaveBeenCalledWith(filePath);
      expect(mockAppend).toHaveBeenCalledWith('file', 'mock-read-stream-file');
      expect(mockAppend).toHaveBeenCalledWith('options', JSON.stringify(options.pdfOptions));
      expect(mockAxiosPost).toHaveBeenCalledWith(
        `${baseURL}/convert`,
        expect.any(FormData),
        expect.objectContaining({
          headers: { 'content-type': 'multipart/form-data' },
          maxBodyLength: Infinity,
        })
      );
      expect(mockAxiosGet).toHaveBeenCalledWith(`${baseURL}/jobs/${jobId}`);
      expect(mockAxiosTopLevelGet).toHaveBeenCalledWith('http://example.com/download/pdf-file', expect.objectContaining({ responseType: 'arraybuffer' }));
      expect(result).toEqual(Buffer.from(pdfBuffer.buffer));
    });

    it('should return jobId when webhookUrl is provided', async () => {
      const htmlContent = '<h1>Test HTML with Webhook</h1>';
      const webhookUrl = 'https://example.com/webhook';
      const jobId = 'webhook-job-id';
      const tempFileName = 'temp-webhook.html';
      const tempFilePath = `/tmp/${tempFileName}`;

      // Mock dependencies
      (os.tmpdir as jest.Mock).mockReturnValue('/tmp');
      (path.join as jest.Mock).mockReturnValue(tempFilePath);
      (fs.promises.writeFile as jest.Mock).mockResolvedValue(undefined);
      (fs.createReadStream as jest.Mock).mockReturnValue('mock-read-stream-webhook');
      mockAxiosPost.mockResolvedValueOnce({
        data: { jobId, status: 'in_progress' },
      });

      const options: PdfConvertOptions = {
        html: htmlContent,
        webhookUrl: webhookUrl,
        pdfOptions: { format: 'A4' },
      };

      const result = await client.convert(options);

      expect(os.tmpdir).toHaveBeenCalledTimes(1);
      expect(path.join).toHaveBeenCalledWith('/tmp', expect.stringContaining('.html'));
      expect(fs.promises.writeFile).toHaveBeenCalledWith(tempFilePath, htmlContent, 'utf8');
      expect(fs.createReadStream).toHaveBeenCalledWith(tempFilePath);
      expect(mockAppend).toHaveBeenCalledWith('file', 'mock-read-stream-webhook');
      expect(mockAppend).toHaveBeenCalledWith('options', JSON.stringify(options.pdfOptions));
      expect(mockAppend).toHaveBeenCalledWith('webhookUrl', webhookUrl);
      expect(mockAxiosPost).toHaveBeenCalledWith(
        `${baseURL}/convert`,
        expect.any(FormData),
        expect.objectContaining({
          headers: { 'content-type': 'multipart/form-data' },
          maxBodyLength: Infinity,
        })
      );
      expect(fs.promises.unlink).toHaveBeenCalledWith(tempFilePath);
      expect(result).toEqual(jobId);
    });
  });

  describe('getJob', () => {
    it('should poll for job status and download PDF as a buffer', async () => {
      const jobId = 'get-job-id';
      const pdfBuffer = Buffer.from('GET_JOB_PDF_DATA');

      mockAxiosGet.mockResolvedValueOnce({
        data: { jobId, status: 'in_progress' },
      });
      mockAxiosGet.mockResolvedValueOnce({
        data: { jobId, status: 'processing' },
      });
      mockAxiosGet.mockResolvedValueOnce({
        data: { jobId, status: 'completed', downloadUrl: 'http://example.com/download/get-job-pdf' },
      });
      mockAxiosTopLevelGet.mockResolvedValueOnce({
        data: pdfBuffer.buffer,
        headers: { 'content-type': 'application/pdf' },
        request: { responseURL: 'http://example.com/download/get-job-pdf' },
      });

      const result = await client.getJob(jobId);

      expect(mockAxiosGet).toHaveBeenCalledWith(`${baseURL}/jobs/${jobId}`); // Polling calls
      expect(mockAxiosTopLevelGet).toHaveBeenCalledWith('http://example.com/download/get-job-pdf', expect.objectContaining({ responseType: 'arraybuffer' })); // Download call
      expect(result).toEqual(Buffer.from(pdfBuffer.buffer));
    });

    it('should poll for job status and save PDF to a file when saveTo is provided', async () => {
      const jobId = 'get-job-id-save';
      const saveToPath = './downloaded.pdf';

      const mockWriteStream: { on: jest.Mock; pipe: jest.Mock } = {
        on: jest.fn((event: string, callback: () => void) => {
          if (event === 'finish') {
            callback();
          }
        }),
        pipe: jest.fn((stream: any) => {
          // Simulate piping by calling the stream's finish event handler
          setTimeout(() => mockWriteStream.on.mock.calls.forEach(call => {
            if (call[0] === 'finish') call[1]();
          }), 0);
          return mockWriteStream; // Return the mockWriteStream itself for chaining
        }),
      };

      (fs.createWriteStream as jest.Mock).mockReturnValue(mockWriteStream);
      mockAxiosGet.mockResolvedValueOnce({
        data: { jobId, status: 'in_progress' },
      });
      mockAxiosGet.mockResolvedValueOnce({
        data: { jobId, status: 'processing' },
      });
      mockAxiosGet.mockResolvedValueOnce({
        data: { jobId, status: 'completed', downloadUrl: 'http://example.com/download/get-job-save' },
      });
      mockAxiosTopLevelGet.mockResolvedValueOnce({ data: { pipe: mockWriteStream.pipe } }); // Mock the stream response

      const result = await client.getJob(jobId, { saveTo: saveToPath });

      expect(mockAxiosGet).toHaveBeenCalledWith(`${baseURL}/jobs/${jobId}`);
      expect(mockAxiosTopLevelGet).toHaveBeenCalledWith('http://example.com/download/get-job-save', expect.objectContaining({ responseType: 'stream' }));
      expect(fs.createWriteStream).toHaveBeenCalledWith(saveToPath);
      expect(mockWriteStream.pipe).toHaveBeenCalledTimes(1);
      expect(result).toEqual(saveToPath);
    });
  });

  describe('verifyWebhook', () => {
    const rawBody = JSON.stringify({ status: 'completed', jobId: 'webhook-test-job' });

    it('should verify a valid webhook signature', () => {
      const expectedSig = 'sha256=' + require('crypto').createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
      const result = client.verifyWebhook(rawBody, expectedSig);

      expect(result).toEqual(JSON.parse(rawBody));
    });

    it('should throw an error for an invalid webhook signature', () => {
      const invalidSig = 'sha256=invalid-signature';

      expect(() => client.verifyWebhook(rawBody, invalidSig)).toThrow('Invalid webhook signature');
    });

    it('should throw an error if webhookSecret is missing', () => {
      const clientWithoutSecret = new PdfClient({ apiKey: apiKey, baseURL: baseURL });
      const expectedSig = 'sha256=' + require('crypto').createHmac('sha256', '' ).update(rawBody).digest('hex'); // Using an empty string for secret

      expect(() => clientWithoutSecret.verifyWebhook(rawBody, expectedSig)).toThrow('Missing webhookSecret in PdfClient constructor');
    });

    it('should throw an error for invalid JSON in webhook payload', () => {
      const badJsonBody = 'not-json';
      const expectedSig = 'sha256=' + require('crypto').createHmac('sha256', webhookSecret).update(badJsonBody).digest('hex');

      expect(() => client.verifyWebhook(badJsonBody, expectedSig)).toThrow('Invalid JSON in webhook payload');
    });
  });

  describe('error handling', () => {
    it('should throw a custom error message for axios failures in convert (file upload)', async () => {
      const htmlContent = '<h1>Error Test</h1>';
      const tempFilePath = '/tmp/temp-error.html';
      const errorMessage = 'Network Error';

      // Mock dependencies
      (os.tmpdir as jest.Mock).mockReturnValue('/tmp');
      (path.join as jest.Mock).mockReturnValue(tempFilePath);
      (fs.promises.writeFile as jest.Mock).mockResolvedValue(undefined);
      (fs.createReadStream as jest.Mock).mockReturnValue('mock-read-stream-error');

      mockAxiosPost.mockRejectedValueOnce({ isAxiosError: true, message: errorMessage, response: { status: 500, data: { message: errorMessage } } });

      const options: PdfConvertOptions = { html: htmlContent };

      await expect(client.convert(options)).rejects.toThrow(`PDF conversion failed (status: 500): ${errorMessage}`);
      expect(fs.promises.unlink).toHaveBeenCalledWith(tempFilePath);
    });

    it('should throw a custom error message for axios failures in convert (json payload)', async () => {
      const url = 'http://example.com/error';
      const errorMessage = 'Request failed with status code 400';

      mockAxiosPost.mockRejectedValueOnce({ isAxiosError: true, message: errorMessage, response: { status: 400, data: { message: 'Bad Request' } } });

      const options: PdfConvertOptions = { url: url };

      await expect(client.convert(options)).rejects.toThrow(`PDF conversion failed (status: 400): Bad Request`);
    });

    it('should throw a custom error message for axios failures in getJob', async () => {
      jest.useRealTimers(); // Ensure real timers are used for this specific test

      const jobId = 'error-job-id';
      const errorMessage = 'Network Error on getJob';

      // Mock axios.get to reject immediately on the first call
      mockAxiosGet.mockRejectedValueOnce({
        isAxiosError: true,
        message: errorMessage,
        response: { status: 502, data: { message: errorMessage } },
      });

      await expect(client.getJob(jobId)).rejects.toThrow(errorMessage);
    });

    it('should throw a timeout error if job does not complete within timeoutMs', async () => {
      jest.useFakeTimers();

      const jobId = 'timeout-job';
      const timeoutMs = 10000; // 10 seconds

      mockAxiosGet.mockResolvedValue({ data: { jobId, status: 'in_progress' } });

      const promise = client.getJob(jobId, { timeoutMs });

      jest.advanceTimersByTime(timeoutMs + 1); // Advance past the timeout

      await expect(promise).rejects.toThrow(`PDF conversion timed out after ${timeoutMs / 1000} seconds waiting for completion`);

      jest.useRealTimers();
    });
  });
});
