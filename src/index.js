import cron from "node-cron";
import opmet from "./opmet.js";
import send from "./send.js";
import env from "dotenv";
import express from "express";
import idop from "./idop.js";

env.config();

const nodeEnv = process.env.NODE_ENV;

if (nodeEnv !== "development") {
  cron.schedule("*/10 * * * * *", async () => {
    try {
      const opmetData = await opmet();
      const sendData = await send(opmetData);
      const date = new Date();
      console.log("running a task every 10 seconds " + date);
    } catch (error) {
      console.error("Error handling request:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });
} else {
  const app = express();
  const port = 3000;

  app.get("/", async (req, res) => {
    try {
      const opmetData = await opmet();
      const sendData = await send(opmetData);
      res.send("Hello World!");
    } catch (error) {
      console.error("Error handling request:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`);
  });
}
