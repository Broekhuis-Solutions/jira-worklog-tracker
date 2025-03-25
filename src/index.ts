import dotenv from "dotenv";
import { writeFileSync } from "fs";
import fetch, { RequestInit } from "node-fetch";

dotenv.config();

const email = process.env.JIRA_EMAIL;
const apiToken = process.env.JIRA_API_TOKEN;
const jiraDomain = process.env.JIRA_DOMAIN;

if (!email || !apiToken || !jiraDomain) {
  console.error("Missing environment variables. Please check your .env file.");
  process.exit(1);
}

export interface APIClientOptions {
  email: string;
  apiToken: string;
  jiraDomain: string;
}

export class APIClient {
  private headers: { [key: string]: string };
  private jiraDomain: string;

  constructor(options: APIClientOptions) {
    const { email, apiToken, jiraDomain } = options;
    this.jiraDomain = jiraDomain;
    this.headers = {
      Authorization:
        "Basic " + Buffer.from(`${email}:${apiToken}`).toString("base64"),
      Accept: "application/json",
      "Content-Type": "application/json",
    };
  }

  public async get<T>(url: string): Promise<any> {
    const options: RequestInit = {
      method: "GET",
      headers: this.headers,
    };

    const res = await fetch(url, options);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `GET ${url} failed: ${res.status} ${res.statusText} - ${text}`
      );
    }
    return res.json();
  }

  public async post<T>(url: string, body: any): Promise<any> {
    const options: RequestInit = {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    };

    const res = await fetch(url, options);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `POST ${url} failed: ${res.status} ${res.statusText} - ${text}`
      );
    }
    return res.json();
  }

  public getJiraDomain(): string {
    return this.jiraDomain;
  }
}
const client = new APIClient({ email, apiToken, jiraDomain });

/**
 * Computes the start and end timestamps (in ms) for the past week,
 * defined as the Monday to Sunday period preceding the current week.
 */
function getLastWeekRange(): { start: number; end: number } {
  const today = new Date();
  // Set today's date to midnight
  const todayMidnight = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );
  // JS getDay(): Sunday = 0, Monday = 1, …, Saturday = 6.
  // For calculation, treat Sunday as 7.
  const dayOfWeek = todayMidnight.getDay() === 0 ? 7 : todayMidnight.getDay();
  // Current week's Monday:
  const currentMonday = new Date(todayMidnight);
  currentMonday.setDate(todayMidnight.getDate() - (dayOfWeek - 1));
  // Last week's Monday:
  const lastWeekMonday = new Date(currentMonday);
  lastWeekMonday.setDate(currentMonday.getDate() - 7);
  // Last week's Sunday:
  const lastWeekSunday = new Date(lastWeekMonday);
  lastWeekSunday.setDate(lastWeekMonday.getDate() + 6);
  // Set Sunday to end of day
  lastWeekSunday.setHours(23, 59, 59, 999);

  return { start: lastWeekMonday.getTime(), end: lastWeekSunday.getTime() };
}

/**
 * Recursively fetches worklog IDs updated within a given time window.
 * @param since Epoch timestamp (in ms) marking the start of the window.
 * @param until Epoch timestamp (in ms) marking the end of the window.
 * @param startAt Starting index for pagination.
 * @param maxResults Number of results per page.
 * @param accum Accumulated array of worklog IDs.
 * @returns Array of worklog IDs.
 */
async function getWorklogUpdates(
  since: number,
  until: number,
  startAt = 0,
  maxResults = 100,
  accum: number[] = []
): Promise<number[]> {
  const url = `https://${client.getJiraDomain()}/rest/api/3/worklog/updated?since=${since}&until=${until}&startAt=${startAt}&maxResults=${maxResults}`;
  const data = await client.get<any>(url);
  const ids: number[] = data.values.map((w: any) => w.worklogId);
  const newAccum = accum.concat(ids);

  if (startAt + maxResults < data.total) {
    return getWorklogUpdates(
      since,
      until,
      startAt + maxResults,
      maxResults,
      newAccum
    );
  } else {
    return newAccum;
  }
}

/**
 * Fetches full worklog details for a list of worklog IDs.
 * @param ids Array of worklog IDs.
 * @returns Array of worklog details.
 */
async function getWorklogDetails(ids: number[]): Promise<any[]> {
  const url = `https://${client.getJiraDomain()}/rest/api/3/worklog/list`;
  const logs = await client.post<any[]>(url, { ids });
  return logs.map((log: any) => ({
    id: log.id,
    issueKey: log.issueId, // You might resolve this further if needed
    author: log.author.displayName,
    created: log.created,
    updated: log.updated,
    started: log.started,
    timeSpent: log.timeSpent,
    comment:
      log.comment?.content
        ?.map((block: any) => block.content?.map((c: any) => c.text).join(" "))
        .join(" ") || "",
  }));
}

(async () => {
  try {
    // Get the past week's Monday and Sunday timestamps
    const { start: weekStart, end: weekEnd } = getLastWeekRange();
    console.log(
      `Fetching worklog updates between ${new Date(
        weekStart
      ).toISOString()} and ${new Date(weekEnd).toISOString()}`
    );

    // Fetch all worklog IDs updated in that time window
    const worklogIds = await getWorklogUpdates(weekStart, weekEnd);
    console.log(`\n🔍 Found ${worklogIds.length} updated worklogs`);

    const chunkSize = 100;
    const allLogs: any[] = [];

    // Process worklog IDs in chunks
    for (let i = 0; i < worklogIds.length; i += chunkSize) {
      const chunk = worklogIds.slice(i, i + chunkSize);
      const logs = await getWorklogDetails(chunk);
      allLogs.push(...logs);
      process.stdout.write(
        `\rFetched ${allLogs.length}/${worklogIds.length} worklogs`
      );
    }

    function parseTimeSpent(timeSpent: string): number {
      const trimmed = timeSpent.trim();
      if (trimmed.endsWith("m")) {
        return parseFloat(trimmed.slice(0, -1));
      } else if (trimmed.endsWith("h")) {
        return parseFloat(trimmed.slice(0, -1)) * 60;
      } else if (trimmed.endsWith("d")) {
        return parseFloat(trimmed.slice(0, -1)) * 8 * 60; // assuming 8h per day
      }
      return 0;
    }

    const ticketCache: { [issueId: string]: string } = {};
    async function fetchTicketKey(issueId: string): Promise<string> {
      if (ticketCache[issueId]) return ticketCache[issueId];
      const url = `https://${client.getJiraDomain()}/rest/api/3/issue/${issueId}`;
      const issueData = await client.get<any>(url);
      ticketCache[issueId] = issueData.key;
      return issueData.key;
    }

    const groupedByAuthorAndIssue = allLogs.reduce((acc, log) => {
      const author = log.author;
      const issueId = log.issueKey; // using the internal issue identifier
      const timeSpentMinutes = parseTimeSpent(log.timeSpent);
      if (!acc[author]) {
        acc[author] = {};
      }
      if (!acc[author][issueId]) {
        acc[author][issueId] = 0;
      }
      acc[author][issueId] += timeSpentMinutes;
      return acc;
    }, {} as { [author: string]: { [issueId: string]: number } });

    const tableRows: {
      author: string;
      ticket: string;
      totalTimeSpentMinutes: number;
    }[] = [];
    for (const author in groupedByAuthorAndIssue) {
      for (const issueId in groupedByAuthorAndIssue[author]) {
        const totalTime = groupedByAuthorAndIssue[author][issueId];
        const ticket = await fetchTicketKey(issueId);
        tableRows.push({ author, ticket, totalTimeSpentMinutes: totalTime });
      }
    }
    console.log("\n");
    console.table(tableRows);

    const csvArgIndex = process.argv.findIndex((arg) => arg === "--csv");
    if (csvArgIndex !== -1 && process.argv[csvArgIndex + 1]) {
      const csvFilePath = process.argv[csvArgIndex + 1];
      const csvHeader = "Author,Ticket,TotalTimeSpentMinutes";
      const csvRows = tableRows.map(
        (row) => `"${row.author}","${row.ticket}",${row.totalTimeSpentMinutes}`
      );
      const csvContent = [csvHeader, ...csvRows].join("\n");
      writeFileSync(csvFilePath, csvContent, "utf8");

      console.log(`CSV saved to ${csvFilePath}`);
    }
  } catch (err) {
    console.error("❌ Error:", err);
  }
})();
