import { ChatWindow } from "../components/chat/ChatWindow";

export function Chat() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <h1 className="text-3xl font-bold tracking-tight text-white">
        Chat with your AI agent
      </h1>
      <ChatWindow />
    </div>
  );
}
