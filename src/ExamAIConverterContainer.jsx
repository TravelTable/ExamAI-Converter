import { useState, useEffect, useRef } from "react";
import {
  Upload, FileText, Image, Check, X, HelpCircle, AlertTriangle, RefreshCw, Award, Brain, BookOpen, Clock, Zap, CheckCircle, XCircle, Sparkles, BarChart, PenTool, Eye, Lightbulb, Calculator, MessageCircle, Search, ExternalLink, Bookmark, Settings, Info, RotateCcw, Layers, List, Maximize, Minimize, ChevronRight, ChevronLeft, Coffee, Compass
} from "lucide-react";
import Tesseract from "tesseract.js";

// --- Constants ---
const LOCAL_STORAGE_KEY = "examAI:settings";
const SESSION_KEY_PREFIX = "examSession:";
const HISTORY_KEY = "examHistory";
const TOKEN_KEY = "examAI:tokenUsage";
const DEFAULT_MODEL = "gpt-3.5-turbo";
const MODELS = [
  { id: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
  { id: "gpt-4.1", label: "GPT-4.1" }
];

// --- OpenAI Function Schema (forces JSON) ---
const EXAM_FUNCTION = {
  type: "function",
  function: {
    name: "return_exam",
    description: "Return the parsed exam in a strict schema.",
    parameters: {
      type: "object",
      properties: {
        title: { type: ["string","null"] },
        suggestedTime: { type: ["integer", "null"], description: "Suggested total time for the exam in seconds." },
        multipleChoice: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              type: { type: "string", enum: ["radio"] },
              text: { type: "string" },
              options: { type: "array", items: { type: "string" } },
              correctAnswer: { type: ["string","null"] },
              points: { type: "integer" },
              hint: {
                oneOf: [
                  { type: "string" },
                  {
                    type: "object",
                    properties: {
                      explanation: { type: "string" },
                      answer: { type: "string" }
                    },
                    required: ["explanation"]
                  }
                ]
              },
              sampleAnswer: { type: ["string","null"] }
            },
            required: ["type","text","options"]
          }
        },
        trueFalse: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              type: { type: "string", enum: ["radio"] },
              text: { type: "string" },
              options: { type: "array", items: { type: "string" } },
              correctAnswer: { type: ["string","null"] },
              points: { type: "integer" },
              hint: {
                oneOf: [
                  { type: "string" },
                  {
                    type: "object",
                    properties: {
                      explanation: { type: "string" },
                      answer: { type: "string" }
                    },
                    required: ["explanation"]
                  }
                ]
              }
            },
            required: ["type","text","options"]
          }
        },
        checkbox: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              type: { type: "string", enum: ["checkbox"] },
              text: { type: "string" },
              options: { type: "array", items: { type: "string" } },
              correctAnswers: { type: ["array","null"], items: { type: "string" } },
              points: { type: "integer" },
              hint: {
                oneOf: [
                  { type: "string" },
                  {
                    type: "object",
                    properties: {
                      explanation: { type: "string" },
                      answer: { type: "string" }
                    },
                    required: ["explanation"]
                  }
                ]
              }
            },
            required: ["type","text","options"]
          }
        },
        shortAnswer: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              type: { type: "string", enum: ["text"] },
              text: { type: "string" },
              points: { type: "integer" },
              hint: {
                oneOf: [
                  { type: "string" },
                  {
                    type: "object",
                    properties: {
                      explanation: { type: "string" },
                      answer: { type: "string" }
                    },
                    required: ["explanation"]
                  }
                ]
              },
              sampleAnswer: { type: ["string","null"] }
            },
            required: ["type","text"]
          }
        }
      },
      required: []
    }
  }
};

// --- Helper: OpenAI API ---
async function callOpenAI({
  apiKey,
  model,
  messages,
  temperature = 0.3,
  max_tokens = 1024,
  tools = null,
  tool_choice = null,
  forceJson = false
}) {
  if (!apiKey) throw new Error("No API key configured.");
  const url = "https://api.openai.com/v1/chat/completions";
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`
  };

  const payload = {
    model,
    messages,
    temperature,
    max_tokens
  };

  // Prefer function-calling for strict JSON
  if (Array.isArray(tools) && tools.length > 0) {
    payload.tools = tools;
    if (tool_choice) payload.tool_choice = tool_choice; // force the function
  } else if (forceJson) {
    // Fallback JSON mode for models that support it
    payload.response_format = { type: "json_object" };
  }

  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || "OpenAI API error");
  }
  const data = await res.json();
  return data;
}

// --- Helper: Token Estimation ---
function estimateTokens(str) {
  // Rough estimate: 1 token ≈ 4 chars English
  return Math.ceil(str.length / 4);
}

/// --- Helper: Robust LLM JSON Parse ---
function robustLLMJsonParse(response) {
  // If it's an OpenAI object, extract message.content first
  if (typeof response === "object" && response !== null) {
    if (response?.choices?.[0]?.message?.content) {
      response = response.choices[0].message.content;
    } else if (response?.content) {
      response = response.content;
    } else {
      try { return JSON.parse(JSON.stringify(response)); } catch { /* fall through */ }
    }
  }

  if (typeof response !== "string") response = String(response ?? "");

  // Strip ```json ...``` fences
  response = response.replace(/```(?:json|JSON)?\s*([\s\S]*?)\s*```/g, "$1");

  // Strip BOM + curly quotes
  response = response.replace(/\uFEFF/g, "");
  response = response.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');

  // Fast path
  try { return JSON.parse(response); } catch {}

  // Find the largest balanced {...} or [...] substring
  const extractBalanced = (str, open, close) => {
    const opens = [];
    let best = null;
    for (let i = 0; i < str.length; i++) {
      if (str[i] === open) opens.push(i);
      if (str[i] === close && opens.length) {
        const start = opens.shift();
        best = { start, end: i };
      }
    }
    return best ? str.slice(best.start, best.end + 1) : null;
  };

  let jsonStr = extractBalanced(response, "{", "}") || extractBalanced(response, "[", "]");
  if (!jsonStr) throw new Error("Could not find JSON in model response.");

  // Sanitize
  jsonStr = jsonStr.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, "");            // comments
  jsonStr = jsonStr.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");    // control chars
  let prev;
  do { prev = jsonStr; jsonStr = jsonStr.replace(/,\s*([\]}])/g, "$1"); } while (jsonStr !== prev); // trailing commas
  do { prev = jsonStr; jsonStr = jsonStr.replace(/,,+/g, ","); } while (jsonStr !== prev);          // duplicate commas

  return JSON.parse(jsonStr);
}

// --- Helper: Extract + Normalize Exam JSON from OpenAI response ---
function extractExamFromResponse(data) {
  const choice = data?.choices?.[0]?.message;

  // Prefer function-calling (tool_calls) if present
  if (choice?.tool_calls?.length) {
    const argsStr = choice.tool_calls[0]?.function?.arguments || "{}";
    const parsed = robustLLMJsonParse(argsStr);
    return normalizeExamStructure(parsed);
  }

  // Otherwise parse content
  const content = choice?.content ?? data;
  const parsed = robustLLMJsonParse(content);
  return normalizeExamStructure(parsed);
}

// Normalize to: { multipleChoice:[], trueFalse:[], checkbox:[], shortAnswer:[], suggestedTime }
function normalizeExamStructure(parsed) {
  const exam = { multipleChoice: [], trueFalse: [], checkbox: [], shortAnswer: [] };

  if (parsed && parsed.suggestedTime) {
    exam.suggestedTime = parsed.suggestedTime;
  }

  const put = (q) => {
    if (!q) return;
    if (!q.id) q.id = "q_" + Math.random().toString(36).slice(2, 10);

    // Normalize hint: if it's a string, try to parse as JSON for {explanation, answer}
    if (q.hint && typeof q.hint === "string") {
      try {
        const hintObj = JSON.parse(q.hint);
        if (hintObj && (hintObj.explanation || hintObj.answer)) {
          q.hint = hintObj;
        }
      } catch {
        // If not JSON, treat as explanation only
        q.hint = { explanation: q.hint };
      }
    }

    if (q.type === "radio") {
      const isTF = Array.isArray(q.options) && q.options.length === 2 &&
        q.options.every((opt) => ["true","false","True","False","TRUE","FALSE"].includes(String(opt)));
      if (isTF) exam.trueFalse.push(q); else exam.multipleChoice.push(q);
    } else if (q.type === "checkbox") {
      exam.checkbox.push(q);
    } else if (q.type === "text" || q.type === "short" || q.type === "shortAnswer") {
      q.type = "text";
      exam.shortAnswer.push(q);
    }
  };

  if (Array.isArray(parsed)) {
    parsed.forEach(put);
  } else if (parsed && (parsed.multipleChoice || parsed.trueFalse || parsed.checkbox || parsed.shortAnswer)) {
    (parsed.multipleChoice || []).forEach(put);
    (parsed.trueFalse || []).forEach(put);
    (parsed.checkbox || []).forEach(put);
    (parsed.shortAnswer || []).forEach(put);
  } else if (parsed && parsed.type) {
    put(parsed);
  }

  return exam;
}

// --- Helper: Hash ---
function hashString(str) {
  let hash = 0, i, chr;
  if (str.length === 0) return hash.toString();
  for (i = 0; i < str.length; i++) {
    chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString();
}

// --- Main Container ---
export default function ExamAIConverterContainer() {
  // --- Settings State ---
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [saveKey, setSaveKey] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsBanner, setSettingsBanner] = useState(false);

  // --- Token Usage State ---
  const [tokenUsage, setTokenUsage] = useState({ session: 0, actions: [] });

  // --- Exam State ---
  const [uploadType, setUploadType] = useState("none");
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrText, setOcrText] = useState("");
  const [ocrFileName, setOcrFileName] = useState("");
  const [rawText, setRawText] = useState("");
  const [examJSON, setExamJSON] = useState(null);
  const [examCompleted, setExamCompleted] = useState(false);
  const [examScore, setExamScore] = useState(null);
  const [answers, setAnswers] = useState({});
  const [textAnswersFeedback, setTextAnswersFeedback] = useState({});
  const [helpPanelOpen, setHelpPanelOpen] = useState(false);
  const [activeHelpTool, setActiveHelpTool] = useState(null);
  const [showHints, setShowHints] = useState(false);

  // --- Timer/Progress State ---
  const [timer, setTimer] = useState(60 * 60); // seconds
  const [timerActive, setTimerActive] = useState(false);
  const [timerEnabled, setTimerEnabled] = useState(true);
  const [aiSuggestedTime, setAiSuggestedTime] = useState(null);
  const timerRef = useRef();
  const [sessionHash, setSessionHash] = useState(null);

  // --- History State ---
  const [historyTab, setHistoryTab] = useState(false);
  const [history, setHistory] = useState([]);

  // --- Error State ---
  const [error, setError] = useState("");

  // --- File Input Ref ---
  const fileInputRef = useRef();

  // --- Load Settings on Mount ---
  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || "{}");
    if (saved.apiKey) setApiKey(saved.apiKey);
    if (saved.model) setModel(saved.model);
    if (saved.saveKey) setSaveKey(true);
    setSettingsSaved(!!saved.apiKey);
    setSettingsBanner(true);
    // Token usage
    const tu = JSON.parse(localStorage.getItem(TOKEN_KEY) || "{}");
    setTokenUsage(tu.session ? tu : { session: 0, actions: [] });
    // History
    const hist = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    setHistory(hist);
  }, []);

  // --- Persist Settings ---
  useEffect(() => {
    if (saveKey) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ apiKey, model, saveKey }));
      setSettingsSaved(true);
    } else {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ model, saveKey }));
      setSettingsSaved(false);
    }
  }, [apiKey, model, saveKey]);

  // --- Persist Token Usage ---
  useEffect(() => {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(tokenUsage));
  }, [tokenUsage]);

  // --- Persist Session ---
  useEffect(() => {
    if (!examJSON) return;
    const hash = sessionHash || hashString(JSON.stringify(examJSON));
    setSessionHash(hash);
    const sessionData = {
      examJSON,
      answers,
      timer,
      startTime: Date.now(),
      ocrText,
      rawText
    };
    localStorage.setItem(SESSION_KEY_PREFIX + hash, JSON.stringify(sessionData));
  }, [examJSON, answers, timer, ocrText, rawText]);

  // --- Restore Session on Mount ---
  useEffect(() => {
    // Find latest session
    const keys = Object.keys(localStorage).filter(k => k.startsWith(SESSION_KEY_PREFIX));
    if (keys.length > 0) {
      const latest = keys.sort().reverse()[0];
      const session = JSON.parse(localStorage.getItem(latest));
      if (session && session.examJSON) {
        setExamJSON(session.examJSON);
        setAnswers(session.answers || {});
        setTimer(session.timer || 60 * 60);
        setOcrText(session.ocrText || "");
        setRawText(session.rawText || "");
        setSessionHash(latest.replace(SESSION_KEY_PREFIX, ""));
        setTimerActive(true);
      }
    }
  }, []);

  // --- Timer Logic ---
  useEffect(() => {
    if (!timerActive || !timerEnabled) return;
    timerRef.current = setInterval(() => {
      setTimer(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          handleAutoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line
  }, [timerActive, timerEnabled]);

  // --- Progress Calculation ---
  const totalQuestions = examJSON
    ? [
        ...(examJSON.multipleChoice || []),
        ...(examJSON.trueFalse || []),
        ...(examJSON.checkbox || []),
        ...(examJSON.shortAnswer || [])
      ].length
    : 0;
  const answeredCount = examJSON
    ? [
        ...(examJSON.multipleChoice || []),
        ...(examJSON.trueFalse || []),
        ...(examJSON.checkbox || []),
        ...(examJSON.shortAnswer || [])
      ].filter(q => {
        if (q.type === "radio") return answers[q.id] !== undefined && answers[q.id] !== "";
        if (q.type === "checkbox") return answers[q.id] && Object.values(answers[q.id]).some(Boolean);
        if (q.type === "text") return answers[q.id] && answers[q.id].trim().length > 0;
        return false;
      }).length
    : 0;

  // --- File Upload Handler ---
  const handleFileInput = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setOcrFileName(file.name);
    setIsProcessing(true);
    setOcrText("");
    setRawText("");
    Tesseract.recognize(file, "eng", { logger: () => {} })
      .then(({ data: { text } }) => {
        setOcrText(text);
        setIsProcessing(false);
      })
      .catch(() => {
        setError("OCR failed. Please try another image.");
        setIsProcessing(false);
      });
  };

  // --- Upload Option Handler ---
  const handleUpload = (type) => {
    setUploadType(type);
    setIsProcessing(false);
    setOcrText("");
    setOcrFileName("");
    setRawText("");
    setExamJSON(null);
    setExamCompleted(false);
    setExamScore(null);
    setAnswers({});
    setTextAnswersFeedback({});
    setTimer(60 * 60);
    setTimerActive(false);
    setSessionHash(null);
  };

  // --- Process Exam Handler (Text or OCR) ---
  const handleProcessExam = async () => {
    setIsProcessing(true);
    setError("");

    const text = uploadType === "image" ? ocrText : rawText;
    if (!text.trim()) {
      setError("No exam text to process.");
      setIsProcessing(false);
      return;
    }

    try {
      const prompt = [
        {
          role: "system",
          content:
            "You are an expert exam parser. Extract all questions from the user's exam text. " +
            "Return ONLY the exam in JSON via the provided function with fields: id, type (radio/checkbox/text), text, options (if any), " +
            "correctAnswer or correctAnswers (if present), points (int), hint (as an object: {explanation: string, answer: string} where explanation explains the concept but does NOT reveal the answer, and answer is the actual answer), sampleAnswer (if present), and a suggestedTime (in seconds, integer, for the whole exam, based on difficulty and length). " +
            "If no answer key is present, set correctAnswer(s) to null. For each hint, do NOT reveal the answer in the explanation field."
        },
        { role: "user", content: text }
      ];

      const tokensPrompt = estimateTokens(prompt.map(m => m.content).join("\n"));

      const data = await callOpenAI({
        apiKey,
        model,
        messages: prompt,
        temperature: 0.2,
        max_tokens: 11000,
        tools: [EXAM_FUNCTION],
        tool_choice: { type: "function", function: { name: "return_exam" } } // force structured output
      });

      // Defensive: handle truncated/partial JSON from OpenAI
      let exam;
      try {
        exam = extractExamFromResponse(data);
      } catch (e) {
        // Try to recover from partial/truncated JSON in tool_calls
        const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
        if (toolCall && typeof toolCall === "string") {
          // Try to find the largest valid JSON substring
          let jsonStr = toolCall;
          // Try to close the last array/object if truncated
          if (jsonStr.lastIndexOf("]") < jsonStr.lastIndexOf("[")) jsonStr += "]";
          if (jsonStr.lastIndexOf("}") < jsonStr.lastIndexOf("{")) jsonStr += "}";
          try {
            exam = robustLLMJsonParse(jsonStr);
            exam = normalizeExamStructure(exam);
          } catch (e2) {
            setError("Exam data was truncated or incomplete. Please try again or reduce exam length.");
            setIsProcessing(false);
            return;
          }
        } else {
          setError("Failed to parse exam data. Please try again.");
          setIsProcessing(false);
          return;
        }
      }
      const tokensResponse = estimateTokens(JSON.stringify(exam));

      // AI suggested time
      let suggestedTime = 60 * 60;
      if (data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments) {
        try {
          const args = robustLLMJsonParse(data.choices[0].message.tool_calls[0].function.arguments);
          if (args.suggestedTime && Number.isInteger(args.suggestedTime)) {
            suggestedTime = args.suggestedTime;
          }
        } catch {}
      } else if (exam.suggestedTime && Number.isInteger(exam.suggestedTime)) {
        suggestedTime = exam.suggestedTime;
      }
      setAiSuggestedTime(suggestedTime);

      setTokenUsage(prev => ({
        session: prev.session + tokensPrompt + tokensResponse,
        actions: [
          ...prev.actions,
          {
            type: "processExam",
            tokens: tokensPrompt + tokensResponse,
            prompt: tokensPrompt,
            response: tokensResponse,
            timestamp: Date.now()
          }
        ]
      }));

      setExamJSON(exam);
      setExamCompleted(false);
      setExamScore(null);
      setAnswers({});
      setTextAnswersFeedback({});
      setTimerEnabled(true);
      setTimer(suggestedTime);
      setTimerActive(true);
      setSessionHash(hashString(JSON.stringify(exam)));
    } catch (e) {
      setError(e.message || "Failed to process exam.");
    }

    setIsProcessing(false);
  };

  // --- Submit Exam Handler ---
  const handleSubmitExam = async () => {
    setIsProcessing(true);
    setError("");
    if (!examJSON) {
      setError("No exam loaded.");
      setIsProcessing(false);
      return;
    }
    // Grading logic
    let score = {
      total: 0,
      earned: 0,
      multipleChoice: { total: 0, earned: 0 },
      trueFalse: { total: 0, earned: 0 },
      checkbox: { total: 0, earned: 0 },
      shortAnswer: { total: 0, earned: 0 }
    };
    let feedback = {};
    // Multiple Choice
    for (const q of examJSON.multipleChoice || []) {
      score.multipleChoice.total += q.points || 1;
      score.total += q.points || 1;
      if (q.correctAnswer != null && answers[q.id] === q.correctAnswer) {
        score.multipleChoice.earned += q.points || 1;
        score.earned += q.points || 1;
      }
    }
    // True/False
    for (const q of examJSON.trueFalse || []) {
      score.trueFalse.total += q.points || 1;
      score.total += q.points || 1;
      if (q.correctAnswer != null && answers[q.id] === q.correctAnswer) {
        score.trueFalse.earned += q.points || 1;
        score.earned += q.points || 1;
      }
    }
    // Checkbox
    for (const q of examJSON.checkbox || []) {
      score.checkbox.total += q.points || 1;
      score.total += q.points || 1;
      if (q.correctAnswers && Array.isArray(q.correctAnswers)) {
        const correctSet = new Set(q.correctAnswers);
        const selected = answers[q.id] ? Object.entries(answers[q.id]).filter(([k, v]) => v).map(([k]) => k) : [];
        const numCorrect = selected.filter(opt => correctSet.has(opt)).length;
        const numIncorrect = selected.filter(opt => !correctSet.has(opt)).length;
        const partial = Math.max(0, (numCorrect - numIncorrect) / correctSet.size);
        const pts = Math.round((q.points || 1) * partial);
        score.checkbox.earned += pts;
        score.earned += pts;
      }
    }
    // Short Answer
    for (const q of examJSON.shortAnswer || []) {
      score.shortAnswer.total += q.points || 1;
      score.total += q.points || 1;
      // If correctAnswer/sampleAnswer present, grade locally
      if (q.sampleAnswer) {
        // Simple: if answer matches sampleAnswer (case-insensitive, trimmed), full points
        if (
          answers[q.id] &&
          answers[q.id].trim().toLowerCase() === q.sampleAnswer.trim().toLowerCase()
        ) {
          score.shortAnswer.earned += q.points || 1;
          score.earned += q.points || 1;
          feedback[q.id] = {
            score: q.points || 1,
            feedback: "Perfect answer. Matches the sample answer.",
            maxScore: q.points || 1
          };
        } else {
          // Otherwise, use LLM for grading
          try {
            const prompt = [
              {
                role: "system",
                content:
                  "You are an expert grader. Given a question, a student's answer, and a sample answer, grade the student's answer out of the given points. Return JSON: { \"score\": <int>, \"feedback\": \"<1–2 sentences>\" }. Score must not exceed points. Justify against key points in the sample answer."
              },
              {
                role: "user",
                content: `Question: ${q.text}\nPoints: ${q.points}\nSample Answer: ${q.sampleAnswer}\nStudent Answer: ${answers[q.id]}`
              }
            ];
            const tokensPrompt = estimateTokens(prompt.map(m => m.content).join("\n"));
            const data = await callOpenAI({
              apiKey,
              model,
              messages: prompt,
              temperature: 0.2,
              max_tokens: 256
            });
            const responseContent = data.choices[0].message.content;
            const response = typeof responseContent === "string" ? responseContent.trim() : "";
            const tokensResponse = estimateTokens(response);
            setTokenUsage(prev => ({
              session: prev.session + tokensPrompt + tokensResponse,
              actions: [
                ...prev.actions,
                {
                  type: "processExam",
                  tokens: tokensPrompt + tokensResponse,
                  prompt: tokensPrompt,
                  response: tokensResponse,
                  timestamp: Date.now()
                }
              ]
            }));
            // Parse JSON
            let parsed;
            try {
              parsed = robustLLMJsonParse(response);
            } catch (e) {
              setError("Failed to parse generated exam JSON. Please try again.");
              setIsProcessing(false);
              return;
            }
            const pts = Math.min(q.points || 1, Math.max(0, parsed.score));
            score.shortAnswer.earned += pts;
            score.earned += pts;
            feedback[q.id] = {
              score: pts,
              feedback: parsed.feedback,
              maxScore: q.points || 1
            };
          } catch (e) {
            feedback[q.id] = {
              score: 0,
              feedback: "Could not grade answer (API error).",
              maxScore: q.points || 1
            };
          }
        }
      } else {
        // No sampleAnswer: ask LLM to extract key points and grade
        try {
          const prompt = [
            {
              role: "system",
              content:
                "You are an expert grader. Given a question, a student's answer, and the number of points, extract key points from the question and grade the student's answer out of the given points. Return JSON: { \"score\": <int>, \"feedback\": \"<1–2 sentences>\" }. Score must not exceed points. Justify against key points."
            },
            {
              role: "user",
              content: `Question: ${q.text}\nPoints: ${q.points}\nStudent Answer: ${answers[q.id]}`
            }
          ];
          const tokensPrompt = estimateTokens(prompt.map(m => m.content).join("\n"));
          const data = await callOpenAI({
            apiKey,
            model,
            messages: prompt,
            temperature: 0.2,
            max_tokens: 256
          });
          const response = data.choices[0].message.content.trim();
          const tokensResponse = estimateTokens(response);
          setTokenUsage(prev => ({
            session: prev.session + tokensPrompt + tokensResponse,
            actions: [
              ...prev.actions,
              {
                type: "gradeShortAnswer",
                tokens: tokensPrompt + tokensResponse,
                prompt: tokensPrompt,
                response: tokensResponse,
                timestamp: Date.now()
              }
            ]
          }));
          let parsed;
          try {
            parsed = robustLLMJsonParse(response);
          } catch (e) {
            feedback[q.id] = {
              score: 0,
              feedback: "Could not grade answer (invalid model response).",
              maxScore: q.points || 1
            };
            // No continue; just let the loop proceed
          }
          const pts = Math.min(q.points || 1, Math.max(0, parsed.score));
          score.shortAnswer.earned += pts;
          score.earned += pts;
          feedback[q.id] = {
            score: pts,
            feedback: parsed.feedback,
            maxScore: q.points || 1
          };
        } catch (e) {
          feedback[q.id] = {
            score: 0,
            feedback: "Could not grade answer (API error).",
            maxScore: q.points || 1
          };
        }
      }
    }
    setExamScore(score);
    setTextAnswersFeedback(feedback);
    setExamCompleted(true);
    setTimerActive(false);

    // Save to history
    const hist = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    hist.push({
      timestamp: Date.now(),
      subject: examJSON.title || "Exam",
      scoreBreakdown: score
    });
    setHistory(hist);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(hist));
    setIsProcessing(false);
  };

  // --- Auto Submit on Timer End ---
  const handleAutoSubmit = () => {
    if (!examCompleted) handleSubmitExam();
  };

  // --- Generate New Exam Handler ---
  const handleGenerateNewExam = async () => {
    setIsProcessing(true);
    setError("");

    try {
      let prompt;
      if (examJSON) {
        prompt = [
          {
            role: "system",
            content:
              "You are an expert exam generator. Given the following exam JSON, generate a NEW exam with the SAME learning objectives, " +
              "difficulty, section counts, and point totals, but with DIFFERENT questions/wording. Return ONLY via the provided function."
          },
          { role: "user", content: JSON.stringify(examJSON) }
        ];
      } else {
        prompt = [
          {
            role: "system",
            content:
              "You are an expert exam generator. Generate a new exam for the given subject and difficulty. " +
              "Return ONLY via the provided function with sections for multipleChoice, trueFalse, checkbox, shortAnswer."
          },
          { role: "user", content: "Subject: Biology\nDifficulty: Medium" }
        ];
      }

      const tokensPrompt = estimateTokens(prompt.map(m => m.content).join("\n"));

      const data = await callOpenAI({
        apiKey,
        model,
        messages: prompt,
        temperature: 0.3,
        max_tokens: 2048,
        tools: [EXAM_FUNCTION],
        tool_choice: { type: "function", function: { name: "return_exam" } }
      });

      const exam = extractExamFromResponse(data);
      const tokensResponse = estimateTokens(JSON.stringify(exam));

      setTokenUsage(prev => ({
        session: prev.session + tokensPrompt + tokensResponse,
        actions: [
          ...prev.actions,
          {
            type: "generateExam",
            tokens: tokensPrompt + tokensResponse,
            prompt: tokensPrompt,
            response: tokensResponse,
            timestamp: Date.now()
          }
        ]
      }));

      setExamJSON(exam);
      setExamCompleted(false);
      setExamScore(null);
      setAnswers({});
      setTextAnswersFeedback({});
      setTimer(60 * 60);
      setTimerActive(true);
      setSessionHash(hashString(JSON.stringify(exam)));
    } catch (e) {
      setError(e.message || "Failed to generate new exam.");
    }

    setIsProcessing(false);
  };

  // --- Answer Change Handler ---
  const handleAnswerChange = (questionId, value, isCheckbox = false) => {
    setAnswers(prev => {
      if (isCheckbox) {
        return {
          ...prev,
          [questionId]: {
            ...(prev[questionId] || {}),
            [value]: !(prev[questionId]?.[value] || false)
          }
        };
      } else {
        return {
          ...prev,
          [questionId]: value
        };
      }
    });
  };

  // --- Settings Modal Handlers ---
  const handleSaveSettings = () => {
    if (saveKey) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ apiKey, model, saveKey }));
      setSettingsSaved(true);
    } else {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ model, saveKey }));
      setSettingsSaved(false);
    }
    setSettingsOpen(false);
  };
  const handleDeleteKey = () => {
    setApiKey("");
    setSettingsSaved(false);
    setSaveKey(false);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ model, saveKey: false }));
  };
  const handleResetSession = () => {
    setTokenUsage({ session: 0, actions: [] });
    localStorage.setItem(TOKEN_KEY, JSON.stringify({ session: 0, actions: [] }));
  };

  // --- UI ---
  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white">
      <header className="bg-gradient-to-r from-indigo-700 to-purple-700 text-white py-6 shadow-lg">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between">
            <div>
              <button
                className="text-3xl font-bold flex items-center focus:outline-none hover:underline"
                onClick={() => {
                  // Remove current exam session from localStorage
                  if (sessionHash) {
                    localStorage.removeItem(SESSION_KEY_PREFIX + sessionHash);
                  }
                  setUploadType("none");
                  setIsProcessing(false);
                  setOcrText("");
                  setOcrFileName("");
                  setRawText("");
                  setExamJSON(null);
                  setExamCompleted(false);
                  setExamScore(null);
                  setAnswers({});
                  setTextAnswersFeedback({});
                  setTimer(60 * 60);
                  setTimerActive(false);
                  setSessionHash(null);
                  setHelpPanelOpen(false);
                  setActiveHelpTool(null);
                  setShowHints(false);
                  setError("");
                  setHistoryTab(false);
                }}
                style={{ background: "none", border: "none", padding: 0, margin: 0, cursor: "pointer" }}
                type="button"
              >
                <Brain className="h-8 w-8 mr-3" />
                ExamAI Converter
              </button>
              <p className="text-indigo-100 mt-1">
                All processing happens locally in your browser. Your API key is stored only on this device if you choose.
              </p>
            </div>
            <div className="hidden md:flex space-x-4">
              <FeatureBadge icon={Zap} text="Convert exam text or images to a structured exam in-browser." />
              <FeatureBadge icon={CheckCircle} text="Grading with your selected AI model (runs from this browser)." />
              <FeatureBadge icon={Sparkles} text="Generate new practice exams on demand with your model." />
            </div>
            <button
              className="ml-6 bg-white text-indigo-700 px-4 py-2 rounded-lg shadow hover:bg-indigo-50 flex items-center"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings className="h-5 w-5 mr-2" />
              Settings
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {error && (
          <div className="bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded mb-4 flex items-center">
            <XCircle className="h-5 w-5 mr-2" />
            {error}
          </div>
        )}

        {settingsOpen && (
          <SettingsModal
            apiKey={apiKey}
            setApiKey={setApiKey}
            model={model}
            setModel={setModel}
            saveKey={saveKey}
            setSaveKey={setSaveKey}
            onClose={() => setSettingsOpen(false)}
            onSave={handleSaveSettings}
            onDeleteKey={handleDeleteKey}
            settingsSaved={settingsSaved}
            tokenUsage={tokenUsage}
            onResetSession={handleResetSession}
          />
        )}

        <div className="flex justify-between mb-4">
          <div>
            <button
              className={`mr-2 px-4 py-2 rounded-lg ${!historyTab ? "bg-indigo-600 text-white" : "bg-white text-indigo-700 border border-indigo-300"} font-medium`}
              onClick={() => setHistoryTab(false)}
            >
              Exam
            </button>
            <button
              className={`px-4 py-2 rounded-lg ${historyTab ? "bg-indigo-600 text-white" : "bg-white text-indigo-700 border border-indigo-300"} font-medium`}
              onClick={() => setHistoryTab(true)}
            >
              History
            </button>
          </div>
          <div className="text-gray-600 text-sm flex items-center">
            <BarChart className="h-4 w-4 mr-1" />
            Estimated tokens this session: <span className="font-bold ml-1">{tokenUsage.session}</span>
            <button
              className="ml-3 text-xs text-indigo-600 underline"
              onClick={handleResetSession}
            >
              Reset Session
            </button>
          </div>
        </div>

        {historyTab ? (
          <HistoryTab history={history} />
        ) : !examJSON ? (
          <div className="max-w-4xl mx-auto">
            <div className="bg-white rounded-xl shadow-xl p-8 mb-8 border border-indigo-100">
              <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center">
                <Upload className="h-6 w-6 mr-2 text-indigo-600" />
                Upload Your Exam
              </h2>
              <p className="text-gray-600 mb-8 text-lg">
                Upload a photo of your exam or paste the exam text to convert it into an interactive online format with AI-powered grading.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <UploadOption
                  icon={Image}
                  title="Upload Image"
                  description="Take a photo or upload an image of your exam paper"
                  onClick={() => handleUpload("image")}
                  active={uploadType === "image"}
                  disabled={isProcessing}
                  features={["Supports JPG, PNG, PDF", "OCR text recognition", "Preserves formatting"]}
                />
                <UploadOption
                  icon={FileText}
                  title="Paste Text"
                  description="Copy and paste your exam text from any document"
                  onClick={() => handleUpload("text")}
                  active={uploadType === "text"}
                  disabled={isProcessing}
                  features={["Fast processing", "Supports rich text", "Maintains structure"]}
                />
              </div>
              {uploadType === "image" && (
                <div className="mt-8 border-2 border-dashed border-indigo-300 rounded-xl p-10 text-center bg-indigo-50">
                  <Upload className="h-16 w-16 text-indigo-400 mx-auto mb-4" />
                  <p className="text-gray-600 mb-4 text-lg">Drag and drop your exam image here, or click to browse</p>
                  <div className="flex justify-center">
                    <button
                      className="bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 transition shadow-md flex items-center text-lg font-medium"
                      onClick={() => fileInputRef.current.click()}
                      disabled={isProcessing}
                    >
                      <Image className="h-5 w-5 mr-2" />
                      Select Image
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".png,.jpg,.jpeg,.pdf"
                      className="hidden"
                      onChange={handleFileInput}
                    />
                  </div>
                  {ocrFileName && (
                    <div className="mt-2 text-gray-700 text-sm">Selected: {ocrFileName}</div>
                  )}
                  <p className="text-gray-500 mt-4 text-sm">Supported formats: JPG, PNG, PDF (up to 10MB)</p>
                  {isProcessing && (
                    <div className="mt-6 text-center">
                      <div className="animate-spin rounded-full h-10 w-10 border-t-4 border-b-4 border-indigo-600 mx-auto mb-2"></div>
                      <p className="text-gray-600">Extracting text…</p>
                    </div>
                  )}
                  {ocrText && !isProcessing && (
                    <div className="mt-6">
                      <label className="block text-gray-700 mb-2 text-lg font-medium">Preview and edit extracted text:</label>
                      <textarea
                        className="w-full h-64 border border-gray-300 rounded-xl p-4 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-700 shadow-inner bg-white"
                        value={ocrText}
                        onChange={e => setOcrText(e.target.value)}
                      />
                      <button
                        className="mt-4 bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 transition shadow-md flex items-center text-lg font-medium"
                        onClick={handleProcessExam}
                        disabled={isProcessing}
                      >
                        <Zap className="h-5 w-5 mr-2" />
                        Process Exam
                      </button>
                    </div>
                  )}
                </div>
              )}
              {uploadType === "text" && (
                <div className="mt-8">
                  <label className="block text-gray-700 mb-2 text-lg font-medium">Paste your exam text below:</label>
                  <textarea
                    className="w-full h-64 border border-gray-300 rounded-xl p-4 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-700 shadow-inner bg-white"
                    placeholder="Paste your exam questions and answers here. Include all instructions, questions, and answer choices..."
                    value={rawText}
                    onChange={e => setRawText(e.target.value)}
                  />
                  <div className="mt-4 flex justify-between items-center">
                    <div className="text-gray-500 text-sm">
                      <p className="flex items-center"><Check className="h-4 w-4 mr-1 text-green-500" /> Supports multiple question types</p>
                      <p className="flex items-center"><Check className="h-4 w-4 mr-1 text-green-500" /> Preserves formatting</p>
                    </div>
                    <button
                      className="bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 transition shadow-md flex items-center text-lg font-medium"
                      onClick={handleProcessExam}
                      disabled={isProcessing}
                    >
                      <Zap className="h-5 w-5 mr-2" />
                      Process Exam
                    </button>
                  </div>
                </div>
              )}
              {isProcessing && (
                <div className="mt-8 text-center py-10">
                  <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-indigo-600 mx-auto mb-6"></div>
                  <p className="text-gray-600 text-xl">All processing happens locally in your browser. Your API key is stored only on this device if you choose.</p>
                  <p className="text-gray-500 mt-2">OCR (browser) → LLM structuring → local render → local grading or LLM short-answer grading → optional LLM exam generation.</p>
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <FeatureCard
                icon={BookOpen}
                title="Multiple Exam Formats"
                description="Supports multiple choice, true/false, checkbox, and short answer questions"
                color="indigo"
              />
              <FeatureCard
                icon={Brain}
                title="Grading with your selected AI model (runs from this browser)."
                description="Automatically grades objective questions and provides feedback on written responses"
                color="purple"
              />
              <FeatureCard
                icon={RefreshCw}
                title="Generate new practice exams on demand with your model."
                description="Create new practice exams with similar questions to test your knowledge"
                color="blue"
              />
            </div>
            <div className="bg-white rounded-xl shadow-xl p-8 border border-indigo-100">
              <h2 className="text-2xl font-bold text-gray-800 mb-6">How It Works Locally</h2>
              <div className="space-y-6">
                <FeatureStep
                  number="1"
                  title="Upload Your Exam"
                  description="Upload a photo or paste text. OCR runs in your browser."
                />
                <FeatureStep
                  number="2"
                  title="LLM Processing & Conversion"
                  description="Your selected AI model structures the exam into JSON."
                />
                <FeatureStep
                  number="3"
                  title="Complete Your Exam"
                  description="Answer questions in an interactive interface."
                />
                <FeatureStep
                  number="4"
                  title="Grading"
                  description="Objective questions graded locally; short answers graded by your AI model."
                />
                <FeatureStep
                  number="5"
                  title="Generate Practice Exams"
                  description="Create new exams with your model, all in-browser."
                />
              </div>
            </div>
          </div>
        ) : (
          <ExamView
            examJSON={examJSON}
            answers={answers}
            onAnswerChange={handleAnswerChange}
            showHints={showHints}
            setShowHints={setShowHints}
            helpPanelOpen={helpPanelOpen}
            setHelpPanelOpen={setHelpPanelOpen}
            activeHelpTool={activeHelpTool}
            setActiveHelpTool={setActiveHelpTool}
            examCompleted={examCompleted}
            examScore={examScore}
            textAnswersFeedback={textAnswersFeedback}
            onSubmitExam={handleSubmitExam}
            isProcessing={isProcessing}
            onGenerateNewExam={handleGenerateNewExam}
            timer={timer}
            totalQuestions={totalQuestions}
            answeredCount={answeredCount}
            tokenUsage={tokenUsage}
            canSubmit={answeredCount === totalQuestions}
            timerEnabled={timerEnabled}
            setTimerEnabled={setTimerEnabled}
            aiSuggestedTime={aiSuggestedTime}
          />
        )}
      </main>
    </div>
  );
}

// --- Settings Modal ---
function SettingsModal({
  apiKey, setApiKey, model, setModel, saveKey, setSaveKey,
  onClose, onSave, onDeleteKey, settingsSaved, tokenUsage, onResetSession
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-8 relative">
        <h2 className="text-2xl font-bold mb-4 flex items-center">
          <Settings className="h-6 w-6 mr-2" />
          Settings
        </h2>
        <div className="absolute top-0 right-0 p-4">
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">
            <X className="h-6 w-6" />
          </button>
        </div>
        <div className="mb-4">
          <label htmlFor="apiKey" className="block font-medium text-gray-700 mb-1">
            API Key
          </label>
          <input
            id="apiKey"
            type="password"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            autoComplete="off"
          />
          <div className="text-xs text-gray-500 mt-1">
            Your API key is stored in this browser only. Do not distribute this build.
          </div>
        </div>
        <div className="mb-4">
          <label htmlFor="model" className="block font-medium text-gray-700 mb-1">
            Model
          </label>
          <select
            id="model"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500"
            value={model}
            onChange={e => setModel(e.target.value)}
          >
            {MODELS.map(m => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>
        <div className="mb-4 flex items-center">
          <input
            id="saveKey"
            type="checkbox"
            checked={saveKey}
            onChange={e => setSaveKey(e.target.checked)}
            className="mr-2"
          />
          <label htmlFor="saveKey" className="text-gray-700">
            Save key to this browser
          </label>
          <span className="ml-3 text-xs text-gray-500">
            {saveKey ? (settingsSaved ? "Saved" : "Saving…") : "Not saved"}
          </span>
        </div>
        <div className="mb-4">
          <button
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition font-medium mr-2"
            onClick={onSave}
          >
            Save Settings
          </button>
          <button
            className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition font-medium"
            onClick={onDeleteKey}
          >
            Delete key from this device
          </button>
        </div>
        <div className="mb-4">
          <div className="text-xs text-gray-500">
            <span className="font-bold">Estimated tokens this session:</span> {tokenUsage.session}
            <button
              className="ml-2 text-indigo-600 underline"
              onClick={onResetSession}
            >
              Reset Session
            </button>
          </div>
        </div>
        <div className="mb-2">
          <div className="bg-red-100 border border-red-400 text-red-700 px-3 py-2 rounded text-xs font-bold flex items-center">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Local-only build; keys are exposed to this device.
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Exam View ---
function ExamView({
  examJSON, answers, onAnswerChange, showHints, setShowHints,
  helpPanelOpen, setHelpPanelOpen, activeHelpTool, setActiveHelpTool,
  examCompleted, examScore, textAnswersFeedback, onSubmitExam, isProcessing,
  onGenerateNewExam, timer, totalQuestions, answeredCount, tokenUsage, canSubmit,
  timerEnabled, setTimerEnabled, aiSuggestedTime
}) {
  // Timer display
  const mins = Math.floor(timer / 60);
  const secs = timer % 60;
  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex">
        <div className={`transition-all duration-300 ${helpPanelOpen ? "w-3/4 pr-4" : "w-full"}`}>
          <div className="bg-white rounded-xl shadow-xl p-8 mb-6 border border-indigo-100">
            <div className="flex justify-between items-center mb-8 border-b border-gray-200 pb-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-800">{examJSON.title || "Exam"}</h2>
                <div className="flex items-center space-x-4 mt-1">
                  <p className="text-gray-500">
                    {timerEnabled ? (
                      <>
                        Time Remaining: {mins}:{secs.toString().padStart(2, "0")}
                        {aiSuggestedTime && (
                          <span className="ml-2 text-xs text-blue-600">(AI suggested: {Math.floor(aiSuggestedTime / 60)} min)</span>
                        )}
                      </>
                    ) : (
                      <span className="text-gray-400">Timer Off</span>
                    )}
                  </p>
                  <button
                    className={`ml-2 px-2 py-1 rounded text-xs border ${timerEnabled ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-gray-100 text-gray-500 border-gray-200"}`}
                    onClick={() => setTimerEnabled(t => !t)}
                  >
                    {timerEnabled ? "Disable Timer" : "Enable Timer"}
                  </button>
                </div>
                <p className="text-gray-500 mt-1">
                  Total Points: {examScore ? examScore.total : (
                    (examJSON.multipleChoice || []).reduce((a, q) => a + (q.points || 1), 0) +
                    (examJSON.trueFalse || []).reduce((a, q) => a + (q.points || 1), 0) +
                    (examJSON.checkbox || []).reduce((a, q) => a + (q.points || 1), 0) +
                    (examJSON.shortAnswer || []).reduce((a, q) => a + (q.points || 1), 0)
                  )}
                </p>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowHints(h => !h)}
                  className={`px-3 py-2 rounded-lg border transition flex items-center ${
                    showHints
                      ? "bg-yellow-100 text-yellow-700 border-yellow-300"
                      : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <Lightbulb className="h-4 w-4 mr-1" />
                  {showHints ? "Hide Hints" : "Show Hints"}
                </button>
                <button
                  onClick={() => setHelpPanelOpen(h => !h)}
                  className={`px-3 py-2 rounded-lg border transition flex items-center ${
                    helpPanelOpen
                      ? "bg-indigo-100 text-indigo-700 border-indigo-300"
                      : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <HelpCircle className="h-4 w-4 mr-1" />
                  {helpPanelOpen ? "Hide Help" : "Show Help"}
                </button>
                {examCompleted && (
                  <button
                    onClick={onGenerateNewExam}
                    className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition shadow-md flex items-center"
                    disabled={isProcessing}
                  >
                    <RefreshCw className="h-5 w-5 mr-2" /> Generate New Exam
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between bg-blue-50 p-4 rounded-lg border border-blue-200 mb-6">
              <div className="flex items-center">
                <Clock className="h-5 w-5 text-blue-500 mr-2" />
                <span className="text-blue-700 font-medium">
                  Time Remaining: {mins}:{secs.toString().padStart(2, "0")}
                </span>
              </div>
              <div className="text-blue-700 text-sm">
                <span className="font-medium">Progress:</span> {answeredCount} of {totalQuestions} answered
              </div>
            </div>
            {examCompleted ? (
              <div className="space-y-8">
                <div className="bg-indigo-50 rounded-xl p-6 border border-indigo-100">
                  <h3 className="text-xl font-bold text-indigo-800 mb-4 flex items-center">
                    <Award className="h-6 w-6 mr-2 text-indigo-600" />
                    Exam Results
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white rounded-lg p-5 shadow-sm border border-indigo-100">
                      <div className="flex justify-between items-center mb-4">
                        <h4 className="text-lg font-medium text-gray-700">Overall Score</h4>
                        <div className="text-2xl font-bold text-indigo-600">{examScore.earned}/{examScore.total}</div>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-4 mb-2">
                        <div
                          className="bg-indigo-600 h-4 rounded-full"
                          style={{ width: `${(examScore.earned / examScore.total) * 100}%` }}
                        ></div>
                      </div>
                      <div className="text-right text-gray-500 text-sm">
                        {Math.round((examScore.earned / examScore.total) * 100)}% Correct
                      </div>
                    </div>
                    <div className="bg-white rounded-lg p-5 shadow-sm border border-indigo-100">
                      <h4 className="text-lg font-medium text-gray-700 mb-4">Section Breakdown</h4>
                      <div className="space-y-3">
                        <ScoreBar
                          label="Multiple Choice"
                          score={examScore.multipleChoice.earned}
                          total={examScore.multipleChoice.total}
                          color="indigo"
                        />
                        <ScoreBar
                          label="True/False"
                          score={examScore.trueFalse.earned}
                          total={examScore.trueFalse.total}
                          color="green"
                        />
                        <ScoreBar
                          label="Checkbox Questions"
                          score={examScore.checkbox.earned}
                          total={examScore.checkbox.total}
                          color="purple"
                        />
                        <ScoreBar
                          label="Short Answer"
                          score={examScore.shortAnswer.earned}
                          total={examScore.shortAnswer.total}
                          color="blue"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="mt-6 text-center">
                    <button
                      onClick={onGenerateNewExam}
                      className="bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 transition shadow-md flex items-center mx-auto text-lg font-medium"
                      disabled={isProcessing}
                    >
                      <RefreshCw className="h-5 w-5 mr-2" /> Generate New Practice Exam
                    </button>
                    <p className="text-gray-500 mt-2">Create a new exam with similar questions to practice further</p>
                  </div>
                </div>
                <div className="space-y-8">
                  <h3 className="text-xl font-bold text-gray-800 flex items-center">
                    <Eye className="h-6 w-6 mr-2 text-indigo-600" />
                    Detailed Review
                  </h3>
                  {Array.isArray(examJSON.multipleChoice) && examJSON.multipleChoice.length > 0 && (
                    <ExamSection
                      title="Multiple Choice Questions"
                      description="Select the best answer for each question."
                      questions={examJSON.multipleChoice}
                      answers={answers}
                      showHints={showHints}
                      onAnswerChange={onAnswerChange}
                    />
                  )}
                  {Array.isArray(examJSON.trueFalse) && examJSON.trueFalse.length > 0 && (
                    <ExamSection
                      title="True/False Questions"
                      description="Indicate whether each statement is true or false."
                      questions={examJSON.trueFalse}
                      answers={answers}
                      showHints={showHints}
                      onAnswerChange={onAnswerChange}
                    />
                  )}
                  {Array.isArray(examJSON.checkbox) && examJSON.checkbox.length > 0 && (
                    <ExamSection
                      title="Checkbox Questions"
                      description="Select ALL correct answers for each question."
                      questions={examJSON.checkbox}
                      answers={answers}
                      showHints={showHints}
                      onAnswerChange={onAnswerChange}
                    />
                  )}
                  {Array.isArray(examJSON.shortAnswer) && examJSON.shortAnswer.length > 0 && (
                    <ExamSection
                      title="Short Answer Questions"
                      description="Provide brief answers to the following questions."
                      questions={examJSON.shortAnswer}
                      answers={answers}
                      showHints={showHints}
                      onAnswerChange={onAnswerChange}
                    />
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                <ExamSection
                  title="Multiple Choice Questions"
                  description="Select the best answer for each question."
                  questions={examJSON.multipleChoice}
                  answers={answers}
                  showHints={showHints}
                  onAnswerChange={onAnswerChange}
                />
                <ExamSection
                  title="True/False Questions"
                  description="Indicate whether each statement is true or false."
                  questions={examJSON.trueFalse}
                  answers={answers}
                  showHints={showHints}
                  onAnswerChange={onAnswerChange}
                />
                <ExamSection
                  title="Checkbox Questions"
                  description="Select ALL correct answers for each question."
                  questions={examJSON.checkbox}
                  answers={answers}
                  showHints={showHints}
                  onAnswerChange={onAnswerChange}
                />
                <ExamSection
                  title="Short Answer Questions"
                  description="Provide brief answers to the following questions."
                  questions={examJSON.shortAnswer}
                  answers={answers}
                  showHints={showHints}
                  onAnswerChange={onAnswerChange}
                />
                <div className="mt-8 flex justify-between items-center bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <div className="text-gray-500 text-sm flex items-center">
                    <HelpCircle className="h-4 w-4 mr-1" />
                    <span>Your progress is automatically saved</span>
                  </div>
                  <button
                    onClick={onSubmitExam}
                    className={`bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 transition shadow-md flex items-center font-medium ${canSubmit ? "" : "opacity-50 cursor-not-allowed"}`}
                    disabled={!canSubmit || isProcessing}
                    aria-disabled={!canSubmit}
                    title={!canSubmit ? "Answer all required questions." : ""}
                  >
                    <CheckCircle className="h-5 w-5 mr-2" />
                    Submit Exam for Grading
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        {helpPanelOpen && (
          <div className="w-[420px] min-w-[380px] max-w-[520px] pl-6 transition-all duration-300">
            <div className="bg-white rounded-xl shadow-lg border border-indigo-100 sticky top-4">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-xl font-bold text-gray-800 flex items-center">
                  <HelpCircle className="h-6 w-6 mr-2 text-indigo-600" />
                  Exam Help Tools
                </h3>
                <p className="text-gray-500 text-base mt-1">AI-powered assistance for your exam</p>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-2 gap-4">
                  <HelpToolButton
                    icon={BookOpen}
                    label="Key Concepts"
                    active={activeHelpTool === "concepts"}
                    onClick={() => setActiveHelpTool("concepts")}
                  />
                  <HelpToolButton
                    icon={Calculator}
                    label="Calculator"
                    active={activeHelpTool === "calculator"}
                    onClick={() => setActiveHelpTool("calculator")}
                  />
                  <HelpToolButton
                    icon={MessageCircle}
                    label="AI Tutor"
                    active={activeHelpTool === "tutor"}
                    onClick={() => setActiveHelpTool("tutor")}
                  />
                  <HelpToolButton
                    icon={Search}
                    label="Search"
                    active={activeHelpTool === "search"}
                    onClick={() => setActiveHelpTool("search")}
                  />
                  <HelpToolButton
                    icon={Bookmark}
                    label="Bookmarks"
                    active={activeHelpTool === "bookmarks"}
                    onClick={() => setActiveHelpTool("bookmarks")}
                  />
                  <HelpToolButton
                    icon={Settings}
                    label="Settings"
                    active={activeHelpTool === "settings"}
                    onClick={() => setActiveHelpTool("settings")}
                  />
                </div>
              </div>
              <div className="p-6 border-t border-gray-200">
                {activeHelpTool === "concepts" && (
                  <div className="space-y-4">
                    <h4 className="font-medium text-gray-700">Key Concepts</h4>
                    <div className="space-y-3">
                      <ConceptCard
                        title="Exam is processed and graded locally"
                        description="All exam structuring, grading, and generation happens in your browser using your selected AI model."
                      />
                      <ConceptCard
                        title="Short answers"
                        description="Short answer grading uses your AI model for feedback and scoring."
                      />
                      <ConceptCard
                        title="Session Save"
                        description="Your answers and progress are saved in your browser. Reloading restores your session."
                      />
                    </div>
                  </div>
                )}
                {activeHelpTool === "calculator" && (
                  <div className="space-y-4">
                    <h4 className="font-medium text-gray-700">Scientific Calculator</h4>
                    <div className="bg-gray-100 p-4 rounded-lg">
                      <div className="bg-white p-2 rounded mb-3 text-right h-10 flex items-center justify-end text-lg font-mono">
                        0
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        {["7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "-", "0", ".", "=", "+"].map((key) => (
                          <button key={key} className="bg-white hover:bg-gray-50 text-gray-700 font-medium py-2 px-4 rounded shadow">
                            {key}
                          </button>
                        ))}
                      </div>
                      <div className="grid grid-cols-4 gap-2 mt-2">
                        {["sin", "cos", "tan", "^", "log", "ln", "√", "π"].map((key) => (
                          <button key={key} className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium py-2 px-2 rounded shadow text-sm">
                            {key}
                          </button>
                        ))}
                      </div>
                    </div>
                    <p className="text-gray-500 text-xs text-center">This is a demo calculator. In a real implementation, it would be fully functional.</p>
                  </div>
                )}
                {activeHelpTool === "tutor" && (
                  <AITutorChat
                    apiKey={typeof window !== "undefined" ? localStorage.getItem("examAI:settings") ? JSON.parse(localStorage.getItem("examAI:settings")).apiKey : "" : ""}
                    model={typeof window !== "undefined" ? localStorage.getItem("examAI:settings") ? JSON.parse(localStorage.getItem("examAI:settings")).model : "gpt-3.5-turbo" : "gpt-3.5-turbo"}
                    examJSON={examJSON}
                  />
                )}
                {activeHelpTool === "search" && (
                  <div className="space-y-4">
                    <h4 className="font-medium text-gray-700">Search Concepts</h4>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search for a concept..."
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 pl-9 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <Search className="h-4 w-4 text-gray-400 absolute left-3 top-3" />
                    </div>
                    <div className="bg-gray-100 rounded-lg p-3 h-64 overflow-y-auto">
                      <p className="text-gray-500 text-center py-8">
                        Enter a search term to find relevant concepts and explanations
                      </p>
                    </div>
                  </div>
                )}
                {activeHelpTool === "bookmarks" && (
                  <div className="space-y-4">
                    <h4 className="font-medium text-gray-700">Bookmarked Questions</h4>
                    <div className="bg-gray-100 rounded-lg p-3 h-64 overflow-y-auto">
                      <p className="text-gray-500 text-center py-8">
                        No bookmarked questions yet. Click the bookmark icon on any question to save it for later review.
                      </p>
                    </div>
                  </div>
                )}
                {activeHelpTool === "settings" && (
                  <div className="space-y-4">
                    <h4 className="font-medium text-gray-700">Exam Settings</h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">Show Hints</span>
                        <button
                          onClick={() => setShowHints(h => !h)}
                          className={`w-10 h-5 rounded-full flex items-center transition-colors duration-300 focus:outline-none ${showHints ? 'bg-indigo-600' : 'bg-gray-300'}`}
                        >
                          <span className={`w-4 h-4 rounded-full bg-white shadow-md transform transition-transform duration-300 ${showHints ? 'translate-x-5' : 'translate-x-1'}`}></span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="p-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
                <div className="flex items-center justify-between">
                  <button className="text-indigo-600 hover:text-indigo-800 text-sm flex items-center">
                    <Info className="h-4 w-4 mr-1" />
                    Help Guide
                  </button>
                  <button
                    onClick={() => setHelpPanelOpen(false)}
                    className="text-gray-600 hover:text-gray-800 text-sm flex items-center"
                  >
                    <ChevronRight className="h-4 w-4 mr-1" />
                    Close Panel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Exam Section ---
function ExamSection({ title, description, questions, answers, showAnswers, showHints, onAnswerChange, textAnswersFeedback }) {
  const [revealedHints, setRevealedHints] = useState({});

  const handleRevealHint = (qid) => {
    setRevealedHints(prev => ({ ...prev, [qid]: true }));
  };

  // Helper: determine correctness for radio/checkbox
  function getRadioCorrectness(question, answers) {
    if (!showAnswers) return "";
    if (typeof question.correctAnswer === "undefined" || question.correctAnswer === null) return "";
    if (answers[question.id] === undefined || answers[question.id] === "") return "unanswered";
    return answers[question.id] === question.correctAnswer ? "correct" : "incorrect";
  }
  function getCheckboxCorrectness(question, answers) {
    if (!showAnswers) return "";
    if (!Array.isArray(question.correctAnswers)) return "";
    const selected = answers[question.id] ? Object.entries(answers[question.id]).filter(([k, v]) => v).map(([k]) => k) : [];
    if (selected.length === 0) return "unanswered";
    const correctSet = new Set(question.correctAnswers);
    const numCorrect = selected.filter(opt => correctSet.has(opt)).length;
    const numIncorrect = selected.filter(opt => !correctSet.has(opt)).length;
    if (numCorrect === correctSet.size && numIncorrect === 0) return "correct";
    return "incorrect";
  }
  function getTextCorrectness(question, answers, textAnswersFeedback) {
    if (!showAnswers) return "";
    if (!textAnswersFeedback || !textAnswersFeedback[question.id]) return "";
    if (typeof textAnswersFeedback[question.id].score === "undefined") return "";
    if (textAnswersFeedback[question.id].score >= (textAnswersFeedback[question.id].maxScore || 1)) return "correct";
    if (textAnswersFeedback[question.id].score > 0) return "partial";
    return "incorrect";
  }

  return (
    <div className="border-b border-gray-200 pb-8">
      <h3 className="text-xl font-semibold text-gray-800 mb-2">{title}</h3>
      <p className="text-gray-600 text-sm mb-6">{description}</p>
      <div className="space-y-8">
        {questions.map((question) => {
          let correctness = "";
          if (question.type === "radio") {
            correctness = getRadioCorrectness(question, answers);
          } else if (question.type === "checkbox") {
            correctness = getCheckboxCorrectness(question, answers);
          } else if (question.type === "text") {
            correctness = getTextCorrectness(question, answers, textAnswersFeedback);
          }
          let borderColor = "";
          if (showAnswers) {
            if (correctness === "correct") borderColor = "border-l-4 border-green-500";
            else if (correctness === "incorrect") borderColor = "border-l-4 border-red-500";
            else if (correctness === "partial") borderColor = "border-l-4 border-yellow-500";
            else borderColor = "border-l-4 border-gray-300";
          }
          return (
            <div key={question.id} className={`bg-gray-50 p-6 rounded-xl ${borderColor}`}>
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-start">
                  <label className="text-gray-800 font-medium" htmlFor={question.id}>
                    {question.text}
                  </label>
                  {showHints && (
                    <div className="relative group ml-2" tabIndex={0} aria-label="Hint">
                      <Lightbulb className="h-5 w-5 text-yellow-500 cursor-help" tabIndex={0} />
                      <div className="absolute left-0 top-full mt-2 w-72 bg-yellow-50 border border-yellow-200 rounded-lg p-3 shadow-lg z-10 hidden group-focus:block group-hover:block">
                        <p className="text-sm text-yellow-800 font-medium mb-1">Hint:</p>
                        <p className="text-sm text-yellow-700">
                          {question.hint && typeof question.hint === "object"
                            ? question.hint.explanation
                            : (typeof question.hint === "string" ? question.hint : "Think about the core concepts related to this question.")}
                        </p>
                        {question.hint && typeof question.hint === "object" && question.hint.answer && (
                          <>
                            {!revealedHints[question.id] ? (
                              <button
                                className="mt-2 px-3 py-1 bg-yellow-200 text-yellow-900 rounded text-xs font-bold"
                                onClick={() => handleRevealHint(question.id)}
                              >
                                Reveal Answer
                              </button>
                            ) : (
                              <div className="mt-2 text-green-800 font-semibold">
                                <span className="block text-xs text-green-600 mb-1">Answer:</span>
                                {question.hint.answer}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                {showAnswers && question.points && (
                  <div className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded text-sm font-medium">
                    {question.points} points
                  </div>
                )}
              </div>
              {question.type === "radio" && (
                <div className="space-y-3">
                  {question.options.map((option, index) => {
                    let optionColor = "";
                    if (showAnswers) {
                      if (question.correctAnswer === option) optionColor = "text-green-700 font-semibold";
                      else if (answers[question.id] === option && question.correctAnswer !== option) optionColor = "text-red-700 font-semibold";
                    }
                    return (
                      <label key={index} className="flex items-start cursor-pointer group" htmlFor={`${question.id}_${index}`}>
                        <div className="flex items-center h-5">
                          <input
                            type="radio"
                            id={`${question.id}_${index}`}
                            name={question.id}
                            value={option}
                            checked={answers[question.id] === option}
                            onChange={() => onAnswerChange(question.id, option)}
                            disabled={showAnswers}
                            className="h-5 w-5 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                            aria-checked={answers[question.id] === option}
                            aria-labelledby={question.id}
                          />
                        </div>
                        <div className={`ml-3 text-gray-700 group-hover:text-gray-900 ${optionColor}`}>
                          {option}
                          {showAnswers && question.correctAnswer === option && (
                            <span className="ml-2 text-green-600 flex items-center text-sm">
                              <CheckCircle className="h-4 w-4 mr-1" /> Correct
                            </span>
                          )}
                          {showAnswers && answers[question.id] === option && question.correctAnswer !== option && (
                            <span className="ml-2 text-red-600 flex items-center text-sm">
                              <XCircle className="h-4 w-4 mr-1" /> Incorrect
                            </span>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
              {question.type === "checkbox" && (
                <div className="space-y-3">
                  {question.options.map((option, index) => {
                    let optionColor = "";
                    if (showAnswers) {
                      if (question.correctAnswers && question.correctAnswers.includes(option)) optionColor = "text-green-700 font-semibold";
                      else if (answers[question.id]?.[option] && question.correctAnswers && !question.correctAnswers.includes(option)) optionColor = "text-red-700 font-semibold";
                    }
                    return (
                      <label key={index} className="flex items-start cursor-pointer group" htmlFor={`${question.id}_${index}`}>
                        <div className="flex items-center h-5">
                          <input
                            type="checkbox"
                            id={`${question.id}_${index}`}
                            name={`${question.id}_${index}`}
                            checked={answers[question.id]?.[option] || false}
                            onChange={() => onAnswerChange(question.id, option, true)}
                            disabled={showAnswers}
                            className="h-5 w-5 text-indigo-600 focus:ring-indigo-500 rounded border-gray-300"
                            aria-checked={answers[question.id]?.[option] || false}
                            aria-labelledby={question.id}
                          />
                        </div>
                        <div className={`ml-3 text-gray-700 group-hover:text-gray-900 ${optionColor}`}>
                          {option}
                          {showAnswers && question.correctAnswers && question.correctAnswers.includes(option) && (
                            <span className="ml-2 text-green-600 flex items-center text-sm">
                              <CheckCircle className="h-4 w-4 mr-1" /> Correct
                            </span>
                          )}
                          {showAnswers && answers[question.id]?.[option] && question.correctAnswers && !question.correctAnswers.includes(option) && (
                            <span className="ml-2 text-red-600 flex items-center text-sm">
                              <XCircle className="h-4 w-4 mr-1" /> Incorrect
                            </span>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
              {question.type === "text" && (
                <div>
                  <div className="relative">
                    <textarea
                      id={question.id}
                      className={`w-full border rounded-lg p-4 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 h-40 bg-white ${
                        showAnswers
                          ? correctness === "correct"
                            ? "border-green-500"
                            : correctness === "partial"
                            ? "border-yellow-500"
                            : correctness === "incorrect"
                            ? "border-red-500"
                            : "border-gray-300"
                          : "border-gray-300"
                      }`}
                      placeholder="Type your answer here..."
                      value={answers[question.id] || ""}
                      onChange={e => onAnswerChange(question.id, e.target.value)}
                      disabled={showAnswers}
                    />
                    {showHints && (
                      <div className="absolute top-2 right-2">
                        <div className="relative group" tabIndex={0} aria-label="Hint">
                          <Lightbulb className="h-5 w-5 text-yellow-500 cursor-help" tabIndex={0} />
                          <div className="absolute right-0 top-full mt-2 w-72 bg-yellow-50 border border-yellow-200 rounded-lg p-3 shadow-lg z-10 hidden group-focus:block group-hover:block">
                            <p className="text-sm text-yellow-800 font-medium mb-1">Hint:</p>
                            <p className="text-sm text-yellow-700">
                              {question.hint && typeof question.hint === "object"
                                ? question.hint.explanation
                                : (typeof question.hint === "string" ? question.hint : "Answer all parts of the question. Use specific terminology. Be concise and clear.")}
                            </p>
                            {question.hint && typeof question.hint === "object" && question.hint.answer && (
                              <>
                                {!revealedHints[question.id] ? (
                                  <button
                                    className="mt-2 px-3 py-1 bg-yellow-200 text-yellow-900 rounded text-xs font-bold"
                                    onClick={() => handleRevealHint(question.id)}
                                  >
                                    Reveal Answer
                                  </button>
                                ) : (
                                  <div className="mt-2 text-green-800 font-semibold">
                                    <span className="block text-xs text-green-600 mb-1">Answer:</span>
                                    {question.hint.answer}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  {!showAnswers && (
                    <div className="flex justify-between text-xs text-gray-500 mt-2">
                      <span className="flex items-center">
                        <PenTool className="h-3 w-3 mr-1" />
                        Be concise and specific
                      </span>
                      <span>Recommended: 100-200 words</span>
                    </div>
                  )}
                  {showAnswers && textAnswersFeedback && textAnswersFeedback[question.id] && (
                    <div className="mt-4 space-y-3">
                      <div className="flex justify-between items-center">
                        <h4 className="font-medium text-gray-700">AI Evaluation</h4>
                        <div className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-sm font-medium">
                          Score: {textAnswersFeedback[question.id].score}/{textAnswersFeedback[question.id].maxScore}
                        </div>
                      </div>
                      <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                        <p className="font-medium text-yellow-800 mb-1">Feedback:</p>
                        <p className="text-yellow-700">{textAnswersFeedback[question.id].feedback}</p>
                      </div>
                      {question.sampleAnswer && (
                        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                          <p className="font-medium text-green-800 mb-1">Sample Answer:</p>
                          <p className="text-green-700">{question.sampleAnswer}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Score Bar ---
function ScoreBar({ label, score, total, color }) {
  const colorClasses = {
    indigo: "bg-indigo-600",
    green: "bg-green-600",
    purple: "bg-purple-600",
    blue: "bg-blue-600"
  };
  const percentage = total === 0 ? 0 : (score / total) * 100;
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-gray-600 text-sm">{label}</span>
        <span className="text-gray-800 font-medium">{score}/{total}</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5">
        <div
          className={`${colorClasses[color]} h-2.5 rounded-full`}
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
    </div>
  );
}

// --- Feature Badge ---
function FeatureBadge({ icon: Icon, text }) {
  return (
    <div className="bg-indigo-800 bg-opacity-50 rounded-full px-4 py-1 flex items-center text-sm">
      <Icon className="h-4 w-4 mr-1" />
      {text}
    </div>
  );
}

// --- Feature Card ---
function FeatureCard({ icon: Icon, title, description, color }) {
  const colorClasses = {
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-100",
    purple: "bg-purple-50 text-purple-700 border-purple-100",
    blue: "bg-blue-50 text-blue-700 border-blue-100"
  };
  const iconColorClasses = {
    indigo: "bg-indigo-100 text-indigo-600",
    purple: "bg-purple-100 text-purple-600",
    blue: "bg-blue-100 text-blue-600"
  };
  return (
    <div className={`rounded-xl p-6 border ${colorClasses[color]} shadow-sm`}>
      <div className={`p-3 rounded-full ${iconColorClasses[color]} inline-block mb-4`}>
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="font-bold text-lg mb-2">{title}</h3>
      <p className="text-gray-600">{description}</p>
    </div>
  );
}

// --- Feature Step ---
function FeatureStep({ number, title, description }) {
  return (
    <div className="flex items-start">
      <div className="bg-indigo-100 text-indigo-700 rounded-full h-10 w-10 flex items-center justify-center font-bold flex-shrink-0 text-lg">
        {number}
      </div>
      <div className="ml-4">
        <h3 className="font-medium text-lg text-gray-800">{title}</h3>
        <p className="text-gray-600">{description}</p>
      </div>
    </div>
  );
}

// --- Upload Option ---
function UploadOption({ icon: Icon, title, description, onClick, active, disabled, features }) {
  return (
    <button
      className={`p-6 rounded-xl border-2 text-left transition focus:outline-none ${
        active
          ? "border-indigo-500 bg-indigo-50"
          : "border-gray-200 hover:border-indigo-300 hover:bg-indigo-50"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      onClick={onClick}
      disabled={disabled}
    >
      <div className="flex items-start">
        <div className={`p-3 rounded-full ${active ? "bg-indigo-100" : "bg-gray-100"} mr-4`}>
          <Icon className={`h-8 w-8 ${active ? "text-indigo-600" : "text-gray-500"}`} />
        </div>
        <div>
          <h3 className={`font-bold text-lg ${active ? "text-indigo-700" : "text-gray-800"}`}>{title}</h3>
          <p className="text-gray-600 mt-1">{description}</p>
          {features && (
            <ul className="mt-3 space-y-1">
              {features.map((feature, index) => (
                <li key={index} className="flex items-center text-sm text-gray-500">
                  <Check className="h-4 w-4 mr-1 text-green-500" />
                  {feature}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </button>
  );
}

// --- Help Tool Button ---
function HelpToolButton({ icon: Icon, label, active, onClick }) {
  return (
    <button
      className={`flex flex-col items-center justify-center p-3 rounded-lg transition ${
        active
          ? "bg-indigo-100 text-indigo-700"
          : "bg-gray-50 text-gray-600 hover:bg-gray-100"
      }`}
      onClick={onClick}
    >
      <Icon className="h-6 w-6 mb-1" />
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}

// --- Concept Card ---
function ConceptCard({ title, description }) {
  return (
    <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
      <h5 className="font-medium text-indigo-700 mb-1">{title}</h5>
      <p className="text-gray-600 text-sm">{description}</p>
    </div>
  );
}

// --- History Tab ---
function HistoryTab({ history }) {
  return (
    <div className="bg-white rounded-xl shadow-xl p-8 border border-indigo-100 max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center">
        <List className="h-6 w-6 mr-2" />
        Exam History
      </h2>
      {history.length === 0 ? (
        <div className="text-gray-500 text-center py-12">No past attempts yet.</div>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th className="py-2 px-3 text-gray-700 font-medium">Date</th>
              <th className="py-2 px-3 text-gray-700 font-medium">Subject</th>
              <th className="py-2 px-3 text-gray-700 font-medium">Score</th>
            </tr>
          </thead>
          <tbody>
            {history.slice().reverse().map((h, i) => (
              <tr key={i} className="border-t border-gray-200">
                <td className="py-2 px-3">{new Date(h.timestamp).toLocaleString()}</td>
                <td className="py-2 px-3">{h.subject}</td>
                <td className="py-2 px-3">{h.scoreBreakdown.earned}/{h.scoreBreakdown.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// --- Send Icon ---
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

// --- AI Tutor Chat ---
function AITutorChat({ apiKey, model, examJSON }) {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "How can I help with your exam today?"
    }
  ]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const chatBottomRef = useRef(null);
  const [popupContent, setPopupContent] = useState(null);

  // Scroll to bottom on new message
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
    setMessages(prev => [...prev, userMsg]);
    setInput("");

    try {
      const prompt = [
        {
          role: "system",
          content:
            "You are an AI tutor for students taking an exam. " +
            "Provide helpful, USE BABY WORDS concise explanations and guidance about exam concepts, structure, and strategies. " +
            "Do NOT give away answers to specific exam questions. " +
            "If the user asks about a specific question, help them understand the concept or how to approach it, but do not provide the answer. " +
            "Exam context: " +
            (examJSON?.title ? `Title: ${examJSON.title}. ` : "") +
            `Sections: ${Object.keys(examJSON || {}).filter(k => Array.isArray(examJSON[k]) && examJSON[k].length > 0).join(", ")}.`
        },
        ...messages.slice(-10), // last 10 messages for context
        userMsg
      ];

      const data = await callOpenAI({
        apiKey,
        model,
        messages: prompt,
        temperature: 0.3,
        max_tokens: 256
      });

      const response = data.choices[0].message.content.trim();
      setMessages(prev => [...prev, { role: "assistant", content: response }]);
    } catch (e) {
      setError(e.message || "Failed to get response from AI tutor.");
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
            <div
              key={i}
              className={
                msg.role === "assistant"
                  ? "bg-indigo-100 text-indigo-800 p-2 rounded-lg max-w-[80%] ml-auto cursor-pointer hover:bg-indigo-200 transition"
                  : "bg-white p-2 rounded-lg max-w-[80%]"
              }
              onClick={
                msg.role === "assistant"
                  ? () => setPopupContent(msg.content)
                  : undefined
              }
              tabIndex={msg.role === "assistant" ? 0 : undefined}
              style={msg.role === "assistant" ? { outline: "none" } : undefined}
              onKeyDown={
                msg.role === "assistant"
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") setPopupContent(msg.content);
                    }
                  : undefined
              }
              aria-label={msg.role === "assistant" ? "Show full response" : undefined}
            >
              {msg.content}
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
            onChange={e => setInput(e.target.value)}
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
        {error && (
          <div className="text-red-600 text-xs mt-2">{error}</div>
        )}
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
            <div className="text-lg text-gray-800 whitespace-pre-line break-words">
              {popupContent}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
