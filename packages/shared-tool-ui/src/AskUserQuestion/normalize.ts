import { pickString, toRecord } from '@lobechat/utils/object';
import { safeParseJSON, safeParsePartialJSON } from '@lobechat/utils/safeParseJSON';

import type { AskUserQuestionArgs, AskUserQuestionItem, AskUserQuestionOption } from './types';

const parseJsonString = (value: unknown): unknown => {
  let parsed = value;

  // Weakly schema-compliant models sometimes serialize either the complete
  // args object or one of its nested fields more than once. Keep the repair
  // bounded so ordinary question text can never turn into an unbounded parse
  // loop, while still accepting the forms observed in persisted tool calls.
  for (let depth = 0; depth < 3 && typeof parsed === 'string'; depth += 1) {
    const next = safeParseJSON<unknown>(parsed) ?? safeParsePartialJSON<unknown>(parsed);
    if (next === undefined || next === parsed) break;
    parsed = next;
  }

  return parsed;
};

/**
 * Convention-based recommendation marker (see `AskUserQuestionOption.recommended`).
 * Accepts ASCII/fullwidth parens and the English/Chinese wording models emit.
 * Surrounding whitespace is handled with `trimEnd()` instead of `\s*` in the
 * pattern — the label is model-controlled input, and ambiguous `\s*` around an
 * end anchor makes the scan polynomial (CodeQL js/polynomial-redos).
 */
const RECOMMENDED_SUFFIX = /[(（](?:recommended|推荐)[)）]$/i;

const stripRecommendedSuffix = (rawLabel: string): string => {
  const trimmed = rawLabel.trimEnd();
  const match = RECOMMENDED_SUFFIX.exec(trimmed);

  return match ? trimmed.slice(0, match.index).trimEnd() : rawLabel;
};

const normalizeOption = (value: unknown): AskUserQuestionOption | undefined => {
  const option = toRecord(value);
  const rawLabel = pickString(option?.label);

  if (!rawLabel) return;

  const strippedLabel = stripRecommendedSuffix(rawLabel);
  // Only treat the suffix as a marker when something remains — a label that IS
  // "(Recommended)" stays verbatim rather than collapsing to an empty option.
  const recommended = strippedLabel.length > 0 && strippedLabel !== rawLabel;
  const label = recommended ? strippedLabel : rawLabel;
  const description = pickString(option?.description);
  const id = pickString(option?.id);

  return {
    ...(id ? { id } : {}),
    label,
    ...(description ? { description } : {}),
    ...(recommended ? { recommended } : {}),
  };
};

const isQuestionOption = (
  option: AskUserQuestionOption | undefined,
): option is AskUserQuestionOption => !!option;

const normalizeQuestion = (value: unknown): AskUserQuestionItem | undefined => {
  const item = toRecord(value);
  const question = pickString(item?.question);

  if (!question) return;

  const rawOptions = parseJsonString(item?.options);
  const options = Array.isArray(rawOptions)
    ? rawOptions.map(normalizeOption).filter(isQuestionOption)
    : [];
  const header = pickString(item?.header) ?? '';
  const multiSelect = typeof item?.multiSelect === 'boolean' ? item.multiSelect : undefined;

  return {
    header,
    ...(multiSelect === undefined ? {} : { multiSelect }),
    options,
    question,
  };
};

const isQuestionItem = (
  question: AskUserQuestionItem | undefined,
): question is AskUserQuestionItem => !!question;

/**
 * Tool arguments come from model/runtime payloads, so tolerate stale or weakly
 * shaped messages instead of letting one bad card crash the conversation page.
 */
export const normalizeAskUserQuestions = (
  args: Partial<AskUserQuestionArgs> | unknown,
): AskUserQuestionItem[] => {
  const parsedArgs = parseJsonString(args);
  const rawArgs = toRecord(parsedArgs);
  const parsedQuestions = parseJsonString(rawArgs?.questions ?? parsedArgs);
  const nestedQuestions = toRecord(parsedQuestions)?.questions;
  const rawQuestions = parseJsonString(nestedQuestions ?? parsedQuestions);

  if (Array.isArray(rawQuestions)) {
    return rawQuestions.map(normalizeQuestion).filter(isQuestionItem);
  }

  const question = normalizeQuestion(rawQuestions);

  return question ? [question] : [];
};
