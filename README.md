# Jira Worklog Summary Tool

A TypeScript CLI tool that fetches worklog updates from Jira for the past week (Monday–Sunday), groups them by author and ticket, and prints a summary table with the total time spent per ticket.

## Prerequisites

- **Node.js:** Version 18 or higher.
- **Jira Cloud Account:** With proper permissions.
- **Jira API Token:** Create one at [Atlassian API Tokens](https://id.atlassian.com/manage/api-tokens).
- **Atlassian Domain:** (e.g., `your-domain.atlassian.net`).

## Installation

```bash
git clone <repository-url>
cd jira-worklog
npm install
```

## Configuration

Create a .env file in the project root with the following environment variables:

```bash
EMAIL=your-email@example.com
API_TOKEN=your-api-token
JIRA_DOMAIN=your-domain.atlassian.net
```

## Usage

Shows the summary table and optionally saves it as a CSV file:

```bash
npx ts-node --esm src/index.ts
npx ts-node --esm src/index.ts --csv output.csv
```

## Example Output

```bash
┌─────────┬─────────────────────┬─────────────┬───────────────────────────┐
│ (index) │      author         │   ticket    │ totalTimeSpentMinutes     │
├─────────┼─────────────────────┼─────────────┼───────────────────────────┤
│    0    │ 'John Doe'          │ 'ABC-3010'  │           20              │
│    1    │ 'Jane Doe'          │ 'XYZ-3020'  │           20              │
└─────────┴─────────────────────┴─────────────┴───────────────────────────┘
```
