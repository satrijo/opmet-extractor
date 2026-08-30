import mysql from "mysql2";
import env from "dotenv";
import idop from "./idop.js";
import { sendWA } from "./wa.js";
import moment from "moment";

env.config();

const send = (opmetData) => {
  const data = opmetData;
  if (!data || data.length === 0) {
    console.log("[SEND] No OPMET data to process");
    return;
  }
  console.log(`[SEND] Processing ${data.length} file dataset(s)...`);
  data.forEach((e) => {
    sendDB(e);
  });
};

const sendDB = (data) => {
  if (!data || data.length === 0) {
    console.log("[SEND:DB] Empty dataset received");
    return;
  }
  data.forEach((group) => {
    const length = group.length;
    if (length < 1) {
      console.log("[BULLETIN:EMPTY] Skipped empty bulletin group");
      return;
    }
    const header = group[0].split(" ");
    const identifier = header[0];

    if (identifier.startsWith("SA") || identifier.startsWith("SP")) {
      try {
        console.log(`[BULLETIN] Header: "${group[0]}", Type: METAR, Lines: ${group.length}`);
        decodeOnebyOne(group, "METAR");
      } catch (error) {
        console.error(`[DECODE:ERROR] Failed decoding METAR bulletin ("${group[0]}"):`, error);
      }
    } else if (
      identifier.startsWith("SNID") ||
      identifier.startsWith("SMID") ||
      identifier.startsWith("SIID")
    ) {
      try {
        console.log(`[BULLETIN] Header: "${group[0]}", Type: SYNOP, Lines: ${group.length}`);
        decodeOnebyOne(group, "SYNOP");
      } catch (error) {
        console.error(`[DECODE:ERROR] Failed decoding SYNOP bulletin ("${group[0]}"):`, error);
      }
    } else if (identifier.startsWith("FT") || identifier.startsWith("FC")) {
      try {
        console.log(`[BULLETIN] Header: "${group[0]}", Type: TAF, Lines: ${group.length}`);
        decodeOnebyOne(group, "TAF");
      } catch (error) {
        console.error(`[DECODE:ERROR] Failed decoding TAF bulletin ("${group[0]}"):`, error);
      }
    } else if (identifier.startsWith("W")) {
      try {
        console.log(`[BULLETIN] Header: "${group[0]}", Type: SIGMET, Lines: ${group.length}`);
        decodeOnebyOne(group, "SIGMET");
      } catch (error) {
        console.error(`[DECODE:ERROR] Failed decoding SIGMET bulletin ("${group[0]}"):`, error);
      }
    } else if (identifier.startsWith("FN")) {
      try {
        console.log(`[BULLETIN] Header: "${group[0]}", Type: FN (Space Weather), Lines: ${group.length}`);
        decodeOnebyOne(group, "FN");
      } catch (error) {
        console.error(`[DECODE:ERROR] Failed decoding FN bulletin ("${group[0]}"):`, error);
      }
    } else {
      console.log(`[BULLETIN:UNKNOWN] Unknown bulletin identifier "${identifier}" in header: "${group[0]}"`);
    }
  });
};

const sendWhatsapp = async (fn, targetNumber) => {
  await sendWA(fn, targetNumber);
};

const decodeOnebyOne = (group, typeBerita) => {
  if (!group || group.length === 0 || !group[0]) {
    console.warn(`[DECODE:WARN] Empty group for ${typeBerita}`);
    return;
  }
  const sliceGroup = [[group[0]], group.slice(1)];
  const header = sliceGroup[0][0].split(" ");

  if (header.length < 3) {
    console.warn(`[DECODE:WARN] Malformed header (${sliceGroup[0][0]}) for ${typeBerita}`);
    return;
  }

  const headerSandi = sliceGroup[0][0];
  const identifier = header[0];
  const regionalCode = header[1];

  const type = identifier.substring(0, 2);
  const regional = identifier.substring(2, 4);
  const bulletin = identifier.substring(4, 6);

  const center = header[1];
  const datetime = header[2];
  const date = datetime.substring(0, 2);

  const nowUtc = moment.utc();
  let defaultYear = nowUtc.year().toString();
  let defaultMonth = String(nowUtc.month() + 1).padStart(2, "0");
  let dateCurrent = String(nowUtc.date()).padStart(2, "0");
  let hour = String(nowUtc.hour()).padStart(2, "0");
  let minute = String(nowUtc.minute()).padStart(2, "0");

  const filling = `${defaultYear}-${defaultMonth}-${date} ${datetime.substring(
    2,
    4,
  )}:${datetime.substring(4, 6)}`;

  const datacode_date = `${defaultYear}-${defaultMonth}-${date}`;
  const insert = `${defaultYear}-${defaultMonth}-${dateCurrent} ${hour}:${minute}`;
  let extra = header[3] ?? "";

  if (typeBerita === "METAR") {
    sliceGroup[1].forEach((line) => {
      const lineSplit = line.split(" ");
      if (lineSplit[0] === "METAR" || lineSplit[0] === "SPECI") {
        if (line.includes("NIL")) {
          console.log(`[INFO:SKIP] [METAR] Skipped NIL report: "${line}"`);
          return;
        }

        let icao = "";
        if (lineSplit[1] && lineSplit[1].length === 4) {
          icao = lineSplit[1];
        } else if (lineSplit[2] && lineSplit[2].length === 4) {
          icao = lineSplit[2];
        } else {
          icao = center;
        }

        const wiorwa = icao.substring(0, 2);
        const dataText = line;
        let dataCode = datacode_date + dataText;
        dataCode = dataCode
          .replace(/-/g, "")
          .replace(/:/g, "")
          .replace(/\s/g, "")
          .replace(/=/g, "");

        dataCode = dataCode.substring(0, 254);

        if (center.slice(-1) === "Z" || icao.slice(-1) === "Z") {
          const regex = /Z(?!.*Z)/;
          dataCode = dataCode.split(regex);
        } else {
          dataCode = dataCode.split("Z");
        }

        if (regionalCode === "WIIX") {
          console.log(`[WARN:DROP] [METAR] Dropped station ${icao} with regionalCode WIIX: "${line}"`);
          return;
        } else if (!dataText.includes("=")) {
          console.warn(`[WARN:DROP] [METAR] Dropped station ${icao} because missing '=' delimiter: "${line}"`);
          return;
        } else if (regionalCode.startsWith("KW")) {
          console.log(`[WARN:DROP] [METAR] Dropped station ${icao} with regionalCode KW* (${regionalCode}): "${line}"`);
          return;
        } else {
          dataCode = dataCode[0] + "Z" + extra;
        }
        const query = `INSERT INTO metar_speci (
          data_code,
          type_code,
          regional_code,
          bulletin_code,
          centre_code,
          filling_time,
          extra_code,
          icao_code,
          observed_time,
          data_text,
          insert_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
          observed_time = VALUES(observed_time),
          data_text = VALUES(data_text),
          insert_time = VALUES(insert_time)`;

        const finalDataCode = Array.isArray(dataCode) ? dataCode[0] : dataCode;
        const values = [
          finalDataCode,
          type,
          regional,
          bulletin,
          center,
          filling,
          extra,
          icao,
          filling,
          dataText,
          insert,
        ];

        console.log(`[DB:START] [METAR] Inserting: ICAO=${icao}, DataCode=${finalDataCode}`);
        pool.query(query, values, (err, result) => {
          if (err) {
            console.error(`[DB:ERROR] [METAR] Failed inserting ${icao} (${finalDataCode}):`, err.message);
          } else {
            const status = result?.affectedRows === 1 ? "INSERTED" : "UPDATED_DUPLICATE";
            console.log(`[DB:SUCCESS] [METAR] Saved ${icao} (${finalDataCode}) -> ${status} (affected: ${result?.affectedRows})`);
          }
        });

        try {
          let headerSandiString = headerSandi;
          if (regionalCode !== icao || regionalCode === "WIIX") {
            let headerSandiArray = headerSandi.split(" ");
            headerSandiArray[1] = icao;

            if (regionalCode === "WIIX" && headerSandiArray.length === 4) {
              headerSandiArray[3] = "";
            }

            headerSandiString = headerSandiArray.join(" ").trim();
          }
          if (line.includes("=")) {
            console.log(`[IDOP:TRIGGER] [METAR] Uploading ${icao} to IDOP (Header: ${headerSandiString})`);
            idop(headerSandiString + "\n" + line);
          }
        } catch (error) {
          console.error(`[IDOP:ERROR] [METAR] Failed sending ${icao} to IDOP:`, error.message || error);
        }
      }
    });
  } else if (typeBerita === "TAF") {
    sliceGroup[1].forEach((line) => {
      line = line.toString();
      const lineSplit = line.split(" ");

      if (lineSplit.length < 4) {
        console.warn(`[WARN:DROP] [TAF] Dropped malformed line (tokens < 4): "${line}"`);
        return;
      }
      if (lineSplit[0] === "TAF") {
        let icao = "";
        if (lineSplit[1].length === 4) {
          icao = lineSplit[1];
        } else {
          icao = lineSplit[2];
        }

        const wiorwa = icao.substring(0, 2);

        if (line.includes("NIL") && wiorwa !== "WI" && wiorwa !== "WA") {
          console.log(`[INFO:SKIP] [TAF] Skipped foreign NIL report: ICAO=${icao}, line="${line}"`);
          return;
        }

        const dataText = line;
        let dataCode = datacode_date + dataText;
        dataCode = dataCode
          .replace(/-/g, "")
          .replace(/:/g, "")
          .replace(/\s/g, "")
          .replace(/=/g, "");
        dataCode = dataCode.substring(0, 254);

        if (center.slice(-1) === "Z" || icao.slice(-1) === "Z") {
          const regex = /Z(?!.*Z)/;
          dataCode = dataCode.split(regex);
        } else {
          dataCode = dataCode.split("Z");
        }
        if (regionalCode === "WIIX") {
          console.log(`[WARN:DROP] [TAF] Dropped station ${icao} with regionalCode WIIX: "${line}"`);
          return;
        } else if (!dataText.includes("=")) {
          console.warn(`[WARN:DROP] [TAF] Dropped station ${icao} because missing '=' delimiter: "${line}"`);
          return;
        } else if (regionalCode.startsWith("K")) {
          console.log(`[WARN:DROP] [TAF] Dropped station ${icao} with regionalCode K* (${regionalCode}): "${line}"`);
          return;
        } else {
          dataCode = dataCode[0] + "Z" + extra;
        }

        let issuedTime = "";
        if (lineSplit[2].length === 7) {
          issuedTime = lineSplit[2];
        } else {
          issuedTime = lineSplit[3];
        }

        if (issuedTime && issuedTime.length === 7) {
          let yearLine = defaultYear;
          let monthLine = defaultMonth;
          let dateIssued = issuedTime.substring(0, 2);
          let hourIssued = issuedTime.substring(2, 4);
          let minuteIssued = issuedTime.substring(4, 6);
          let compiledIssuedTime = `${yearLine}-${monthLine}-${dateIssued} ${hourIssued}:${minuteIssued}`;
          let compiledValidFrom;
          let compiledValidUntil;
          let validity = "";
          if (lineSplit[3].length === 9) {
            validity = lineSplit[3];
          } else {
            validity = lineSplit[4];
          }
          if (validity && validity.length === 9) {
            let dateValidFrom = validity.substring(0, 2);
            let hourValidFrom = validity.substring(2, 4);
            compiledValidFrom = `${yearLine}-${monthLine}-${dateValidFrom} ${hourValidFrom}:00`;
            let dateValidUntil = validity.substring(5, 7);
            let hourValidUntil = validity.substring(7, 9);

            if (hourValidUntil === "24") {
              hourValidUntil = "00";
              let dUntil = parseInt(dateValidUntil, 10) + 1;
              let mUntil = parseInt(monthLine, 10);
              let yUntil = parseInt(yearLine, 10);

              const daysInMonth = new Date(yUntil, mUntil, 0).getDate();
              if (dUntil > daysInMonth) {
                dUntil = 1;
                mUntil += 1;
                if (mUntil > 12) {
                  mUntil = 1;
                  yUntil += 1;
                }
              }
              dateValidUntil = String(dUntil).padStart(2, "0");
              monthLine = String(mUntil).padStart(2, "0");
              yearLine = String(yUntil);
            }

            if (parseInt(dateValidFrom, 10) > parseInt(dateValidUntil, 10)) {
              let mUntil = parseInt(monthLine, 10) + 1;
              let yUntil = parseInt(yearLine, 10);
              if (mUntil > 12) {
                mUntil = 1;
                yUntil += 1;
              }
              monthLine = String(mUntil).padStart(2, "0");
              yearLine = String(yUntil);
            }
            compiledValidUntil = `${yearLine}-${monthLine}-${dateValidUntil} ${hourValidUntil}:00`;
          } else {
            compiledValidFrom = null;
            compiledValidUntil = null;
          }

          const query = `INSERT INTO taf (
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
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
          issued_time = VALUES(issued_time),
          valid_from = VALUES(valid_from),
          valid_until = VALUES(valid_until),
          data_text = VALUES(data_text),
          insert_time = VALUES(insert_time)`;

          const finalDataCode = Array.isArray(dataCode) ? dataCode[0] : dataCode;
          const values = [
            finalDataCode,
            type,
            regional,
            bulletin,
            center,
            filling,
            extra,
            icao,
            compiledIssuedTime,
            compiledValidFrom,
            compiledValidUntil,
            dataText,
            insert,
          ];

          console.log(`[DB:START] [TAF] Inserting: ICAO=${icao}, DataCode=${finalDataCode}, Valid=${compiledValidFrom}..${compiledValidUntil}`);
          pool.query(
            query,
            values,
            (err, result) => {
              if (err) {
                console.error(`[DB:ERROR] [TAF] Failed inserting ${icao} (${finalDataCode}):`, err.message, "| Values:", JSON.stringify(values));
              } else {
                const status = result?.affectedRows === 1 ? "INSERTED" : "UPDATED_DUPLICATE";
                console.log(`[DB:SUCCESS] [TAF] Saved ${icao} (${finalDataCode}) -> ${status} (affected: ${result?.affectedRows})`);
              }
            },
          );

          try {
            if (regionalCode === "WIIX") {
              console.log(`[WARN:DROP] [TAF:IDOP] Skipped IDOP for ${icao} due to regionalCode WIIX`);
              return;
            }
            if (wiorwa === "WI" || wiorwa === "WA") {
              console.log(`[IDOP:TRIGGER] [TAF] Uploading ${icao} to IDOP (Header: ${headerSandi})`);
              idop(headerSandi + "\n" + line);
            } else {
              console.log(`[INFO:SKIP] [TAF:IDOP] Skipped non-Indonesian station ${icao} for IDOP`);
            }
          } catch (error) {
            console.error(`[IDOP:ERROR] [TAF] Failed sending ${icao} to IDOP:`, error.message || error);
          }
        } else {
          console.warn(`[WARN:DROP] [TAF] Dropped ${icao} because invalid issuedTime: "${issuedTime}" in "${line}"`);
        }
      }
    });
  } else if (typeBerita === "SIGMET") {
    const line = [...group].slice(1).join(" ").replace(/\s+/g, " ").trim();
    if (line.includes("NIL") || !line.includes("SIGMET")) {
      console.log(`[INFO:SKIP] [SIGMET] Skipped NIL or non-SIGMET body: "${line}"`);
      return;
    }

    const norm = line;
    const validMatch = norm.match(/VALID\s+(\d{6})\/(\d{6})/i);
    const sigmetMatch = norm.match(/(?:([A-Z]{4})\s+)?SIGMET\s+([A-Z0-9\s]+?)\s+VALID/i);

    let ats_code = "";
    let sequence_code = "";
    if (sigmetMatch) {
      ats_code = sigmetMatch[1] || "";
      sequence_code = sigmetMatch[2].trim();
    }

    if (!ats_code) {
      const firMatch = norm.match(/([A-Z]{4})\s+(?:[A-Z\s\/]+)?FIR/i);
      if (firMatch) {
        ats_code = firMatch[1];
      } else {
        ats_code = center;
      }
    }

    let icao = center;
    const dataText = line;
    let dataCode = `${datacode_date}${center}${ats_code}${sequence_code}${validMatch ? validMatch[1] + validMatch[2] : ""}${extra}`
      .replace(/[^A-Za-z0-9]/g, "")
      .substring(0, 254);

    if (validMatch) {
      let date_from = validMatch[1].substring(0, 2);
      let date_until = validMatch[2].substring(0, 2);

      let validFromMonth = defaultMonth;
      let validFromYear = defaultYear;
      let validUntilMonth = defaultMonth;
      let validUntilYear = defaultYear;

      if (parseInt(date_from, 10) > parseInt(date_until, 10)) {
        if (parseInt(defaultMonth, 10) < 12) {
          let m = parseInt(defaultMonth, 10) + 1;
          validUntilMonth = m < 10 ? "0" + m : m.toString();
        } else {
          validUntilMonth = "01";
          validUntilYear = (parseInt(defaultYear, 10) + 1).toString();
        }
      }

      const compiledValidFrom = `${validFromYear}-${validFromMonth}-${date_from} ${validMatch[1].substring(2, 4)}:${validMatch[1].substring(4, 6)}:00`;
      const compiledValidUntil = `${validUntilYear}-${validUntilMonth}-${date_until} ${validMatch[2].substring(2, 4)}:${validMatch[2].substring(4, 6)}:00`;

      const query = `INSERT INTO sigmet (
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
        insert_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
        data_text = VALUES(data_text),
        valid_from = VALUES(valid_from),
        valid_until = VALUES(valid_until),
        insert_time = VALUES(insert_time)`;

      const values = [
        dataCode,
        type,
        regional,
        bulletin,
        center,
        filling,
        extra,
        ats_code,
        sequence_code,
        compiledValidFrom,
        compiledValidUntil,
        icao,
        dataText,
        insert,
      ];

      console.log(`[DB:START] [SIGMET] Inserting: ICAO=${icao}, ATS=${ats_code}, Seq=${sequence_code}, DataCode=${dataCode}`);
      pool.query(query, values, (err, result) => {
        if (err) {
          console.error(`[DB:ERROR] [SIGMET] Failed inserting ${icao} (${dataCode}):`, err.message);
        } else {
          const status = result?.affectedRows === 1 ? "INSERTED" : "UPDATED_DUPLICATE";
          console.log(`[DB:SUCCESS] [SIGMET] Saved ${icao} (${dataCode}) -> ${status} (affected: ${result?.affectedRows})`);
        }
      });
    } else {
      console.warn(`[WARN:DROP] [SIGMET] Dropped SIGMET due to missing VALID range: "${line}"`);
    }
  } else if (typeBerita === "FN") {
    const rawCode = Array.isArray(sliceGroup[1]) ? sliceGroup[1].join("\n") : String(sliceGroup[1]);
    let id_code = `${headerSandi}-${rawCode}`;
    let insert = moment().format("YYYY-MM-DD HH:mm:ss");
    id_code = id_code.substring(0, 254).replace(/\s+/g, "_");

    const query = `INSERT INTO space_weather (
        id_code,
        header,
        code,
        time) VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
        header = VALUES(header),
        code = VALUES(code),
        time = VALUES(time)`;

    console.log(`[DB:START] [FN] Inserting space weather bulletin: Header=${headerSandi}, IdCode=${id_code}`);
    pool.query(query, [id_code, headerSandi, rawCode, insert], (err, result) => {
      if (err) {
        console.error(`[DB:ERROR] [FN] Failed inserting space weather (${id_code}):`, err.message);
      } else {
        const status = result?.affectedRows === 1 ? "INSERTED" : "UPDATED_DUPLICATE";
        console.log(`[DB:SUCCESS] [FN] Saved space weather (${id_code}) -> ${status} (affected: ${result?.affectedRows})`);
      }
    });
  } else if (typeBerita === "SYNOP") {
    console.log(`[INFO:SYNOP] Processed SYNOP bulletin for regionalCode ${regionalCode}`);
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
  maxIdle: 10,
  idleTimeout: 60000,
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
  console.log("[DB:POOL] Connected with connection threadId " + connection.threadId);
};

export default send;
