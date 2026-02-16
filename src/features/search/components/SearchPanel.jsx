import { useMemo, useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import { createSearchService } from "../searchService";

export default function SearchPanel({ aiClient, model, searchContextSize, examJSON }) {
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const searchService = useMemo(() => createSearchService(aiClient), [aiClient]);

  const runSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    setIsSearching(true);
    setError("");
    try {
      const contextPrefix = examJSON?.title ? `Exam context: ${examJSON.title}. ` : "";
      const response = await searchService.searchWeb({
        model,
        query: `${contextPrefix}${trimmed}`,
        searchContextSize
      });
      setResult(response);
    } catch (e) {
      setError(e?.message || "Search failed.");
      setResult(null);
    }
    setIsSearching(false);
  };

  return (
    <div className="space-y-4">
      <h4 className="font-medium text-gray-700">Search Concepts</h4>
      <div className="relative flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search for a concept..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 pl-9 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") runSearch();
            }}
          />
          <Search className="h-4 w-4 text-gray-400 absolute left-3 top-3" />
        </div>
        <button
          type="button"
          onClick={runSearch}
          disabled={isSearching || !query.trim()}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            isSearching || !query.trim()
              ? "bg-gray-200 text-gray-400 cursor-not-allowed"
              : "bg-indigo-600 text-white hover:bg-indigo-700"
          }`}
        >
          {isSearching ? "Searching..." : "Search"}
        </button>
      </div>

      <div className="bg-gray-100 rounded-lg p-3 h-80 overflow-y-auto space-y-3">
        {error && <p className="text-sm text-red-600">{error}</p>}

        {!error && !result && (
          <p className="text-gray-500 text-center py-8">
            Enter a search term to find relevant concepts and grounded explanations.
          </p>
        )}

        {result && (
          <>
            <div className="bg-white rounded-lg p-3 border border-gray-200">
              <div className="text-xs text-gray-500 mb-1">Answer</div>
              <p className="text-sm text-gray-800 whitespace-pre-wrap">
                {result.answerText || "No text answer returned."}
              </p>
            </div>

            <div className="bg-white rounded-lg p-3 border border-gray-200">
              <div className="text-xs text-gray-500 mb-2">Sources</div>
              {result.sources?.length ? (
                <div className="space-y-2">
                  {result.sources.map((src) => (
                    <a
                      key={src.url}
                      href={src.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block p-2 rounded border border-gray-200 hover:bg-gray-50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-indigo-700 truncate">
                          {src.title || src.url}
                        </span>
                        <ExternalLink className="h-4 w-4 text-gray-500 shrink-0" />
                      </div>
                      {src.snippet && (
                        <p className="text-xs text-gray-600 mt-1 line-clamp-3">{src.snippet}</p>
                      )}
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No source metadata returned.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
