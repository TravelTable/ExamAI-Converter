import { normalizeModelList } from "./models";

test("normalizes mixed model payloads", () => {
  const out = normalizeModelList([{ id: "gpt-4.1", name: "GPT 4.1" }, "gpt-4o-mini"]);
  expect(out).toEqual([
    { id: "gpt-4.1", label: "GPT 4.1" },
    { id: "gpt-4o-mini", label: "gpt-4o-mini" }
  ]);
});
