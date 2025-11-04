/*
	This is the Node.js proxy server for OpenAI (ChatGPT).
	1. Host this on Replit.
	2. Install dependencies: `npm install express cors` (or just use the package.json)
	3. Set a secret environment variable named `OPENAI_API_KEY` with your API key.
	4. Get the public URL (e.g., `https://your-repl-name.replit.dev`) and paste it
	   into the `PROXY_URL` variable in the `RobloxPlugin.lua` script.
*/
import express from 'express';
import cors from 'cors';

// Use built-in fetch (available in Node.js 18+)
const app = express();
const PORT = process.env.PORT || 3000;

// Get your API key from environment variables
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const API_URL = 'https://api.openai.com/v1/chat/completions';

// Middleware
app.use(cors()); // Allow cross-origin requests (from Roblox Studio)
app.use(express.json()); // Parse JSON bodies

// Main generation endpoint
app.post('/generate', async (req, res) => {
	if (!OPENAI_API_KEY) {
		console.error("OPENAI_API_KEY is not set.");
		return res.status(500).json({ error: "Server is missing API key." });
	}

	try {
		const { prompt, context } = req.body;

		if (!prompt) {
			return res.status(400).json({ error: "Missing 'prompt' in request body." });
		}

		// --- Construct the Prompt for the AI ---
		const systemPrompt = `You are an expert Roblox Luau developer and scripter.
Your task is to help a user in Roblox Studio.
You will be given a prompt from the user and a JSON string representing their currently selected "context" (parts, scripts, etc. in their workspace).
Based on the prompt and context, provide helpful advice or complete Luau code snippets.
If you write code, wrap it in Luau markdown blocks ('''luau ... ''').
If the user asks to modify things, generate a new script they can run to perform the actions.
Be concise and helpful.

The user's selected workspace context is:
${context || "No context provided."}`;

		const userQuery = prompt;

		// --- Call the OpenAI API ---
		console.log("Forwarding request to OpenAI API...");

		const payload = {
			model: "gpt-4o", // You can change this to "gpt-4o", "gpt-4-turbo", etc.
			messages: [
				{
					role: "system",
					content: systemPrompt
				},
				{
					role: "user",
					content: userQuery
				}
			],
			temperature: 0.7,
			max_tokens: 2048,
		};

		const apiResponse = await fetch(API_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${OPENAI_API_KEY}` // OpenAI uses Bearer token
			},
			body: JSON.stringify(payload)
		});

		if (!apiResponse.ok) {
			const errorBody = await apiResponse.text();
			console.error("OpenAI API Error:", errorBody);
			return res.status(apiResponse.status).json({ error: "Error from AI API.", details: errorBody });
		}

		const result = await apiResponse.json();
		const aiText = result.choices?.[0]?.message?.content;

		if (!aiText) {
			console.error("Invalid response structure from OpenAI:", result);
			return res.status(500).json({ error: "Could not parse AI response." });
		}

		// Send the AI's text response back to the Roblox plugin
		console.log("Successfully got response from OpenAI.");
		res.json({ text: aiText });

	} catch (error) {
		console.error("Error in /generate endpoint:", error);
		res.status(500).json({ error: "Internal server error.", details: error.message });
	}
});

app.listen(PORT, () => {
	console.log(`Roblox AI Proxy Server listening on port ${PORT}`);
	if (!OPENAI_API_KEY) {
		console.warn("WARNING: `OPENAI_API_KEY` environment variable is not set. The server will not work.");
	}
});

