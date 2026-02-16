import { useEffect, useRef, useState } from "react";
import { CheckCircle, ChevronLeft, ChevronRight, Compass, RefreshCw } from "lucide-react";

function AccessibleMenu({ label, options, onSelect, disabled }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef();
  const menuRef = useRef();

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
    }
    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative inline-block">
      <button
        ref={buttonRef}
        className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg font-medium"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls="practice-type-menu"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (
            e.key === "ArrowDown" ||
            e.key === "Enter" ||
            e.key === " "
          ) {
            e.preventDefault();
            setOpen(true);
            setTimeout(() => {
              if (menuRef.current) {
                const first = menuRef.current.querySelector("button");
                if (first) first.focus();
              }
            }, 0);
          }
        }}
      >
        {label}
      </button>
      {open && (
        <div
          id="practice-type-menu"
          ref={menuRef}
          className="absolute z-10 bg-white border border-gray-200 rounded shadow-lg mt-2 min-w-[180px]"
          role="menu"
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              className="block w-full text-left px-4 py-2 hover:bg-indigo-50 focus:bg-indigo-100"
              role="menuitem"
              tabIndex={0}
              onClick={() => {
                onSelect(opt.value);
                setOpen(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  const next = e.target.nextSibling;
                  if (next) next.focus();
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  const prev = e.target.previousSibling;
                  if (prev) prev.focus();
                  else buttonRef.current.focus();
                }
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Practice Question View ---
export default function PracticeQuestionView({
  questions,
  currentIndex,
  answer,
  setAnswer,
  feedback,
  setFeedback,
  onNext,
  onPrev,
  onCheck,
  onSimilar,
  onDifferent,
  onRequestType,
  isProcessing,
  practiceHistory = []
}) {
  const q = questions[currentIndex];

  const thisHistory = practiceHistory.filter(
    (h) =>
      q &&
      h.question &&
      (h.question.id === q.id || h.question.text === q.text)
  );

  const hasAnswer = (() => {
    if (!q) return false;
    const hasOptions = Array.isArray(q.options) && q.options.length > 0;
    if (hasOptions) {
      if (q.type === "checkbox") {
        return (
          answer &&
          typeof answer === "object" &&
          Object.values(answer).some(Boolean)
        );
      }
      return !!answer;
    }
    if (typeof answer === "string") {
      return answer.trim().length > 0;
    }
    return false;
  })();

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-xl p-8 border border-indigo-100">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-indigo-700">
          Practice Mode
        </h2>
        <div className="text-gray-500 text-sm">
          Question {currentIndex + 1} of {questions.length}
        </div>
      </div>
      {q ? (
        <>
          <div className="mb-6">
            <div className="font-medium text-gray-800 mb-2">{q.text}</div>
            {q.options && q.options.length > 0 && (
              <div className="space-y-2">
                {q.options.map((opt, i) => (
                  <label
                    key={i}
                    className="flex items-center space-x-2"
                  >
                    <input
                      type={q.type === "checkbox" ? "checkbox" : "radio"}
                      name="practice"
                      value={opt}
                      checked={
                        q.type === "checkbox"
                          ? (answer && answer[opt]) || false
                          : answer === opt
                      }
                      onChange={() => {
                        if (q.type === "checkbox") {
                          setAnswer((prev) => ({
                            ...(typeof prev === "object" && prev ? prev : {}),
                            [opt]: !prev?.[opt]
                          }));
                        } else {
                          setAnswer(opt);
                        }
                      }}
                      disabled={!!feedback}
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            )}
            {(q.type === "shortAnswer" ||
              q.type === "text" ||
              (!q.options || q.options.length === 0)) && (
              <textarea
                className="w-full border border-gray-300 rounded-lg p-3 mt-2"
                rows={4}
                placeholder="Type your answer here..."
                value={typeof answer === "string" ? answer : ""}
                onChange={(e) => setAnswer(e.target.value)}
                disabled={!!feedback}
              />
            )}
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            <button
              type="button"
              onClick={onCheck}
              disabled={isProcessing || !hasAnswer}
              className={`inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium shadow ${
                isProcessing || !hasAnswer
                  ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                  : "bg-indigo-600 text-white hover:bg-indigo-700"
              }`}
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              Check with AI
            </button>
            <button
              type="button"
              onClick={onSimilar}
              disabled={isProcessing}
              className="inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200"
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Similar Question
            </button>
            <button
              type="button"
              onClick={onDifferent}
              disabled={isProcessing || questions.length <= 1}
              className="inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200"
            >
              <Compass className="h-4 w-4 mr-1" />
              Different Question
            </button>
            <AccessibleMenu
              label="Request Question"
              options={[
                { value: "multipleChoice", label: "Multiple choice" },
                { value: "trueFalse", label: "True / False" },
                { value: "checkbox", label: "Multi-select" },
                { value: "shortAnswer", label: "Short answer" },
                { value: "essay", label: "Essay-style" }
              ]}
              onSelect={onRequestType}
              disabled={isProcessing}
            />
          </div>

          {isProcessing && (
            <div className="text-indigo-600 font-medium mb-2">
              Processing...
            </div>
          )}

          {feedback && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mt-4">
              {typeof feedback === "string" ? (
                <div>{feedback}</div>
              ) : (
                <div>
                  <div className="mb-2 font-medium text-indigo-700">
                    Breakdown:
                  </div>
                  <ul className="mb-2">
                    {feedback.breakdown?.map((pt, i) => (
                      <li
                        key={i}
                        className={
                          pt.achieved ? "text-green-700" : "text-red-700"
                        }
                      >
                        {pt.achieved ? "[OK]" : "[X]"} {pt.point}
                      </li>
                    ))}
                  </ul>
                  <div className="mb-2">
                    <span className="font-bold">Score:</span>{" "}
                    {feedback.score}
                  </div>
                  <div>
                    <span className="font-bold">Feedback:</span>{" "}
                    {feedback.feedback}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-between items-center mt-6">
            <button
              type="button"
              onClick={onPrev}
              disabled={questions.length <= 1}
              className={`inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium border ${
                questions.length <= 1
                  ? "text-gray-400 border-gray-200 cursor-not-allowed"
                  : "text-gray-700 border-gray-300 hover:bg-gray-50"
              }`}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={questions.length <= 1}
              className={`inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium border ${
                questions.length <= 1
                  ? "text-gray-400 border-gray-200 cursor-not-allowed"
                  : "text-gray-700 border-gray-300 hover:bg-gray-50"
              }`}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </button>
          </div>

          {thisHistory.length > 0 && (
            <div className="mt-6">
              <div className="font-semibold text-gray-700 mb-2">
                Your Previous Attempts:
              </div>
              <ul className="space-y-2">
                {thisHistory
                  .slice(-3)
                  .reverse()
                  .map((h, idx) => (
                    <li
                      key={idx}
                      className="bg-gray-50 border border-gray-200 rounded p-2 text-sm"
                    >
                      <div>
                        <span className="font-bold">Your Answer:</span>{" "}
                        {typeof h.answer === "object"
                          ? Object.entries(h.answer)
                              .filter(([, v]) => v)
                              .map(([k]) => k)
                              .join(", ")
                          : h.answer}
                      </div>
                      <div>
                        <span className="font-bold">Feedback:</span>{" "}
                        {typeof h.feedback === "string"
                          ? h.feedback
                          : h.feedback?.feedback}
                      </div>
                      <div className="text-gray-400 text-xs">
                        {new Date(h.timestamp).toLocaleString()}
                      </div>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <div>No questions available.</div>
      )}
    </div>
  );
}
