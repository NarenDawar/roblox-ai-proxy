/*
	This is the Node.js proxy server for OpenAI, Google (Gemini), and Anthropic (Claude).

	--- LOGIC ---
	1. If no model is specified, it defaults to 'gpt-4o-mini' using the server's key.
	2. If an OpenAI model ('gpt-...') is specified, it uses the user's API key if provided,
	   otherwise it falls back to the server's OPENAI_API_KEY.
	3. If a Gemini or Claude model is specified, the user MUST provide their own API key.
	   There is NO server-side fallback key for these models.
*/
import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

// --- API Keys from Environment Variables ---
// ONLY your OpenAI key is used as a fallback.
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// We no longer need fallback keys for Google or Anthropic.
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
		message: 'Roblox AI Proxy Server is running!',
		defaultModel: DEFAULT_MODEL,
		hasOpenAIFallbackKey: !!OPENAI_API_KEY,
	});
});

// --- Main Generation Endpoint (UPDATED) ---
app.post('/generate', async (req, res) => {
	// Get all fields from the plugin
	// Use '||' to set default model if user's 'model' string is empty
	const { prompt, context, apiKey } = req.body;
	const model = req.body.model || DEFAULT_MODEL; 

	if (!prompt) {
		return res.status(400).json({ error: "Missing 'prompt' in request body." });
	}

	// --- Construct the System Prompt (used by all models) ---
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
	let aiText = ""; // This will hold the final text from any provider

	try {
		// --- AI ROUTER LOGIC ---

		if (model.startsWith('gpt-')) {
			// --- 1. Handle OpenAI (gpt-4o-mini, gpt-4, etc.) ---
			console.log(`Routing to OpenAI for model: ${model}`);
			
			// Use the user's API key if provided, otherwise fall back to YOUR key
			const keyToUse = apiKey || OPENAI_API_KEY; 
			
			if (!keyToUse) {
				// This only happens if the user provided no key AND you didn't set one on the server
				return res.status(500).json({ error: "Server is missing OPENAI_API_KEY." });
			}

			const payload = {
				model: model,
				messages: [
					{ role: "system", content: systemPrompt },
					{ role: "user", content: userQuery }
				],
				temperature: 1,
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
			// --- 2. Handle Google Gemini (User MUST provide key) ---
			console.log(`Routing to Google for model: ${model}`);
			
			// NO FALLBACK. User must provide their own key.
			const keyToUse = apiKey; 
			
			if (!keyToUse) {
				// This is the new logic: return an error if no key is provided
				return res.status(400).json({ 
					error: "API Key Required",
					details: `You must provide your own API key to use Gemini models. Only 'gpt-4o-mini' is available without a key.`
				});
			}

			const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${keyToUse}`;
			const payload = {
				contents: [
					{
						role: "user", 
						parts: [{ text: `${systemPrompt}\n\n---\n\nUSER PROMPT: ${userQuery}` }]
					}
				]
			};

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
			// --- 3. Handle Anthropic Claude (User MUST provide key) ---
			console.log(`Routing to Anthropic for model: ${model}`);
			
			// NO FALLBACK. User must provide their own key.
			const keyToUse = apiKey; 

			if (!keyToUse) {
				// This is the new logic: return an error if no key is provided
				return res.status(400).json({ 
					error: "API Key Required",
					details: `You must provide your own API key to use Claude models. Only 'gpt-4o-mini' is available without a key.`
				});
			}

			const payload = {
				model: model,
				system: systemPrompt,
				messages: [
					{ role: "user", content: userQuery }
				],
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
			// --- 4. Handle Unknown Model ---
			console.warn(`Unknown model: ${model}`);
			return res.status(400).json({ error: `Unsupported model: ${model}` });
		}

		// --- Send the final, standardized response back to Roblox ---
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
	console.log(`Roblox AI Multi-Model Proxy Server listening on port ${PORT}`);
	if (!OPENAI_API_KEY) {
		console.warn("WARNING: OPENAI_API_KEY is not set. The default fallback will fail!");
	} else {
		console.log(`Default fallback model 'gpt-4o-mini' is ready.`);
	}
});
