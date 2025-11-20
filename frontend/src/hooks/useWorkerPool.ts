import { useEffect, useRef, useState } from "react";
import type { WorkerMessage, WorkerResponse } from "../workers/pdf-worker";

interface WorkerTask {
  id: string;
  file: File;
  resolve: (result: CompressResult) => void;
  reject: (error: Error) => void;
}

export interface CompressResult {
  originalSize: number;
  compressedSize: number;
  data: Uint8Array;
}

export function useWorkerPool(poolSize?: number) {
  const [isReady, setIsReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const workersRef = useRef<Worker[]>([]);
  const taskQueueRef = useRef<WorkerTask[]>([]);
  const activeTasksRef = useRef<Map<string, WorkerTask>>(new Map());
  const workerBusyRef = useRef<Set<number>>(new Set());

  const size = poolSize || Math.max(1, navigator.hardwareConcurrency - 1);

  useEffect(() => {
    // 初始化 Worker 池
    const workers: Worker[] = [];
    let initializedCount = 0;

    for (let i = 0; i < size; i++) {
      const worker = new Worker(
        new URL("../workers/pdf-worker.ts", import.meta.url),
        { type: "module" },
      );

      worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        handleWorkerMessage(e.data, i);
      };

      worker.onerror = (error) => {
        console.error(`Worker ${i} error:`, error);
      };

      workers.push(worker);

      // 初始化 WASM
      worker.postMessage({
        type: "init",
        id: `init-${i}`,
      } as WorkerMessage);
    }

    workersRef.current = workers;

    function handleWorkerMessage(
      response: WorkerResponse,
      workerIndex: number,
    ) {
      if (response.type === "init-success") {
        initializedCount++;
        if (initializedCount === size) {
          setIsReady(true);
        }
        return;
      }

      const task = activeTasksRef.current.get(response.id);
      if (!task) return;

      if (response.type === "success" && response.data) {
        task.resolve({
          originalSize: response.originalSize!,
          compressedSize: response.compressedSize!,
          data: response.data,
        });
        activeTasksRef.current.delete(response.id);
        workerBusyRef.current.delete(workerIndex);
        processNextTask();
      } else if (response.type === "error") {
        task.reject(new Error(response.error || "Unknown error"));
        activeTasksRef.current.delete(response.id);
        workerBusyRef.current.delete(workerIndex);
        processNextTask();
      }
    }

    function processNextTask() {
      if (taskQueueRef.current.length === 0) {
        if (activeTasksRef.current.size === 0) {
          setIsProcessing(false);
        }
        return;
      }

      // 找到空闲的 Worker
      const workerIndex = workers.findIndex(
        (_, i) => !workerBusyRef.current.has(i),
      );
      if (workerIndex === -1) return;

      const task = taskQueueRef.current.shift();
      if (!task) return;

      workerBusyRef.current.add(workerIndex);
      activeTasksRef.current.set(task.id, task);

      task.file.arrayBuffer().then((buffer) => {
        const data = new Uint8Array(buffer);
        workers[workerIndex].postMessage(
          {
            type: "compress",
            id: task.id,
            data: data,
            filename: task.file.name,
          } as WorkerMessage,
          [data.buffer], // 转移所有权，避免复制
        );
      });
    }

    // 清理函数
    return () => {
      workers.forEach((worker) => worker.terminate());
    };
  }, [size]);

  const compressFile = (file: File): Promise<CompressResult> => {
    return new Promise((resolve, reject) => {
      const id = `${file.name}-${Date.now()}-${Math.random()}`;
      const task: WorkerTask = { id, file, resolve, reject };

      taskQueueRef.current.push(task);
      setIsProcessing(true);

      // 尝试立即处理
      const workerIndex = workersRef.current.findIndex(
        (_, i) => !workerBusyRef.current.has(i),
      );

      if (workerIndex !== -1 && isReady) {
        const nextTask = taskQueueRef.current.shift();
        if (nextTask) {
          workerBusyRef.current.add(workerIndex);
          activeTasksRef.current.set(nextTask.id, nextTask);

          nextTask.file.arrayBuffer().then((buffer) => {
            const data = new Uint8Array(buffer);
            workersRef.current[workerIndex].postMessage(
              {
                type: "compress",
                id: nextTask.id,
                data: data,
                filename: nextTask.file.name,
              } as WorkerMessage,
              [data.buffer],
            );
          });
        }
      }
    });
  };

  return {
    isReady,
    isProcessing,
    compressFile,
    poolSize: size,
  };
}
