import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { apiClient } from "../../lib/api-client";
import { SendIcon, SparklesIcon } from "../icons";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function ChatWindow() {
  const qc = useQueryClient();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hi! I can create, list, complete, and delete your tasks. Try: “Add a task to call the dentist tomorrow” or “What's on my list?”",
    },
  ]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, thinking]);

  const send = async () => {
    const text = input.trim();
    if (!text || thinking) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setThinking(true);
    try {
      // History lives server-side in LangGraph's checkpointer — send only the
      // new message.
      const { reply } = await apiClient.chat(text);
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
      // The agent may have changed tasks — refresh the tasks view.
      qc.invalidateQueries({ queryKey: ["tasks"] });
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: `Sorry, something went wrong: ${
            err instanceof Error ? err.message : "unknown error"
          }`,
        },
      ]);
    } finally {
      setThinking(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="flex h-[70vh] flex-col rounded-xl border border-slate-800 bg-slate-900/60">
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {m.role === "assistant" && (
              <span className="mr-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-indigo-500/40 bg-indigo-500/10">
                <SparklesIcon className="h-3.5 w-3.5 text-indigo-400" />
              </span>
            )}
            <div
              className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${
                m.role === "user"
                  ? "bg-gradient-to-r from-violet-600 to-blue-600 text-white"
                  : "bg-slate-800 text-slate-200"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="flex justify-start">
            <span className="mr-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-indigo-500/40 bg-indigo-500/10">
              <SparklesIcon className="h-3.5 w-3.5 text-indigo-400" />
            </span>
            <div className="max-w-[80%] rounded-2xl bg-slate-800 px-4 py-2 text-sm italic text-slate-500">
              Thinking…
            </div>
          </div>
        )}
      </div>
      <div className="flex gap-2 border-t border-slate-800 p-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask the agent to manage your tasks…"
          className="flex-1 rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-indigo-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
        />
        <button
          onClick={send}
          disabled={thinking || !input.trim()}
          className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-violet-600 to-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
        >
          <SendIcon className="h-4 w-4" />
          Send
        </button>
      </div>
    </div>
  );
}
