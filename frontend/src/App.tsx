import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWorkerPool } from "./hooks/useWorkerPool";

interface FileStatus {
  name: string;
  status: "pending" | "processing" | "completed" | "error";
  originalSize?: number;
  compressedSize?: number;
  error?: string;
}

export default function App() {
  const { isReady, isProcessing, compressFile, poolSize } = useWorkerPool();
  const [files, setFiles] = useState<FileStatus[]>([]);
  const [message, setMessage] = useState("");

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const selectedFiles = event.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    const pdfFiles = Array.from(selectedFiles).filter(
      (file) => file.type === "application/pdf",
    );

    if (pdfFiles.length === 0) {
      setMessage("Please upload PDF files only");
      return;
    }

    // 初始化文件状态
    const fileStatuses: FileStatus[] = pdfFiles.map((file) => ({
      name: file.name,
      status: "pending",
    }));

    setFiles(fileStatuses);
    setMessage(
      `Processing ${pdfFiles.length} file(s) with ${poolSize} workers...`,
    );

    // 并行处理所有文件
    const results = await Promise.allSettled(
      pdfFiles.map(async (file, index) => {
        try {
          // 更新为处理中
          setFiles((prev) =>
            prev.map((f, i) =>
              i === index ? { ...f, status: "processing" as const } : f,
            ),
          );

          const result = await compressFile(file);

          // 更新为完成
          setFiles((prev) =>
            prev.map((f, i) =>
              i === index
                ? {
                    ...f,
                    status: "completed" as const,
                    originalSize: result.originalSize,
                    compressedSize: result.compressedSize,
                  }
                : f,
            ),
          );

          // 自动下载
          const buffer = result.data.buffer.slice(
            result.data.byteOffset,
            result.data.byteOffset + result.data.byteLength,
          ) as ArrayBuffer;
          const blob = new Blob([buffer], { type: "application/pdf" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `compressed_${file.name}`;
          a.click();
          URL.revokeObjectURL(url);

          return result;
        } catch (error) {
          setFiles((prev) =>
            prev.map((f, i) =>
              i === index
                ? {
                    ...f,
                    status: "error" as const,
                    error:
                      error instanceof Error ? error.message : String(error),
                  }
                : f,
            ),
          );
          throw error;
        }
      }),
    );

    const successCount = results.filter((r) => r.status === "fulfilled").length;
    setMessage(
      `Completed! ${successCount}/${pdfFiles.length} files processed successfully.`,
    );
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const getCompressionRatio = (original: number, compressed: number) => {
    return ((1 - compressed / original) * 100).toFixed(2);
  };

  const resetAll = () => {
    setFiles([]);
    setMessage("");
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <Card className="max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle>PDF Compressor</CardTitle>
          <p className="text-sm text-gray-500">
            {isReady
              ? `Ready with ${poolSize} worker threads`
              : "Initializing workers..."}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {message && <p className="text-sm text-gray-600">{message}</p>}

          <input
            type="file"
            accept="application/pdf"
            multiple
            onChange={handleFileUpload}
            disabled={!isReady || isProcessing}
            className="block w-full text-sm text-gray-500
              file:mr-4 file:py-2 file:px-4
              file:rounded-md file:border-0
              file:text-sm file:font-semibold
              file:bg-blue-50 file:text-blue-700
              hover:file:bg-blue-100
              disabled:opacity-50 disabled:cursor-not-allowed"
          />

          {files.length > 0 && (
            <div className="space-y-3 mt-6">
              <h3 className="font-semibold text-sm">Processing Status:</h3>
              {files.map((file, index) => (
                <div
                  key={index}
                  className="border rounded-lg p-4 bg-white shadow-sm"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm truncate flex-1">
                      {file.name}
                    </span>
                    <span
                      className={`text-xs px-2 py-1 rounded ml-2 ${
                        file.status === "completed"
                          ? "bg-green-100 text-green-700"
                          : file.status === "processing"
                            ? "bg-blue-100 text-blue-700 animate-pulse"
                            : file.status === "error"
                              ? "bg-red-100 text-red-700"
                              : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {file.status}
                    </span>
                  </div>

                  {file.status === "completed" &&
                    file.originalSize &&
                    file.compressedSize && (
                      <div className="text-xs text-gray-600 space-y-1">
                        <p>
                          Original: {formatBytes(file.originalSize)} →
                          Compressed: {formatBytes(file.compressedSize)}
                        </p>
                        <p className="text-green-600 font-semibold">
                          Reduction:{" "}
                          {getCompressionRatio(
                            file.originalSize,
                            file.compressedSize,
                          )}
                          %
                        </p>
                      </div>
                    )}

                  {file.status === "error" && file.error && (
                    <p className="text-xs text-red-600 mt-1">{file.error}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {files.length > 0 && (
            <Button
              onClick={resetAll}
              variant="outline"
              disabled={isProcessing}
              className="w-full"
            >
              Reset
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
