/** Connectors stay "planned" until they can actually ingest; the UI disables planned ones. */
export interface Connector {
  id: string;
  name: string;
  state: "implemented" | "planned";
}

export const CONNECTOR_CATALOG: readonly Connector[] = [
  { id: "confluence", name: "Confluence", state: "planned" },
  { id: "google_drive", name: "Google Drive", state: "planned" },
  { id: "sharepoint", name: "SharePoint", state: "planned" },
  { id: "slack", name: "Slack", state: "planned" },
  { id: "jira", name: "Jira", state: "planned" },
  { id: "github", name: "GitHub", state: "planned" },
  { id: "notion", name: "Notion", state: "planned" },
  { id: "zendesk", name: "Zendesk", state: "planned" },
] as const;
