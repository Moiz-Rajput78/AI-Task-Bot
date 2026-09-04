const model = process.env.OLLAMA_MODEL || "gpt-oss:120b";

export async function generateAIResponse(
  prompt: string
): Promise<string> {
  const apiKey = process.env.OLLAMA_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OLLAMA_API_KEY is not configured in the backend environment."
    );
  }

  if (!prompt || !prompt.trim()) {
    throw new Error("AI prompt cannot be empty.");
  }

  const baseUrl =
    process.env.OLLAMA_BASE_URL || "https://ollama.com";

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      stream: false,
    }),
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `Ollama API error (${response.status}): ${responseText}`
    );
  }

  let data: {
    message?: {
      content?: string;
    };
  };

  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(
      `Ollama API returned invalid JSON: ${responseText}`
    );
  }

  const content = data.message?.content;

  if (!content || typeof content !== "string") {
    throw new Error(
      "Ollama API returned successfully, but no AI message content was found."
    );
  }

  return content.trim();
}