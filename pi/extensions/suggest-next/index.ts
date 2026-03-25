/**
 * Suggest Next Message — auto-suggests the next user message after the agent responds.
 *
 * Shows a ghost-text suggestion in the editor that can be accepted with Tab.
 * Uses a lightweight LLM call to generate contextual suggestions.
 */

import { CustomEditor, type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { EditorTheme, TUI } from "@mariozechner/pi-tui";
import { matchesKey, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import type { KeybindingsManager } from "@mariozechner/pi-coding-agent";

interface SuggestionState {
	suggestion: string | null;
}

class SuggestingEditor extends CustomEditor {
	private suggestionState: SuggestionState;

	constructor(tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager, suggestionState: SuggestionState) {
		super(tui, theme, keybindings);
		this.suggestionState = suggestionState;
	}

	handleInput(data: string): void {
		if (this.suggestionState.suggestion && matchesKey(data, "tab")) {
			const editorText = this.getText();
			if (!editorText.trim()) {
				this.setText(this.suggestionState.suggestion);
				this.suggestionState.suggestion = null;
				return;
			}
		}

		if (this.suggestionState.suggestion && !matchesKey(data, "tab")) {
			const isCursorMovement =
				matchesKey(data, "up") ||
				matchesKey(data, "down") ||
				matchesKey(data, "left") ||
				matchesKey(data, "right");
			if (!isCursorMovement) {
				this.suggestionState.suggestion = null;
			}
		}

		super.handleInput(data);
	}

	render(width: number): string[] {
		const lines = super.render(width);
		if (!this.suggestionState.suggestion || lines.length === 0) return lines;

		const editorText = this.getText();
		if (editorText.trim()) return lines;

		if (lines.length >= 3) {
			const ghostText = this.suggestionState.suggestion;
			const paddingX = this.getPaddingX();
			const availableWidth = width - paddingX * 2;
			const truncatedGhost = truncateToWidth(ghostText, availableWidth, "…");
			const padding = " ".repeat(paddingX);
			const ghostLine = `${padding}\x1b[2m${truncatedGhost}\x1b[22m`;
			const ghostVisible = visibleWidth(ghostLine);
			const padRight = Math.max(0, width - ghostVisible);
			lines[1] = truncateToWidth(ghostLine + " ".repeat(padRight), width);
		}

		return lines;
	}
}

export default function (pi: ExtensionAPI) {
	const suggestionState: SuggestionState = { suggestion: null };
	let abortController: AbortController | null = null;

	pi.on("session_start", (_event, ctx) => {
		ctx.ui.setEditorComponent((tui, theme, kb) => new SuggestingEditor(tui, theme, kb, suggestionState));
	});

	pi.on("agent_end", async (_event, ctx) => {
		abortController?.abort();
		abortController = new AbortController();
		suggestionState.suggestion = null;

		try {
			const suggestion = await generateSuggestion(ctx, abortController.signal);
			if (suggestion && !abortController.signal.aborted) {
				suggestionState.suggestion = suggestion;
			}
		} catch {
			// Silently ignore suggestion failures
		}
	});

	pi.on("input", async () => {
		abortController?.abort();
		suggestionState.suggestion = null;
		return { action: "continue" as const };
	});

	pi.on("session_before_switch", async () => {
		abortController?.abort();
		suggestionState.suggestion = null;
	});
}

async function generateSuggestion(
	ctx: { sessionManager: any; modelRegistry: any; model: any; getSystemPrompt: () => string },
	signal: AbortSignal,
): Promise<string | null> {
	const branch = ctx.sessionManager.getBranch();
	const recentMessages = extractRecentMessages(branch, 10);
	if (recentMessages.length === 0) return null;

	const apiKey = await resolveApiKey(ctx);
	if (!apiKey) return null;

	const model = ctx.model;
	if (!model) return null;

	const sessionSystemPrompt = ctx.getSystemPrompt();
	const combinedSystemPrompt = sessionSystemPrompt + "\n\n" + SUGGEST_SYSTEM_PROMPT;

	const provider: string = model.provider;
	const modelId: string = model.id;

	if (provider === "anthropic" || model.api === "anthropic-messages") {
		return callAnthropic({ apiKey, modelId, messages: recentMessages, systemPrompt: combinedSystemPrompt, baseUrl: model.baseUrl, signal });
	}
	if (provider === "openai" || model.api === "openai-responses" || model.api === "openai-completions") {
		return callOpenAI({ apiKey, modelId, messages: recentMessages, systemPrompt: combinedSystemPrompt, baseUrl: model.baseUrl, signal });
	}
	if (provider === "google" || model.api === "google-generative-ai") {
		return callGoogle({ apiKey, modelId, messages: recentMessages, systemPrompt: combinedSystemPrompt, signal });
	}

	const anthropicKey = process.env["ANTHROPIC_API_KEY"];
	if (anthropicKey) {
		return callAnthropic({ apiKey: anthropicKey, modelId: modelId || "claude-haiku-4-5-20251001", messages: recentMessages, systemPrompt: combinedSystemPrompt, baseUrl: undefined, signal });
	}

	return null;
}

async function resolveApiKey(ctx: { modelRegistry: any; model: any }): Promise<string | null> {
	try {
		const key = await ctx.modelRegistry.getApiKey(ctx.model);
		return key ?? null;
	} catch {
		return null;
	}
}

interface SimpleMessage {
	role: "user" | "assistant";
	content: string;
}

function extractRecentMessages(branch: any[], maxMessages: number): SimpleMessage[] {
	const messages: SimpleMessage[] = [];

	for (const entry of branch) {
		if (entry.type !== "message") continue;
		const msg = entry.message;
		if (!msg?.role) continue;

		if (msg.role === "user") {
			const text =
				typeof msg.content === "string"
					? msg.content
					: Array.isArray(msg.content)
						? msg.content
								.filter((c: any) => c.type === "text")
								.map((c: any) => c.text)
								.join("\n")
						: "";
			if (text.trim()) {
				messages.push({ role: "user", content: text.trim() });
			}
		} else if (msg.role === "assistant") {
			const text = Array.isArray(msg.content)
				? msg.content
						.filter((c: any) => c.type === "text")
						.map((c: any) => c.text)
						.join("\n")
				: "";
			if (text.trim()) {
				messages.push({ role: "assistant", content: truncateMessage(text.trim(), 500) });
			}
		}
	}

	const merged: SimpleMessage[] = [];
	for (const msg of messages) {
		const last = merged[merged.length - 1];
		if (last && last.role === msg.role) {
			last.content += "\n" + msg.content;
		} else {
			merged.push({ ...msg });
		}
	}

	const startIdx = merged.findIndex((m) => m.role === "user");
	if (startIdx < 0) return [];

	return merged.slice(startIdx).slice(-maxMessages);
}

function truncateMessage(text: string, maxChars: number): string {
	if (text.length <= maxChars) return text;
	return text.slice(0, maxChars) + "…";
}

const SUGGEST_SYSTEM_PROMPT = `FIRST: Look at the user's recent messages and original request. Your job is to predict what THEY would type – not what you think they should do.

2-12 words. User's phrasing. Never evaluate, never Claude-voice.

If there's no clear next message the user would type, output exactly: NONE`;

function parseSuggestion(raw: string | undefined | null): string | null {
	const text = raw?.trim();
	if (!text) return null;
	if (text.toUpperCase() === "NONE") return null;
	return text;
}

async function callAnthropic(opts: {
	apiKey: string;
	modelId: string;
	messages: SimpleMessage[];
	systemPrompt: string;
	baseUrl: string | undefined;
	signal: AbortSignal;
}): Promise<string | null> {
	const url = `${opts.baseUrl || "https://api.anthropic.com"}/v1/messages`;

	const response = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-api-key": opts.apiKey,
			"anthropic-version": "2023-06-01",
		},
		body: JSON.stringify({
			model: opts.modelId,
			max_tokens: 60,
			system: opts.systemPrompt,
			messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
		}),
		signal: opts.signal,
	});

	if (!response.ok) return null;
	const data: any = await response.json();
	return parseSuggestion(data?.content?.[0]?.text);
}

async function callOpenAI(opts: {
	apiKey: string;
	modelId: string;
	messages: SimpleMessage[];
	systemPrompt: string;
	baseUrl: string | undefined;
	signal: AbortSignal;
}): Promise<string | null> {
	const url = `${opts.baseUrl || "https://api.openai.com"}/v1/chat/completions`;

	const response = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${opts.apiKey}`,
		},
		body: JSON.stringify({
			model: opts.modelId,
			max_tokens: 60,
			messages: [{ role: "system", content: opts.systemPrompt }, ...opts.messages],
		}),
		signal: opts.signal,
	});

	if (!response.ok) return null;
	const data: any = await response.json();
	return parseSuggestion(data?.choices?.[0]?.message?.content);
}

async function callGoogle(opts: {
	apiKey: string;
	modelId: string;
	messages: SimpleMessage[];
	systemPrompt: string;
	signal: AbortSignal;
}): Promise<string | null> {
	const url = `https://generativelanguage.googleapis.com/v1beta/models/${opts.modelId}:generateContent?key=${encodeURIComponent(opts.apiKey)}`;

	const contents = opts.messages.map((m) => ({
		role: m.role === "assistant" ? "model" : "user",
		parts: [{ text: m.content }],
	}));

	const response = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			systemInstruction: { parts: [{ text: opts.systemPrompt }] },
			contents,
			generationConfig: { maxOutputTokens: 60 },
		}),
		signal: opts.signal,
	});

	if (!response.ok) return null;
	const data: any = await response.json();
	return parseSuggestion(data?.candidates?.[0]?.content?.parts?.[0]?.text);
}
