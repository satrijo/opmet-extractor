import fs from "fs";
import path from "path";
import env from "dotenv";

env.config();

const opmet = () => {
  const directoryPath = process.env.OPMET_PATH;
  let datas = [];

  try {
    const files = fs.readdirSync(directoryPath);

    files.forEach((file) => {
      const filePath = path.join(directoryPath, file);

      if (file.includes(".a")) {
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
            group.map((line) => line.replace(/\r/g, "").replace(/\u0003/g, ""))
          )
          .map((group) => group.filter((line) => line.trim() !== ""))
          .map((group) => combineLines(group))
          .map((group) => cleanLines(group))
          // if array length is 0, then delete
          .filter((group) => group.length > 0);

        datas.push(newData);
        fs.unlinkSync(filePath);
      }
    });
  } catch (err) {
    console.error("Error reading directory:", err);
    throw err;
  }
  return datas;
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
    if (line.endsWith("=")) {
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
