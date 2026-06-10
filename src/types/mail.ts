export type MailProvider = "google" | "zoho";

export interface MailConnection {
  id: string;
  user_id: string | null;
  organization_id: string | null;
  connected_by_user_id: string | null;
  provider: MailProvider;
  mailbox_email: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expiry: string | null;
  sync_cursor: string | null;
  sync_page_token?: string | null;
  sync_status?: "idle" | "running" | "error";
  sync_progress_synced?: number;
  zoho_account_id: string | null;
  zoho_dc: string | null;
}
