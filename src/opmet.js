import fs from "fs";
import path from "path";
import env from "dotenv";

env.config();

const opmet = () => {
  const transmetPath = process.env.TRANSMET_PATH;
  const cmssPath = process.env.CMSS_PATH;
  const trash = process.env.TRASH_PATH;
  const wifsPath = process.env.WIFS_PATH;

  let datas = [];
  try {
    const checkFolder = (folder, type) => {
      const files = fs.readdirSync(folder);
      files.forEach((file) => {
        const filePath = path.join(folder, file);

        if (file.includes("OPMET") || file.includes(".a")) {
          const data = fs.readFileSync(filePath, "utf8");
          let dataLines = data.split("\n");
          const dataCleansing = [];
          let group = [];

          dataLines.forEach((line) => {
            if (line.startsWith("0000") || line.startsWith("\u0003")) {
              if (group.length > 0) {
                dataCleansing.push(group);
                group = [];
              }
            }
            group.push(line);
          });

          if (group.length > 0) {
            dataCleansing.push(group);
          }

          const newData = dataCleansing
            .map((group) => group.slice(2))
            .map((group) =>
              group.map((line) =>
                line.replace(/\r/g, "").replace(/\u0003/g, "")
              )
            )
            .map((group) => group.filter((line) => line.trim() !== ""))
            .map((group) => combineLines(group))
            .map((group) => cleanLines(group))
            .map((group) => checkIfDouble(group))
            // if array length is 0, then delete
            .filter((group) => group.length > 0);

          datas.push(newData);
          if (type == "transmet") {
            fs.unlinkSync(filePath);
            // fs.renameSync(filePath, path.join(trash, file), (err) => {
            //   if (err) throw err;
            //   console.log("Successfully moved");
            // });
          }

          if (type == "cmss") {
            fs.unlinkSync(filePath);
          }

          if (type == "wifs") {
            fs.unlinkSync(filePath);
          }
        } else {
          if (type == "transmet") {
            fs.unlinkSync(filePath);
          }
        }
      });
    };

    const transmet = checkFolder(transmetPath, "transmet");
    const cmss = checkFolder(cmssPath, "cmss");
    const wifs = checkFolder(wifsPath, "wifs");
  } catch (err) {
    console.error("Error reading directory:", err);
    throw err;
  }
  return datas;
};

const checkIfDouble = (lines) => {
  const separatedData = [];
  const data = lines;
  for (let i = 0; i < data.length; i++) {
    if (data[i].includes(" METAR")) {
      const index = data[i].indexOf(" METAR");
      separatedData.push(data[i].substring(0, index));
      separatedData.push(data[i].substring(index + 1));
    } else if (data[i].includes(" TAF")) {
      const index = data[i].indexOf(" TAF");
      separatedData.push(data[i].substring(0, index));
      separatedData.push(data[i].substring(index + 1));
    } else if (data[i].includes(" SIGMET")) {
      const index = data[i].indexOf(" SIGMET");
      separatedData.push(data[i].substring(0, index));
      separatedData.push(data[i].substring(index + 1));
    } else {
      separatedData.push(data[i]);
    }
  }
  return separatedData;
};

const cleanLines = (lines) => {
  const length = lines.length;
  if (length < 1) {
    return lines;
  }
  const header = lines[0].split(" ");
  const identifier = header[0];
  if (identifier.startsWith("W")) {
    return lines;
  }
  return lines.map((line) => line.replace(/\s+/g, " ").trim());
};

const combineLines = (lines) => {
  const length = lines.length;
  if (length < 1) {
    return lines;
  }
  const header = lines[0].split(" ");
  const identifier = header[0];
  const combinedData = [];
  let combinedLine = "";

  lines.slice(1).forEach((line) => {
    if (line.includes("=")) {
      combinedLine += line;
      combinedData.push(combinedLine);
      combinedLine = "";
    } else if (line.startsWith("// END PART")) {
      // do nothing
    } else {
      if (identifier.startsWith("W")) {
        combinedLine += line + "\r";
      } else {
        combinedLine += line + " ";
      }
    }
  });

  if (combinedLine.trim() !== "") {
    combinedData.push(combinedLine.trim());
  }

  return [lines[0], ...combinedData];
};

export default opmet;
