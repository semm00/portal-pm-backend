import "dotenv/config";
import express from "express";
import cors, { CorsOptions } from "cors";

import usersRouter from "./router/users";
import usersRecoveryRouter from "./router/users-recovery";
import usersVerificationRouter from "./router/users-verification";
import googleAuthRouter from "./router/auth/google";
import profileRouter from "./router/profile";
import newsRouter from "./router/news";

const app = express();

const allowedOrigins = process.env.CORS_ORIGIN?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions: CorsOptions = {
  origin: allowedOrigins && allowedOrigins.length > 0 ? allowedOrigins : true,
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.use(express.json());
app.use("/admin", express.static("admin"));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/users", usersRouter);
app.use("/api/users", usersRecoveryRouter);
app.use("/api/users", usersVerificationRouter);
app.use("/api/users", googleAuthRouter);
app.use("/api/profile", profileRouter);
app.use("/api/news", newsRouter);

const PORT = Number(process.env.PORT ?? 4000);

app.listen(PORT, () => {
  console.log(`🚀 Server ready on http://localhost:${PORT}`);
});
