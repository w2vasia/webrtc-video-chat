import { createSignal, For } from "solid-js";

interface Toast {
  id: number;
  message: string;
  type: "info" | "error" | "success";
}

const [toasts, setToasts] = createSignal<Toast[]>([]);
let nextId = 0;

export function showToast(message: string, type: Toast["type"] = "info", duration = 3000) {
  const id = nextId++;
  setToasts((prev) => [...prev.slice(-2), { id, message, type }]);
  setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), duration);
}

export function ToastContainer() {
  return (
    <div class="fixed bottom-6 right-6 flex flex-col gap-2 z-[1000]">
      <For each={toasts()}>
        {(t) => (
          <div class={`px-4 py-2.5 rounded-[10px] bg-white shadow-md text-sm min-w-[220px] animate-toast-in ${t.type === "error" ? "border-l-[3px] border-l-danger" : t.type === "success" ? "border-l-[3px] border-l-success" : ""}`}>
            {t.message}
          </div>
        )}
      </For>
    </div>
  );
}
