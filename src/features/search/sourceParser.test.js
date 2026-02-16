import { parseSearchResponse } from "./sourceParser";

test("parses output text and deduped sources", () => {
  const parsed = parseSearchResponse({
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: "Grounded answer" }]
      },
      {
        type: "web_search_call",
        action: {
          sources: [
            { title: "A", url: "https://a.test", snippet: "a" },
            { title: "A2", url: "https://a.test", snippet: "a2" },
            { title: "B", url: "https://b.test", snippet: "b" }
          ]
        }
      }
    ]
  });

  expect(parsed.answerText).toBe("Grounded answer");
  expect(parsed.sources).toHaveLength(2);
  expect(parsed.grounded).toBe(true);
});
