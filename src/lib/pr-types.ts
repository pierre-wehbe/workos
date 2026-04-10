export interface PRDetail {
  owner: string;
  repo: string;
  repoName: string;
  number: number;
  title: string;
  author: string;
  state: string;
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
  headSha: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  files: PRFile[];
  reviewThreads: PRReviewThread[];
  reviews: PRReview[];
  ciStatus: string | null;
  labels: string[];
  reviewDecision: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;
}

export interface PRFile {
  path: string;
  additions: number;
  deletions: number;
}

export interface PRReviewThread {
  id: string;
  path: string | null;
  line: number | null;
  isResolved: boolean;
  comments: PRComment[];
}

export interface PRComment {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}

export interface PRReview {
  id: string;
  author: string;
  state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "PENDING" | "DISMISSED";
  body: string;
  createdAt: string;
}

export interface AnalysisEntry {
  headSha: string;
  timestamp: string;
  summary: string;
  rubricResult: RubricResult | null;
  cli: string;
}

export interface PRCacheEntry {
  prId: string;
  prData: PRDetail | null;
  analyses: AnalysisEntry[];
  commentThreads: PRReviewThread[] | null;
  lastFetchedAt: string | null;
  lastAnalyzedAt: string | null;
  prState: string;
  headSha: string | null;
}

export interface RubricCategory {
  id: string;
  name: string;
  weight: number;
  description: string;
  sortOrder: number;
}

export interface RubricThresholds {
  autoApproveScore: number;
  autoApproveMaxFiles: number;
  autoApproveMaxLines: number;
  autoSummarizeMaxFiles: number;
  autoSummarizeMaxLines: number;
}

export interface RubricResult {
  overallScore: number;
  categories: RubricCategoryScore[];
}

export interface RubricCategoryScore {
  name: string;
  score: number;
  maxScore: number;
  explanation: string;
}

export type AgentTaskType = "summarize" | "rubric" | "draft_review" | "implement_fix" | "address_comments" | "summarize_feedback" | "draft_reply";
export type AgentTaskStatus = "running" | "completed" | "failed" | "cancelled";

export interface AgentTask {
  id: string;
  prId: string;
  taskType: AgentTaskType;
  status: AgentTaskStatus;
  cli: string;
  result: string | null;
  tokenEstimate: number;
  logFile: string | null;
  startedAt: string;
  completedAt: string | null;
}
