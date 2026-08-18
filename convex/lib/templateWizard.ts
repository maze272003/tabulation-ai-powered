import type { Doc } from "../_generated/dataModel";

export type TemplateDraftConfig = Doc<"eventTemplates">["configSnapshot"];
export type TemplateDraft = { name: string; description: string; configSnapshot: TemplateDraftConfig };
export type LlmCaller = (prompt: string) => Promise<unknown>;

export const WIZARD_SYSTEM_INSTRUCTION = [
  "You design templates for judged live events (pageants, singing contests, quiz bees).",
  "Given a plain-language event description, return a template as JSON with this exact shape:",
  '{"name": string, "description": string, "configSnapshot": {"decimalPrecision": 0-4, "resultVisibility": "private"|"organization"|"public",',
  '"categories": optional [{"name": string}], "rounds": [{"name": string, "qualifiesToNextRound": boolean,',
  '"weight": optional number, "advancement": optional {"mode": "none"|"top_count"|"top_percent"|"manual", "count"?: number, "percent"?: number, "allowOverride": boolean},',
  '"criteria": [{"name": string, "weight": 1-100, "minScore": number, "maxScore": number, "decimalPrecision": 0-4}] }] }}',
  "Rules: 1-6 rounds; 1-8 criteria per round; criterion weights within a round should sum to about 100;",
  "use realistic judging scales (e.g. 0-10 or 0-100); only set advancement on rounds that cut contestants.",
].join("\n");

const MAX_NAME = 80;
const MAX_DESCRIPTION = 300;
const MAX_ROUNDS = 6;
const MAX_CRITERIA = 8;
const MAX_PROMPT_LENGTH = 2000;

type Validation = { draft: TemplateDraft } | { error: string };

function fail(error: string): Validation {
  return { error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function validateTemplateDraft(raw: unknown): Validation {
  if (!isRecord(raw)) return fail("Response is not a JSON object");
  const name = str(raw.name)?.trim();
  if (!name) return fail("name is missing");
  if (name.length > MAX_NAME) return fail(`name exceeds ${MAX_NAME} characters`);
  const description = str(raw.description)?.trim() ?? "";
  if (description.length > MAX_DESCRIPTION) return fail(`description exceeds ${MAX_DESCRIPTION} characters`);

  const snapshot = raw.configSnapshot;
  if (!isRecord(snapshot)) return fail("configSnapshot is missing");
  const decimalPrecision = num(snapshot.decimalPrecision);
  if (decimalPrecision === null || !Number.isInteger(decimalPrecision) || decimalPrecision < 0 || decimalPrecision > 4) {
    return fail("decimalPrecision must be an integer 0-4");
  }
  const resultVisibility = str(snapshot.resultVisibility);
  if (resultVisibility !== "private" && resultVisibility !== "organization" && resultVisibility !== "public") {
    return fail("resultVisibility must be private, organization, or public");
  }

  let categories: TemplateDraftConfig["categories"];
  if (snapshot.categories !== undefined) {
    if (!Array.isArray(snapshot.categories) || snapshot.categories.length === 0) return fail("categories must be a non-empty array");
    const names: { name: string; order: number }[] = [];
    for (const [i, category] of snapshot.categories.entries()) {
      if (!isRecord(category)) return fail("categories entries must be objects");
      const categoryName = str(category.name)?.trim();
      if (!categoryName) return fail("category name is missing");
      names.push({ name: categoryName, order: i });
    }
    categories = names;
  }

  if (!Array.isArray(snapshot.rounds) || snapshot.rounds.length === 0) return fail("rounds must be a non-empty array");
  if (snapshot.rounds.length > MAX_ROUNDS) return fail(`at most ${MAX_ROUNDS} rounds are allowed`);

  const rounds: TemplateDraftConfig["rounds"] = [];
  for (const [i, rawRound] of snapshot.rounds.entries()) {
    if (!isRecord(rawRound)) return fail(`round ${i + 1} is not an object`);
    const roundName = str(rawRound.name)?.trim();
    if (!roundName) return fail(`round ${i + 1} has no name`);
    const qualifiesToNextRound = rawRound.qualifiesToNextRound === true;

    let scoringRules: TemplateDraftConfig["rounds"][number]["scoringRules"];
    if (rawRound.scoringRules !== undefined) {
      if (!isRecord(rawRound.scoringRules)) return fail(`round ${i + 1} scoringRules must be an object`);
      const winner = rawRound.scoringRules.winner;
      if (winner !== "highest" && winner !== "lowest") return fail(`round ${i + 1} scoringRules.winner must be highest or lowest`);
      scoringRules = { winner };
    }

    let weight: number | undefined;
    if (rawRound.weight !== undefined) {
      const parsed = num(rawRound.weight);
      if (parsed === null || parsed < 1 || parsed > 100) return fail(`round ${i + 1} weight must be 1-100`);
      weight = parsed;
    }

    let advancement: TemplateDraftConfig["rounds"][number]["advancement"];
    if (rawRound.advancement !== undefined) {
      if (!isRecord(rawRound.advancement)) return fail(`round ${i + 1} advancement must be an object`);
      const mode = rawRound.advancement.mode;
      if (mode !== "none" && mode !== "top_count" && mode !== "top_percent" && mode !== "manual") {
        return fail(`round ${i + 1} advancement.mode is invalid`);
      }
      let count: number | undefined;
      if (rawRound.advancement.count !== undefined) {
        const parsed = num(rawRound.advancement.count);
        if (parsed === null || !Number.isInteger(parsed) || parsed < 1) {
          return fail(`round ${i + 1} advancement.count must be a positive integer`);
        }
        count = parsed;
      }
      let percent: number | undefined;
      if (rawRound.advancement.percent !== undefined) {
        const parsed = num(rawRound.advancement.percent);
        if (parsed === null || parsed < 1 || parsed > 100) return fail(`round ${i + 1} advancement.percent must be 1-100`);
        percent = parsed;
      }
      advancement = {
        mode,
        count,
        percent,
        allowOverride: rawRound.advancement.allowOverride === true,
      };
    }

    if (!Array.isArray(rawRound.criteria) || rawRound.criteria.length === 0) {
      return fail(`round ${i + 1} needs at least one criterion`);
    }
    if (rawRound.criteria.length > MAX_CRITERIA) return fail(`round ${i + 1} exceeds ${MAX_CRITERIA} criteria`);
    const criteria: TemplateDraftConfig["rounds"][number]["criteria"] = [];
    for (const [j, rawCriterion] of rawRound.criteria.entries()) {
      if (!isRecord(rawCriterion)) return fail(`round ${i + 1} criterion ${j + 1} is not an object`);
      const criterionName = str(rawCriterion.name)?.trim();
      if (!criterionName) return fail(`round ${i + 1} criterion ${j + 1} has no name`);
      const criterionWeight = num(rawCriterion.weight);
      if (criterionWeight === null || criterionWeight < 1 || criterionWeight > 100) {
        return fail(`round ${i + 1} criterion ${j + 1} weight must be 1-100`);
      }
      const minScore = num(rawCriterion.minScore);
      const maxScore = num(rawCriterion.maxScore);
      if (minScore === null || maxScore === null || minScore < 0 || maxScore > 1000 || minScore > maxScore) {
        return fail(`round ${i + 1} criterion ${j + 1} has an invalid score range`);
      }
      const criterionPrecision = num(rawCriterion.decimalPrecision);
      if (criterionPrecision === null || !Number.isInteger(criterionPrecision) || criterionPrecision < 0 || criterionPrecision > 4) {
        return fail(`round ${i + 1} criterion ${j + 1} decimalPrecision must be 0-4`);
      }
      criteria.push({
        name: criterionName, order: j, weight: criterionWeight,
        minScore, maxScore, decimalPrecision: criterionPrecision,
      });
    }

    rounds.push({ name: roundName, order: i, qualifiesToNextRound, scoringRules, weight, advancement, criteria });
  }

  const configSnapshot: TemplateDraftConfig = {
    decimalPrecision,
    resultVisibility,
    ...(categories === undefined ? {} : { categories }),
    rounds,
  };
  return { draft: { name, description, configSnapshot } };
}

export async function buildTemplateDraft(prompt: string, callLlm: LlmCaller): Promise<TemplateDraft | null> {
  if (!prompt.trim() || prompt.length > MAX_PROMPT_LENGTH) return null;
  const first = validateTemplateDraft(await callLlm(prompt));
  if ("draft" in first) return first.draft;
  const second = validateTemplateDraft(
    await callLlm(`${prompt}\n\nYour previous response was invalid: ${first.error}. Fix it and return valid JSON only.`),
  );
  return "draft" in second ? second.draft : null;
}
