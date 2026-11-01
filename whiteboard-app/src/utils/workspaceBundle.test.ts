/**
 * workspaceBundle export/import tests (Track 3).
 *
 * Tests the REAL module `workspaceBundle.ts` (same directory), using ONLY
 * the exports actually read from it at main 3b6510d:
 *   exportWorkspace(liveScene: LiveSceneData): Promise<void>
 *   importWorkspace(): Promise<ImportResult | null>
 *   interfaces WorkspaceBundle / LiveSceneData / ImportResult
 *
 * Why mocks: the real module touches IndexedDB (via ../data/LocalStorage and
 * ../services/chatDb) and the DOM (document.createElement, Blob, URL, alert)
 * for the download / file-picker flow. Those two dependency modules are
 * mocked with exactly the functions workspaceBundle.ts calls; the DOM bits
 * are stubbed per-test. No new exports were invented in workspaceBundle.ts.
 *
 * Run: `bun run --cwd ./whiteboard-app test` (vitest, node environment).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
    loadScene: vi.fn(),
    saveScene: vi.fn(),
    getAIHistory: vi.fn(),
    saveAIResult: vi.fn(),
    loadConversations: vi.fn(),
    loadMessages: vi.fn(),
    saveConversation: vi.fn(),
    saveMessages: vi.fn(),
}));

vi.mock("../data/LocalStorage", () => ({
    loadScene: mocks.loadScene,
    saveScene: mocks.saveScene,
    getAIHistory: mocks.getAIHistory,
    saveAIResult: mocks.saveAIResult,
}));

vi.mock("../services/chatDb", () => ({
    chatDb: {
        loadConversations: mocks.loadConversations,
        loadMessages: mocks.loadMessages,
        saveConversation: mocks.saveConversation,
        saveMessages: mocks.saveMessages,
    },
}));

import { exportWorkspace, importWorkspace } from "./workspaceBundle";
import type { WorkspaceBundle, LiveSceneData } from "./workspaceBundle";

// ─── DOM fakes ──────────────────────────────────────────────────────────────

interface FakeAnchor {
    href: string;
    download: string;
    click: ReturnType<typeof vi.fn>;
}

interface FakeFile {
    text: () => Promise<string>;
}

interface FakeInput {
    type: string;
    accept: string;
    files: FakeFile[] | null;
    onchange: (() => Promise<void>) | null;
    oncancel: (() => void) | null;
    click: ReturnType<typeof vi.fn>;
}

class CapturingBlob {
    static last: CapturingBlob | null = null;
    parts: unknown[];
    options: { type?: string } | undefined;
    constructor(parts: unknown[], options?: { type?: string }) {
        this.parts = parts;
        this.options = options;
        CapturingBlob.last = this;
    }
    async text(): Promise<string> {
        return this.parts.map(String).join("");
    }
}

function installDomStubs(anchor: FakeAnchor, input: FakeInput, alertMock: ReturnType<typeof vi.fn>) {
    vi.stubGlobal("document", {
        createElement: (tag: string) => (tag === "input" ? input : anchor),
        body: { appendChild: vi.fn(), removeChild: vi.fn() },
    });
    vi.stubGlobal("Blob", CapturingBlob);
    vi.stubGlobal("URL", {
        createObjectURL: vi.fn(() => "blob:fake-url"),
        revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal("alert", alertMock);
}

function makeAnchor(): FakeAnchor {
    return { href: "", download: "", click: vi.fn() };
}

function makeInput(): FakeInput {
    return {
        type: "",
        accept: "",
        files: null,
        onchange: null,
        oncancel: null,
        click: vi.fn(),
    };
}

const liveScene: LiveSceneData = {
    elements: [{ id: "element-1", type: "rectangle" }],
    appState: { viewBackgroundColor: "#ffffff" },
    files: {},
};

const sampleMessages = [{ role: "user", content: "hello" }];
const sampleAiHistory = [
    { type: "text", prompt: "draw a cat", result: "cat", thumbnail: null, metadata: {} },
];

beforeEach(() => {
    vi.clearAllMocks();
    CapturingBlob.last = null;
    mocks.loadConversations.mockResolvedValue([
        { id: "conv-1", title: "Chat 1", updatedAt: 1700000000000 },
    ]);
    mocks.loadMessages.mockResolvedValue(sampleMessages);
    mocks.getAIHistory.mockResolvedValue(sampleAiHistory);
    mocks.saveScene.mockResolvedValue(undefined);
    mocks.saveConversation.mockResolvedValue(undefined);
    mocks.saveMessages.mockResolvedValue(undefined);
    mocks.saveAIResult.mockResolvedValue(undefined);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

// ─── exportWorkspace ────────────────────────────────────────────────────────

describe("exportWorkspace", () => {
    it("builds a version-1 bundle from the LIVE scene and downloads it", async () => {
        const anchor = makeAnchor();
        const input = makeInput();
        installDomStubs(anchor, input, vi.fn());

        await exportWorkspace(liveScene);

        expect(mocks.loadConversations).toHaveBeenCalledTimes(1);
        expect(mocks.loadMessages).toHaveBeenCalledWith("conv-1");
        expect(mocks.getAIHistory).toHaveBeenCalledTimes(1);

        expect(CapturingBlob.last).not.toBeNull();
        expect(CapturingBlob.last?.options?.type).toBe("application/json");
        const bundle: WorkspaceBundle = JSON.parse(await CapturingBlob.last!.text());

        expect(bundle.version).toBe(1);
        expect(bundle.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        // Live scene passes through (elements are copied, not stale DB data).
        expect(bundle.scene?.elements).toEqual([{ id: "element-1", type: "rectangle" }]);
        expect(bundle.scene?.appState).toEqual({ viewBackgroundColor: "#ffffff" });
        expect(bundle.scene?.files).toEqual({});
        expect(bundle.conversations).toEqual([
            {
                id: "conv-1",
                title: "Chat 1",
                updatedAt: 1700000000000,
                messages: sampleMessages,
            },
        ]);
        expect(bundle.aiHistory).toEqual(sampleAiHistory);

        // Download side of the export.
        expect(anchor.download).toMatch(/^my-whiteboard-\d{4}-\d{2}-\d{2}\.whiteboard\.json$/);
        expect(anchor.click).toHaveBeenCalledTimes(1);
    });

    it("exports empty conversations / AI history as empty arrays", async () => {
        const anchor = makeAnchor();
        installDomStubs(anchor, makeInput(), vi.fn());
        mocks.loadConversations.mockResolvedValue([]);
        mocks.getAIHistory.mockResolvedValue([]);

        await exportWorkspace(liveScene);

        const bundle: WorkspaceBundle = JSON.parse(await CapturingBlob.last!.text());
        expect(bundle.conversations).toEqual([]);
        expect(bundle.aiHistory).toEqual([]);
        expect(bundle.scene).not.toBeNull();
    });
});

// ─── importWorkspace ────────────────────────────────────────────────────────

describe("importWorkspace", () => {
    function validBundle(): WorkspaceBundle {
        return {
            version: 1,
            exportedAt: "2026-11-02T00:00:00.000Z",
            scene: {
                elements: [{ id: "element-9" }],
                appState: { viewBackgroundColor: "#000000" },
                files: { "file-1": { dataURL: "data:," } },
            },
            conversations: [
                {
                    id: "conv-9",
                    title: "Restored",
                    updatedAt: 1700000000001,
                    messages: sampleMessages as never,
                },
            ],
            aiHistory: sampleAiHistory as never,
        };
    }

    it("restores scene + conversations + AI history and returns counts", async () => {
        const input = makeInput();
        installDomStubs(makeAnchor(), input, vi.fn());
        const bundle = validBundle();
        input.files = [{ text: async () => JSON.stringify(bundle) }];

        const pending = importWorkspace();
        expect(input.type).toBe("file");
        await input.onchange!();
        const result = await pending;

        expect(result).toEqual({
            scene: bundle.scene,
            conversationCount: 1,
            aiHistoryCount: 1,
        });
        expect(mocks.saveScene).toHaveBeenCalledWith(
            bundle.scene!.elements,
            bundle.scene!.appState,
            bundle.scene!.files,
        );
        expect(mocks.saveConversation).toHaveBeenCalledWith({
            id: "conv-9",
            title: "Restored",
            updatedAt: 1700000000001,
        });
        // Messages are restored with the original timestamps preserved.
        expect(mocks.saveMessages).toHaveBeenCalledWith("conv-9", sampleMessages, {
            skipTimestamp: true,
        });
        expect(mocks.saveAIResult).toHaveBeenCalledWith({
            type: "text",
            prompt: "draw a cat",
            result: "cat",
            thumbnail: null,
            metadata: {},
        });
    });

    it("returns scene null and zero counts when the bundle has no scene", async () => {
        const input = makeInput();
        installDomStubs(makeAnchor(), input, vi.fn());
        const bundle = validBundle();
        bundle.scene = null;
        bundle.conversations = [];
        bundle.aiHistory = [];
        input.files = [{ text: async () => JSON.stringify(bundle) }];

        const pending = importWorkspace();
        await input.onchange!();
        const result = await pending;

        expect(result).toEqual({ scene: null, conversationCount: 0, aiHistoryCount: 0 });
        expect(mocks.saveScene).not.toHaveBeenCalled();
    });

    it("rejects a bundle missing version/exportedAt: alerts and resolves null", async () => {
        const input = makeInput();
        const alertMock = vi.fn();
        installDomStubs(makeAnchor(), input, alertMock);
        input.files = [{ text: async () => JSON.stringify({ scene: null }) }];

        const pending = importWorkspace();
        await input.onchange!();
        const result = await pending;

        expect(result).toBeNull();
        expect(alertMock).toHaveBeenCalledTimes(1);
        expect(String(alertMock.mock.calls[0][0])).toContain("Import failed");
        expect(mocks.saveScene).not.toHaveBeenCalled();
        expect(mocks.saveConversation).not.toHaveBeenCalled();
    });

    it("resolves null when no file is selected", async () => {
        const input = makeInput();
        installDomStubs(makeAnchor(), input, vi.fn());
        input.files = [];

        const pending = importWorkspace();
        await input.onchange!();
        await expect(pending).resolves.toBeNull();
        expect(mocks.saveScene).not.toHaveBeenCalled();
    });

    it("resolves null when the file picker is cancelled", async () => {
        const input = makeInput();
        installDomStubs(makeAnchor(), input, vi.fn());

        const pending = importWorkspace();
        input.oncancel!();
        await expect(pending).resolves.toBeNull();
    });
});
