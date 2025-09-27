import { Router } from "express";
import { PrismaClient } from "../../generated/prisma";
import {
  createSupabaseServerClient,
  createSupabaseAdminClient,
} from "../../services/supabaseClient";

const router = Router();
const prisma = new PrismaClient();

const ensureUniqueUsername = async (desired: string): Promise<string> => {
  const base =
    desired
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-{2,}/g, "-") || `google-user-${Date.now()}`;

  let candidate = base;
  let counter = 1;

  while (true) {
    const existing = await prisma.user.findFirst({
      where: { username: candidate },
    });

    if (!existing) {
      return candidate;
    }

    candidate = `${base}-${counter}`;
    counter += 1;
  }
};

router.post("/login/google", async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) {
    return res
      .status(400)
      .json({ success: false, message: "Token Google ausente." });
  }

  try {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: "google",
      token: idToken,
    });

    if (error || !data.user || !data.session || !data.user.email) {
      console.error("Supabase Google login error:", error);
      return res
        .status(401)
        .json({ success: false, message: "Falha na autenticação Google." });
    }

    const supabaseUser = data.user;
    const email = supabaseUser.email as string;
    const metadata = (supabaseUser.user_metadata ?? {}) as Record<
      string,
      unknown
    >;

    const fullName =
      (metadata.fullName as string) ??
      (metadata.name as string) ??
      email.split("@")[0];
    const avatarUrl =
      (metadata.avatarUrl as string | undefined) ??
      (metadata.avatar_url as string | undefined) ??
      (metadata.picture as string | undefined) ??
      undefined;

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    const username = existingUser
      ? existingUser.username
      : await ensureUniqueUsername(email.split("@")[0]);

    const userRecord = await prisma.user.upsert({
      where: { email },
      update: {
        fullName,
        username,
        avatarUrl,
        emailVerified: Boolean(supabaseUser.email_confirmed_at),
        supabaseId: supabaseUser.id,
      },
      create: {
        fullName,
        username,
        email,
        avatarUrl,
        emailVerified: Boolean(supabaseUser.email_confirmed_at),
        supabaseId: supabaseUser.id,
      },
    });

    return res.json({
      success: true,
      user: {
        name: userRecord.fullName,
        email: userRecord.email,
        username: userRecord.username,
        avatarUrl: userRecord.avatarUrl ?? undefined,
        token: data.session.access_token,
      },
      token: data.session.access_token,
      refreshToken: data.session.refresh_token,
    });
  } catch (err) {
    console.error("Erro inesperado ao autenticar com Google:", err);
    return res
      .status(401)
      .json({ success: false, message: "Falha na autenticação Google." });
  }
});

export default router;
