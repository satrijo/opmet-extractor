import request from "request";
import env from "dotenv";
import fs from "fs";
env.config();

const tokenWA = process.env.TOKEN_WA;
const urlWA = process.env.URL_WA;
const isGroup = process.env.IS_GROUP;

const sendWA = (result, targetNumber) => {
  const date = new Date();
  const dateIndo = date;
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
    "Desember",
  ];

  const hariIni = hariIndo[hari];
  const tanggalIni = tanggal;
  const bulanIni = bulanIndo[bulan];

  let message = "";
  message += `Laporan Monitoring Space Weather \n${hariIni}, ${tanggalIni} ${bulanIni} ${date.getFullYear()}\n\n`;
  message += `*Berita :* \n${result}\n`;
  message += `\n\n*Note: _Digenerate pada tanggal ${dateIndo}_*\n`;

  console.log(`[WA:TRIGGER] Sending WhatsApp notification to ${targetNumber}...`);
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
    if (error) {
      console.error(`[WA:ERROR] Failed sending WA to ${targetNumber}:`, error.message || error);
      return;
    }
    console.log(`[WA:RESPONSE] Status: ${response?.statusCode} | Body: ${response?.body}`);
  });
};

export { sendWA };
