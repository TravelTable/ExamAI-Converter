export const EXAM_FUNCTION = {
  type: "function",
  function: {
    name: "return_exam",
    description: "Return the parsed exam in a strict schema.",
    parameters: {
      type: "object",
      properties: {
        title: { type: ["string", "null"] },
        suggestedTime: {
          type: ["integer", "null"],
          description: "Suggested total time for the exam in seconds."
        },
        multipleChoice: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              type: { type: "string", enum: ["radio"] },
              text: { type: "string" },
              options: { type: "array", items: { type: "string" } },
              correctAnswer: { type: ["string", "null"] },
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
              sampleAnswer: { type: ["string", "null"] }
            },
            required: ["type", "text", "options"]
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
              correctAnswer: { type: ["string", "null"] },
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
            required: ["type", "text", "options"]
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
              correctAnswers: {
                type: ["array", "null"],
                items: { type: "string" }
              },
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
            required: ["type", "text", "options"]
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
              sampleAnswer: { type: ["string", "null"] }
            },
            required: ["type", "text"]
          }
        }
      },
      required: []
    }
  }
};
