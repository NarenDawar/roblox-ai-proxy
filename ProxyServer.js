/*
	This is the Node.js proxy server for OpenAI (ChatGPT).
	Enhanced version with better debugging and error handling.
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

// Add a simple GET endpoint for testing
app.get('/', (req, res) => {
	console.log('GET / - Health check requested');
	res.json({ 
		status: 'ok', 
		message: 'Roblox AI Proxy Server is running!',
		timestamp: new Date().toISOString(),
		hasApiKey: !!OPENAI_API_KEY,
		apiKeyPreview: OPENAI_API_KEY ? `${OPENAI_API_KEY.substring(0, 7)}...` : 'NOT SET'
	});
});

// Test endpoint to verify server is receiving requests
app.post('/test', (req, res) => {
	console.log('POST /test - Test endpoint hit');
	console.log('Request body:', req.body);
	res.json({ 
		message: 'Test successful', 
		received: req.body,
		timestamp: new Date().toISOString()
	});
});

// Main generation endpoint
app.post('/generate', async (req, res) => {
	console.log('POST /generate - Request received at:', new Date().toISOString());
	console.log('Request headers:', req.headers);
	console.log('Request body:', JSON.stringify(req.body, null, 2));
	
	if (!OPENAI_API_KEY) {
		console.error("OPENAI_API_KEY is not set.");
		return res.status(500).json({ 
			error: "Server is missing API key.",
			details: "Please set the OPENAI_API_KEY environment variable in Render dashboard"
		});
	}
	
	try {
		const { prompt, context } = req.body;
		
		if (!prompt) {
			console.error("Missing prompt in request");
			return res.status(400).json({ error: "Missing 'prompt' in request body." });
		}
		
		console.log('Prompt received:', prompt);
		console.log('Context received:', context ? 'Yes' : 'No');
		
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
		console.log("Preparing to call OpenAI API...");
		
		const payload = {
			model: "gpt-4o-mini", // Changed back to gpt-4o-mini for better compatibility
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
		
		console.log('Calling OpenAI with model:', payload.model);
		console.log('API URL:', API_URL);
		
		const startTime = Date.now();
		const apiResponse = await fetch(API_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${OPENAI_API_KEY}`
			},
			body: JSON.stringify(payload)
		});
		const endTime = Date.now();
		
		console.log(`OpenAI API responded in ${endTime - startTime}ms with status:`, apiResponse.status);
		
		if (!apiResponse.ok) {
			const errorBody = await apiResponse.text();
			console.error("OpenAI API Error Status:", apiResponse.status);
			console.error("OpenAI API Error Body:", errorBody);
			
			// Parse error if possible
			try {
				const errorJson = JSON.parse(errorBody);
				return res.status(apiResponse.status).json({ 
					error: "Error from OpenAI API",
					details: errorJson.error?.message || errorBody,
					type: errorJson.error?.type || 'unknown',
					code: errorJson.error?.code || apiResponse.status
				});
			} catch (e) {
				return res.status(apiResponse.status).json({ 
					error: "Error from OpenAI API",
					details: errorBody 
				});
			}
		}
		
		const result = await apiResponse.json();
		console.log('OpenAI response received, extracting text...');
		
		const aiText = result.choices?.[0]?.message?.content;
		
		if (!aiText) {
			console.error("Invalid response structure from OpenAI:", JSON.stringify(result));
			return res.status(500).json({ 
				error: "Could not parse AI response.",
				details: "Response structure was unexpected",
				received: result
			});
		}
		
		// Send the AI's text response back to the Roblox plugin
		console.log("Successfully got response from OpenAI, sending back to client...");
		console.log("Response preview:", aiText.substring(0, 100) + '...');
		
		res.json({ text: aiText });
		console.log('Response sent successfully!');
		
	} catch (error) {
		console.error("Error in /generate endpoint:", error);
		console.error("Error stack:", error.stack);
		res.status(500).json({ 
			error: "Internal server error.",
			details: error.message,
			stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
		});
	}
});

// 404 handler
app.use((req, res) => {
	console.log(`404 - Unknown route: ${req.method} ${req.path}`);
	res.status(404).json({ 
		error: 'Not Found', 
		message: `Route ${req.method} ${req.path} not found`,
		availableRoutes: ['GET /', 'POST /generate', 'POST /test']
	});
});

// Error handler
app.use((err, req, res, next) => {
	console.error('Unhandled error:', err);
	res.status(500).json({ 
		error: 'Internal Server Error',
		message: err.message 
	});
});

app.listen(PORT, () => {
	console.log(`========================================`);
	console.log(`Roblox AI Proxy Server is starting...`);
	console.log(`Port: ${PORT}`);
	console.log(`Time: ${new Date().toISOString()}`);
	console.log(`Node Version: ${process.version}`);
	console.log(`OPENAI_API_KEY: ${OPENAI_API_KEY ? 'SET ✓' : 'NOT SET ✗'}`);
	if (OPENAI_API_KEY) {
		console.log(`API Key Preview: ${OPENAI_API_KEY.substring(0, 7)}...`);
	}
	console.log(`========================================`);
	
	if (!OPENAI_API_KEY) {
		console.warn("⚠️  WARNING: OPENAI_API_KEY environment variable is not set!");
		console.warn("⚠️  The server will not work without it.");
		console.warn("⚠️  Please set it in your Render dashboard under Environment settings.");
	}
	
	console.log('Server is ready to receive requests!');
});
