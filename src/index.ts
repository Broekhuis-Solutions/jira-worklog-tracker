#!/usr/bin/env node
import {
  endOfISOWeek,
  format,
  getISOWeek,
  isWithinInterval,
  parseISO,
  setISOWeek,
  startOfISOWeek,
} from "date-fns";
import dotenv from "dotenv";
import { writeFileSync } from "fs";
import fetch, { RequestInit } from "node-fetch";
import parseDuration from "parse-duration";

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
 * Recursively fetches worklog IDs updated within a given time window.
 * @param since Epoch timestamp (in ms) marking the start of the window.
 * @param startAt Starting index for pagination.
 * @param maxResults Number of results per page.
 * @param accum Accumulated array of worklog IDs.
 * @returns Array of worklog IDs.
 */
async function getWorklogUpdatesSince(
  since: number,
  startAt = 0,
  maxResults = 100,
  accum: number[] = []
): Promise<number[]> {
  const url = `https://${client.getJiraDomain()}/rest/api/3/worklog/updated?since=${since}&startAt=${startAt}&maxResults=${maxResults}`;
  const data = await client.get<any>(url);
  const ids: number[] = data.values.map((w: any) => w.worklogId);
  const newAccum = accum.concat(ids);

  if (startAt + maxResults < data.total) {
    return getWorklogUpdatesSince(
      since,
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
async function getWorklogs(ids: number[]): Promise<any[]> {
  const url = `https://${client.getJiraDomain()}/rest/api/3/worklog/list`;
  const logs = await client.post<any[]>(url, { ids });
  return logs.map((log: any) => ({
    id: log.id,
    issueId: log.issueId, // You might resolve this further if needed
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

/**
 * Returns the value of a command-line argument.
 * @param name The name of the argument.
 * @returns The value of the argument, or an empty string if not found.
 */
const arg = (name: string) => {
  const index = process.argv.findIndex((arg) => arg === `--${name}`);
  if (index === -1) return "";
  return process.argv[index + 1];
};

/**
 * Computes the start and end timestamps (in ms) for the past week,
 * @param weekNumber The week number (e.g., 11 for the 11th week of the year).
 * @param year The year.
 * @returns An object with `weekStart` and `weekEnd` properties, both of type `Date`.
 */
function getWeekRange(weekNumber: number, year: number) {
  const january4th = new Date(year, 0, 4);
  const dateInWeek = setISOWeek(january4th, weekNumber);
  const weekStart = startOfISOWeek(dateInWeek);
  const weekEnd = endOfISOWeek(dateInWeek);
  return { weekStart, weekEnd };
}

/**
 * Fetches full issue details for a list of issue IDs.
 * @param issueIds Array of issue IDs.
 * @returns Array of issue details.
 */
async function fetchIssues(issueIds: number[]): Promise<any[]> {
  const data = await client.post<any>(
    `https://${client.getJiraDomain()}/rest/api/3/search/jql`,
    {
      jql: `id in (${issueIds.join(",")})`,
      fields: ["summary", "parent", "components"],
    }
  );
  return data.issues;
}

(async () => {
  try {
    const date = new Date();
    const currentWeek = getISOWeek(date);
    const givenWeek = arg("week");
    const weekNumber = givenWeek ? parseInt(givenWeek) : currentWeek;

    // Fetch all worklog IDs updated in that time window
    const { weekStart, weekEnd } = getWeekRange(weekNumber, date.getFullYear());
    const worklogIds = await getWorklogUpdatesSince(weekStart.getTime());

    // Generate tableRows with each worklog as a row: author, resolved ticket, time spent, and comment.
    const allLogs: any[] = await getWorklogs(worklogIds);
    const filteredWorklogs = allLogs.filter((log) => {
      const startedDate = parseISO(log.started);
      return isWithinInterval(startedDate, { start: weekStart, end: weekEnd });
    });
    if (!filteredWorklogs.length) {
      throw new Error(`No worklogs found for week ${weekNumber}`);
    }

    console.log(
      `\n🔍 Found ${filteredWorklogs.length} updated worklogs for week ${weekNumber}`
    );
    const ms = 5400000; //  1.5 hours in milliseconds

    const tableRows: {
      author: string;
      issueKey: string;
      summary: string;
      parent: string;
      issueComponents: string;
      hoursSpent: string;
      started: string;
      updated: string;
      comment: string;
    }[] = [];
    const uniqueIssueIds = [
      ...new Set(filteredWorklogs.map((log) => log.issueId)),
    ];
    const issues = await fetchIssues(uniqueIssueIds);

    for (const log of filteredWorklogs) {
      const issue = issues.find((issue) => issue.id === log.issueId);
      const issueComponents = issue?.fields?.components
        ?.map((component: { name: string }) => component.name)
        .join(", ");

      const duration = parseDuration(log.timeSpent) ?? 0;
      const hoursSpent = duration / (1000 * 60 * 60);
      tableRows.push({
        author: log.author,
        issueKey: issue.key,
        summary: issue.fields.summary,
        parent: issue.fields.parent?.fields.summary,
        issueComponents,
        hoursSpent: hoursSpent.toLocaleString("nl-nl", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
        started: format(log.started, "Pp"),
        updated: format(log.updated, "Pp"),
        comment: log.comment,
      });
    }

    // Log the worklogs in a table
    console.table(tableRows);

    // Check for CSV output argument and write the data as CSV if provided
    const csvFilePath = arg("csv");
    const filename = `w${weekNumber}.csv`;
    const csvHeader =
      "Author;IssueKey;Summary;Parent;IssueComponents;HoursSpent;Started;Updated;Comment";
    const csvRows = tableRows.map(
      (row) =>
        `"${row.author}";"${row.issueKey}";"${row.summary}";"${row.parent}";"${row.issueComponents}";"${row.hoursSpent}";"${row.started}";"${row.updated}";"${row.comment}"`
    );
    const csvContent = [csvHeader, ...csvRows].join("\n");
    writeFileSync(csvFilePath || filename, csvContent, "utf8");

    console.log(`CSV saved to: ${csvFilePath || filename}`);
  } catch (err) {
    console.error("\n❌ Error:", err);
  }
})();
