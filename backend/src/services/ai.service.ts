const model = process.env.OLLAMA_MODEL || "gpt-oss:120b";

export async function generateAIResponse(prompt: string): Promise<string> {
  const apiKey = process.env.OLLAMA_API_KEY;

  if (!apiKey) {
    throw new Error("OLLAMA_API_KEY is not configured");
  }

  const baseUrl = process.env.OLLAMA_BASE_URL || "https://ollama.com";

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

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Ollama API error (${response.status}): ${errorText}`
    );
  }

  const data = await response.json();

  return data.message?.content || "No response received from AI";
}