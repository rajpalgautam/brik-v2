import { z } from "zod";
const https = z
  .string()
  .max(500)
  .regex(/^https:\/\/[a-z0-9.-]+(?::\d+)?(?:[/?#][^\s]*)?$/i)
  .url();
export const snapshotSchema = z.object({
  slug: z
    .string()
    .regex(
      /^[a-z0-9][a-z0-9-]{0,79}$/,
      "Use lowercase letters, digits and hyphens.",
    ),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(4000),
  type: z.enum(["academic", "coding", "idea"]),
  tags: z.array(z.string().trim().min(1).max(32)).max(8),
  demo_url: https.nullable(),
  github_url: https
    .regex(/^https:\/\/github\.com\/[\w-]+\/[\w.-]+\/?$/)
    .nullable(),
  cover_image: z
    .string()
    .max(700000)
    .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/)
    .nullable(),
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export const profileFields = [
  "bio",
  "skills",
  "college",
  "course",
  "study_year",
  "avatar_url",
] as const;
