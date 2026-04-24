import { randomUUID } from "node:crypto";
import { renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { complete, Type } from "@mariozechner/pi-ai";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
	SessionEntry,
	SessionHeader,
} from "@mariozechner/pi-coding-agent";

type UserMessageEntry = SessionEntry & { type: "message"; message: { role: "user" } };

function isUserMessageEntry(entry: SessionEntry): entry is UserMessageEntry {
	return entry.type === "message" && entry.message.role === "user";
}

function getLastUserMessage(entries: SessionEntry[]): UserMessageEntry | undefined {
	return entries.findLast(isUserMessageEntry);
}

function extractUserMessageText(entry: UserMessageEntry): string {
	const { content } = entry.message;
	return typeof content === "string"
		? content
		: content.filter((block) => block.type === "text").map((block) => block.text).join("");
}

function collectSubtreeIds(entries: SessionEntry[], rootId: string): Set<string> {
	const childrenByParentId = new Map<string, string[]>();

	for (const entry of entries) {
		if (entry.parentId === null) {
			continue;
		}

		const children = childrenByParentId.get(entry.parentId) ?? [];
		children.push(entry.id);
		childrenByParentId.set(entry.parentId, children);
	}

	const subtreeIds = new Set<string>();
	const stack = [rootId];

	while (stack.length > 0) {
		const currentId = stack.pop()!;
		if (subtreeIds.has(currentId)) {
			continue;
		}

		subtreeIds.add(currentId);
		for (const childId of childrenByParentId.get(currentId) ?? []) {
			stack.push(childId);
		}
	}

	return subtreeIds;
}

function rewriteEntriesForFuckhard(
	entries: SessionEntry[],
	lastUserMessage: UserMessageEntry,
): SessionEntry[] {
	const removedIds = collectSubtreeIds(entries, lastUserMessage.id);
	return entries.filter((entry) => {
		if (removedIds.has(entry.id)) {
			return false;
		}

		if (entry.type === "label" && removedIds.has(entry.targetId)) {
			return false;
		}

		return true;
	});
}

function serializeSession(header: SessionHeader, entries: SessionEntry[]): string {
	return `${[header, ...entries].map((entry) => JSON.stringify(entry)).join("\n")}\n`;
}

function rewriteSessionInPlace(sessionFile: string, header: SessionHeader, entries: SessionEntry[]): void {
	const tempFile = join(dirname(sessionFile), `.pi-fuck-${randomUUID()}.tmp`);
	writeFileSync(tempFile, serializeSession(header, entries));
	renameSync(tempFile, sessionFile);
}

const TYPO_FIX_SYSTEM_PROMPT = [
	"You are correcting a user prompt that was accidentally sent to a coding agent.",
	"Correct only obvious spelling typos, accidental duplicated words, and minor punctuation or grammar mistakes.",
	"",
	"Rules:",
	"- Preserve the user's meaning exactly.",
	"- Do not add requirements.",
	"- Do not remove requirements.",
	"- Do not make the prompt more specific.",
	"- Do not improve prompt quality.",
	"- Do not rephrase.",
	"- Preserve formatting, newlines, indentation, markdown, and code blocks.",
	"- If unsure, return the original prompt unchanged.",
	"",
	"Call the prompt_typo_fixed tool with the corrected prompt itself, not JSON and not wrapped in any other format.",
].join("\n");

const TYPO_FIX_TOOL = {
	name: "prompt_typo_fixed",
	description: "Return the user's prompt with only obvious typos corrected",
	parameters: Type.Object({
		correctedPrompt: Type.String({
			description: "The corrected prompt, preserving the user's original meaning and formatting",
		}),
	}),
};

function buildTypoFixUserPrompt(originalPrompt: string): string {
	return [
		"Correct only obvious typos in this prompt and return the corrected prompt via the tool.",
		"Do not return JSON. Do not include the <prompt> tags.",
		"",
		"<prompt>",
		originalPrompt,
		"</prompt>",
	].join("\n");
}

async function suggestTypoFix(originalPrompt: string, ctx: ExtensionCommandContext): Promise<string | undefined> {
	const model = ctx.model;
	if (!model) {
		ctx.ui.notify("fuck typo: no model available", "warning");
		return undefined;
	}

	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	if (!auth?.ok || !auth.apiKey) {
		ctx.ui.notify(auth?.ok === false ? auth.error : "fuck typo: no API key", "warning");
		return undefined;
	}

	const response = await complete(
		model,
		{
			systemPrompt: TYPO_FIX_SYSTEM_PROMPT,
			messages: [
				{
					role: "user" as const,
					content: [{ type: "text" as const, text: buildTypoFixUserPrompt(originalPrompt) }],
					timestamp: Date.now(),
				},
			],
			tools: [TYPO_FIX_TOOL],
		},
		{ apiKey: auth.apiKey, headers: auth.headers },
	);

	for (const content of response.content) {
		if (content.type !== "toolCall" || content.name !== "prompt_typo_fixed") {
			continue;
		}

		const correctedPrompt = content.arguments.correctedPrompt;
		if (typeof correctedPrompt === "string") {
			return correctedPrompt;
		}
	}

	ctx.ui.notify("fuck typo: model did not return a typo correction", "warning");
	return undefined;
}

async function offerTypoFix(originalPrompt: string, ctx: ExtensionCommandContext): Promise<void> {
	ctx.ui.setStatus("pi-fuck", "Checking prompt for typos...");
	ctx.ui.setWidget("pi-fuck-typo", ["pi-fuck: checking restored prompt for typos..."]);
	try {
		const suggestion = await suggestTypoFix(originalPrompt, ctx);
		if (suggestion === undefined) {
			return;
		}

		if (suggestion.trim() === originalPrompt.trim()) {
			ctx.ui.notify("fuck typo: no obvious typo fix found", "info");
			return;
		}

		const useSuggestion = await ctx.ui.confirm(
			"Use typo-fixed prompt?",
			[
				"Original:",
				originalPrompt,
				"",
				"Suggested:",
				suggestion,
				"",
				"Choose Yes to replace the restored prompt, or No to keep the original.",
			].join("\n"),
		);

		if (useSuggestion) {
			ctx.ui.setEditorText(suggestion);
			ctx.ui.notify("fuck typo: applied suggestion", "info");
		} else {
			ctx.ui.notify("fuck typo: kept original prompt", "info");
		}
	} catch (error) {
		ctx.ui.notify(`fuck typo failed: ${error instanceof Error ? error.message : String(error)}`, "warning");
	} finally {
		ctx.ui.setStatus("pi-fuck", undefined);
		ctx.ui.setWidget("pi-fuck-typo", undefined);
	}
}

export default function piFuck(pi: ExtensionAPI) {
	let isCompacting = false;
	let isFuckhardActive = false;

	const clearCompactionState = () => {
		isCompacting = false;
	};

	const clearFuckhardActivation = () => {
		isFuckhardActive = false;
	};

	const resetSessionState = () => {
		clearCompactionState();
		clearFuckhardActivation();
	};

	const prepareCommand = async (commandName: "fuck" | "fuckhard", ctx: ExtensionCommandContext) => {
		if (isCompacting) {
			ctx.ui.notify(
				`Can't /${commandName} during compaction. Press Esc to cancel compaction, then run /${commandName} again.`,
				"warning",
			);
			return false;
		}

		if (ctx.hasPendingMessages()) {
			ctx.ui.notify(
				`Can't /${commandName} while queued messages exist. Restore or send them first.`,
				"warning",
			);
			return false;
		}

		if (!ctx.isIdle()) {
			ctx.abort();
			await ctx.waitForIdle();
		}

		return true;
	};

	pi.on("session_start", resetSessionState);
	pi.on("input", clearFuckhardActivation);
	pi.on("message_start", (event) => {
		if (event.message.role === "user") {
			isFuckhardActive = true;
		}
	});
	pi.on("session_tree", clearFuckhardActivation);
	pi.on("session_before_compact", ({ signal }) => {
		isCompacting = true;
		signal.addEventListener("abort", clearCompactionState, { once: true });
	});
	pi.on("session_compact", clearCompactionState);

	pi.registerCommand("fuck", {
		description: "Abort the current run, recover the last prompt, optionally suggest a typo fix",
		handler: async (args, ctx) => {
			clearFuckhardActivation();

			const mode = args.trim();
			if (mode && mode !== "typo") {
				ctx.ui.notify("Usage: /fuck [typo]", "warning");
				return;
			}

			if (!(await prepareCommand("fuck", ctx))) {
				return;
			}

			const lastUserMessage = getLastUserMessage(ctx.sessionManager.getBranch());
			if (!lastUserMessage) {
				ctx.ui.notify("Nothing to recover on this branch. Use /tree for manual navigation.", "info");
				return;
			}

			const originalPrompt = extractUserMessageText(lastUserMessage);
			const result = await ctx.navigateTree(lastUserMessage.id);
			if (result.cancelled) {
				ctx.ui.notify("Recovery cancelled.", "info");
				return;
			}

			ctx.ui.notify("fuck: navigated back to last prompt", "info");

			if (mode === "typo") {
				await offerTypoFix(originalPrompt, ctx);
			}
		},
	});

	pi.registerCommand("fuckhard", {
		description: "Destructively rewrite the current session to remove the last prompt subtree",
		handler: async (args, ctx) => {
			if (args.trim()) {
				ctx.ui.notify("Usage: /fuckhard", "warning");
				return;
			}

			if (!isFuckhardActive) {
				ctx.ui.notify(
					"Can't /fuckhard now. It only works immediately during or after a user prompt.",
					"warning",
				);
				return;
			}

			if (!(await prepareCommand("fuckhard", ctx))) {
				return;
			}

			const branch = ctx.sessionManager.getBranch();
			const lastUserMessage = getLastUserMessage(branch);
			if (!lastUserMessage) {
				ctx.ui.notify("Nothing to remove on this branch.", "info");
				return;
			}

			const sessionFile = ctx.sessionManager.getSessionFile();
			const sessionHeader = ctx.sessionManager.getHeader();
			if (!sessionFile || !sessionHeader) {
				ctx.ui.notify("Current session can't be rewritten safely.", "warning");
				return;
			}

			clearFuckhardActivation();

			const editorText = ctx.ui.getEditorText();
			const restoredText = editorText.trim() ? editorText : extractUserMessageText(lastUserMessage);
			const rewindTargetId = lastUserMessage.parentId;
			const rewrittenEntries = rewriteEntriesForFuckhard(ctx.sessionManager.getEntries(), lastUserMessage);

			rewriteSessionInPlace(sessionFile, sessionHeader, rewrittenEntries);
			await ctx.switchSession(sessionFile, {
				withSession: async (replacementCtx) => {
					// The slash-command submission flow can still clear the editor after the
					// replacement session is ready, so restore the prompt on the next tick.
					setTimeout(() => {
						void (async () => {
							if (rewindTargetId) {
								await replacementCtx.navigateTree(rewindTargetId);
							}
							replacementCtx.ui.setEditorText(restoredText);
							replacementCtx.ui.notify(
								"fuckhard: navigated back to last prompt and dropped messages from session",
								"info",
							);
						})();
					}, 0);
				},
			});
		},
	});
}
