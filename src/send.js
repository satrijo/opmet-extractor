import mysql from "mysql2/promise";
import env from "dotenv";
import idop from "./idop.js";
import { sendWA } from "./wa.js";
import moment from "moment";

env.config();

// Database connection configuration
const dbConfig = {
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
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

// Constants
const MESSAGE_TYPES = {
  METAR: 'METAR',
  TAF: 'TAF',
  SIGMET: 'SIGMET',
  SYNOP: 'SYNOP',
  FN: 'FN'
};

const REGION_PREFIXES = {
  METAR: ['SA', 'SP'],
  SYNOP: ['SNID', 'SMID', 'SIID'],
  TAF: ['FT', 'FC'],
  SIGMET: ['W'],
  FN: ['FN']
};

// Utility functions
const formatNumber = (num) => num < 10 ? `0${num}` : `${num}`;

const getCurrentDateTime = () => {
  const now = new Date(Date.now() - 7 * 3600000);
  const year = now.getFullYear();
  const month = formatNumber(now.getMonth() + 1);
  const date = formatNumber(now.getDate());
  const hour = formatNumber(now.getHours());
  const minute = formatNumber(now.getMinutes());
  
  return {
    year,
    month,
    date,
    hour,
    minute,
    dateString: `${year}-${month}-${date}`,
    timeString: `${hour}:${minute}`,
    fullDateTime: `${year}-${month}-${date} ${hour}:${minute}`
  };
};

const createDataCode = (date, text) => {
  return (date + text)
    .replace(/[-:\s=]/g, '')
    .substring(0, 254);
};

// Main processor
const processMetar = async (pool, data, header, dateTime) => {
  const { year, month, dateString, fullDateTime } = dateTime;
  const [headerSandi, regionalCode] = header;

  for (const line of data) {
    const parts = line.split(' ');
    if (!['METAR', 'SPECI'].includes(parts[0]) || line.includes('NIL')) continue;

    const icao = parts[1].length === 4 ? parts[1] : parts[2];
    if (!icao) continue;

    const wiorwa = icao.substring(0, 2);
    const dataCode = createDataCode(dateString, line);
    
    const query = `
      INSERT INTO metar_speci 
      (data_code, type_code, regional_code, bulletin_code, centre_code, 
       filling_time, extra_code, icao_code, observed_time, data_text, insert_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    try {
      await pool.execute(query, [
        dataCode, header.type, header.regional, header.bulletin, 
        header.center, header.filling, header.extra, icao,
        header.filling, line, fullDateTime
      ]);

      if ((regionalCode !== icao || regionalCode === 'WIIX') && line.includes('=')) {
        let modifiedHeader = headerSandi.split(' ');
        modifiedHeader[1] = icao;
        if (regionalCode === 'WIIX' && modifiedHeader.length === 4) {
          modifiedHeader.pop();
        }
        await idop(modifiedHeader.join(' ').trim() + '\n' + line);
      }
    } catch (error) {
      console.error('METAR processing error:', error);
    }
  }
};

const processTaf = async (pool, data, header, dateTime) => {
  const { year, month, dateString, fullDateTime } = dateTime;
  
  for (const line of data) {
    const parts = line.toString().split(' ');
    if (parts.length < 4 || parts[0] !== 'TAF' || line.includes('NIL')) continue;

    const icao = parts[1].length === 4 ? parts[1] : parts[2];
    if (!icao) continue;

    const wiorwa = icao.substring(0, 2);
    const dataCode = createDataCode(dateString, line);
    
    // Process validity times
    const issuedTime = parts[2].length === 7 ? parts[2] : parts[3];
    if (!issuedTime || issuedTime.length !== 7) continue;

    const validity = await processValidityTimes(issuedTime, parts, dateTime);
    if (!validity) continue;

    const query = `
      INSERT INTO taf 
      (data_code, type_code, regional_code, bulletin_code, centre_code,
       filling_time, extra_code, icao_code, issued_time, valid_from,
       valid_until, data_text, insert_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    try {
      await pool.execute(query, [
        dataCode, header.type, header.regional, header.bulletin,
        header.center, header.filling, header.extra, icao,
        validity.issuedTime, validity.validFrom, validity.validUntil,
        line, fullDateTime
      ]);

      if (wiorwa === 'WI' || wiorwa === 'WA') {
        if (header.regionalCode !== 'WIIX') {
          await idop(header.headerSandi + '\n' + line);
        }
      }
    } catch (error) {
      console.error('TAF processing error:', error);
    }
  }
};

// Main export function
const send = async (opmetData) => {
  try {
    await Promise.all(opmetData.map(async (data) => {
      await processData(data);
    }));
  } catch (error) {
    console.error('Error in send function:', error);
  }
};

const processData = async (data) => {
  for (const group of data) {
    if (!group.length) continue;

    const header = parseHeader(group[0]);
    if (!header) continue;

    const dateTime = getCurrentDateTime();
    const messageType = determineMessageType(header.identifier);
    
    try {
      switch (messageType) {
        case MESSAGE_TYPES.METAR:
          await processMetar(pool, group.slice(1), header, dateTime);
          break;
        case MESSAGE_TYPES.TAF:
          await processTaf(pool, group.slice(1), header, dateTime);
          break;
        case MESSAGE_TYPES.SIGMET:
          await processSigmet(pool, group, header, dateTime);
          break;
        case MESSAGE_TYPES.FN:
          await processFN(pool, group, header, dateTime);
          break;
        case MESSAGE_TYPES.SYNOP:
          await processSynop(group, header);
          break;
      }
    } catch (error) {
      console.error(`Error processing ${messageType}:`, error);
    }
  }
};

// Helper function to determine message type
const determineMessageType = (identifier) => {
  for (const [type, prefixes] of Object.entries(REGION_PREFIXES)) {
    if (prefixes.some(prefix => identifier.startsWith(prefix))) {
      return MESSAGE_TYPES[type];
    }
  }
  return null;
};

// Parse header information
const parseHeader = (headerLine) => {
  const parts = headerLine.split(' ');
  if (parts.length < 3) return null;

  const identifier = parts[0];
  return {
    identifier,
    type: identifier.substring(0, 2),
    regional: identifier.substring(2, 4),
    bulletin: identifier.substring(4, 6),
    center: parts[1],
    datetime: parts[2],
    extra: parts[3] || '',
    headerSandi: headerLine,
    regionalCode: parts[1],
    filling: null // Set this based on datetime processing
  };
};

export default send;
