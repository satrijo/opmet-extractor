import fs from "fs";
import path from "path";
import env from "dotenv";

env.config();

// Cache regex patterns
const regexCache = {
  carriage: /\r/g,
  controlChar: /\u0003/g,
  whitespace: /\s+/g,
  metarPattern: / METAR/,
  tafPattern: / TAF/,
  sigmetPattern: / SIGMET/
};

// Predefined constants
const VALID_FILE_PATTERNS = ['OPMET', '.a', '.b'];
const HEADER_MARKERS = ['0000', '\u0003'];

const opmet = () => {
  const paths = {
    transmet: process.env.TRANSMET_PATH,
    cmss: process.env.CMSS_PATH,
    wifs: process.env.WIFS_PATH
  };

  const datas = [];

  try {
    // Process all folders concurrently
    const processFolders = Object.entries(paths).map(([type, folderPath]) => 
      processFolder(folderPath, type, datas)
    );
    
    Promise.all(processFolders);
  } catch (err) {
    console.error("Error in OPMET processing:", err);
    throw err;
  }

  return datas;
};

const processFolder = (folderPath, type, datas) => {
  try {
    const files = fs.readdirSync(folderPath);
    
    // Process only relevant files
    const relevantFiles = files.filter(file => 
      VALID_FILE_PATTERNS.some(pattern => file.includes(pattern))
    );

    relevantFiles.forEach(file => {
      const filePath = path.join(folderPath, file);
      processFile(filePath, type, datas);
    });

    // Clean up non-OPMET files in transmet folder
    if (type === 'transmet') {
      const otherFiles = files.filter(file => 
        !VALID_FILE_PATTERNS.some(pattern => file.includes(pattern))
      );
      otherFiles.forEach(file => fs.unlinkSync(path.join(folderPath, file)));
    }
  } catch (err) {
    console.error(`Error processing folder ${folderPath}:`, err);
  }
};

const processFile = (filePath, type, datas) => {
  const data = fs.readFileSync(filePath, "utf8");
  const processedData = processDataContent(data);
  
  if (processedData.length > 0) {
    datas.push(processedData);
  }

  // Clean up file based on type
  fs.unlinkSync(filePath);
};

const processDataContent = (data) => {
  const groups = splitIntoGroups(data);
  
  return groups
    .map(group => group.slice(2))
    .map(group => cleanGroupLines(group))
    .map(group => combineLines(group))
    .map(group => cleanLines(group))
    .map(group => checkIfDouble(group))
    .filter(group => group.length > 0);
};

const splitIntoGroups = (data) => {
  const lines = data.split('\n');
  const groups = [];
  let currentGroup = [];

  lines.forEach(line => {
    if (HEADER_MARKERS.some(marker => line.startsWith(marker))) {
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
        currentGroup = [];
      }
    }
    currentGroup.push(line);
  });

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups;
};

const cleanGroupLines = (lines) => {
  return lines
    .map(line => line
      .replace(regexCache.carriage, '')
      .replace(regexCache.controlChar, '')
    )
    .filter(line => line.trim() !== '');
};

const checkIfDouble = (lines) => {
  const separatedData = [];
  
  lines.forEach(line => {
    let processed = false;
    ['METAR', 'TAF', 'SIGMET'].forEach(type => {
      const pattern = regexCache[`${type.toLowerCase()}Pattern`];
      if (pattern.test(line)) {
        const [before, after] = line.split(pattern);
        separatedData.push(before, type + after);
        processed = true;
      }
    });
    
    if (!processed) {
      separatedData.push(line);
    }
  });

  return separatedData;
};

const cleanLines = (lines) => {
  if (lines.length < 1) return lines;
  
  const identifier = lines[0].split(' ')[0];
  if (identifier.startsWith('W') || identifier.startsWith('FNXX')) {
    return lines;
  }
  
  return lines.map(line => line.replace(regexCache.whitespace, ' ').trim());
};

const combineLines = (lines) => {
  if (lines.length < 1) return lines;
  
  const identifier = lines[0].split(' ')[0];
  const isSpecialFormat = identifier.startsWith('W') || identifier.startsWith('FNXX');
  const lineJoiner = isSpecialFormat ? '\r' : ' ';
  
  const combinedData = [lines[0]];
  let currentLine = '';

  lines.slice(1).forEach(line => {
    if (line.includes('=')) {
      currentLine += line;
      combinedData.push(currentLine);
      currentLine = '';
    } else if (!line.startsWith('// END PART')) {
      currentLine += line + lineJoiner;
    }
  });

  if (currentLine.trim()) {
    combinedData.push(currentLine.trim());
  }

  return combinedData;
};

export default opmet;
