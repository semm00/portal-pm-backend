import path from "node:path";
import nodemailer from "nodemailer";
import jwt, { SignOptions, Secret } from "jsonwebtoken";
import { User } from "../generated/prisma";

const rawJwtSecret = process.env.JWT_SECRET;
if (!rawJwtSecret) throw new Error("JWT_SECRET não definido no arquivo .env");
const JWT_SECRET: Secret = rawJwtSecret;
const JWT_EXPIRES_IN: SignOptions["expiresIn"] =
  (process.env.JWT_EXPIRES_IN as SignOptions["expiresIn"]) ?? "1d";

const SMTP_HOST = process.env.SMTP_HOST ?? "smtp.sendgrid.net";
const SMTP_PORT = Number(process.env.SMTP_PORT ?? 587);
const SMTP_SECURE = process.env.SMTP_SECURE
  ? process.env.SMTP_SECURE === "true"
  : false;

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  auth: {
    user: process.env.SMTP_USER ?? "apikey", // Para SendGrid, user é 'apikey'
    pass: process.env.SMTP_PASS ?? process.env.GMAIL_PASS, // Usar SMTP_PASS para a chave de API
  },
  connectionTimeout: 30_000,
  greetingTimeout: 30_000,
  socketTimeout: 60_000,
  tls: {
    rejectUnauthorized: false,
  },
});

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const EMAIL_FROM = process.env.EMAIL_FROM ?? "noreply@portalpm.com"; // E-mail verificado no SendGrid
const LOGO_PATH = path.resolve(__dirname, "../router/public/logo-portal.png");

export const sendVerificationEmail = async (user: User): Promise<void> => {
  const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
  const verifyUrl = `${FRONTEND_URL}/profile/verification?token=${token}`;

  const emailHtml = `
    <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px;">
      <img src="cid:logo-portal" alt="Portal PM Logo" style="display: block; margin: 0 auto 20px; max-width: 150px;" />
      <h2 style="color: #0b203a; text-align: center;">Confirme seu endereço de e-mail</h2>
      <p>Olá, ${user.fullName},</p>
      <p>Obrigado por se cadastrar no Portal PM! Para ativar sua conta, por favor, confirme seu endereço de e-mail clicando no botão abaixo.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${verifyUrl}" style="background-color: #fca311; color: #fff; padding: 15px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">Verificar E-mail</a>
      </div>
      <p>Se você não se cadastrou em nosso site, por favor, ignore este e-mail.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
      <p style="font-size: 12px; color: #999; text-align: center;">&copy; ${new Date().getFullYear()} Portal PM. Todos os direitos reservados.</p>
    </div>
  `;

  await transporter.sendMail({
    from: `"Portal PM" <${EMAIL_FROM}>`,
    to: user.email,
    subject: "Verificação de E-mail - Portal PM",
    html: emailHtml,
    attachments: [
      {
        filename: "logo-portal.png",
        path: LOGO_PATH,
        cid: "logo-portal",
      },
    ],
  });
};
