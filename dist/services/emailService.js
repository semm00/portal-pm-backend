"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendVerificationEmail = void 0;
const node_path_1 = __importDefault(require("node:path"));
const nodemailer_1 = __importDefault(require("nodemailer"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const rawJwtSecret = process.env.JWT_SECRET;
if (!rawJwtSecret)
    throw new Error("JWT_SECRET não definido no arquivo .env");
const JWT_SECRET = rawJwtSecret;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "1d";
const SMTP_HOST = process.env.SMTP_HOST ?? "smtp.sendgrid.net";
const SMTP_PORT = Number(process.env.SMTP_PORT ?? 587);
const SMTP_SECURE = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE === "true"
    : false;
const transporter = nodemailer_1.default.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
        user: process.env.SMTP_USER ?? "apikey", // Para SendGrid, user é 'apikey'
        pass: process.env.SMTP_PASS ?? process.env.GMAIL_PASS, // Usar SMTP_PASS para a chave de API
    },
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 60000,
    tls: {
        rejectUnauthorized: false,
    },
});
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const EMAIL_FROM = process.env.EMAIL_FROM ?? "noreply@portalpm.com"; // E-mail verificado no SendGrid
const LOGO_PATH = node_path_1.default.resolve(__dirname, "../router/public/logo-portal.png");
const sendVerificationEmail = async (user) => {
    const token = jsonwebtoken_1.default.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
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
exports.sendVerificationEmail = sendVerificationEmail;
