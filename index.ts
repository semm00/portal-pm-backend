import "dotenv/config";
import express from "express";
import cors from "cors";

import usersRouter from "./router/users";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/users", usersRouter);

const PORT = Number(process.env.PORT ?? 4000);

app.listen(PORT, () => {
  console.log(`🚀 Server ready on http://localhost:${PORT}`);
});
