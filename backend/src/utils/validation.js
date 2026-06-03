import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1).max(100).default(''),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const saveTreeSchema = z.object({
  topic: z.string().min(1).max(500),
  rootPaper: z.any(),
  treeData: z.any(),
  depth: z.number().int().min(1).max(10).default(3),
});

export const updateTreeSchema = z.object({
  topic: z.string().min(1).max(500).optional(),
  treeData: z.any().optional(),
});

export const saveReadingItemSchema = z.object({
  paperId: z.string().min(1),
  title: z.string().default(''),
  authors: z.array(z.string()).default([]),
  year: z.number().int().nullable().default(null),
  venue: z.string().default(''),
  arxivOrDoi: z.string().default(''),
  summary: z.string().default(''),
  savedFrom: z.string().default(''),
});
