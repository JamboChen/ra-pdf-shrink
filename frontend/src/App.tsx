import React, { useState, useEffect } from "react";
import init, { shrink_pdf } from "../pkg/ra_pdf.js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function App() {
  const [message, setMessage] = useState("Initializing WASM...");
  const [wasmReady, setWasmReady] = useState(false);

  useEffect(() => {
    init()
      .then(() => {
        setWasmReady(true);
        setMessage("WASM ready! Upload a PDF to compress.");
      })
      .catch((err) => {
        console.error("WASM init failed:", err);
        setMessage("WASM initialization failed");
      });
  }, []);

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      setMessage("Please upload a PDF file");
      return;
    }

    setMessage("Processing...");

    try {
      const arrayBuffer = await file.arrayBuffer();
      const inputBytes = new Uint8Array(arrayBuffer);
      console.log("Input PDF size:", inputBytes.length);

      const outputBytes = shrink_pdf(inputBytes);
      console.log("Output PDF size:", outputBytes.length);

      const compressionRatio = (
        (1 - outputBytes.length / inputBytes.length) *
        100
      ).toFixed(2);

      setMessage(
        `Success! Original: ${inputBytes.length} bytes, Compressed: ${outputBytes.length} bytes (${compressionRatio}% reduction)`,
      );

      // 下载压缩后的 PDF
      const bytes = new Uint8Array(outputBytes);
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `compressed_${file.name}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setMessage(`Error: ${err}`);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>PDF Compressor (React + WASM)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileUpload}
            disabled={!wasmReady}
            className="block w-full text-sm text-gray-500
                       file:mr-4 file:py-2 file:px-4
                       file:rounded-full file:border-0
                       file:text-sm file:font-semibold
                       file:bg-blue-50 file:text-blue-700
                       hover:file:bg-blue-100"
          />

          <p className="text-gray-700">{message}</p>

          <Button
            onClick={() => setMessage("Upload a PDF to compress")}
            variant="outline"
          >
            Reset
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
