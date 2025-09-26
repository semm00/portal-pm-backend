import nodemailer from "nodemailer";
import jwt, { SignOptions, Secret } from "jsonwebtoken";
import { User } from "../generated/prisma";

const rawJwtSecret = process.env.JWT_SECRET;
if (!rawJwtSecret) throw new Error("JWT_SECRET não definido no arquivo .env");
const JWT_SECRET: Secret = rawJwtSecret;
const JWT_EXPIRES_IN: SignOptions["expiresIn"] =
  (process.env.JWT_EXPIRES_IN as SignOptions["expiresIn"]) ?? "1d";

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true, // true for 465, false for other ports
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
  logger: true,
  debug: true,
});

const FRONTEND_URL = process.env.FRONTEND_URL || "https://portal-pm.vercel.app";

export const sendVerificationEmail = async (user: User): Promise<void> => {
  const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
  const verifyUrl = `${FRONTEND_URL}/profile/verification?token=${token}`;
  const logoUrl = "https://portal-pm.vercel.app/images/logo-portal.png";

  const emailHtml = `
    <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:24px;background:#f9f9f9;border-radius:8px;">
      <div style="text-align:center;">
        <img src='${logoUrl}' alt="Portal PM" style="max-width:150px;margin-bottom:24px;" />
      </div>
      <h2 style="color:#0b203a;text-align:center;">Bem-vindo ao Portal PM!</h2>
      <p style="font-size:1.1em;color:#333;text-align:center;">
        Olá, ${user.fullName}! Para ativar sua conta, clique no botão abaixo para verificar seu e-mail:
      </p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${verifyUrl}" style="background:#fca311;color:#fff;text-decoration:none;padding:14px 32px;border-radius:6px;font-size:1.1em;display:inline-block;">
          Verificar E-mail
        </a>
      </div>
      <p style="color:#555;text-align:center;">
        Se não conseguir clicar, copie e cole este link no navegador:<br>
        <a href="${verifyUrl}" style="color:#0b203a;">${verifyUrl}</a>
      </p>
      <hr style="margin:32px 0;">
      <p style="font-size:0.95em;color:#888;text-align:center;">
        Se você não criou uma conta, ignore este e-mail.<br>
        &copy; Portal PM
      </p>
    </div>
  `;

  const mailOptions = {
    from: `"Portal PM" <${process.env.GMAIL_USER}>`,
    to: user.email,
    subject: "Verifique seu e-mail - Portal PM",
    html: emailHtml,
  };

  try {
    console.log(`[LOG] Preparando para enviar e-mail para: ${user.email}`);
    console.log(
      "[LOG] Opções de e-mail:",
      JSON.stringify(mailOptions, null, 2)
    );
    const info = await transporter.sendMail(mailOptions);
    console.log(`[LOG] E-mail enviado. Resposta do servidor: ${info.response}`);
  } catch (error) {
    console.error("[ERRO] Falha ao enviar e-mail via emailService:", error);
    throw error; // Re-lança o erro para ser tratado pelo chamador
  }
};
