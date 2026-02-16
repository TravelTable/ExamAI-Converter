import {
  Award,
  BookOpen,
  Calculator,
  CheckCircle,
  ChevronRight,
  Clock,
  Eye,
  HelpCircle,
  Info,
  Lightbulb,
  MessageCircle,
  RefreshCw,
  Search,
  Settings,
  Bookmark
} from "lucide-react";
import ExamSection from "./ExamSection";
import ScoreBar from "../../shared/components/ScoreBar";
import HelpToolButton from "../../shared/components/HelpToolButton";
import ConceptCard from "../../shared/components/ConceptCard";
import AITutorChat from "../../tutor/components/AITutorChat";
import SearchPanel from "../../search/components/SearchPanel";

export default function ExamView({
  examJSON,
  answers,
  onAnswerChange,
  showHints,
  setShowHints,
  helpPanelOpen,
  setHelpPanelOpen,
  activeHelpTool,
  setActiveHelpTool,
  examCompleted,
  examScore,
  textAnswersFeedback,
  onSubmitExam,
  isProcessing,
  onGenerateNewExam,
  timer,
  totalQuestions,
  answeredCount,
  canSubmit,
  timerEnabled,
  setTimerEnabled,
  aiSuggestedTime,
  aiClient,
  model,
  enableTutorWebSearch,
  searchContextSize
}) {
  const mins = Math.floor(timer / 60);
  const secs = timer % 60;

  const totalPoints =
    (examJSON.multipleChoice || []).reduce(
      (a, q) => a + (q.points || 1),
      0
    ) +
    (examJSON.trueFalse || []).reduce((a, q) => a + (q.points || 1), 0) +
    (examJSON.checkbox || []).reduce((a, q) => a + (q.points || 1), 0) +
    (examJSON.shortAnswer || []).reduce((a, q) => a + (q.points || 1), 0);

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex">
        <div
          className={`transition-all duration-300 ${
            helpPanelOpen ? "w-3/4 pr-4" : "w-full"
          }`}
        >
          <div className="bg-white rounded-xl shadow-xl p-8 mb-6 border border-indigo-100">
            <div className="flex justify-between items-center mb-8 border-b border-gray-200 pb-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-800">
                  {examJSON.title || "Exam"}
                </h2>
                <div className="flex items-center space-x-4 mt-1">
                  <p className="text-gray-500">
                    {timerEnabled ? (
                      <>
                        Time Remaining: {mins}:
                        {secs.toString().padStart(2, "0")}
                        {aiSuggestedTime && (
                          <span className="ml-2 text-xs text-blue-600">
                            (AI suggested:{" "}
                            {Math.floor(aiSuggestedTime / 60)} min)
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-gray-400">Timer Off</span>
                    )}
                  </p>
                  <button
                    className={`ml-2 px-2 py-1 rounded text-xs border ${
                      timerEnabled
                        ? "bg-blue-50 text-blue-700 border-blue-200"
                        : "bg-gray-100 text-gray-500 border-gray-200"
                    }`}
                    onClick={() => setTimerEnabled((t) => !t)}
                  >
                    {timerEnabled ? "Disable Timer" : "Enable Timer"}
                  </button>
                </div>
                <p className="text-gray-500 mt-1">
                  Total Points: {examScore ? examScore.total : totalPoints}
                </p>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowHints((h) => !h)}
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
                  onClick={() => setHelpPanelOpen((h) => !h)}
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
                <span className="font-medium">Progress:</span> {answeredCount}{" "}
                of {totalQuestions} answered
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
                        <h4 className="text-lg font-medium text-gray-700">
                          Overall Score
                        </h4>
                        <div className="text-2xl font-bold text-indigo-600">
                          {examScore.earned}/{examScore.total}
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-4 mb-2">
                        <div
                          className="bg-indigo-600 h-4 rounded-full"
                          style={{
                            width: `${
                              (examScore.earned / examScore.total) * 100
                            }%`
                          }}
                        ></div>
                      </div>
                      <div className="text-right text-gray-500 text-sm">
                        {Math.round(
                          (examScore.earned / examScore.total) * 100
                        )}
                        % Correct
                      </div>
                    </div>
                    <div className="bg-white rounded-lg p-5 shadow-sm border border-indigo-100">
                      <h4 className="text-lg font-medium text-gray-700 mb-4">
                        Section Breakdown
                      </h4>
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
                      <RefreshCw className="h-5 w-5 mr-2" /> Generate New
                      Practice Exam
                    </button>
                    <p className="text-gray-500 mt-2">
                      Create a new exam with similar questions to practice
                      further
                    </p>
                  </div>
                </div>

                <div className="space-y-8">
                  <h3 className="text-xl font-bold text-gray-800 flex items-center">
                    <Eye className="h-6 w-6 mr-2 text-indigo-600" />
                    Detailed Review
                  </h3>

                  {Array.isArray(examJSON.multipleChoice) &&
                    examJSON.multipleChoice.length > 0 && (
                      <ExamSection
                        title="Multiple Choice Questions"
                        description="Select the best answer for each question."
                        questions={examJSON.multipleChoice}
                        answers={answers}
                        showAnswers={true}
                        showHints={showHints}
                        onAnswerChange={onAnswerChange}
                        textAnswersFeedback={textAnswersFeedback}
                      />
                    )}
                  {Array.isArray(examJSON.trueFalse) &&
                    examJSON.trueFalse.length > 0 && (
                      <ExamSection
                        title="True/False Questions"
                        description="Indicate whether each statement is true or false."
                        questions={examJSON.trueFalse}
                        answers={answers}
                        showAnswers={true}
                        showHints={showHints}
                        onAnswerChange={onAnswerChange}
                        textAnswersFeedback={textAnswersFeedback}
                      />
                    )}
                  {Array.isArray(examJSON.checkbox) &&
                    examJSON.checkbox.length > 0 && (
                      <ExamSection
                        title="Checkbox Questions"
                        description="Select ALL correct answers for each question."
                        questions={examJSON.checkbox}
                        answers={answers}
                        showAnswers={true}
                        showHints={showHints}
                        onAnswerChange={onAnswerChange}
                        textAnswersFeedback={textAnswersFeedback}
                      />
                    )}
                  {Array.isArray(examJSON.shortAnswer) &&
                    examJSON.shortAnswer.length > 0 && (
                      <ExamSection
                        title="Short Answer Questions"
                        description="Provide brief answers to the following questions."
                        questions={examJSON.shortAnswer}
                        answers={answers}
                        showAnswers={true}
                        showHints={showHints}
                        onAnswerChange={onAnswerChange}
                        textAnswersFeedback={textAnswersFeedback}
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
                  showAnswers={false}
                  showHints={showHints}
                  onAnswerChange={onAnswerChange}
                  textAnswersFeedback={textAnswersFeedback}
                />
                <ExamSection
                  title="True/False Questions"
                  description="Indicate whether each statement is true or false."
                  questions={examJSON.trueFalse}
                  answers={answers}
                  showAnswers={false}
                  showHints={showHints}
                  onAnswerChange={onAnswerChange}
                  textAnswersFeedback={textAnswersFeedback}
                />
                <ExamSection
                  title="Checkbox Questions"
                  description="Select ALL correct answers for each question."
                  questions={examJSON.checkbox}
                  answers={answers}
                  showAnswers={false}
                  showHints={showHints}
                  onAnswerChange={onAnswerChange}
                  textAnswersFeedback={textAnswersFeedback}
                />
                <ExamSection
                  title="Short Answer Questions"
                  description="Provide brief answers to the following questions."
                  questions={examJSON.shortAnswer}
                  answers={answers}
                  showAnswers={false}
                  showHints={showHints}
                  onAnswerChange={onAnswerChange}
                  textAnswersFeedback={textAnswersFeedback}
                />
                <div className="mt-8 flex justify-between items-center bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <div className="text-gray-500 text-sm flex items-center">
                    <HelpCircle className="h-4 w-4 mr-1" />
                    <span>Your progress is automatically saved</span>
                  </div>
                  <button
                    onClick={onSubmitExam}
                    className={`bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 transition shadow-md flex items-center font-medium ${
                      canSubmit ? "" : "opacity-50 cursor-not-allowed"
                    }`}
                    disabled={!canSubmit || isProcessing}
                    aria-disabled={!canSubmit}
                    title={
                      !canSubmit ? "Answer all required questions." : ""
                    }
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
                <p className="text-gray-500 text-base mt-1">
                  AI-powered assistance for your exam
                </p>
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
                    <h4 className="font-medium text-gray-700">
                      Key Concepts
                    </h4>
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
                    <h4 className="font-medium text-gray-700">
                      Scientific Calculator
                    </h4>
                    <div className="bg-gray-100 p-4 rounded-lg">
                      <div className="bg-white p-2 rounded mb-3 text-right h-10 flex items-center justify-end text-lg font-mono">
                        0
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        {[
                          "7",
                          "8",
                          "9",
                          "/",
                          "4",
                          "5",
                          "6",
                          "*",
                          "1",
                          "2",
                          "3",
                          "-",
                          "0",
                          ".",
                          "=",
                          "+"
                        ].map((key) => (
                          <button
                            key={key}
                            className="bg-white hover:bg-gray-50 text-gray-700 font-medium py-2 px-4 rounded shadow"
                          >
                            {key}
                          </button>
                        ))}
                      </div>
                      <div className="grid grid-cols-4 gap-2 mt-2">
                        {[
                          "sin",
                          "cos",
                          "tan",
                          "^",
                          "log",
                          "ln",
                          "sqrt",
                          "pi"
                        ].map((key) => (
                          <button
                            key={key}
                            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium py-2 px-2 rounded shadow text-sm"
                          >
                            {key}
                          </button>
                        ))}
                      </div>
                    </div>
                    <p className="text-gray-500 text-xs text-center">
                      This is a demo calculator. In a real implementation, it
                      would be fully functional.
                    </p>
                  </div>
                )}
                {activeHelpTool === "tutor" && (
                  <AITutorChat
                    aiClient={aiClient}
                    model={model}
                    examJSON={examJSON}
                    enableWebSearch={enableTutorWebSearch}
                    searchContextSize={searchContextSize}
                  />
                )}
                {activeHelpTool === "search" && (
                  <SearchPanel
                    aiClient={aiClient}
                    model={model}
                    searchContextSize={searchContextSize}
                    examJSON={examJSON}
                  />
                )}
                {activeHelpTool === "bookmarks" && (
                  <div className="space-y-4">
                    <h4 className="font-medium text-gray-700">
                      Bookmarked Questions
                    </h4>
                    <div className="bg-gray-100 rounded-lg p-3 h-64 overflow-y-auto">
                      <p className="text-gray-500 text-center py-8">
                        No bookmarked questions yet. Click the bookmark icon on
                        any question to save it for later review.
                      </p>
                    </div>
                  </div>
                )}
                {activeHelpTool === "settings" && (
                  <div className="space-y-4">
                    <h4 className="font-medium text-gray-700">
                      Exam Settings
                    </h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">Show Hints</span>
                        <button
                          onClick={() => setShowHints((h) => !h)}
                          className={`w-10 h-5 rounded-full flex items-center transition-colors duration-300 focus:outline-none ${
                            showHints ? "bg-indigo-600" : "bg-gray-300"
                          }`}
                        >
                          <span
                            className={`w-4 h-4 rounded-full bg-white shadow-md transform transition-transform duration-300 ${
                              showHints ? "translate-x-5" : "translate-x-1"
                            }`}
                          ></span>
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
