import request from "request";
import env from "dotenv";

const idop = (sandi) => {
  const urlIDOP = process.env.URL_IDOP || "http://172.19.2.99/idop/upload_api";
  const tokenIDOP = process.env.TOKEN_IDOP;
  const bearer = "Bearer " + tokenIDOP;
  console.log(`[IDOP:TRIGGER] Initiating upload to IDOP for sandi:\n${sandi.substring(0, 120)}...`);
  var options = {
    method: "POST",
    url: urlIDOP,
    headers: {
      Authorization: bearer,
    },
    formData: {
      sandi,
      kirim_cmss: "false",
    },
  };
  request(options, function (error, response) {
    if (error) {
      console.error("[IDOP:ERROR] Failed sending sandi to IDOP:", error.message || error);
      return;
    }
    console.log(`[IDOP:RESPONSE] Status: ${response?.statusCode} | Body: ${response?.body}`);
  });
};

export default idop;
