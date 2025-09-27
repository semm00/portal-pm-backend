"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const users_1 = __importDefault(require("./router/users"));
const users_recovery_1 = __importDefault(require("./router/users-recovery"));
const users_verification_1 = __importDefault(require("./router/users-verification"));
const google_1 = __importDefault(require("./router/auth/google"));
const profile_1 = __importDefault(require("./router/profile"));
const app = (0, express_1.default)();
const allowedOrigins = process.env.CORS_ORIGIN?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
const corsOptions = {
    origin: allowedOrigins && allowedOrigins.length > 0 ? allowedOrigins : true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
};
app.use((0, cors_1.default)(corsOptions));
app.use(express_1.default.json());
app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
});
app.use("/api/users", users_1.default);
app.use("/api/users", users_recovery_1.default);
app.use("/api/users", users_verification_1.default);
app.use("/api/users", google_1.default);
app.use("/api/profile", profile_1.default);
const PORT = Number(process.env.PORT ?? 4000);
app.listen(PORT, () => {
    console.log(`🚀 Server ready on http://localhost:${PORT}`);
});
