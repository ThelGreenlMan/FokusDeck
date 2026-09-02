import type { DateInput } from "./model";
import { toIsoTimestamp } from "./time";

function requireTopic(topic: string) {
  const normalized = topic.trim();
  if (!normalized) throw new Error("Ein Lernthema ist erforderlich.");
  return normalized;
}

function cleanList(values: readonly string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export type FeynmanPhase = "explain" | "find-gaps" | "simplify" | "complete";

export interface FeynmanSession {
  method: "feynman";
  topic: string;
  phase: FeynmanPhase;
  explanation: string;
  gaps: string[];
  simplifiedExplanation: string;
  updatedAt: string;
}

export type FeynmanAction =
  | { type: "set-explanation"; value: string }
  | { type: "set-gaps"; values: readonly string[] }
  | { type: "set-simplified-explanation"; value: string }
  | { type: "next" }
  | { type: "reopen" };

export function createFeynmanSession(topic: string, at: DateInput): FeynmanSession {
  return {
    method: "feynman",
    topic: requireTopic(topic),
    phase: "explain",
    explanation: "",
    gaps: [],
    simplifiedExplanation: "",
    updatedAt: toIsoTimestamp(at),
  };
}

export function canAdvanceFeynman(session: FeynmanSession) {
  if (session.phase === "explain") return Boolean(session.explanation.trim());
  if (session.phase === "find-gaps") return true;
  if (session.phase === "simplify") return Boolean(session.simplifiedExplanation.trim());
  return false;
}

export function reduceFeynmanSession(
  session: FeynmanSession,
  action: FeynmanAction,
  at: DateInput,
): FeynmanSession {
  if (action.type === "next") {
    if (!canAdvanceFeynman(session)) return session;
    const phases: FeynmanPhase[] = ["explain", "find-gaps", "simplify", "complete"];
    return {
      ...session,
      phase: phases[Math.min(phases.indexOf(session.phase) + 1, phases.length - 1)],
      updatedAt: toIsoTimestamp(at),
    };
  }
  if (action.type === "reopen") {
    return { ...session, phase: "explain", updatedAt: toIsoTimestamp(at) };
  }
  if (action.type === "set-explanation") {
    return { ...session, explanation: action.value, updatedAt: toIsoTimestamp(at) };
  }
  if (action.type === "set-gaps") {
    return { ...session, gaps: cleanList(action.values), updatedAt: toIsoTimestamp(at) };
  }
  return {
    ...session,
    simplifiedExplanation: action.value,
    updatedAt: toIsoTimestamp(at),
  };
}

export type FreeRecallPhase = "recall" | "compare" | "complete";

export interface FreeRecallSession {
  method: "free-recall";
  topic: string;
  phase: FreeRecallPhase;
  recallText: string;
  referenceText: string;
  rememberedPoints: string[];
  missingPoints: string[];
  updatedAt: string;
}

export type FreeRecallAction =
  | { type: "set-recall"; value: string }
  | { type: "set-reference"; value: string }
  | { type: "set-comparison"; remembered: readonly string[]; missing: readonly string[] }
  | { type: "next" }
  | { type: "reopen" };

export function createFreeRecallSession(topic: string, at: DateInput): FreeRecallSession {
  return {
    method: "free-recall",
    topic: requireTopic(topic),
    phase: "recall",
    recallText: "",
    referenceText: "",
    rememberedPoints: [],
    missingPoints: [],
    updatedAt: toIsoTimestamp(at),
  };
}

export function canAdvanceFreeRecall(session: FreeRecallSession) {
  if (session.phase === "recall") return Boolean(session.recallText.trim());
  if (session.phase === "compare") return Boolean(session.referenceText.trim());
  return false;
}

export function reduceFreeRecallSession(
  session: FreeRecallSession,
  action: FreeRecallAction,
  at: DateInput,
): FreeRecallSession {
  if (action.type === "next") {
    if (!canAdvanceFreeRecall(session)) return session;
    const phase = session.phase === "recall" ? "compare" : "complete";
    return { ...session, phase, updatedAt: toIsoTimestamp(at) };
  }
  if (action.type === "reopen") {
    return { ...session, phase: "recall", updatedAt: toIsoTimestamp(at) };
  }
  if (action.type === "set-recall") {
    return { ...session, recallText: action.value, updatedAt: toIsoTimestamp(at) };
  }
  if (action.type === "set-reference") {
    return { ...session, referenceText: action.value, updatedAt: toIsoTimestamp(at) };
  }
  return {
    ...session,
    rememberedPoints: cleanList(action.remembered),
    missingPoints: cleanList(action.missing),
    updatedAt: toIsoTimestamp(at),
  };
}

export type Sq3rStage = "survey" | "question" | "read" | "recite" | "review" | "complete";

export interface Sq3rSession {
  method: "sq3r";
  topic: string;
  stage: Sq3rStage;
  surveyNotes: string;
  questions: string[];
  readingNotes: string;
  recitation: string;
  reviewNotes: string;
  updatedAt: string;
}

export type Sq3rAction =
  | { type: "set-survey"; value: string }
  | { type: "set-questions"; values: readonly string[] }
  | { type: "set-reading-notes"; value: string }
  | { type: "set-recitation"; value: string }
  | { type: "set-review-notes"; value: string }
  | { type: "next" }
  | { type: "previous" };

const SQ3R_STAGES: Sq3rStage[] = [
  "survey",
  "question",
  "read",
  "recite",
  "review",
  "complete",
];

export function createSq3rSession(topic: string, at: DateInput): Sq3rSession {
  return {
    method: "sq3r",
    topic: requireTopic(topic),
    stage: "survey",
    surveyNotes: "",
    questions: [],
    readingNotes: "",
    recitation: "",
    reviewNotes: "",
    updatedAt: toIsoTimestamp(at),
  };
}

export function canAdvanceSq3r(session: Sq3rSession) {
  if (session.stage === "survey") return Boolean(session.surveyNotes.trim());
  if (session.stage === "question") return session.questions.length > 0;
  if (session.stage === "read") return Boolean(session.readingNotes.trim());
  if (session.stage === "recite") return Boolean(session.recitation.trim());
  if (session.stage === "review") return Boolean(session.reviewNotes.trim());
  return false;
}

export function reduceSq3rSession(
  session: Sq3rSession,
  action: Sq3rAction,
  at: DateInput,
): Sq3rSession {
  const currentIndex = SQ3R_STAGES.indexOf(session.stage);
  if (action.type === "next") {
    if (!canAdvanceSq3r(session)) return session;
    return {
      ...session,
      stage: SQ3R_STAGES[Math.min(currentIndex + 1, SQ3R_STAGES.length - 1)],
      updatedAt: toIsoTimestamp(at),
    };
  }
  if (action.type === "previous") {
    if (currentIndex === 0) return session;
    return {
      ...session,
      stage: SQ3R_STAGES[currentIndex - 1],
      updatedAt: toIsoTimestamp(at),
    };
  }
  if (action.type === "set-survey") {
    return { ...session, surveyNotes: action.value, updatedAt: toIsoTimestamp(at) };
  }
  if (action.type === "set-questions") {
    return { ...session, questions: cleanList(action.values), updatedAt: toIsoTimestamp(at) };
  }
  if (action.type === "set-reading-notes") {
    return { ...session, readingNotes: action.value, updatedAt: toIsoTimestamp(at) };
  }
  if (action.type === "set-recitation") {
    return { ...session, recitation: action.value, updatedAt: toIsoTimestamp(at) };
  }
  return { ...session, reviewNotes: action.value, updatedAt: toIsoTimestamp(at) };
}
