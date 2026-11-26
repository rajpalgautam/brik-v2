import { z } from "zod";
const line = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .regex(/^(?![\s\S]*<[a-z!/][^>]*>)[\s\S]+$/i, "Use plain text.");
const task = z.object({ title: line(120), description: line(500) });
export const planSchema = z.object({
  title: line(120),
  summary: line(1200),
  projectType: z.enum(["academic", "coding", "idea"]),
  problem: line(1000),
  solution: line(1000),
  targetAudience: line(250),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  features: z.array(line(180)).min(1).max(12),
  suggestedTech: z.array(line(180)).min(1).max(12),
  milestones: z
    .array(
      z.object({
        title: line(120),
        description: line(500),
        tasks: z.array(task).min(2).max(5),
      }),
    )
    .min(3)
    .max(6),
});
export type Plan = z.infer<typeof planSchema>;
export const ideaInput = z.object({ idea: line(4000).min(10) }).strict();
export function blankPlan(): Plan {
  return {
    title: "",
    summary: "",
    projectType: "idea",
    problem: "",
    solution: "",
    targetAudience: "",
    difficulty: "beginner",
    features: [""],
    suggestedTech: [""],
    milestones: Array.from({ length: 3 }, () => ({
      title: "",
      description: "",
      tasks: Array.from({ length: 2 }, () => ({ title: "", description: "" })),
    })),
  };
}
