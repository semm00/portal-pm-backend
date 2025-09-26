import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt, { SignOptions, Secret } from "jsonwebtoken";

import { PrismaClient, User } from "../generated/prisma";

const prisma = new PrismaClient();
const router = Router();

const rawJwtSecret = process.env.JWT_SECRET;

if (!rawJwtSecret) {
  throw new Error("JWT_SECRET não definido no arquivo .env");
}

const JWT_SECRET: Secret = rawJwtSecret;

const JWT_EXPIRES_IN: SignOptions["expiresIn"] =
  (process.env.JWT_EXPIRES_IN as SignOptions["expiresIn"]) ?? "7d";

type SanitizedUser = Pick<
  User,
  | "id"
  | "fullName"
  | "username"
  | "email"
  | "avatarUrl"
  | "createdAt"
  | "updatedAt"
>;

const toSanitizedUser = (user: User): SanitizedUser => {
  const { passwordHash: _passwordHash, ...rest } = user;
  return rest;
};

const buildToken = (user: User) =>
  jwt.sign(
    {
      sub: user.id,
      email: user.email,
      username: user.username,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

router.post("/register", async (req, res) => {
  const { fullName, username, email, password } = req.body as {
    fullName?: string;
    username?: string;
    email?: string;
    password?: string;
  };

  if (!fullName || !username || !email || !password) {
    return res.status(400).json({
      success: false,
      message: "Campos obrigatórios ausentes.",
    });
  }

  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [{ email }, { username }],
    },
  });

  if (existingUser) {
    return res.status(409).json({
      success: false,
      message: "E-mail ou nome de usuário já cadastrado.",
    });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      fullName,
      username,
      email,
      passwordHash,
    },
  });

  const token = buildToken(user);

  return res.status(201).json({
    success: true,
    user: toSanitizedUser(user),
    token,
  });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body as {
    email?: string;
    password?: string;
  };

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "Informe e-mail e senha.",
    });
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    return res.status(401).json({
      success: false,
      message: "Credenciais inválidas.",
    });
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);

  if (!passwordMatches) {
    return res.status(401).json({
      success: false,
      message: "Credenciais inválidas.",
    });
  }

  const token = buildToken(user);

  return res.json({
    success: true,
    user: toSanitizedUser(user),
    token,
  });
});

export default router;
