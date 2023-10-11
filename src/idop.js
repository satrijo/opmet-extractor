import request from "request";
import env from "dotenv";

const idop = (sandi) => {
  const urlIDOP = "http://172.19.2.99/idop/upload_api";
  const tokenIDOP = process.env.TOKEN_IDOP;
  const bearer = "Bearer " + tokenIDOP;
  var options = {
    method: "POST",
    url: urlIDOP,
    headers: {
      Authorization: bearer,
    },
    formData: {
      sandi,
    },
  };
  request(options, function (error, response) {
    if (error) throw new Error(error);
    console.log(response.body);
  });
};

export default idop;
