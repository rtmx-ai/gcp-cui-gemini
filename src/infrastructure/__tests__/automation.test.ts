import { describe, it, expect } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import { resolveStateDir, buildStackName } from "../automation.js";

// @req REQ-GCG-004: resolveStateDir, buildStackName

describe("resolveStateDir", () => {
  it("returns path under ~/.aegis/state/gcp-cui-gemini", () => {
    const dir = resolveStateDir();
    expect(dir).toBe(path.join(os.homedir(), ".aegis", "state", "gcp-cui-gemini"));
  });

  it("is an absolute path", () => {
    const dir = resolveStateDir();
    expect(path.isAbsolute(dir)).toBe(true);
  });
});

describe("buildStackName", () => {
  it("formats as project-id-impact-level lowercase", () => {
    expect(
      buildStackName({ projectId: "my-project", region: "us-central1", impactLevel: "IL4" }),
    ).toBe("my-project-il4");
  });

  it("lowercases IL5", () => {
    expect(buildStackName({ projectId: "proj", region: "us-central1", impactLevel: "IL5" })).toBe(
      "proj-il5",
    );
  });

  it("preserves project ID as-is", () => {
    expect(
      buildStackName({ projectId: "My-Project-123", region: "us-central1", impactLevel: "IL4" }),
    ).toBe("My-Project-123-il4");
  });
});
