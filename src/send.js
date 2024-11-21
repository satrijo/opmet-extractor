import mysql from "mysql2";
import env from "dotenv";
import idop from "./idop.js";
import { sendWA } from "./wa.js";
import moment from "moment";

env.config();

const send = (opmetData) => {
  const data = opmetData;
  data.forEach((e) => {
    sendDB(e);
  });
};

const sendDB = (data) => {
  data.forEach((group) => {
    const length = group.length;
    if (length < 1) {
      return group;
    }
    const header = group[0].split(" ");
    const identifier = header[0];

    if (identifier.startsWith("SA") || identifier.startsWith("SP")) {
      try {
        const metar = decodeOnebyOne(group, "METAR");
      } catch (error) {
        console.log(error);
        // skip
      }
    }

    if (identifier.startsWith("SNID") || identifier.startsWith("SMID") || identifier.startsWith("SIID")) {
      try {
        const taf = decodeOnebyOne(group, "SYNOP");
      } catch (error) {
        console.log(error);
        // skip
      }
    }

    if (identifier.startsWith("FT") || identifier.startsWith("FC")) {
      try {
        const taf = decodeOnebyOne(group, "TAF");
      } catch (error) {
        console.log(error);
        // skip
      }
    }

    if (identifier.startsWith("W")) {
      try {
        const sigmet = decodeOnebyOne(group, "SIGMET");
      } catch (error) {
        console.log(error);
      }
    }

    // start with FN

    if (identifier.startsWith("FN")) {
      try {
        const fn = decodeOnebyOne(group, "FN");
      } catch (error) {
        console.log(error);
      }
    }
  });
};

const sendWhatsapp = async (fn, targetNumber) => {
  await sendWA(fn, targetNumber);
};

const decodeOnebyOne = (group, typeBerita) => {
  const sliceGroup = [[group[0]], group.slice(1)];
  const header = sliceGroup[0][0].split(" ");

  const headerSandi = sliceGroup[0][0];

  const identifier = header[0];

  const regionalCode = header[1];

  const type = identifier.substring(0, 2);
  const regional = identifier.substring(2, 4);
  const bulletin = identifier.substring(4, 6);

  const center = header[1];
  const datetime = header[2];
  const date = datetime.substring(0, 2);

  let dateNow = new Date();
  dateNow = new Date(dateNow.getTime() - 7 * 3600000);

  let month = dateNow.getMonth() + 1;
  if (month < 10) {
    month = "0" + month;
  }
  let dateCurrent = dateNow.getDate();
  if (dateCurrent < 10) {
    dateCurrent = "0" + dateCurrent;
  }

  let hour = dateNow.getHours();
  if (hour < 10) {
    hour = "0" + hour;
  }

  let minute = dateNow.getMinutes();
  if (minute < 10) {
    minute = "0" + minute;
  }
  let year = dateNow.getFullYear();

  const filling = `${year}-${month}-${date} ${datetime.substring(
    2,
    4
  )}:${datetime.substring(4, 6)}`;

  const datacode_date = `${year}-${month}-${date}`;

  const insert = `${year}-${month}-${dateCurrent} ${hour}:${minute}`;
  let extra = header[3] ?? "";

  if (typeBerita == "METAR") {
    sliceGroup[1].map(async (line) => {
      const lineSplit = line.split(" ");
      // console.log("METAR ISI :" + lineSplit);
      if (lineSplit[0] == "METAR" || lineSplit[0] == "SPECI") {
        if (line.includes("NIL")) {
          return;
        }

        let icao = "";
        if (lineSplit[1].length == 4) {
          icao = lineSplit[1];
        } else {
          icao = lineSplit[2];
        }

        const wiorwa = icao.substring(0, 2);
        // console.log("wiorwa :" + wiorwa);

        const dataText = line;
        let dataCode = datacode_date + dataText;
        dataCode = dataCode
          .replace(/-/g, "")
          .replace(/:/g, "")
          .replace(/\s/g, "")
          // replace = with nothing
          .replace(/=/g, "");

        dataCode = dataCode.substring(0, 254);
        dataCode = dataCode.split("Z");
        dataCode = dataCode[0] + "Z" + extra;
        pool.query(
          `INSERT INTO metar_speci (data_code, type_code, regional_code, bulletin_code, centre_code,filling_time,extra_code,icao_code,observed_time,data_text,insert_time) VALUES ('${dataCode}', '${type}', '${regional}', '${bulletin}', '${center}', '${filling}', '${extra}', '${icao}', '${filling}', '${dataText}', '${insert}')`,
          (err, result) => {
            console.log(result);
          }
        );

        try {
          let headerSandiString = headerSandi;
          if (regionalCode !== icao || regionalCode == "WIIX") {
            let headerSandiArray = headerSandi.split(" ");
            console.log(`Rubah icao ${headerSandiArray[1]} ke ${icao}`);
            headerSandiArray[1] = icao;

            if (regionalCode == "WIIX" && headerSandiArray.length == 4) {
              // delete index 3
              console.log(`Hapus ${headerSandiArray[3]} = ${headerSandi}`);
              headerSandiArray[3] = "";
              console.log(`Menjadi ${headerSandiArray.join(" ")}`);
            }

            headerSandiString = headerSandiArray.join(" ");
            headerSandiString = headerSandiString.trim();
          }
          // cek kalo variable line mengandung = maka boleh send idop
          if (line.includes("=")) {
            const idopSend = idop(headerSandiString + "\n" + line);
            // if (icao == "WAHL") {
            //   sendWhatsapp(`${headerSandiString}\n${line}`, "6282111119138");
            // }
          }
        } catch (error) {
          console.log(error);
        }

        if (wiorwa == "WI" || wiorwa == "WA") {
        }
      }
    });
  } else if (typeBerita == "TAF") {
    sliceGroup[1].map((line) => {
      line = line.toString();
      const lineSplit = line.split(" ");
      // console.log("TAF ISI :" + lineSplit);

      if (lineSplit.length < 2) return;
      if (lineSplit.length < 3) return;
      if (lineSplit.length < 4) return;
      if (lineSplit[0] == "TAF") {
        if (line.includes("NIL")) {
          console.log("NIL");
          console.log(line);
          return;
        }

        let icao = "";
        if (lineSplit[1].length == 4) {
          icao = lineSplit[1];
        } else {
          icao = lineSplit[2];
        }

        const wiorwa = icao.substring(0, 2);
        // console.log("wiorwa :" + wiorwa);
        // console.log("TAF ISI :" + lineSplit);

        // if (regionalCode !== icao) {
        //   return;
        // }

        const dataText = line;
        let dataCode = datacode_date + dataText;
        dataCode = dataCode
          .replace(/-/g, "")
          .replace(/:/g, "")
          .replace(/\s/g, "")
          // replace = with nothing
          .replace(/=/g, "");
        dataCode = dataCode.substring(0, 254);
        dataCode = dataCode.split("Z");
        dataCode = dataCode[0] + "Z" + extra;
        let issuedTime = "";
        if (lineSplit[2].length == 7) {
          issuedTime = lineSplit[2];
        } else {
          issuedTime = lineSplit[3];
        }
        if (issuedTime && issuedTime.length == 7) {
          let dateIssued = issuedTime.substring(0, 2);
          let hourIssued = issuedTime.substring(2, 4);
          let minuteIssued = issuedTime.substring(4, 6);
          let compiledIssuedTime = `${year}-${month}-${dateIssued} ${hourIssued}:${minuteIssued}`;
          let compiledValidFrom;
          let compiledValidUntil;
          let validity = "";
          if (lineSplit[3].length == 9) {
            validity = lineSplit[3];
          } else {
            validity = lineSplit[4];
          }
          if (validity && validity.length == 9) {
            let dateValidFrom = validity.substring(0, 2);
            let hourValidFrom = validity.substring(2, 4);
            compiledValidFrom = `${year}-${month}-${dateValidFrom} ${hourValidFrom}:00`;
            let dateValidUntil = validity.substring(5, 7);
            let hourValidUntil = validity.substring(7, 9);

            // check if hour 24 then change to 00
            if (hourValidUntil == "24") {
              hourValidUntil = "00";

              // plus 1 day to dateValidUntil but check first this month is 30 or 31 or is february (28 or 29)

              if (
                month == 1 ||
                month == 3 ||
                month == 5 ||
                month == 7 ||
                month == 8 ||
                month == 10
              ) {
                if (dateValidUntil == "31") {
                  dateValidUntil = "01";
                } else {
                  dateValidUntil = parseInt(dateValidUntil);
                  dateValidUntil = dateValidUntil + 1;
                  dateValidUntil = dateValidUntil.toString();
                  if (dateValidUntil < 10) {
                    dateValidUntil = "0" + dateValidUntil;
                  }
                }
              } else if (month == 12) {
                if (dateValidUntil == "31") {
                  dateValidUntil = "01";
                } else {
                  dateValidUntil = parseInt(dateValidUntil);
                  dateValidUntil = dateValidUntil + 1;
                  dateValidUntil = dateValidUntil.toString();
                  if (dateValidUntil < 10) {
                    dateValidUntil = "0" + dateValidUntil;
                  }
                }
              } else if (month == 2) {
                const isLeapYear =
                  (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
                if (isLeapYear) {
                  if (dateValidUntil == "29") {
                    dateValidUntil = "01";
                  } else {
                    dateValidUntil = parseInt(dateValidUntil);
                    dateValidUntil = dateValidUntil + 1;
                    dateValidUntil = dateValidUntil.toString();
                    if (dateValidUntil < 10) {
                      dateValidUntil = "0" + dateValidUntil;
                    }
                  }
                } else {
                  if (dateValidUntil == "28") {
                    dateValidUntil = "01";
                  } else {
                    dateValidUntil = parseInt(dateValidUntil);
                    dateValidUntil = dateValidUntil + 1;
                    dateValidUntil = dateValidUntil.toString();
                    if (dateValidUntil < 10) {
                      dateValidUntil = "0" + dateValidUntil;
                    }
                  }
                }
              }
            }

            if (dateValidFrom > dateValidUntil) {
              if (month == 12) {
                month = "01";
                year = parseInt(year);
                year = year + 1;
                year = year.toString();
              } else {
                month = parseInt(month) + 1;
                month = month.toString();
                if (month < 10) {
                  month = "0" + month;
                }
              }
            }
            compiledValidUntil = `${year}-${month}-${dateValidUntil} ${hourValidUntil}:00`;
          } else {
            compiledValidFrom = null;
            compiledValidUntil = null;
          }
          // console.log("valid_from :" + compiledValidFrom);
          // console.log("valid_until :" + compiledValidUntil);
          pool.query(
            `INSERT INTO taf (
          data_code,
          type_code,
          regional_code,
          bulletin_code,
          centre_code,
          filling_time,
          extra_code,
          icao_code,
          issued_time,
          valid_from,
          valid_until,
          data_text,
          insert_time) VALUES
          ('${dataCode}',
          '${type}',
          '${regional}',
          '${bulletin}',
          '${center}',
          '${filling}',
          '${extra}',
          '${icao}',
          '${compiledIssuedTime}',
          '${compiledValidFrom}',
          '${compiledValidUntil}',
          '${dataText}',
          '${insert}')`,
            (err, result) => {
              console.log(result);
              if (err) {
                console.log(err);
              }
            }
          );

          try {
            if (regionalCode === "WIIX") {
              return;
            }
            if (wiorwa == "WI" || wiorwa == "WA") {
              const idopSend = idop(headerSandi + "\n" + line);
            }
          } catch (error) {
            console.log(error);
          }

          // if (wiorwa == "WI" || wiorwa == "WA") {
          //   try {
          //     if (regionalCode === "WIIX") {
          //       return;
          //     }
          //     const idopSend = idop(headerSandi + "\n" + line);
          //   } catch (error) {
          //     console.log(error);
          //   }
          // }
        }
      }
    });
  } else if (typeBerita == "SIGMET") {

    const lineHeader = group[0];
    const line = [...group].slice(1).join(" ");
    const lineSplit = line.split(" ");
    if (lineSplit[1] == "SIGMET") {
      if (line.includes("NIL")) {
        return;
      }

      const wiorwa = lineSplit[1].substring(0, 2);
      // console.log("wiorwa :" + wiorwa);

      let icao = center;
      let ats_code = lineSplit[0];
      let sequence_code = lineSplit[2];

      const numbersInWord = sequence_code.match(/\d+/);

      if (numbersInWord) {
        sequence_code = numbersInWord[0];
      }

      const dataText = line;
      let dataCode = datacode_date + dataText;
      dataCode = dataCode
        .replace(/-/g, "")
        .replace(/:/g, "")
        .replace(/\s/g, "")
        // replace = with nothing
        .replace(/=/g, "");
      dataCode = dataCode.substring(0, 254);
      dataCode = dataCode.split("Z");
      dataCode = dataCode[0] + "Z" + extra;
      let validTime = "";

      if (lineSplit[4].length == 13) {
        validTime = lineSplit[4];
      } else {
        validTime = lineSplit[5];
      }

      if (validTime && validTime.length == 13) {
        let splitValidTime = validTime.split("/");

        const compiledValidFrom = `${year}-${month}-${splitValidTime[0].substring(
          0,
          2
        )} ${splitValidTime[0].substring(2, 4)}:${splitValidTime[0].substring(
          4,
          6
        )}`;

        // check if date until less than from
        let date_from = splitValidTime[0].substring(0, 2);
        let date_until = splitValidTime[1].substring(0, 2);

        if (parseInt(date_from) > parseInt(date_until)) {
          if (parseInt(month) < 12) {
            month = parseInt(month) + 1;
            if (month < 10) {
              month = "0" + month.toString();
            }
          } else {
            month = "01";
            year = parseInt(year);
            year = year + 1;
            year = year.toString();
          }
        }

        const compiledValidUntil = `${year}-${month}-${splitValidTime[1].substring(
          0,
          2
        )} ${splitValidTime[1].substring(2, 4)}:${splitValidTime[1].substring(
          4,
          6
        )}`;

        // console.log("valid_until :" + compiledValidUntil);

        pool.query(
          `INSERT INTO sigmet (
          data_code,
          type_code,
          regional_code,
          bulletin_code,
          centre_code,
          filling_time,
          extra_code,
          ats_code,
          sequence_code,
          valid_from,
          valid_until,
          icao_code,
          data_text,
          insert_time) VALUES
          ('${dataCode}',
          '${type}',
          '${regional}',
          '${bulletin}',
          '${center}',
          '${filling}',
          '${extra}',
          '${ats_code}',
          '${sequence_code}',
          '${compiledValidFrom}',
          '${compiledValidUntil}',
          '${icao}',
          '${dataText}',
          '${insert}')`,
          (err, result) => {
            console.log(result);
            if (err) {
              console.log(err);
            }
          }
        );

        // if (wiorwa == "WI" || wiorwa == "WA") {
        //   try {
        //     if (regionalCode === "WIIX") {
        //       return;
        //     }
        //     const idopSend = idop(headerSandi + "\n" + line);
        //   } catch (error) {
        //     console.log(error);
        //   }
        // }
      }
    }

  } else if (typeBerita == "FN") {

    let id_code = `${headerSandi}-${sliceGroup[1]}`;
    // DATETIME - format: YYYY-MM-DD HH:MI:SS form date now
    let insert = moment().format("YYYY-MM-DD HH:mm:ss");
    id_code = id_code.substring(0, 254).replace(" ", "_");

    console.log("id_code : " + id_code);
    console.log("insert : " + insert);

    pool.query(
      `INSERT INTO space_weather (
          id_code,
          header,
          code,
          time) VALUES
          ('${id_code}','${headerSandi}',
          '${sliceGroup[1]}',
          '${insert}')`,
      (err, result) => {
        console.log(result);
        if (err) {
          console.log(err);
        }
      }
    );
  } else if (typeBerita == "SYNOP") {

    if (regionalCode == "WIIL") {
      // sendWhatsapp(`Data Sandi WIIL ${group}`, "6282111119138");
    }

    // sendWhatsapp(`${group} with header ${headerSandi} and icao ${regionalCode}`, "6282111119138");
  }
};

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  waitForConnections: true,
  connectionLimit: 10,
  maxIdle: 10, // max idle connections, the default value is the same as `connectionLimit`
  idleTimeout: 60000, // idle connections timeout, in milliseconds, the default value 60000
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

const getConnection = () => {
  return new Promise((resolve, reject) => {
    pool.getConnection((err, connection) => {
      if (err) reject(err);
      resolve(connection);
    });
  });
};

const sendDatabase = async (data) => {
  const connection = await getConnection();
  console.log("connected as id " + connection.threadId);
};

export default send;
