import { z } from "zod";

export const tripIdSchema = z.string().min(1);
export const candidateIdSchema = z.string().min(1);
export const memberIdSchema = z.string().min(1);
export const bookingIdSchema = z.string().min(1);
export const optionIdSchema = z.string().min(1);
export const approvalIdSchema = z.string().min(1);
export const changeRequestIdSchema = z.string().min(1);
export const versionIdSchema = z.string().min(1);
export const criticalFactProposalIdSchema = z.string().min(1);
export const validationSnapshotIdSchema = z.string().min(1);

export const expectedPlanningCycleSchema = z.number().int().positive();
export const expectedReviewDraftRevisionSchema = z.number().int().positive();
export const expectedItineraryVersionIdSchema = versionIdSchema;

export const reasonCodesSchema = z.array(z.string().min(1));
export const warningCodesSchema = z.array(z.string().min(1));
