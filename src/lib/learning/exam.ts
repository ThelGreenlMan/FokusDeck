export type ExamJudgement = "correct" | "partial" | "incorrect" | "unanswered";

export interface ExamAnswer {
  cardId: string;
  judgement: ExamJudgement;
  maxPoints?: number;
}

export interface ExamOptions {
  partialCredit?: number;
  passingPercentage?: number;
}

export interface ExamScore {
  answers: number;
  correct: number;
  partial: number;
  incorrect: number;
  unanswered: number;
  earnedPoints: number;
  maximumPoints: number;
  percentage: number;
  passed: boolean;
  performance: "excellent" | "good" | "developing" | "needs-practice";
}

const JUDGEMENTS: ReadonlySet<ExamJudgement> = new Set([
  "correct",
  "partial",
  "incorrect",
  "unanswered",
]);

function performanceFor(percentage: number): ExamScore["performance"] {
  if (percentage >= 90) return "excellent";
  if (percentage >= 75) return "good";
  if (percentage >= 60) return "developing";
  return "needs-practice";
}

export function scoreExam(
  answers: readonly ExamAnswer[],
  options: ExamOptions = {},
): ExamScore {
  const partialCredit = options.partialCredit ?? 0.5;
  const passingPercentage = options.passingPercentage ?? 60;
  if (!Number.isFinite(partialCredit) || partialCredit < 0 || partialCredit > 1) {
    throw new Error("Die Teilpunktwertung muss zwischen 0 und 1 liegen.");
  }
  if (
    !Number.isFinite(passingPercentage) ||
    passingPercentage < 0 ||
    passingPercentage > 100
  ) {
    throw new Error("Die Bestehensgrenze muss zwischen 0 und 100 liegen.");
  }

  const seenCards = new Set<string>();
  let earnedPoints = 0;
  let maximumPoints = 0;
  let correct = 0;
  let partial = 0;
  let incorrect = 0;
  let unanswered = 0;

  for (const answer of answers) {
    if (!answer.cardId.trim() || seenCards.has(answer.cardId)) {
      throw new Error("Jede Prüfungsantwort braucht eine eindeutige Karten-ID.");
    }
    if (!JUDGEMENTS.has(answer.judgement)) {
      throw new Error("Die Prüfungsbewertung ist ungültig.");
    }
    const maxPoints = answer.maxPoints ?? 1;
    if (!Number.isFinite(maxPoints) || maxPoints <= 0) {
      throw new Error("Die maximale Punktzahl muss größer als 0 sein.");
    }

    seenCards.add(answer.cardId);
    maximumPoints += maxPoints;
    if (answer.judgement === "correct") {
      correct += 1;
      earnedPoints += maxPoints;
    } else if (answer.judgement === "partial") {
      partial += 1;
      earnedPoints += maxPoints * partialCredit;
    } else if (answer.judgement === "incorrect") {
      incorrect += 1;
    } else {
      unanswered += 1;
    }
  }

  earnedPoints = Math.round(earnedPoints * 1_000) / 1_000;
  maximumPoints = Math.round(maximumPoints * 1_000) / 1_000;
  const percentage = maximumPoints
    ? Math.round((earnedPoints / maximumPoints) * 1_000) / 10
    : 0;

  return {
    answers: answers.length,
    correct,
    partial,
    incorrect,
    unanswered,
    earnedPoints,
    maximumPoints,
    percentage,
    passed: answers.length > 0 && percentage >= passingPercentage,
    performance: performanceFor(percentage),
  };
}
