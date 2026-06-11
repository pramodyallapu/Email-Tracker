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
  /** Gmail list q= param for the current scan pass (page tokens are query-specific). */
  sync_list_query?: string | null;
  sync_status?: "idle" | "running" | "error";
  sync_progress_synced?: number;
  updated_at?: string;
  zoho_account_id: string | null;
  zoho_dc: string | null;
}
