import fs from "node:fs" // replacement of shell commands (much safer)
import path from "node:path"
import {homedir} from "node:os"
import {spawnSync} from "node:child_process"
import type { AgentConfig, ActionLog } from "./types"
import { ActionTracker } from "./action-tracker"

const TEXT_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".mdx",
  ".css",
  ".html",
  ".yml",
  ".yaml",
  ".toml",
  ".txt",
  ".py"
]);

function isProbablyTextFile(filePath: string): boolean { // takes a file path and returns true or false
  const ext = path.extname(filePath).toLowerCase(); // extracts file's extension
  return TEXT_EXT.has(ext) || ext === ""; // return the ext and returns the file with no extension too
}

export class ToolExecutor {
  private overlay = new Map<string, string>(); // in memory store of pending file changes, the files are not yet hitting the disk
  private deleted = new Set<string>(); // tracks file mark for deletion but not deleted yet
  private readonly norm = (rel: string) =>
    path.posix.normalize(rel.split(path.sep).join("/")).replace(/^\.\//, ""); // a narmalizer function that keeps path clean

  constructor(
    private readonly tracker: ActionTracker,
    private readonly config: AgentConfig,
  ) {}

  private resolveSafe(rel: string): string { // converts relative path into absoulte path
    const abs = path.resolve(this.config.codebasePath, rel);
    const root = path.resolve(this.config.codebasePath);
    const relCheck = path.relative(root, abs); // checks where abs is relative to workspace root
    if (relCheck.startsWith("..") || path.isAbsolute(relCheck)) {
      throw new Error(`Path escapes workspace: ${rel}`); // if the results starts with ".." it means the file is outside the workspace, isAbsolute catches edge cases
    }
    return abs;
  }

  private excluded(relPath: string): boolean { // pattern matching for ignored files
    const norm = this.norm(relPath); // cleans up the path
    const segments = norm.split("/"); // gets them into arrays
    const base = segments[segments.length - 1] ?? ""; // grabs the last section

    for (const pat of this.config.excludePatterns) {
      if (pat === "*.log" && base.endsWith(".log")) return true;
      if (pat === ".env*" && base.startsWith(".env")) return true; // hardcoded to not touch these
      if (pat.includes("*")) continue; // is any other wildcard which isn't handeled above, skip it
      if (segments.includes(pat) || norm === pat || norm.startsWith(`${pat}/`)) // match with the exact folder name
        return true;
    }
    return false;
  }

    private assertNotExcluded(rel: string, op: string): void { // checks the file path and the operation
    if (this.excluded(rel)) { // if file is excluded, throw an error with clear message
      throw new Error(`${op}: path is excluded by policy: ${rel}`);
    }
  }

    getEffectiveText(rel: string): string | undefined { // takes a relative path and return string or undefined
    const key = this.norm(rel); // convert it into a consistent format
    if (this.deleted.has(key)) return undefined; // if marked deleted, treat it as it it
    if (this.overlay.has(key)) return this.overlay.get(key); // is there's a pending/draft version, show that other than the disk version
    const abs = this.resolveSafe(rel); // if no overlay show the disk version
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return undefined; // make sure it exists and in a file not folder
    return fs.readFileSync(abs, "utf8");
  }

   readFile(rel: string): string {
    this.assertNotExcluded(rel, "read_file"); // not banned file?
    const abs = this.resolveSafe(rel); // get absoult path safely
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) { // exists and is a file? if not then error
      throw new Error(`File not found: ${rel}`);
    }
    const st = fs.statSync(abs); // if it exsits and is a file
    if (st.size > this.config.maxFileSizeToRead) { // check it's memory. is it tool large?
      throw new Error(`File too large: ${rel}`);
    }
    const text = fs.readFileSync(abs, "utf8");
    this.tracker.log({
      type: "code_analysis",
      path: this.norm(rel),
      details: { after: text, toolName: "read_file" },
      status: "executed", // if all is good, read and log it
    });
    return text;
  }

  createFile(rel: string, content: string): string {
    if (!this.config.tools.allowFileCreation) // checks if the file is allowed to create
      throw new Error("File creation disabled");
    this.assertNotExcluded(rel, "create_file"); // if it is, create file
    const key = this.norm(rel);
    const abs = this.resolveSafe(rel);
    if (fs.existsSync(abs) && !this.deleted.has(key)) { // if a file is deleted and then recreated, remove it from the deleted set
      throw new Error(`create_file: already exists: ${rel}`);
    }
    this.deleted.delete(key); // unmarks as deleted if it was
    this.overlay.set(key, content); // stage as new file
    this.tracker.log({
      type: "file_create",
      path: key,
      details: { after: content },
      status: "pending", // file created but not yet added to disk
    });
    return `Staged new file: ${key}`;
  }

  modifyFile(rel: string, content: string): string {
    if (!this.config.tools.allowFileModification)
      throw new Error("File modification disabled");
    this.assertNotExcluded(rel, "modify_file");
    const before = this.getEffectiveText(rel); // get current content of what's in the file
    if (before === undefined) // if no file
      throw new Error(`modify_file: file not found: ${rel}`);
    const key = this.norm(rel);
    this.overlay.set(key, content); // set the changes
    this.tracker.log({
      type: "file_modify",
      path: key,
      details: { before, after: content },
      status: "pending",
    });
    return `Staged update: ${key}`;
  }

  deleteFile(rel: string): string {
    if (!this.config.tools.allowFileModification)
      throw new Error("File deletion disabled");
    this.assertNotExcluded(rel, "delete_file");
    const before = this.getEffectiveText(rel);
    if (before === undefined)
      throw new Error(`delete_file: file not found: ${rel}`);
    const key = this.norm(rel);
    this.overlay.delete(key); // remove any staged commits
    this.deleted.add(key); // marks for deletion
    this.tracker.log({
      type: "file_delete",
      path: key,
      details: { before },
      status: "pending",
    });
    return `Staged delete: ${key}`;
  }

  createFolder(rel: string): string {
    if (!this.config.tools.allowFolderCreation)
      throw new Error("Folder creation disabled");
    this.assertNotExcluded(rel, "create_folder");
    const key = this.norm(rel);
    this.tracker.log({
      type: "folder_create",
      path: key,
      details: { after: key },
      status: "pending",
    });
    return `Staged folder: ${key}`;
  }

  listFiles(rel: string, recursive: boolean): string {
    this.assertNotExcluded(rel, "list_files");
    const abs = this.resolveSafe(rel);
    if (!fs.existsSync(abs)) throw new Error(`list_files: not found: ${rel}`);

    const lines: string[] = [];
    const walk = (dir: string, prefix: string) => { // walk: recusrsive function which calls itself for subfolders
      const entries = fs.readdirSync(dir, { withFileTypes: true }); // withFileTypes: each entry's knows if it's a file or directory
      for (const ent of entries) {
        const full = path.join(dir, ent.name);
        const relP = path.relative(this.config.codebasePath, full);
        if (this.excluded(relP)) continue; // skip excluded files
        if (ent.isDirectory()) {
          lines.push(`${prefix}${ent.name}/`); // builds up indentation/path as it goes deeper
          if (recursive) walk(full, `${prefix}${ent.name}/`); // recurse into subfolders
        } else {
          lines.push(`${prefix}${ent.name}`);
        }
      }
    };
  }

    searchFiles(
    rootRel: string,
    globPattern: string,
    contentQuery?: string,
  ): string {
    this.assertNotExcluded(rootRel, "search_files");
    const rootAbs = this.resolveSafe(rootRel);
    if (!fs.existsSync(rootAbs))
      throw new Error(`search_files: root not found: ${rootRel}`);

    const results: string[] = [];
    const regexFromGlob = (g: string): RegExp => { // converts a glob pattern into regex so it can match file path
      const escaped = g
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*\*/g, "§§")
        .replace(/\*/g, "[^/\\\\]*")
        .replace(/§§/g, ".*")
        .replace(/\?/g, ".");
      return new RegExp(`^${escaped}$`, "i");
    };
    const nameRe = regexFromGlob(globPattern.replace(/\\/g, "/"));

    const walk = (dir: string) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        const relP = path
          .relative(this.config.codebasePath, full)
          .split(path.sep)
          .join("/");
        if (this.excluded(relP)) continue;
        if (ent.isDirectory()) walk(full);
        else if (nameRe.test(relP) || nameRe.test(ent.name)) { // test the pattern against the full path and the file name
          if (contentQuery) { // optional filter if contentQuery is provided also checks file contents
            if (!isProbablyTextFile(full)) continue;
            const text = fs.readFileSync(full, "utf8");
            if (!text.includes(contentQuery)) continue;
          }
          results.push(relP);
        }
      }
    };

    if (fs.statSync(rootAbs).isDirectory()) walk(rootAbs);
    else {
      const relP = path
        .relative(this.config.codebasePath, rootAbs)
        .split(path.sep)
        .join("/");
      results.push(relP);
    }

    const out = [...new Set(results)].sort().join("\n"); // Deduplicates results with Set, sorts alphabetically, joins into a string
    this.tracker.log({
      type: "code_analysis",
      path: this.norm(rootRel),
      details: { after: out || "(no matches)", toolName: "search_files" },
      status: "executed",
    });
    return out || "(no matches)";
  }

  analyzeCodebase(rootRel: string): string { // just walk the whole directory skipping the excluding one and return summary
    const rootAbs = this.resolveSafe(rootRel);
    if (!fs.existsSync(rootAbs))
      throw new Error(`analyze_codebase: not found: ${rootRel}`);

    let files = 0;
    let dirs = 0;
    const walk = (dir: string) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        const relP = path.relative(this.config.codebasePath, full);
        if (this.excluded(relP)) continue;
        if (ent.isDirectory()) {
          dirs++;
          walk(full);
        } else {
          files++;
        }
      }
    };
    if (fs.statSync(rootAbs).isDirectory()) walk(rootAbs);
    else files = 1;

    const summary = `Files: ${files} | Directories: ${dirs}`;
    this.tracker.log({
      type: "code_analysis",
      path: this.norm(rootRel),
      details: { after: summary, toolName: "analyze_codebase" },
      status: "executed",
    });
    return summary;
  }

  queueShell(command: string): string {
    if (!this.config.tools.allowShellExecution) // dont run shell commands just stage them as pending
      throw new Error("Shell execution disabled");
    this.tracker.log({
      type: "tool_execute",
      path: "shell",
      details: { command, toolName: "execute_shell" },
      status: "pending",
    });
    return `Shell queued: ${command}`;
  }
  skillRoots(): string[] { // skills.md file for specific works
    const extra =
      process.env.SKILLS_DIRS?.split(/[;]/)
        .map((s) => s.trim())
        .filter(Boolean) ?? [];
    return [
      ...extra,
      path.join(homedir(), ".cursor/skills-cursor"),
      path.join(homedir(), ".claude/skills"),
    ];
  }

  listSkills(): string { // list of all of them
    const lines: string[] = [];
    for (const root of this.skillRoots()) {
      if (!fs.existsSync(root)) continue;
      const walk = (dir: string) => {
        for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, ent.name);
          if (ent.isDirectory()) walk(full);
          else if (ent.name === "SKILL.md") lines.push(full);
        }
      };
      walk(root);
    }
    const out = lines.sort().join("\n");
    this.tracker.log({
      type: "code_analysis",
      path: "skills",
      details: { after: out || "(none)", toolName: "list_skills" },
      status: "executed",
    });
    return out || "(none)";
  }

  readSkill(skillPath: string): string { // read the given skills
    const abs = path.isAbsolute(skillPath)
      ? path.normalize(skillPath)
      : path.normalize(path.resolve(this.config.codebasePath, skillPath));
    const allowed = this.skillRoots().some((root) => {
      const r = path.resolve(root);
      return abs === r || abs.startsWith(r + path.sep);
    });
    if (!allowed) throw new Error("read_skill: outside skill roots");
    const text = fs.readFileSync(abs, "utf8");
    this.tracker.log({
      type: "code_analysis",
      path: abs,
      details: { after: text, toolName: "read_skill" },
      status: "executed",
    });
    return text;
  }

  applyApprovedFromTracker(): { errors: string[] } { // all the staged/pending stages finally hit the disk
    const errors: string[] = [];
    const all = [...this.tracker.getActions()];

    // create folder first: folder must exists before files can be written into them
    for (const a of all.filter(
      (x) => x.type === "folder_create" && x.status === "approved",
    )) {
      try {
        fs.mkdirSync(this.resolveSafe(a.path), { recursive: true });
      } catch (e) {
        errors.push(String(e));
      }
    }

    const fileOps = all
      .filter(
        (a) =>
          (a.type === "file_create" ||
            a.type === "file_modify" ||
            a.type === "file_delete") &&
          a.status === "approved",
      )
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      // deduplicate file ops - only apply the last change per path
    const lastByPath = new Map<string, ActionLog>();
    for (const a of fileOps) lastByPath.set(this.norm(a.path), a);

    for (const [p, a] of lastByPath) {
      try {
        if (a.type === "file_delete")
          fs.rmSync(this.resolveSafe(p), { force: true });
        else {
          const target = this.resolveSafe(p);

          // apply files create, modify, delete
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.writeFileSync(target, a.details.after ?? "", "utf8");
        }
      } catch (e) {
        errors.push(String(e));
      }
    }

    for (const a of all.filter(
      (x) => x.type === "tool_execute" && x.status === "approved",
    )) {
      const cmd = a.details.command;
      if (!cmd) continue;

      // run approved shell commands
      const r = spawnSync(cmd, {
        shell: true,
        cwd: this.config.codebasePath,
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
      });
      if (r.status && r.status !== 0)
        errors.push(`shell exit ${r.status}: ${cmd}`);
    }

    return { errors };
  }
}