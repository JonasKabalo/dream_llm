import { Octokit } from "@octokit/rest";
import { getGithubCreds } from "../../credentials.js";
import type { ChatSessionModelFunctions } from "node-llama-cpp";

function octokit(): Octokit {
  const { token } = getGithubCreds();
  return new Octokit({ auth: token });
}

function owner(): string {
  return getGithubCreds().username;
}

export const githubTools = {
  listMyRepos: {
    description: "List the user's GitHub repos.",
    params: {
      type: "object",
      properties: {
        type: { type: "string", description: "'all', 'public', or 'private'" },
      },
    } as const,
    async handler({ type }: { type?: string }): Promise<string> {
      const kit = octokit();
      const { data } = await kit.repos.listForAuthenticatedUser({
        sort: "updated",
        per_page: 20,
        type: (type ?? "all") as "all" | "public" | "private",
      });
      return data.map((r) => `${r.full_name}  [${r.private ? "private" : "public"}]  ${r.description ?? ""}`).join("\n");
    },
  },

  getRepoInfo: {
    description: "Get a repo's description, default branch, stars and open issues.",
    params: {
      type: "object",
      properties: {
        repo: { type: "string", description: "Repo name or 'owner/repo'" },
      },
      required: ["repo"],
    } as const,
    async handler({ repo }: { repo: string }): Promise<string> {
      const kit = octokit();
      const [repoOwner, repoName] = repo.includes("/") ? repo.split("/") : [owner(), repo];
      const { data } = await kit.repos.get({ owner: repoOwner, repo: repoName });
      return JSON.stringify({
        name: data.full_name,
        description: data.description,
        default_branch: data.default_branch,
        stars: data.stargazers_count,
        open_issues: data.open_issues_count,
        language: data.language,
        url: data.html_url,
      });
    },
  },

  listBranches: {
    description: "List branches for a GitHub repository.",
    params: {
      type: "object",
      properties: {
        repo: { type: "string", description: "Repository name" },
      },
      required: ["repo"],
    } as const,
    async handler({ repo }: { repo: string }): Promise<string> {
      const kit = octokit();
      const [repoOwner, repoName] = repo.includes("/") ? repo.split("/") : [owner(), repo];
      const { data } = await kit.repos.listBranches({ owner: repoOwner, repo: repoName, per_page: 30 });
      return data.map((b) => b.name).join("\n");
    },
  },

  createPullRequest: {
    description: "Create a GitHub pull request.",
    params: {
      type: "object",
      properties: {
        repo: { type: "string", description: "Repo name" },
        title: { type: "string", description: "PR title" },
        body: { type: "string", description: "PR description (markdown)" },
        head: { type: "string", description: "Source branch" },
        base: { type: "string", description: "Target branch e.g. 'main'" },
      },
      required: ["repo", "title", "body", "head", "base"],
    } as const,
    async handler({ repo, title, body, head, base }: {
      repo: string; title: string; body: string; head: string; base: string;
    }): Promise<string> {
      const kit = octokit();
      const [repoOwner, repoName] = repo.includes("/") ? repo.split("/") : [owner(), repo];
      const { data } = await kit.pulls.create({ owner: repoOwner, repo: repoName, title, body, head, base });
      return `Pull request created: ${data.html_url}`;
    },
  },

  listPullRequests: {
    description: "List open pull requests in a repo.",
    params: {
      type: "object",
      properties: {
        repo: { type: "string", description: "Repository name" },
      },
      required: ["repo"],
    } as const,
    async handler({ repo }: { repo: string }): Promise<string> {
      const kit = octokit();
      const [repoOwner, repoName] = repo.includes("/") ? repo.split("/") : [owner(), repo];
      const { data } = await kit.pulls.list({ owner: repoOwner, repo: repoName, state: "open", per_page: 20 });
      if (!data.length) return "No open pull requests.";
      return data.map((pr) => `#${pr.number}  ${pr.title}  (${pr.head.ref} → ${pr.base.ref})  ${pr.html_url}`).join("\n");
    },
  },

  createIssue: {
    description: "Create a GitHub issue.",
    params: {
      type: "object",
      properties: {
        repo: { type: "string", description: "Repo name" },
        title: { type: "string", description: "Issue title" },
        body: { type: "string", description: "Issue description" },
      },
      required: ["repo", "title"],
    } as const,
    async handler({ repo, title, body }: { repo: string; title: string; body?: string }): Promise<string> {
      const kit = octokit();
      const [repoOwner, repoName] = repo.includes("/") ? repo.split("/") : [owner(), repo];
      const { data } = await kit.issues.create({ owner: repoOwner, repo: repoName, title, body });
      return `Issue created: ${data.html_url}`;
    },
  },

  listIssues: {
    description: "List open issues in a repo.",
    params: {
      type: "object",
      properties: {
        repo: { type: "string", description: "Repository name" },
      },
      required: ["repo"],
    } as const,
    async handler({ repo }: { repo: string }): Promise<string> {
      const kit = octokit();
      const [repoOwner, repoName] = repo.includes("/") ? repo.split("/") : [owner(), repo];
      const { data } = await kit.issues.listForRepo({ owner: repoOwner, repo: repoName, state: "open", per_page: 20 });
      if (!data.length) return "No open issues.";
      return data
        .filter((i) => !i.pull_request)
        .map((i) => `#${i.number}  ${i.title}  ${i.html_url}`)
        .join("\n");
    },
  },
} satisfies ChatSessionModelFunctions;
