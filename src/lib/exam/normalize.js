export function robustLLMJsonParse(response) {
  if (typeof response === "object" && response !== null) {
    if (response?.choices?.[0]?.message?.content) {
      response = response.choices[0].message.content;
    } else if (response?.content) {
      response = response.content;
    } else {
      try {
        return JSON.parse(JSON.stringify(response));
      } catch {
        /* ignore */
      }
    }
  }

  if (typeof response !== "string") response = String(response ?? "");

  response = response.replace(/```(?:json|JSON)?\s*([\s\S]*?)\s*```/g, "$1");
  response = response.replace(/\uFEFF/g, "");
  response = response.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');

  try {
    return JSON.parse(response);
  } catch {
    /* continue */
  }

  const extractBalanced = (str, open, close) => {
    const opens = [];
    let best = null;
    for (let i = 0; i < str.length; i += 1) {
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

  jsonStr = jsonStr.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, "");
  jsonStr = jsonStr.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  let prev;
  do {
    prev = jsonStr;
    jsonStr = jsonStr.replace(/,\s*([\]}])/g, "$1");
  } while (jsonStr !== prev);

  do {
    prev = jsonStr;
    jsonStr = jsonStr.replace(/,,+/g, ",");
  } while (jsonStr !== prev);

  return JSON.parse(jsonStr);
}

export function normalizeExamStructure(parsed) {
  const exam = {
    multipleChoice: [],
    trueFalse: [],
    checkbox: [],
    shortAnswer: []
  };

  if (parsed && parsed.suggestedTime) {
    exam.suggestedTime = parsed.suggestedTime;
  }

  const put = (q) => {
    if (!q) return;
    if (!q.id) q.id = "q_" + Math.random().toString(36).slice(2, 10);

    if (q.hint && typeof q.hint === "string") {
      try {
        const hintObj = JSON.parse(q.hint);
        if (hintObj && (hintObj.explanation || hintObj.answer)) q.hint = hintObj;
      } catch {
        q.hint = { explanation: q.hint };
      }
    }

    if (q.type === "radio") {
      const isTF =
        Array.isArray(q.options) &&
        q.options.length === 2 &&
        q.options.every((opt) => ["true", "false", "True", "False", "TRUE", "FALSE"].includes(String(opt)));
      if (isTF) exam.trueFalse.push(q);
      else exam.multipleChoice.push(q);
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

export function extractExamFromResponse(data) {
  const choice = data?.choices?.[0]?.message;

  if (choice?.tool_calls?.length) {
    const argsStr = choice.tool_calls[0]?.function?.arguments || "{}";
    const parsed = robustLLMJsonParse(argsStr);
    return normalizeExamStructure(parsed);
  }

  const content = choice?.content ?? data;
  const parsed = robustLLMJsonParse(content);
  return normalizeExamStructure(parsed);
}
