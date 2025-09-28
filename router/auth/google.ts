import { Router } from "express";
import { PrismaClient } from "../../generated/prisma";
import { createSupabaseServerClient } from "../../services/supabaseClient";
import { ensureUniqueUsername } from "../../lib/userHelpers";

const computeTokenExpiry = (session: {
  expires_at?: number | null;
  expires_in?: number | null;
}): number => {
  if (typeof session.expires_at === "number") {
    return session.expires_at * 1000;
  }

  const expiresInSeconds = session.expires_in ?? 3600;
  return Date.now() + expiresInSeconds * 1000;
};

const router = Router();
const prisma = new PrismaClient();

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
      : await ensureUniqueUsername(prisma, email.split("@")[0]);

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

    const tokenExpiresAt = computeTokenExpiry(data.session);

    return res.json({
      success: true,
      user: {
        id: userRecord.id,
        name: userRecord.fullName,
        email: userRecord.email,
        username: userRecord.username,
        avatarUrl: userRecord.avatarUrl ?? undefined,
        token: data.session.access_token,
      },
      token: data.session.access_token,
      refreshToken: data.session.refresh_token,
      tokenExpiresAt,
      expiresIn: data.session.expires_in,
    });
  } catch (err) {
    console.error("Erro inesperado ao autenticar com Google:", err);
    return res
      .status(401)
      .json({ success: false, message: "Falha na autenticação Google." });
  }
});

export default router;
