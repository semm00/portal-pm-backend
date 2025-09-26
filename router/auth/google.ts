import { Router } from "express";
import { OAuth2Client } from "google-auth-library";
import { PrismaClient } from "../../generated/prisma";
import jwt, { SignOptions, Secret } from "jsonwebtoken";

const router = Router();
const prisma = new PrismaClient();

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const rawJwtSecret = process.env.JWT_SECRET;
if (!rawJwtSecret) throw new Error("JWT_SECRET não definido no arquivo .env");
const JWT_SECRET: Secret = rawJwtSecret;
const JWT_EXPIRES_IN: SignOptions["expiresIn"] =
  (process.env.JWT_EXPIRES_IN as SignOptions["expiresIn"]) ?? "7d";

router.post("/login/google", async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) {
    return res
      .status(400)
      .json({ success: false, message: "Token Google ausente." });
  }

  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.email) {
      return res
        .status(400)
        .json({ success: false, message: "E-mail Google não encontrado." });
    }

    let user = await prisma.user.findUnique({
      where: { email: payload.email },
    });
    if (!user) {
      user = await prisma.user.create({
        data: {
          fullName: payload.name ?? "Google User",
          username: payload.email.split("@")[0],
          email: payload.email,
          avatarUrl: payload.picture,
          passwordHash: "google-oauth",
        },
      });
    }

    const token = jwt.sign(
      { sub: user.id, email: user.email, username: user.username },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    return res.json({ success: true, user, token });
  } catch (err) {
    return res
      .status(401)
      .json({ success: false, message: "Falha na autenticação Google." });
  }
});

export default router;
