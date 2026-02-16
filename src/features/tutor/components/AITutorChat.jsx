import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { createSearchService } from "../../search/searchService";

function Send(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}

export default function AITutorChat({
  aiClient,
  model,
  examJSON,
  enableWebSearch = true,
  searchContextSize = "medium"
}) {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "How can I help with your exam today?",
      grounded: false,
      sources: []
    }
  ]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [popupContent, setPopupContent] = useState(null);
  const chatBottomRef = useRef(null);

  const searchService = useMemo(() => createSearchService(aiClient), [aiClient]);

  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;
    setIsSending(true);
    setError("");
    const userMsg = { role: "user", content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    try {
      let liveContext = "";
      let sources = [];
      let grounded = false;

      if (enableWebSearch) {
        try {
          const search = await searchService.searchWeb({
            model,
            query: input,
            searchContextSize
          });
          sources = search.sources || [];
          grounded = Boolean(search.grounded);
          if (search.answerText || sources.length) {
            const shortSources = sources
              .slice(0, 6)
              .map((s, idx) => `${idx + 1}. ${s.title || s.url} (${s.url})`)
              .join("\n");
            liveContext = `Live web summary:\n${search.answerText || ""}\n\nSources:\n${shortSources}`;
          }
        } catch {
          grounded = false;
        }
      }

      const prompt = [
        {
          role: "system",
          content:
            "You are an AI tutor for students taking an exam. " +
            "Provide helpful concise explanations and guidance about exam concepts, structure, and strategies. " +
            "Do NOT give away answers to specific exam questions. " +
            "If asked about a specific question, explain approach and concepts only. " +
            "If live web context is provided, use it and mention uncertainty when needed."
        },
        {
          role: "system",
          content:
            "Exam context: " +
            (examJSON?.title ? `Title: ${examJSON.title}. ` : "") +
            `Sections: ${Object.keys(examJSON || {})
              .filter((k) => Array.isArray(examJSON[k]) && examJSON[k].length > 0)
              .join(", ")}.`
        },
        ...(liveContext ? [{ role: "system", content: liveContext }] : []),
        ...messages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
        userMsg
      ];

      const data = await aiClient.chatCompletions({
        model,
        messages: prompt,
        temperature: 0.3,
        max_tokens: 256
      });

      const response = data?.choices?.[0]?.message?.content?.trim() ||
        "I couldn't generate a response.";

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: grounded ? response : `${response}\n\nNote: live web grounding unavailable for this reply.`,
          grounded,
          sources
        }
      ]);
    } catch (e) {
      setError(e?.message || "Failed to get response from AI tutor.");
    }

    setIsSending(false);
  };

  const handleInputKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="space-y-4">
      <h4 className="font-medium text-gray-700">AI Tutor Chat</h4>
      <div className="bg-gray-100 rounded-lg p-4 h-[420px] flex flex-col">
        <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-2">
          {messages.map((msg, i) => (
            <div key={i}>
              <div
                className={
                  msg.role === "assistant"
                    ? "bg-indigo-100 text-indigo-800 p-2 rounded-lg max-w-[80%] ml-auto cursor-pointer hover:bg-indigo-200 transition"
                    : "bg-white p-2 rounded-lg max-w-[80%]"
                }
                onClick={msg.role === "assistant" ? () => setPopupContent(msg.content) : undefined}
                tabIndex={msg.role === "assistant" ? 0 : undefined}
                onKeyDown={
                  msg.role === "assistant"
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") setPopupContent(msg.content);
                      }
                    : undefined
                }
              >
                {msg.content}
              </div>
              {msg.role === "assistant" && Array.isArray(msg.sources) && msg.sources.length > 0 && (
                <div className="max-w-[80%] ml-auto mt-1 bg-white border border-indigo-100 rounded p-2">
                  <div className="text-[11px] text-gray-500 mb-1">Sources used</div>
                  <div className="space-y-1">
                    {msg.sources.slice(0, 3).map((src) => (
                      <a
                        key={src.url}
                        href={src.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-indigo-700 hover:underline flex items-center"
                      >
                        <ExternalLink className="h-3 w-3 mr-1" />
                        {src.title || src.url}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
          <div ref={chatBottomRef} />
        </div>
        <div className="flex">
          <input
            type="text"
            placeholder="Ask a question about the exam..."
            className="flex-1 border border-gray-300 rounded-l-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleInputKeyDown}
            disabled={isSending}
          />
          <button
            className="bg-indigo-600 text-white px-5 py-3 rounded-r-lg hover:bg-indigo-700"
            onClick={handleSend}
            disabled={isSending || !input.trim()}
          >
            <Send className="h-6 w-6" />
          </button>
        </div>
        {error && <div className="text-red-600 text-xs mt-2">{error}</div>}
      </div>
      <p className="text-gray-500 text-sm text-center mt-2">
        AI tutor provides personalized help without giving away answers
      </p>
      {popupContent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-8 relative">
            <button
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-800"
              onClick={() => setPopupContent(null)}
              aria-label="Close"
            >
              <X className="h-6 w-6" />
            </button>
            <div className="text-lg text-gray-800 whitespace-pre-line break-words">{popupContent}</div>
          </div>
        </div>
      )}
    </div>
  );
}
