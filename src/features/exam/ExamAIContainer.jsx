import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart,
  Brain,
  CheckCircle,
  Coffee,
  Compass,
  FileText,
  Image,
  RefreshCw,
  Settings,
  Sparkles,
  Upload,
  XCircle,
  Zap
} from "lucide-react";
import Tesseract from "tesseract.js";

import ExamView from "./components/ExamView";
import PracticeQuestionView from "../practice/components/PracticeQuestionView";
import SettingsModal from "../settings/components/SettingsModal";
import HistoryTab from "../history/components/HistoryTab";
import VoiceTutor from "../tutor/components/VoiceTutor";
import FeatureBadge from "../shared/components/FeatureBadge";
import FeatureCard from "../shared/components/FeatureCard";
import FeatureStep from "../shared/components/FeatureStep";
import UploadOption from "../shared/components/UploadOption";

import { EXAM_FUNCTION } from "../../lib/exam/schema";
import {
  extractExamFromResponse,
  normalizeExamStructure,
  robustLLMJsonParse
} from "../../lib/exam/normalize";
import { estimateTokens } from "../../lib/utils/tokens";
import { hashString } from "../../lib/utils/hash";
import { createAIClient } from "../../lib/ai/client";
import { FALLBACK_MODELS, normalizeModelList } from "../../lib/ai/models";
import {
  DEFAULT_MODEL,
  DEFAULT_TTS_VOICE,
  useAppSettings
} from "../settings/useAppSettings";

const SESSION_KEY_PREFIX = "examSession:";
const HISTORY_KEY = "examHistory";
const TOKEN_KEY = "examAI:tokenUsage";

function validateSettings(settings) {
  if (settings.providerMode === "proxy") {
    if (!settings.backendBaseUrl?.trim()) return "Proxy mode requires backend base URL.";
    if (!settings.backendAuthToken?.trim()) return "Proxy mode requires backend auth token.";
    return "";
  }
  if (!settings.cometApiKey?.trim()) return "Direct mode requires a Comet API key.";
  return "";
}

export default function ExamAIContainer() {
  const { settings, setSettings, loaded, hasStoredSecrets, clearStoredSecrets } =
    useAppSettings();
  const model = settings.model || DEFAULT_MODEL;
  const ttsVoice = settings.ttsVoice || DEFAULT_TTS_VOICE;

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsValidationError, setSettingsValidationError] = useState("");
  const [models, setModels] = useState(FALLBACK_MODELS);
  const [tokenUsage, setTokenUsage] = useState({ session: 0, actions: [] });
  const aiClient = useMemo(() => createAIClient(() => settings), [settings]);

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

  // --- Adaptive Practice State ---
  const [practiceMode, setPracticeMode] = useState(false);
  const [practiceQuestions, setPracticeQuestions] = useState([]);
  const [currentPracticeIndex, setCurrentPracticeIndex] = useState(0);
  const [practiceAnswer, setPracticeAnswer] = useState("");
  const [practiceFeedback, setPracticeFeedback] = useState(null);

  // --- Practice History ---
  const [practiceHistory, setPracticeHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("practiceHistory") || "[]");
    } catch {
      return [];
    }
  });

  // --- Timer/Progress State ---
  const [timer, setTimer] = useState(60 * 60);
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

  // --- Load non-settings state on Mount ---
  useEffect(() => {
    const tu = JSON.parse(localStorage.getItem(TOKEN_KEY) || "{}");
    setTokenUsage(tu.session ? tu : { session: 0, actions: [] });

    const hist = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    setHistory(hist);
  }, []);

  // --- Mark whether secrets are persisted ---
  useEffect(() => {
    setSettingsSaved(hasStoredSecrets);
  }, [hasStoredSecrets]);

  // --- Fetch model list ---
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;

    const run = async () => {
      try {
        const modelResp = await aiClient.listModels();
        if (cancelled) return;
        setModels(normalizeModelList(modelResp?.data || modelResp?.models || []));
      } catch {
        if (!cancelled) setModels(FALLBACK_MODELS);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [aiClient, loaded]);

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
    localStorage.setItem(
      SESSION_KEY_PREFIX + hash,
      JSON.stringify(sessionData)
    );
  }, [examJSON, answers, timer, ocrText, rawText, sessionHash]);

  // --- Restore Session on Mount ---
  useEffect(() => {
    const keys = Object.keys(localStorage).filter((k) =>
      k.startsWith(SESSION_KEY_PREFIX)
    );
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
      setTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          handleAutoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
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
      ].filter((q) => {
        if (q.type === "radio")
          return answers[q.id] !== undefined && answers[q.id] !== "";
        if (q.type === "checkbox")
          return (
            answers[q.id] &&
            Object.values(answers[q.id]).some((val) => Boolean(val))
          );
        if (q.type === "text")
          return answers[q.id] && answers[q.id].trim().length > 0;
        return false;
      }).length
    : 0;

  const callOpenAI = async ({
    model: reqModel,
    messages,
    temperature = 0.3,
    max_tokens = 1024,
    tools = null,
    tool_choice = null,
    forceJson = false
  }) => {
    const payload = {
      model: reqModel || model,
      messages,
      temperature,
      max_tokens
    };

    if (Array.isArray(tools) && tools.length > 0) {
      payload.tools = tools;
      if (tool_choice) payload.tool_choice = tool_choice;
    } else if (forceJson) {
      payload.response_format = { type: "json_object" };
    }

    return aiClient.chatCompletions(payload);
  };

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
    if (!text || !text.trim()) {
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

      const tokensPrompt = estimateTokens(
        prompt.map((m) => m.content).join("\n")
      );

      const data = await callOpenAI({
        model,
        messages: prompt,
        temperature: 0.2,
        max_tokens: 11000,
        tools: [EXAM_FUNCTION],
        tool_choice: { type: "function", function: { name: "return_exam" } }
      });

      let exam;
      try {
        exam = extractExamFromResponse(data);
      } catch {
        const toolCall =
          data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
        if (toolCall && typeof toolCall === "string") {
          let jsonStr = toolCall;
          if (jsonStr.lastIndexOf("]") < jsonStr.lastIndexOf("[")) jsonStr += "]";
          if (jsonStr.lastIndexOf("}") < jsonStr.lastIndexOf("{"))
            jsonStr += "}";
          try {
            exam = robustLLMJsonParse(jsonStr);
            exam = normalizeExamStructure(exam);
          } catch {
            setError(
              "Exam data was truncated or incomplete. Try again or reduce exam length."
            );
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
      if (
        data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments
      ) {
        try {
          const args = robustLLMJsonParse(
            data.choices[0].message.tool_calls[0].function.arguments
          );
          if (args.suggestedTime && Number.isInteger(args.suggestedTime)) {
            suggestedTime = args.suggestedTime;
          }
        } catch {
          /* ignore */
        }
      } else if (exam.suggestedTime && Number.isInteger(exam.suggestedTime)) {
        suggestedTime = exam.suggestedTime;
      }
      setAiSuggestedTime(suggestedTime);

      setTokenUsage((prev) => ({
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
      const hash = hashString(JSON.stringify(exam));
      setSessionHash(hash);

      // --- Adaptive Practice Mode: build pool from this + past exams ---
      const allQuestions = [];

      ["multipleChoice", "trueFalse", "checkbox", "shortAnswer"].forEach(
        (typeKey) => {
          (exam[typeKey] || []).forEach((q) =>
            allQuestions.push({ ...q, type: typeKey, sourceExam: exam })
          );
        }
      );

      const hist = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      hist.forEach((h) => {
        if (h.examJSON) {
          ["multipleChoice", "trueFalse", "checkbox", "shortAnswer"].forEach(
            (typeKey) => {
              (h.examJSON[typeKey] || []).forEach((q) =>
                allQuestions.push({
                  ...q,
                  type: typeKey,
                  sourceExam: h.examJSON
                })
              );
            }
          );
        }
      });

      if (allQuestions.length > 0) {
        const shuffled = allQuestions.sort(() => Math.random() - 0.5);
        setPracticeQuestions(shuffled);
        setCurrentPracticeIndex(0);
        setPracticeMode(true);
        setPracticeAnswer("");
        setPracticeFeedback(null);
      } else {
        setPracticeMode(false);
      }
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
        const selected = answers[q.id]
          ? Object.entries(answers[q.id])
              .filter(([, v]) => v)
              .map(([k]) => k)
          : [];
        const numCorrect = selected.filter((opt) => correctSet.has(opt)).length;
        const numIncorrect = selected.filter((opt) => !correctSet.has(opt))
          .length;
        const partial = Math.max(
          0,
          (numCorrect - numIncorrect) / correctSet.size
        );
        const pts = Math.round((q.points || 1) * partial);
        score.checkbox.earned += pts;
        score.earned += pts;
      }
    }

    // Short Answer (batched)
    const batchedShortAnswers = [];
    for (const q of examJSON.shortAnswer || []) {
      const maxScore = q.points || 1;
      score.shortAnswer.total += maxScore;
      score.total += maxScore;

      const studentAnswer = answers[q.id] || "";
      if (
        q.sampleAnswer &&
        studentAnswer &&
        studentAnswer.trim().toLowerCase() === q.sampleAnswer.trim().toLowerCase()
      ) {
        score.shortAnswer.earned += maxScore;
        score.earned += maxScore;
        feedback[q.id] = {
          score: maxScore,
          feedback: "Perfect answer. Matches the sample answer.",
          maxScore
        };
        continue;
      }

      batchedShortAnswers.push({
        id: q.id,
        question: q.text,
        points: maxScore,
        sampleAnswer: q.sampleAnswer || "",
        studentAnswer
      });
    }

    if (batchedShortAnswers.length > 0) {
      try {
        const prompt = [
          {
            role: "system",
            content:
              "You are an expert grader. Grade each short-answer item independently. " +
              "Return JSON only in this shape: { \"results\": [{ \"id\": string, \"score\": int, \"feedback\": string }] }. " +
              "Score must be 0..points for each item, and feedback must be concise."
          },
          {
            role: "user",
            content: JSON.stringify({ items: batchedShortAnswers })
          }
        ];

        const tokensPrompt = estimateTokens(prompt.map((m) => m.content).join("\n"));
        const data = await callOpenAI({
          model,
          messages: prompt,
          temperature: 0.2,
          max_tokens: Math.min(6000, 400 + batchedShortAnswers.length * 180),
          forceJson: true
        });

        const response = data?.choices?.[0]?.message?.content?.trim() || "";
        const tokensResponse = estimateTokens(response);
        setTokenUsage((prev) => ({
          session: prev.session + tokensPrompt + tokensResponse,
          actions: [
            ...prev.actions,
            {
              type: "gradeShortAnswerBatch",
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
        } catch {
          parsed = { results: [] };
        }

        const resultMap = new Map(
          (parsed?.results || []).map((r) => [String(r.id), r])
        );

        for (const item of batchedShortAnswers) {
          const r = resultMap.get(String(item.id));
          if (!r) {
            feedback[item.id] = {
              score: 0,
              feedback: "Could not grade answer (missing model result).",
              maxScore: item.points
            };
            continue;
          }
          const pts = Math.min(item.points, Math.max(0, Number(r.score || 0)));
          score.shortAnswer.earned += pts;
          score.earned += pts;
          feedback[item.id] = {
            score: pts,
            feedback: r.feedback || "No feedback returned.",
            maxScore: item.points
          };
        }
      } catch {
        for (const item of batchedShortAnswers) {
          feedback[item.id] = {
            score: 0,
            feedback: "Could not grade answer (API error).",
            maxScore: item.points
          };
        }
      }
    }

    setExamScore(score);
    setTextAnswersFeedback(feedback);
    setExamCompleted(true);
    setTimerActive(false);

    // Save to history INCLUDING examJSON so we can pull "similar exams" later
    const hist = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    hist.push({
      timestamp: Date.now(),
      subject: examJSON.title || "Exam",
      scoreBreakdown: score,
      examJSON
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

      const tokensPrompt = estimateTokens(
        prompt.map((m) => m.content).join("\n")
      );

      const data = await callOpenAI({
        model,
        messages: prompt,
        temperature: 0.3,
        max_tokens: 2048,
        tools: [EXAM_FUNCTION],
        tool_choice: { type: "function", function: { name: "return_exam" } }
      });

      const exam = extractExamFromResponse(data);
      const tokensResponse = estimateTokens(JSON.stringify(exam));

      setTokenUsage((prev) => ({
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
    setAnswers((prev) => {
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
    const validation = validateSettings(settings);
    if (validation) {
      setSettingsValidationError(validation);
      return;
    }
    setSettingsValidationError("");
    setSettingsSaved(
      Boolean(settings.saveKey && (settings.cometApiKey || settings.backendAuthToken))
    );
    setSettingsOpen(false);
  };

  const handleDeleteKey = () => {
    clearStoredSecrets();
    setSettingsSaved(false);
  };

  const handleResetSession = () => {
    setTokenUsage({ session: 0, actions: [] });
    localStorage.setItem(
      TOKEN_KEY,
      JSON.stringify({ session: 0, actions: [] })
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white">
      <header className="bg-gradient-to-r from-indigo-700 to-purple-700 text-white py-6 shadow-lg">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between">
            <div>
              <button
                className="text-3xl font-bold flex items-center focus:outline-none hover:underline"
                onClick={() => {
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
                  setPracticeMode(false);
                  setPracticeQuestions([]);
                  setCurrentPracticeIndex(0);
                  setPracticeAnswer("");
                  setPracticeFeedback(null);
                }}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  margin: 0,
                  cursor: "pointer"
                }}
                type="button"
              >
                <Brain className="h-8 w-8 mr-3" />
                ExamAI Converter
              </button>
              <p className="text-indigo-100 mt-1">
                All processing happens locally in your browser. Your API key is
                stored only on this device if you choose.
              </p>
            </div>
            <div className="hidden md:flex space-x-4">
              <FeatureBadge
                icon={Zap}
                text="Convert exam text or images to a structured exam in-browser."
              />
              <FeatureBadge
                icon={CheckCircle}
                text="Grading with your selected AI model (runs from this browser)."
              />
              <FeatureBadge
                icon={Sparkles}
                text="Generate new practice exams on demand with your model."
              />
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
            settings={settings}
            setSettings={setSettings}
            onClose={() => setSettingsOpen(false)}
            onSave={handleSaveSettings}
            onDeleteKey={handleDeleteKey}
            settingsSaved={settingsSaved}
            tokenUsage={tokenUsage}
            onResetSession={handleResetSession}
            models={models}
            validationError={settingsValidationError}
          />
        )}

        <div className="flex justify-between mb-4">
          <div>
            <button
              className={`mr-2 px-4 py-2 rounded-lg ${
                !historyTab
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-indigo-700 border border-indigo-300"
              } font-medium`}
              onClick={() => setHistoryTab(false)}
            >
              Exam
            </button>
            <button
              className={`px-4 py-2 rounded-lg ${
                historyTab
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-indigo-700 border border-indigo-300"
              } font-medium`}
              onClick={() => setHistoryTab(true)}
            >
              History
            </button>
          </div>
          <div className="text-gray-600 text-sm flex items-center">
            <BarChart className="h-4 w-4 mr-1" />
            Estimated tokens this session:{" "}
            <span className="font-bold ml-1">{tokenUsage.session}</span>
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
        ) : practiceMode ? (
          <>
            <div className="mb-4 flex justify-end">
              <button
                className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg font-medium border border-gray-300 hover:bg-gray-200"
                onClick={() => setPracticeMode(false)}
              >
                Return to Full Exam
              </button>
            </div>
            <PracticeQuestionView
              questions={practiceQuestions}
              currentIndex={currentPracticeIndex}
              answer={practiceAnswer}
              setAnswer={setPracticeAnswer}
              feedback={practiceFeedback}
              setFeedback={setPracticeFeedback}
              onNext={() => {
                setPracticeFeedback(null);
                setPracticeAnswer("");
                if (practiceQuestions.length > 0) {
                  setCurrentPracticeIndex(
                    (i) => (i + 1) % practiceQuestions.length
                  );
                }
              }}
              onPrev={() => {
                setPracticeFeedback(null);
                setPracticeAnswer("");
                if (practiceQuestions.length > 0) {
                  setCurrentPracticeIndex(
                    (i) =>
                      (i - 1 + practiceQuestions.length) %
                      practiceQuestions.length
                  );
                }
              }}
              onCheck={async () => {
                const q = practiceQuestions[currentPracticeIndex];
                if (!q) return;
                setIsProcessing(true);
                setPracticeFeedback(null);
                let feedbackResult = null;
                let feedbackType = "objective";
                try {
                  const hasOptions =
                    Array.isArray(q.options) && q.options.length > 0;
                  const isObjective =
                    hasOptions &&
                    ["multipleChoice", "trueFalse", "checkbox"].includes(q.type);

                  if (isObjective) {
                    let userAnswerText = "";

                    if (q.type === "checkbox") {
                      const selectedOptions =
                        practiceAnswer && typeof practiceAnswer === "object"
                          ? Object.entries(practiceAnswer)
                              .filter(([, v]) => v)
                              .map(([k]) => k)
                          : [];
                      userAnswerText = selectedOptions.join(", ");
                    } else {
                      userAnswerText =
                        typeof practiceAnswer === "string"
                          ? practiceAnswer
                          : String(practiceAnswer || "");
                    }

                    const prompt = [
                      {
                        role: "system",
                        content:
                          "You are an expert exam tutor. Given a question, options, and a student's answer, say 'Yes' if the answer is fully correct, 'No' if not. " +
                          "Then briefly explain why. Keep the explanation short."
                      },
                      {
                        role: "user",
                        content: `Question: ${
                          q.text
                        }\nOptions: ${(q.options || []).join(
                          ", "
                        )}\nStudent Answer: ${userAnswerText}\nCorrect Answer(s): ${
                          q.correctAnswer || q.correctAnswers || ""
                        }`
                      }
                    ];

                    const data = await callOpenAI({
                      model,
                      messages: prompt,
                      temperature: 0.2,
                      max_tokens: 128
                    });
                    feedbackResult =
                      data.choices[0].message.content.trim() ||
                      "No feedback returned.";
                    feedbackType = "objective";
                    setPracticeFeedback(feedbackResult);
                  } else {
                    const prompt = [
                      {
                        role: "system",
                        content:
                          "You are an expert exam marker. Given a question and a student's answer, break the answer into key points, mark each, " +
                          'and give a total mark out of the question\'s points. Return ONLY JSON: { "breakdown": [ { "point": string, "achieved": boolean } ], "score": int, "feedback": string }.'
                      },
                      {
                        role: "user",
                        content: `Question: ${q.text}\nPoints: ${
                          q.points || 1
                        }\nStudent Answer: ${
                          typeof practiceAnswer === "string"
                            ? practiceAnswer
                            : String(practiceAnswer || "")
                        }\nSample Answer: ${q.sampleAnswer || ""}`
                      }
                    ];

                    const data = await callOpenAI({
                      model,
                      messages: prompt,
                      temperature: 0.2,
                      max_tokens: 256
                    });

                    let parsed;
                    try {
                      parsed = robustLLMJsonParse(
                        data.choices[0].message.content
                      );
                    } catch {
                      const content =
                        data.choices[0].message.content || "";
                      const jsonMatch = content.match(/\{[\s\S]*\}/);
                      if (jsonMatch) {
                        try {
                          parsed = JSON.parse(jsonMatch[0]);
                        } catch {
                          setPracticeFeedback("Could not parse AI feedback.");
                          setIsProcessing(false);
                          return;
                        }
                      } else {
                        setPracticeFeedback("Could not parse AI feedback.");
                        setIsProcessing(false);
                        return;
                      }
                    }

                    feedbackResult = parsed;
                    feedbackType = "written";
                    setPracticeFeedback(parsed);
                  }

                  const historyEntry = {
                    timestamp: Date.now(),
                    question: q,
                    answer: practiceAnswer,
                    feedback: feedbackResult,
                    feedbackType
                  };
                  setPracticeHistory((prev) => {
                    const updated = [...prev, historyEntry];
                    localStorage.setItem(
                      "practiceHistory",
                      JSON.stringify(updated)
                    );
                    return updated;
                  });
                } catch (e) {
                  setPracticeFeedback(
                    "AI error: " + (e.message || "unknown")
                  );
                }
                setIsProcessing(false);
              }}
              onSimilar={async () => {
                const q = practiceQuestions[currentPracticeIndex];
                if (!q) return;
                setIsProcessing(true);
                try {
                  const prompt = [
                    {
                      role: "system",
                      content:
                        "You are an expert exam generator. Given a question, generate a similar question of the same type and difficulty. " +
                        "Return JSON: { text: string, options: array (if applicable), type: string, points: int, sampleAnswer: string (if applicable) }"
                    },
                    {
                      role: "user",
                      content: `Question: ${q.text}\nType: ${
                        q.type
                      }\nOptions: ${(q.options || []).join(", ")}`
                    }
                  ];
                  const data = await callOpenAI({
                    model,
                    messages: prompt,
                    temperature: 0.3,
                    max_tokens: 256
                  });
                  let newQ;
                  try {
                    newQ = robustLLMJsonParse(
                      data.choices[0].message.content
                    );
                  } catch {
                    setIsProcessing(false);
                    return;
                  }
                  setPracticeQuestions((prev) => {
                    const updated = [...prev];
                    updated.splice(currentPracticeIndex + 1, 0, newQ);
                    return updated;
                  });
                  setCurrentPracticeIndex((i) => i + 1);
                  setPracticeAnswer("");
                  setPracticeFeedback(null);
                } catch (e) {
                  setPracticeFeedback(
                    "AI error: " + (e.message || "unknown")
                  );
                }
                setIsProcessing(false);
              }}
              onDifferent={async () => {
                if (practiceQuestions.length > 1) {
                  setPracticeFeedback(null);
                  setPracticeAnswer("");
                  setCurrentPracticeIndex(
                    (i) => (i + 1) % practiceQuestions.length
                  );
                }
              }}
              onRequestType={async (type) => {
                setIsProcessing(true);
                try {
                  const prompt = [
                    {
                      role: "system",
                      content:
                        "You are an expert exam generator. Generate a question of the requested type (multiple choice, short answer, checkbox, essay, etc.) " +
                        "on the same subject as the uploaded exam. Return JSON: { text: string, options: array (if applicable), type: string, points: int, sampleAnswer: string (if applicable) }"
                    },
                    {
                      role: "user",
                      content: `Type: ${type}\nSubject: ${
                        examJSON?.title || "General"
                      }`
                    }
                  ];
                  const data = await callOpenAI({
                    model,
                    messages: prompt,
                    temperature: 0.3,
                    max_tokens: 256
                  });
                  let newQ;
                  try {
                    newQ = robustLLMJsonParse(
                      data.choices[0].message.content
                    );
                  } catch {
                    setIsProcessing(false);
                    return;
                  }
                  setPracticeQuestions((prev) => {
                    const updated = [...prev];
                    updated.splice(currentPracticeIndex + 1, 0, newQ);
                    return updated;
                  });
                  setCurrentPracticeIndex((i) => i + 1);
                  setPracticeAnswer("");
                  setPracticeFeedback(null);
                } catch (e) {
                  setPracticeFeedback(
                    "AI error: " + (e.message || "unknown")
                  );
                }
                setIsProcessing(false);
              }}
              isProcessing={isProcessing}
              practiceHistory={practiceHistory}
            />
          </>
        ) : !examJSON ? (
          <div className="max-w-5xl mx-auto">
            <div className="grid md:grid-cols-3 gap-6 mb-8">
              <FeatureCard
                icon={Compass}
                title="Single-question drills"
                description="Upload an exam and we'll pull out one question at a time so you can focus without being overwhelmed."
                color="indigo"
              />
              <FeatureCard
                icon={Brain}
                title="Smart marking"
                description="Multiple choice gets a simple yes/no with reasoning. Written answers are broken into key points and marked."
                color="purple"
              />
              <FeatureCard
                icon={Coffee}
                title="Rapid retries"
                description="Ask for similar or completely different questions, or request a specific type like essay or multi-choice."
                color="blue"
              />
            </div>

            <div className="bg-white rounded-xl shadow-xl border border-indigo-100 p-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-2 flex items-center">
                <Upload className="h-6 w-6 mr-2 text-indigo-600" />
                Upload an assessment to start practising
              </h2>
              <p className="text-gray-600 mb-6">
                Choose how you want to give the exam to the AI. After
                conversion you'll drop straight into single-question practice,
                with the full exam still available.
              </p>

              <div className="grid md:grid-cols-2 gap-4 mb-6">
                <UploadOption
                  icon={FileText}
                  title="Paste exam text"
                  description="Copy and paste questions from a document, LMS, or PDF export."
                  onClick={() => handleUpload("text")}
                  active={uploadType === "text"}
                  disabled={isProcessing}
                  features={[
                    "Best for clean text",
                    "Supports long exams",
                    "Keeps formatting simple"
                  ]}
                />
                <UploadOption
                  icon={Image}
                  title="Upload image (OCR)"
                  description="Upload a clear photo or screenshot of an exam page and we'll run OCR on it."
                  onClick={() => handleUpload("image")}
                  active={uploadType === "image"}
                  disabled={isProcessing}
                  features={[
                    "Use photos or screenshots",
                    "Automatic text extraction",
                    "Edit OCR output before converting"
                  ]}
                />
              </div>

              {uploadType === "text" && (
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Paste your exam or assignment
                  </label>
                  <textarea
                    className="w-full border border-gray-300 rounded-lg p-4 h-64 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Paste the full exam, assignment, or essay prompts here..."
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    disabled={isProcessing}
                  />
                </div>
              )}

              {uploadType === "image" && (
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Upload an exam image
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileInput}
                    className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 focus:outline-none"
                    disabled={isProcessing}
                  />
                  {ocrFileName && (
                    <p className="text-xs text-gray-500 mt-1">
                      Selected:{" "}
                      <span className="font-medium">{ocrFileName}</span>
                    </p>
                  )}
                  <div className="mt-4">
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      OCR preview (you can edit this before converting)
                    </label>
                    <textarea
                      className="w-full border border-gray-300 rounded-lg p-3 h-48 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      value={ocrText}
                      onChange={(e) => setOcrText(e.target.value)}
                      placeholder={
                        isProcessing
                          ? "Running OCR on the image..."
                          : "The recognised text will appear here."
                      }
                      disabled={isProcessing}
                    />
                  </div>
                </div>
              )}

              {uploadType === "none" && (
                <p className="text-gray-500 text-sm mb-6">
                  Pick an upload method above to get started.
                </p>
              )}

              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-500 flex items-center">
                  <AlertTriangle className="h-4 w-4 mr-1 text-yellow-500" />
                  Make sure there are no student names or personal data in the
                  text you paste.
                </div>
                <button
                  type="button"
                  onClick={handleProcessExam}
                  disabled={
                    isProcessing ||
                    !(
                      (uploadType === "text" && rawText.trim()) ||
                      (uploadType === "image" && ocrText.trim())
                    )
                  }
                  className={`inline-flex items-center px-5 py-3 rounded-lg text-sm font-medium shadow ${
                    isProcessing ||
                    !(
                      (uploadType === "text" && rawText.trim()) ||
                      (uploadType === "image" && ocrText.trim())
                    )
                      ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                      : "bg-indigo-600 text-white hover:bg-indigo-700"
                  }`}
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Brain className="h-4 w-4 mr-2" />
                      Convert to AI Exam
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="mt-10 grid md:grid-cols-3 gap-6">
              <FeatureStep
                number={1}
                title="Upload once"
                description="Paste or scan the exam and let the AI pull out all the questions."
              />
              <FeatureStep
                number={2}
                title="Drill one question"
                description="We start you on a single question drawn from this or a similar exam."
              />
              <FeatureStep
                number={3}
                title="Iterate with AI"
                description="Check your answer, ask for similar or harder questions, or switch to full exam view."
              />
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
            canSubmit={answeredCount === totalQuestions}
            timerEnabled={timerEnabled}
            setTimerEnabled={setTimerEnabled}
            aiSuggestedTime={aiSuggestedTime}
            aiClient={aiClient}
            model={model}
            enableTutorWebSearch={settings.enableTutorWebSearch}
            searchContextSize={settings.searchContextSize}
          />
        )}
      </main>

      <VoiceTutor
        aiClient={aiClient}
        model={model}
        examJSON={examJSON}
        ttsVoice={ttsVoice}
        voiceOutputMode={settings.voiceOutputMode}
        enableWebSearch={settings.enableTutorWebSearch}
        searchContextSize={settings.searchContextSize}
      />
    </div>
  );
}
