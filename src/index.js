import cron from "node-cron";
import opmet from "./opmet.js";
import send from "./send.js";

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
