import { useEffect, useMemo, useRef, useState } from "react";
import {
  Brain,
  Mic,
  MicOff,
  Pause,
  Play,
  StopCircle,
  Volume2,
  VolumeX,
  X
} from "lucide-react";
import { createSearchService } from "../../search/searchService";

function speakWithBrowser(text, onEnd, onError) {
  if (typeof window === "undefined" || !window.speechSynthesis) return false;
  try {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => onEnd?.();
    utterance.onerror = () => onError?.();
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

export default function VoiceTutor({
  aiClient,
  model,
  examJSON,
  ttsVoice,
  voiceOutputMode = "browser",
  enableWebSearch = true,
  searchContextSize = "medium"
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);

  const [interim, setInterim] = useState("");
  const [finalText, setFinalText] = useState("");
  const [assistantText, setAssistantText] = useState("");

  const [error, setError] = useState("");

  const recognitionRef = useRef(null);
  const endSilenceTimerRef = useRef(null);
  const audioRef = useRef(null);

  const hasSTT =
    typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const hasTTS = typeof window !== "undefined" && window.speechSynthesis;

  const searchService = useMemo(() => createSearchService(aiClient), [aiClient]);

  useEffect(() => {
    if (listening && hasTTS && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
    }
  }, [listening, hasTTS]);

  useEffect(() => {
    return () => {
      if (endSilenceTimerRef.current) clearTimeout(endSilenceTimerRef.current);
      if (hasTTS) window.speechSynthesis.cancel();
      if (recognitionRef.current) recognitionRef.current.stop();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [hasTTS]);

  const speak = async (text) => {
    if (!text || muted) return;
    setSpeaking(true);

    if (voiceOutputMode === "api") {
      try {
        const audioBlob = await aiClient.audioSpeech({
          model: "gpt-4o-mini-tts",
          voice: ttsVoice || "alloy",
          input: text
        });
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        audio.onended = () => setSpeaking(false);
        audio.onerror = () => {
          setError("Failed to play audio, falling back to browser voice.");
          const ok = speakWithBrowser(
            text,
            () => setSpeaking(false),
            () => {
              setSpeaking(false);
              setError("Browser voice fallback failed.");
            }
          );
          if (!ok) setSpeaking(false);
        };
        await audio.play();
        return;
      } catch {
        // Continue with browser fallback below.
      }
    }

    const ok = speakWithBrowser(
      text,
      () => setSpeaking(false),
      () => {
        setSpeaking(false);
        setError("TTS error.");
      }
    );
    if (!ok) {
      setSpeaking(false);
      setError("This browser cannot play voice output.");
    }
  };

  const stopSpeaking = () => {
    setSpeaking(false);
    if (typeof window !== "undefined") {
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        /* ignore */
      }
    }
    setListening(false);
  };

  const respondTo = async (userText) => {
    if (!userText) return;
    try {
      const contextBits = [];
      if (examJSON?.title) contextBits.push(`Title: ${examJSON.title}`);
      const sections = Object.keys(examJSON || {}).filter(
        (k) => Array.isArray(examJSON[k]) && examJSON[k].length > 0
      );
      if (sections.length) contextBits.push(`Sections: ${sections.join(", ")}`);

      let liveContext = "";
      let grounded = false;
      if (enableWebSearch) {
        try {
          const search = await searchService.searchWeb({ model, query: userText, searchContextSize });
          grounded = Boolean(search.grounded);
          if (search.answerText || search.sources?.length) {
            const sourceLines = (search.sources || [])
              .slice(0, 4)
              .map((s, idx) => `${idx + 1}. ${s.title || s.url} (${s.url})`)
              .join("\n");
            liveContext = `Live web context:\n${search.answerText || ""}\n\n${sourceLines}`;
          }
        } catch {
          grounded = false;
        }
      }

      const prompt = [
        {
          role: "system",
          content:
            "You are a concise, friendly voice tutor. " +
            "Use simple clear language. Explain concepts and approaches; do NOT give exact answers to specific exam questions. " +
            "Keep responses short unless the user asks for more detail."
        },
        ...(contextBits.length
          ? [{ role: "system", content: `Exam context: ${contextBits.join(" | ")}` }]
          : []),
        ...(liveContext ? [{ role: "system", content: liveContext }] : []),
        { role: "user", content: userText }
      ];

      const data = await aiClient.chatCompletions({
        model,
        messages: prompt,
        temperature: 0.4,
        max_tokens: 280
      });

      const text = data?.choices?.[0]?.message?.content?.trim() || "Sorry, I didn't catch that.";
      const content = grounded ? text : `${text} Live web grounding was unavailable for this reply.`;
      setAssistantText(content);
      speak(content);
    } catch (e) {
      setAssistantText("AI request failed.");
      setError(e?.message || "AI request failed.");
    }
  };

  const startListening = () => {
    setError("");
    if (!hasSTT) {
      setError("This browser does not support microphone transcription.");
      return;
    }
    stopSpeaking();

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    recognitionRef.current = rec;

    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = true;

    let collectedFinal = "";

    rec.onresult = (event) => {
      if (endSilenceTimerRef.current) {
        clearTimeout(endSilenceTimerRef.current);
        endSilenceTimerRef.current = null;
      }

      let interimStr = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const res = event.results[i];
        if (res.isFinal) {
          collectedFinal += res[0].transcript + " ";
        } else {
          interimStr += res[0].transcript;
        }
      }
      setInterim(interimStr);
      setFinalText(collectedFinal.trim());

      endSilenceTimerRef.current = setTimeout(async () => {
        stopListening();
        const text = (collectedFinal || interimStr).trim();
        if (text) await respondTo(text);
      }, 900);
    };

    rec.onerror = (e) => {
      if (e?.error !== "aborted") setError(`Mic error: ${e?.error || "unknown"}`);
      setListening(false);
    };

    rec.onend = async () => {
      setListening(false);
      const text = (finalText || interim).trim();
      if (text) await respondTo(text);
    };

    try {
      rec.start();
      setListening(true);
      setInterim("");
      setFinalText("");
    } catch {
      setError("Microphone permission blocked or already in use.");
      setListening(false);
    }
  };

  const toggleMic = () => {
    if (listening) {
      stopListening();
      const text = (finalText || interim).trim();
      if (text) respondTo(text);
    } else {
      startListening();
    }
  };

  const toggleMute = () => {
    if (!hasTTS) return;
    if (!muted && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
    }
    setMuted((m) => !m);
  };

  return (
    <>
      <div className="fixed bottom-6 right-6 z-40">
        <button
          onClick={() => setPanelOpen((p) => !p)}
          className={`rounded-full shadow-xl p-4 border-2 ${
            panelOpen ? "bg-indigo-600 border-indigo-700" : "bg-white border-indigo-200"
          } transition`}
          aria-label="Open Voice Tutor"
          title="Voice Tutor"
        >
          <Mic className={`h-6 w-6 ${panelOpen ? "text-white" : "text-indigo-700"}`} />
        </button>
      </div>

      {panelOpen && (
        <div className="fixed bottom-24 right-6 w-[360px] max-h-[70vh] bg-white rounded-2xl shadow-2xl border border-indigo-100 z-40 flex flex-col overflow-hidden">
          <div className="px-4 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white flex items-center justify-between">
            <div className="flex items-center">
              <Brain className="h-5 w-5 mr-2" />
              <span className="font-semibold">AI Voice Tutor</span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={toggleMute}
                className="bg-white/15 hover:bg-white/25 rounded-lg p-1.5"
                title={muted ? "Unmute" : "Mute"}
              >
                {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </button>
              <button
                onClick={() => setPanelOpen(false)}
                className="bg-white/15 hover:bg-white/25 rounded-lg p-1.5"
                title="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="p-4 space-y-3 overflow-y-auto">
            {!hasSTT && (
              <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg p-3 text-sm">
                Your browser does not support speech recognition. Try Chrome on desktop.
              </div>
            )}
            {!hasTTS && (
              <div className="bg-yellow-50 text-yellow-800 border border-yellow-200 rounded-lg p-3 text-sm">
                Speech synthesis is not available. I can still transcribe and type answers.
              </div>
            )}
            {error && (
              <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg p-3 text-sm">
                {error}
              </div>
            )}

            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <div className="text-xs text-gray-500 mb-1">You said</div>
              <div className="min-h-[48px] whitespace-pre-wrap text-gray-800">
                {finalText || interim || (
                  <span className="text-gray-400">Press the mic and ask a question...</span>
                )}
              </div>
            </div>

            <div className="bg-indigo-50 rounded-lg p-3 border border-indigo-100">
              <div className="text-xs text-indigo-700 mb-1">Tutor</div>
              <div className="min-h-[64px] whitespace-pre-wrap text-indigo-900">
                {assistantText || (
                  <span className="text-indigo-400">I will answer here and speak if not muted.</span>
                )}
              </div>
            </div>
          </div>

          <div className="p-4 border-t border-gray-200 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <button
                onClick={toggleMic}
                className={`px-4 py-2 rounded-lg font-medium shadow ${
                  listening ? "bg-red-600 hover:bg-red-700 text-white" : "bg-indigo-600 hover:bg-indigo-700 text-white"
                }`}
                title={listening ? "Stop and answer" : "Start listening"}
              >
                <span className="inline-flex items-center">
                  {listening ? <MicOff className="h-5 w-5 mr-2" /> : <Mic className="h-5 w-5 mr-2" />}
                  {listening ? "Stop" : "Listen"}
                </span>
              </button>
              <button
                onClick={() => {
                  stopListening();
                  stopSpeaking();
                  setInterim("");
                  setFinalText("");
                }}
                className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300"
                title="Stop all"
              >
                <StopCircle className="h-5 w-5" />
              </button>
            </div>

            <button
              onClick={() => {
                if (!assistantText) return;
                if (speaking) stopSpeaking();
                else speak(assistantText);
              }}
              className="px-3 py-2 rounded-lg bg-white hover:bg-gray-50 text-gray-700 border border-gray-300"
              title={speaking ? "Pause voice" : "Play voice"}
            >
              {speaking ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
