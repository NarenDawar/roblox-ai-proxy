/*
	This is the Node.js proxy server (UPDATED FOR HISTORY).
	It now accepts a 'messages' array instead of a 'prompt' string.
*/
import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DEFAULT_MODEL = "gpt-4o-mini";

// Middleware
app.use(cors());
app.use(express.json());

// Simple health check endpoint
app.get('/', (req, res) => {
	res.json({
		status: 'ok',
		message: 'Roblox AI Proxy Server (with History) is running!',
		defaultModel: DEFAULT_MODEL,
		hasOpenAIFallbackKey: !!OPENAI_API_KEY,
	});
});

// --- Main Generation Endpoint (UPDATED) ---
app.post('/generate', async (req, res) => {
	// MODIFIED: 'prompt' is gone, 'messages' is new
	const { context, model = DEFAULT_MODEL, apiKey, messages } = req.body;

	if (!messages || messages.length === 0) {
		return res.status(400).json({ error: "Missing 'messages' array in request body." });
	}

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
		// --- AI ROUTER LOGIC (now handles 'messages' array) ---

		if (model.startsWith('gpt-')) {
			// --- 1. Handle OpenAI ---
			console.log(`Routing to OpenAI for model: ${model}`);
			const keyToUse = apiKey || OPENAI_API_KEY; 
			
			if (!keyToUse) {
				return res.status(500).json({ error: "Server is missing OPENAI_API_KEY." });
			}

			// MODIFIED: Combine system prompt with user's message history
			const openAIMessages = [
				{ role: "system", content: systemPrompt },
				...messages // Add the rest of the history
			];

			const payload = {
				model: model,
				messages: openAIMessages, // Use the combined array
				temperature: 1,
				max_tokens: 2048,
			};
			
			const apiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${keyToUse}`
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
			const keyToUse = apiKey; 
			
			if (!keyToUse) {
				return res.status(400).json({ 
					error: "API Key Required",
					details: `You must provide your own API key to use Gemini models.`
				});
			}

			// MODIFIED: Transform history for Gemini (roles: 'user'/'model')
			// and manually prepend system prompt to the *first* user message.
			const geminiContents = messages.map(msg => ({
				role: msg.role === 'assistant' ? 'model' : 'user',
				parts: [{ text: msg.content }]
			}));
			
			// Inject system prompt before the first user message
			geminiContents[0].parts[0].text = `${systemPrompt}\n\n---\n\nUSER PROMPT: ${geminiContents[0].parts[0].text}`;

			const payload = { contents: geminiContents };
			const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${keyToUse}`;
			
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
			const keyToUse = apiKey; 

			if (!keyToUse) {
				return res.status(400).json({ 
					error: "API Key Required",
					details: `You must provide your own API key to use Claude models.`
				});
			}

			// MODIFIED: Transform history for Claude (roles: 'user'/'assistant')
			// Claude has a dedicated 'system' field, which is great.
			const claudeMessages = messages.map(msg => ({
				role: msg.role === 'assistant' ? 'assistant' : 'user', // Ensure correct roles
				content: msg.content
			}));

			const payload = {
				model: model,
				system: systemPrompt, // Use the dedicated system field
				messages: claudeMessages, // Pass the history
				max_tokens: 2048,
			};

			const apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-api-key': keyToUse,
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
	console.log(`Roblox AI Multi-Model Proxy Server (with History) listening on port ${PORT}`);
	if (!OPENAI_API_KEY) {
		console.warn("WARNING: OPENAI_API_KEY is not set. The default fallback will fail!");
	} else {
		console.log(`Default fallback model 'gpt-4o-mini' is ready.`);
	}
});
