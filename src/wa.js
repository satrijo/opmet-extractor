import request from "request";
import env from "dotenv";
import fs from "fs";
env.config();

const tokenWA = process.env.TOKEN_WA;
const urlWA = process.env.URL_WA;
const isGroup = process.env.IS_GROUP;

const sendWA = (result, targetNumber) => {
  // date UTC Greenwich
  const date = new Date();
  const dateIndo = date;
  const jamIndo = dateIndo.getHours();
  const hari = dateIndo.getDay();
  const tanggal = dateIndo.getDate();
  const bulan = dateIndo.getMonth();
  const hariIndo = [
    "Minggu",
    "Senin",
    "Selasa",
    "Rabu",
    "Kamis",
    "Jum'at",
    "Sabtu",
  ];
  const bulanIndo = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember ",
  ];

  const hariIni = hariIndo[hari];
  const tanggalIni = tanggal;
  const bulanIni = bulanIndo[bulan];

  const jamUTC = date.getUTCHours();

  let message = "";
  message += `Laporan Monitoring Space Weather \n${hariIni}, ${tanggalIni} ${bulanIni} ${date.getFullYear()}\n\n`;

  message += `*Berita :* \n${result}\n`;

  message += `\n\n*Note: _Digenerate pada tanggal ${dateIndo}_*\n`;
  var options = {
    method: "POST",
    url: urlWA,
    headers: {
      Authorization: tokenWA,
    },
    formData: {
      phone: targetNumber,
      message: message,
      isGroup: isGroup,
    },
  };
  request(options, function (error, response) {
    if (error) throw new Error(error);
    console.log(response.body);
  });
};

export { sendWA };
