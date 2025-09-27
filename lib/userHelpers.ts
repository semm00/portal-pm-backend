import { PrismaClient } from "../generated/prisma";

export const sanitizeUsername = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

export const ensureUniqueUsername = async (
  prisma: PrismaClient,
  desired: string,
  excludeUserId?: string
): Promise<string> => {
  const base = sanitizeUsername(desired) || `usuario-${Date.now()}`;
  let candidate = base;
  let counter = 1;

  while (true) {
    const existing = await prisma.user.findFirst({
      where: {
        username: candidate,
        ...(excludeUserId
          ? {
              NOT: {
                id: excludeUserId,
              },
            }
          : {}),
      },
    });

    if (!existing) {
      return candidate;
    }

    candidate = `${base}-${counter}`;
    counter += 1;
  }
};
