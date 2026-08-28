import type { z } from "zod";
import {
  AnswerSchema,
  ApiErrorResponseSchema,
  AskRequestSchema,
  AskSuccessResponseSchema,
  ClarificationSchema,
  CoverageSchema,
  ErrorCodeSchema,
  OutOfScopeSchema,
  OutcomeSchema,
  ReviewStatusSchema,
  SourceCitationSchema,
  SourceTypeSchema,
  ValidityStatusSchema,
  VerificationStatusSchema,
} from "./schemas.js";

/** 由 schema 推导的 TypeScript 类型，单一事实来源。 */
export type AskRequest = z.infer<typeof AskRequestSchema>;
export type Answer = z.infer<typeof AnswerSchema>;
export type Clarification = z.infer<typeof ClarificationSchema>;
export type OutOfScope = z.infer<typeof OutOfScopeSchema>;
export type SourceCitation = z.infer<typeof SourceCitationSchema>;
export type SourceType = z.infer<typeof SourceTypeSchema>;
export type ValidityStatus = z.infer<typeof ValidityStatusSchema>;
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;
export type Coverage = z.infer<typeof CoverageSchema>;
export type Outcome = z.infer<typeof OutcomeSchema>;
export type AskSuccessResponse = z.infer<typeof AskSuccessResponseSchema>;
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

/** TopicId / AnswerOutcome 以 constants 元组为单一来源（见 constants.ts）。 */
export type { AnswerOutcome, TopicId } from "./constants.js";