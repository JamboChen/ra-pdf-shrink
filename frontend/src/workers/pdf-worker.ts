import init, { shrink_pdf } from "../../pkg/ra_pdf.js";

let wasmInitialized = false;

export interface WorkerMessage {
  type: "init" | "compress";
  id: string;
  data?: Uint8Array;
  filename?: string;
}

export interface WorkerResponse {
  type: "init-success" | "init-error" | "progress" | "success" | "error";
  id: string;
  data?: Uint8Array;
  originalSize?: number;
  compressedSize?: number;
  error?: string;
}

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const { type, id, data } = e.data;

  try {
    if (type === "init") {
      if (!wasmInitialized) {
        await init();
        wasmInitialized = true;
      }
      self.postMessage({
        type: "init-success",
        id,
      } as WorkerResponse);
    } else if (type === "compress") {
      if (!wasmInitialized) {
        throw new Error("WASM not initialized");
      }

      if (!data) {
        throw new Error("No data provided");
      }

      // 发送处理中状态
      self.postMessage({
        type: "progress",
        id,
      } as WorkerResponse);

      const inputBytes = new Uint8Array(data);
      const outputBytes = shrink_pdf(inputBytes);

      self.postMessage({
        type: "success",
        id,
        data: outputBytes,
        originalSize: inputBytes.length,
        compressedSize: outputBytes.length,
      } as WorkerResponse);
    }
  } catch (error) {
    self.postMessage({
      type: "error",
      id,
      error: error instanceof Error ? error.message : String(error),
    } as WorkerResponse);
  }
};
