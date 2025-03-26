# Jira Worklog Tracker

A simple CLI tool that fetches worklog updates from Jira for the past week (Monday–Sunday), groups them by author and ticket, and prints a summary table with the total time spent per ticket.

## Prerequisites

- **Node.js:** Version 18 or higher.
- **Jira Cloud Account:** With proper permissions.
- **Jira API Token:** Create one at [Atlassian API Tokens](https://id.atlassian.com/manage/api-tokens).
- **Atlassian Domain:** (e.g., `your-domain.atlassian.net`).

## Configuration

Create a .env file in the folder where you will use the commands.

```bash
JIRA_EMAIL=your-email@example.com
JIRA_API_TOKEN=your-api-token
JIRA_DOMAIN=your-domain.atlassian.net
```

## Usage

Shows the summary table and saves it as a CSV file:

```bash
npx jira-worklog --week 11 --csv ./your/file/path.csv
```

## Example Output

```bash
┌─────────┬────────────────┬─────────────┬─────────────────────────┬─────────────────────┬────────────────────────┬────────────────────────┬───────────────────────────────────┐
│ (index) │     author     │  issueKey   │     issueComponents     │     hoursSpent      │        started         │        updated         │              comment              │
├─────────┼────────────────┼─────────────┼─────────────────────────┼─────────────────────┼────────────────────────┼────────────────────────┼───────────────────────────────────┤
│    0    │ 'John Doe'     │ 'ABC-985'   │ 'Frontend'              │ 0.25                │ '03/18/2025, 4:20 PM'  │ '03/24/2025, 2:17 PM'  │ 'Lorem ipsum dolor sit amet'      │
│    1    │ 'Jane Doe'     │ 'XYZ-3239'  │ ''                      │ 1                   │ '03/26/2025, 8:55 AM'  │ '03/26/2025, 9:55 AM'  │ ''                                │
│    2    │ 'John Doe'     │ 'ABC-985'   │ 'Frontend'              │ 0.08333333333333333 │ '03/24/2025, 8:30 AM'  │ '03/24/2025, 2:17 PM'  │ 'Lorem ipsum'                     │
│    3    │ 'Jane Doe'     │ 'XYZ-3239'  │ ''                      │ 1                   │ '03/21/2025, 11:41 AM' │ '03/24/2025, 12:42 PM' │ ''                                │
└─────────┴────────────────┴─────────────┴─────────────────────────┴─────────────────────┴────────────────────────┴────────────────────────┴───────────────────────────────────┘
```
