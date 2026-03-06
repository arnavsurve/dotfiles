/**
 * Laint Extension - Auto-lint JSX/TSX files after edit/write
 *
 * After every edit or write to a .jsx/.tsx file, runs laint and appends
 * violations to the tool result so the LLM sees and fixes them.
 *
 * Reads laint.config.json from the project root (cwd) for rule configuration.
 * Falls back to running all rules if no config is found.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isEditToolResult, isWriteToolResult } from "@mariozechner/pi-coding-agent";
import { lintJsxCode } from "laint";
import type { LintConfig, LintResult } from "laint";
import * as fs from "node:fs";
import * as path from "node:path";

const LINT_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);

function loadConfig(cwd: string): LintConfig {
	const configPath = path.resolve(cwd, "laint.config.json");
	try {
		const raw = fs.readFileSync(configPath, "utf-8");
		return JSON.parse(raw) as LintConfig;
	} catch {
		return { rules: [], exclude: true };
	}
}

function formatResult(filePath: string, r: LintResult): string {
	return `${filePath}:${r.line}:${r.column} ${r.severity} [${r.rule}] ${r.message}`;
}

export default function (pi: ExtensionAPI) {
	pi.on("tool_result", async (event, ctx) => {
		if (!isEditToolResult(event) && !isWriteToolResult(event)) return;

		const filePath = event.input.path as string | undefined;
		if (!filePath) return;

		const ext = path.extname(filePath).toLowerCase();
		if (!LINT_EXTENSIONS.has(ext)) return;

		const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(ctx.cwd, filePath);

		let code: string;
		try {
			code = fs.readFileSync(resolved, "utf-8");
		} catch {
			return;
		}

		const config = loadConfig(ctx.cwd);

		let results: LintResult[];
		try {
			results = lintJsxCode(code, config);
		} catch {
			return;
		}

		if (results.length === 0) return;

		const violations = results.map((r) => formatResult(filePath, r)).join("\n");
		const lintMessage = `\n\n⚠️ laint: ${results.length} violation(s) found:\n${violations}\n\nFix these lint violations.`;

		const existingText = event.content
			.filter((c): c is { type: "text"; text: string } => c.type === "text")
			.map((c) => c.text)
			.join("\n");

		return {
			content: [{ type: "text" as const, text: existingText + lintMessage }],
		};
	});
}
