import { useState } from "react";
import { CheckCircle, Lightbulb, PenTool, XCircle } from "lucide-react";

export default function ExamSection({
  title,
  description,
  questions = [],
  answers,
  showAnswers,
  showHints,
  onAnswerChange,
  textAnswersFeedback
}) {
  const [revealedHints, setRevealedHints] = useState({});

  const handleRevealHint = (qid) => {
    setRevealedHints((prev) => ({ ...prev, [qid]: true }));
  };

  function getRadioCorrectness(question, answers) {
    if (!showAnswers) return "";
    if (
      typeof question.correctAnswer === "undefined" ||
      question.correctAnswer === null
    )
      return "";
    if (
      answers[question.id] === undefined ||
      answers[question.id] === ""
    )
      return "unanswered";
    return answers[question.id] === question.correctAnswer
      ? "correct"
      : "incorrect";
  }

  function getCheckboxCorrectness(question, answers) {
    if (!showAnswers) return "";
    if (!Array.isArray(question.correctAnswers)) return "";
    const selected = answers[question.id]
      ? Object.entries(answers[question.id])
          .filter(([, v]) => v)
          .map(([k]) => k)
      : [];
    if (selected.length === 0) return "unanswered";
    const correctSet = new Set(question.correctAnswers);
    const numCorrect = selected.filter((opt) => correctSet.has(opt)).length;
    const numIncorrect = selected.filter((opt) => !correctSet.has(opt)).length;
    if (numCorrect === correctSet.size && numIncorrect === 0) return "correct";
    return "incorrect";
  }

  function getTextCorrectness(question, answers, textAnswersFeedback) {
    if (!showAnswers) return "";
    if (!textAnswersFeedback || !textAnswersFeedback[question.id]) return "";
    if (
      typeof textAnswersFeedback[question.id].score === "undefined"
    )
      return "";
    const fb = textAnswersFeedback[question.id];
    if (fb.score >= (fb.maxScore || 1)) return "correct";
    if (fb.score > 0) return "partial";
    return "incorrect";
  }

  return (
    <div className="border-b border-gray-200 pb-8">
      <h3 className="text-xl font-semibold text-gray-800 mb-2">
        {title}
      </h3>
      <p className="text-gray-600 text-sm mb-6">{description}</p>
      <div className="space-y-8">
        {questions.map((question) => {
          let correctness = "";
          if (question.type === "radio") {
            correctness = getRadioCorrectness(question, answers);
          } else if (question.type === "checkbox") {
            correctness = getCheckboxCorrectness(question, answers);
          } else if (question.type === "text") {
            correctness = getTextCorrectness(
              question,
              answers,
              textAnswersFeedback
            );
          }

          let borderColor = "";
          if (showAnswers) {
            if (correctness === "correct")
              borderColor = "border-l-4 border-green-500";
            else if (correctness === "incorrect")
              borderColor = "border-l-4 border-red-500";
            else if (correctness === "partial")
              borderColor = "border-l-4 border-yellow-500";
            else borderColor = "border-l-4 border-gray-300";
          }

          return (
            <div
              key={question.id}
              className={`bg-gray-50 p-6 rounded-xl ${borderColor}`}
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-start">
                  <label
                    className="text-gray-800 font-medium"
                    htmlFor={question.id}
                  >
                    {question.text}
                  </label>
                  {showHints && (
                    <div
                      className="relative group ml-2"
                      tabIndex={0}
                      aria-label="Hint"
                    >
                      <Lightbulb className="h-5 w-5 text-yellow-500 cursor-help" />
                      <div className="absolute left-0 top-full mt-2 w-72 bg-yellow-50 border border-yellow-200 rounded-lg p-3 shadow-lg z-10 hidden group-focus:block group-hover:block">
                        <p className="text-sm text-yellow-800 font-medium mb-1">
                          Hint:
                        </p>
                        <p className="text-sm text-yellow-700">
                          {question.hint && typeof question.hint === "object"
                            ? question.hint.explanation
                            : typeof question.hint === "string"
                            ? question.hint
                            : "Think about the core concepts related to this question."}
                        </p>
                        {question.hint &&
                          typeof question.hint === "object" &&
                          question.hint.answer && (
                            <>
                              {!revealedHints[question.id] ? (
                                <button
                                  className="mt-2 px-3 py-1 bg-yellow-200 text-yellow-900 rounded text-xs font-bold"
                                  onClick={() =>
                                    handleRevealHint(question.id)
                                  }
                                >
                                  Reveal Answer
                                </button>
                              ) : (
                                <div className="mt-2 text-green-800 font-semibold">
                                  <span className="block text-xs text-green-600 mb-1">
                                    Answer:
                                  </span>
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
                      if (question.correctAnswer === option)
                        optionColor = "text-green-700 font-semibold";
                      else if (
                        answers[question.id] === option &&
                        question.correctAnswer !== option
                      )
                        optionColor = "text-red-700 font-semibold";
                    }
                    return (
                      <label
                        key={index}
                        className="flex items-start cursor-pointer group"
                        htmlFor={`${question.id}_${index}`}
                      >
                        <div className="flex items-center h-5">
                          <input
                            type="radio"
                            id={`${question.id}_${index}`}
                            name={question.id}
                            value={option}
                            checked={answers[question.id] === option}
                            onChange={() =>
                              onAnswerChange(question.id, option)
                            }
                            disabled={showAnswers}
                            className="h-5 w-5 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                          />
                        </div>
                        <div
                          className={`ml-3 text-gray-700 group-hover:text-gray-900 ${optionColor}`}
                        >
                          {option}
                          {showAnswers &&
                            question.correctAnswer === option && (
                              <span className="ml-2 text-green-600 flex items-center text-sm">
                                <CheckCircle className="h-4 w-4 mr-1" />{" "}
                                Correct
                              </span>
                            )}
                          {showAnswers &&
                            answers[question.id] === option &&
                            question.correctAnswer !== option && (
                              <span className="ml-2 text-red-600 flex items-center text-sm">
                                <XCircle className="h-4 w-4 mr-1" />{" "}
                                Incorrect
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
                      if (
                        question.correctAnswers &&
                        question.correctAnswers.includes(option)
                      ) {
                        optionColor = "text-green-700 font-semibold";
                      } else if (
                        answers[question.id]?.[option] &&
                        question.correctAnswers &&
                        !question.correctAnswers.includes(option)
                      ) {
                        optionColor = "text-red-700 font-semibold";
                      }
                    }
                    return (
                      <label
                        key={index}
                        className="flex items-start cursor-pointer group"
                        htmlFor={`${question.id}_${index}`}
                      >
                        <div className="flex items-center h-5">
                          <input
                            type="checkbox"
                            id={`${question.id}_${index}`}
                            name={`${question.id}_${index}`}
                            checked={
                              answers[question.id]?.[option] || false
                            }
                            onChange={() =>
                              onAnswerChange(question.id, option, true)
                            }
                            disabled={showAnswers}
                            className="h-5 w-5 text-indigo-600 focus:ring-indigo-500 rounded border-gray-300"
                          />
                        </div>
                        <div
                          className={`ml-3 text-gray-700 group-hover:text-gray-900 ${optionColor}`}
                        >
                          {option}
                          {showAnswers &&
                            question.correctAnswers &&
                            question.correctAnswers.includes(option) && (
                              <span className="ml-2 text-green-600 flex items-center text-sm">
                                <CheckCircle className="h-4 w-4 mr-1" />{" "}
                                Correct
                              </span>
                            )}
                          {showAnswers &&
                            answers[question.id]?.[option] &&
                            question.correctAnswers &&
                            !question.correctAnswers.includes(option) && (
                              <span className="ml-2 text-red-600 flex items-center text-sm">
                                <XCircle className="h-4 w-4 mr-1" />{" "}
                                Incorrect
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
                      onChange={(e) =>
                        onAnswerChange(question.id, e.target.value)
                      }
                      disabled={showAnswers}
                    />
                    {showHints && (
                      <div className="absolute top-2 right-2">
                        <div
                          className="relative group"
                          tabIndex={0}
                          aria-label="Hint"
                        >
                          <Lightbulb className="h-5 w-5 text-yellow-500 cursor-help" />
                          <div className="absolute right-0 top-full mt-2 w-72 bg-yellow-50 border border-yellow-200 rounded-lg p-3 shadow-lg z-10 hidden group-focus:block group-hover:block">
                            <p className="text-sm text-yellow-800 font-medium mb-1">
                              Hint:
                            </p>
                            <p className="text-sm text-yellow-700">
                              {question.hint &&
                              typeof question.hint === "object"
                                ? question.hint.explanation
                                : typeof question.hint === "string"
                                ? question.hint
                                : "Answer all parts of the question. Use specific terminology. Be concise and clear."}
                            </p>
                            {question.hint &&
                              typeof question.hint === "object" &&
                              question.hint.answer && (
                                <>
                                  {!revealedHints[question.id] ? (
                                    <button
                                      className="mt-2 px-3 py-1 bg-yellow-200 text-yellow-900 rounded text-xs font-bold"
                                      onClick={() =>
                                        handleRevealHint(question.id)
                                      }
                                    >
                                      Reveal Answer
                                    </button>
                                  ) : (
                                    <div className="mt-2 text-green-800 font-semibold">
                                      <span className="block text-xs text-green-600 mb-1">
                                        Answer:
                                      </span>
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
                  {showAnswers &&
                    textAnswersFeedback &&
                    textAnswersFeedback[question.id] && (
                      <div className="mt-4 space-y-3">
                        <div className="flex justify-between items-center">
                          <h4 className="font-medium text-gray-700">
                            AI Evaluation
                          </h4>
                          <div className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-sm font-medium">
                            Score:{" "}
                            {
                              textAnswersFeedback[question.id]
                                .score
                            }
                            /
                            {
                              textAnswersFeedback[question.id]
                                .maxScore
                            }
                          </div>
                        </div>
                        <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                          <p className="font-medium text-yellow-800 mb-1">
                            Feedback:
                          </p>
                          <p className="text-yellow-700">
                            {textAnswersFeedback[question.id].feedback}
                          </p>
                        </div>
                        {question.sampleAnswer && (
                          <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                            <p className="font-medium text-green-800 mb-1">
                              Sample Answer:
                            </p>
                            <p className="text-green-700">
                              {question.sampleAnswer}
                            </p>
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
