/*
	This is the Node.js proxy server (UPDATED FOR "BYOK" MODEL).
	It has NO fallback keys. Users MUST provide their own API key in the plugin.
*/
import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

// MODIFIED: Removed all fallback API keys. They are no longer used.
// const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
// const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
// const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const DEFAULT_MODEL = "gpt-4o-mini";

// Middleware
app.use(cors());
app.use(express.json());

// Simple health check endpoint
app.get('/', (req, res) => {
	res.json({
		status: 'ok',
		message: 'Roblox AI Proxy Server (BYOK Mode) is running!',
		defaultModel: DEFAULT_MODEL,
		hasOpenAIFallbackKey: false, // Explicitly set to false
	});
});

// --- Main Generation Endpoint (UPDATED) ---
app.post('/generate', async (req, res) => {
	// MODIFIED: 'apiKey' is now the only key used.
	const { context, model = DEFAULT_MODEL, apiKey, messages } = req.body;

	if (!messages || messages.length === 0) {
		return res.status(400).json({ error: "Missing 'messages' array in request body." });
	}

	// MODIFIED: Check for the user's API key MUST happen first.
	if (!apiKey) {
		return res.status(400).json({ 
			error: "API Key Required",
			details: `You must provide your own API key in the plugin's configuration section to use this tool.`
		});
	}
	
	const keyToUse = apiKey; // The user's key is the only key

	// --- Construct the System Prompt (lives on the server) ---
	const systemPrompt = `You are an expert Roblox Luau developer and scripter.
Your task is to help a user in Roblox Studio.
You will be given a conversation history and a JSON string representing the user's "context" (parts, scripts, etc.).
Based on the prompt and context, provide helpful advice or complete Luau code snippets.
If you write code, wrap it in Luau markdown blocks ('''luau ... ''').

The user's selected workspace context is:
${context || "No context provided."}`;
	
	let aiText = "";

	try {
		// --- AI ROUTER LOGIC ---

		if (model.startsWith('gpt-')) {
			// --- 1. Handle OpenAI ---
			console.log(`Routing to OpenAI for model: ${model}`);
			
			// MODIFIED: No fallback. 'keyToUse' is just 'apiKey'.
			const openAIMessages = [
				{ role: "system", content: systemPrompt },
				...messages
			];

			const payload = {
				model: model,
				messages: openAIMessages,
				temperature: 1,
			};
			
			const apiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${keyToUse}` // Uses user's key
				},
				body: JSON.stringify(payload)
			});

			if (!apiResponse.ok) {
				const errorBody = await apiResponse.text();
				return res.status(apiResponse.status).json({ error: `Error from OpenAI API.`, details: errorBody });
			}
			
			const result = await apiResponse.json();
			aiText = result.choices?.[0]?.message?.content;

		} else if (model.startsWith('gemini-')) {
			// --- 2. Handle Google Gemini ---
			console.log(`Routing to Google for model: ${model}`);
			
			// MODIFIED: 'keyToUse' is just 'apiKey'. No fallback check needed.
			const geminiContents = messages.map(msg => ({
				role: msg.role === 'assistant' ? 'model' : 'user',
				parts: [{ text: msg.content }]
			}));
			
			geminiContents[0].parts[0].text = `${systemPrompt}\n\n---\n\nUSER PROMPT: ${geminiContents[0].parts[0].text}`;

			const payload = { contents: geminiContents };
			const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${keyToUse}`; // Uses user's key
			
			const apiResponse = await fetch(API_URL, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			if (!apiResponse.ok) {
				const errorBody = await apiResponse.text();
				return res.status(apiResponse.status).json({ error: `Error from Google API.`, details: errorBody });
			}
			
			const result = await apiResponse.json();
			aiText = result.candidates?.[0]?.content.parts?.[0]?.text;

		} else if (model.startsWith('claude-')) {
			// --- 3. Handle Anthropic Claude ---
			console.log(`Routing to Anthropic for model: ${model}`);
			
			// MODIFIED: 'keyToUse' is just 'apiKey'. No fallback check needed.
			const claudeMessages = messages.map(msg => ({
				role: msg.role === 'assistant' ? 'assistant' : 'user',
				content: msg.content
			}));

			const payload = {
				model: model,
		system: systemPrompt,
				messages: claudeMessages,
				max_tokens: 2048,
			};

			const apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-api-key': keyToUse, // Uses user's key
					'anthropic-version': '2023-06-01'
				},
				body: JSON.stringify(payload)
			});

			if (!apiResponse.ok) {
				const errorBody = await apiResponse.text();
				return res.status(apiResponse.status).json({ error: `Error from Anthropic API.`, details: errorBody });
			}
			
			const result = await apiResponse.json();
			aiText = result.content?.[0]?.text;

		} else {
			console.warn(`Unknown model: ${model}`);
			return res.status(400).json({ error: `Unsupported model: ${model}` });
		}

		if (!aiText) {
			console.error("AI response was empty or in an invalid format.");
			return res.status(500).json({ error: "Could not parse AI response from provider." });
		}

		console.log("Successfully got response from AI provider.");
		res.json({ text: aiText });

	} catch (error) {
		console.error(`Error in /generate endpoint for model ${model}:`, error);
		res.status(500).json({ error: "Internal server error.", details: error.message });
	}
});

app.listen(PORT, () => {
	console.log(`Roblox AI Multi-Model Proxy Server (BYOK Mode) listening on port ${PORT}`);
	console.log("Server is running in BYOK (Bring Your Own Key) mode. No fallback keys are configured.");
});
