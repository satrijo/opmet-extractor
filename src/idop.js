import request from "request";

const idop = (sandi) => {
  const urlIDOP = "https://aviation.bmkg.go.id/idop/upload_api";
  const tokenIDOP =
    "e9625aec5fd79095a8a9114d67e8dcb0a4c47c264a76bc8b4bc7e1aadbbb1980";
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
