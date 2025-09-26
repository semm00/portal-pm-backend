"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendVerificationEmail = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const rawJwtSecret = process.env.JWT_SECRET;
if (!rawJwtSecret)
    throw new Error("JWT_SECRET não definido no arquivo .env");
const JWT_SECRET = rawJwtSecret;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "1d";
const transporter = nodemailer_1.default.createTransport({
    service: "gmail",
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS,
    },
});
const FRONTEND_URL = process.env.FRONTEND_URL || "https://portal-pm.vercel.app";
const sendVerificationEmail = async (user) => {
    const token = jsonwebtoken_1.default.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
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
    await transporter.sendMail({
        from: `"Portal PM" <${process.env.GMAIL_USER}>`,
        to: user.email,
        subject: "Verifique seu e-mail - Portal PM",
        html: emailHtml,
    });
};
exports.sendVerificationEmail = sendVerificationEmail;
