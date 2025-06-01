import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function apiAPP() {
  const app = express();

  app.use(express.json());
  app.use(express.static(path.join(__dirname)));

  const dataFile = path.join(__dirname, "data.json");

  // Ensure the data file exists.
  (async () => {
    try {
      await fs.access(dataFile);
    } catch {
      await fs.writeFile(dataFile, "[]");
    }
  })();

  app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
  });

  app.get("/dates", async (req, res) => {
    try {
      const data = await fs.readFile(dataFile, "utf8");
      let jsonData = JSON.parse(data);

      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({ error: "Both startDate and endDate are required" });
      }

      // Assert that the dates are in the correct format
      const datePattern = /^\d{4}-\d{2}-\d{2}$/;
      if (!datePattern.test(startDate) || !datePattern.test(endDate)) {
        return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" });
      }

      // Assert that the dates are of valid values
      const valuePattern = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
      if (!valuePattern.test(startDate) || !valuePattern.test(endDate)) {
        return res.status(400).json({ error: "Invalid date. Check their values" });
      }

      // Convert the dates to Date objects and assert that they are valid
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (isNaN(start) || isNaN(end)) {
        return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" });
      }

      // Assert that the start date is not greater than the end date
      if (start > end) {
        return res.status(400).json({ error: "startDate cannot be greater than endDate" });
      }

      jsonData = jsonData.filter((item) => {
        const itemDate = new Date(item.date);
        return itemDate >= start && itemDate <= end;
      });

      res.json(jsonData);
    } catch (error) {
      res.status(500).json({ error: "Failed to read data, are the dates correct?" });
    }
  });

  app.get("/id", async (req, res) => {
    try {
      const data = await fs.readFile(dataFile, "utf8");
      let jsonData = JSON.parse(data);

      const { value } = req.query;

      if (!value) {
        return res.status(400).json({ error: "Value is required" });
      }

      // Assert that the value is an integer.
      const parsedValue = parseInt(value, 10);
      if (isNaN(parsedValue)) {
        return res.status(400).json({ error: "Invalid id. Use an integer" });
      }

      jsonData = jsonData.filter((item) => item.id === parsedValue);

      res.json(jsonData);
    } catch (error) {
      res.status(500).json({ error: "Failed to read data" });
    }
  });

  return app;
}
