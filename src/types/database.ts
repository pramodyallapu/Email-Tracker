/**
 * TODO: Regenerate from your Supabase project after running schema.sql:
 *
 *   npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/types/database.ts
 *
 * Replace YOUR_PROJECT_ID with your project ref from Supabase Dashboard → Settings → General.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          name: string | null;
          avatar_url: string | null;
          gmail_access_token: string | null;
          gmail_refresh_token: string | null;
          gmail_token_expiry: string | null;
          gmail_history_id: string | null;
          team_id: string | null;
          role: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          name?: string | null;
          avatar_url?: string | null;
          gmail_access_token?: string | null;
          gmail_refresh_token?: string | null;
          gmail_token_expiry?: string | null;
          gmail_history_id?: string | null;
          team_id?: string | null;
          role?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          name?: string | null;
          avatar_url?: string | null;
          gmail_access_token?: string | null;
          gmail_refresh_token?: string | null;
          gmail_token_expiry?: string | null;
          gmail_history_id?: string | null;
          team_id?: string | null;
          role?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      mail_connections: {
        Row: {
          id: string;
          user_id: string | null;
          organization_id: string | null;
          connected_by_user_id: string | null;
          provider: string;
          mailbox_email: string;
          access_token: string | null;
          refresh_token: string | null;
          token_expiry: string | null;
          sync_cursor: string | null;
          sync_page_token: string | null;
          sync_list_query: string | null;
          sync_status: string;
          sync_progress_synced: number;
          sync_gmail_total: number | null;
          zoho_account_id: string | null;
          zoho_dc: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          organization_id?: string | null;
          connected_by_user_id?: string | null;
          provider: string;
          mailbox_email: string;
          access_token?: string | null;
          refresh_token?: string | null;
          token_expiry?: string | null;
          sync_cursor?: string | null;
          sync_page_token?: string | null;
          sync_list_query?: string | null;
          sync_status?: string;
          sync_progress_synced?: number;
          sync_gmail_total?: number | null;
          zoho_account_id?: string | null;
          zoho_dc?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          organization_id?: string | null;
          connected_by_user_id?: string | null;
          provider?: string;
          mailbox_email?: string;
          access_token?: string | null;
          refresh_token?: string | null;
          token_expiry?: string | null;
          sync_cursor?: string | null;
          sync_page_token?: string | null;
          sync_list_query?: string | null;
          sync_status?: string;
          sync_progress_synced?: number;
          sync_gmail_total?: number | null;
          zoho_account_id?: string | null;
          zoho_dc?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      organization_members: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          role: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          role?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string;
          role?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      organization_invites: {
        Row: {
          id: string;
          organization_id: string;
          email: string;
          role: string;
          token: string;
          invited_by: string | null;
          accepted_at: string | null;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          email: string;
          role?: string;
          token?: string;
          invited_by?: string | null;
          accepted_at?: string | null;
          expires_at: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          email?: string;
          role?: string;
          token?: string;
          invited_by?: string | null;
          accepted_at?: string | null;
          expires_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      emails: {
        Row: {
          id: string;
          user_id: string;
          organization_id: string | null;
          mail_connection_id: string | null;
          provider: string;
          gmail_message_id: string;
          gmail_thread_id: string;
          from_address: string;
          from_name: string | null;
          to_addresses: string[];
          cc_addresses: string[];
          subject: string | null;
          is_sent: boolean;
          is_reply: boolean;
          labels: string[];
          received_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          organization_id?: string | null;
          mail_connection_id?: string | null;
          provider?: string;
          gmail_message_id: string;
          gmail_thread_id: string;
          from_address: string;
          from_name?: string | null;
          to_addresses?: string[];
          cc_addresses?: string[];
          subject?: string | null;
          is_sent?: boolean;
          is_reply?: boolean;
          labels?: string[];
          received_at: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          gmail_message_id?: string;
          gmail_thread_id?: string;
          from_address?: string;
          from_name?: string | null;
          to_addresses?: string[];
          cc_addresses?: string[];
          subject?: string | null;
          is_sent?: boolean;
          is_reply?: boolean;
          labels?: string[];
          received_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "emails_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      threads: {
        Row: {
          id: string;
          user_id: string;
          organization_id: string | null;
          provider: string;
          gmail_thread_id: string;
          subject: string | null;
          participants: string[];
          is_replied: boolean;
          is_archived: boolean;
          first_received_at: string | null;
          last_message_at: string | null;
          first_replied_at: string | null;
          reply_time_seconds: number | null;
          message_count: number;
          inbound_count: number;
          outbound_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          organization_id?: string | null;
          provider?: string;
          gmail_thread_id: string;
          subject?: string | null;
          participants?: string[];
          is_replied?: boolean;
          is_archived?: boolean;
          first_received_at?: string | null;
          last_message_at?: string | null;
          first_replied_at?: string | null;
          reply_time_seconds?: number | null;
          message_count?: number;
          inbound_count?: number;
          outbound_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          organization_id?: string | null;
          gmail_thread_id?: string;
          subject?: string | null;
          participants?: string[];
          is_replied?: boolean;
          is_archived?: boolean;
          first_received_at?: string | null;
          last_message_at?: string | null;
          first_replied_at?: string | null;
          reply_time_seconds?: number | null;
          message_count?: number;
          inbound_count?: number;
          outbound_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "threads_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      metrics_daily: {
        Row: {
          id: string;
          user_id: string;
          organization_id: string | null;
          date: string;
          total_received: number;
          total_sent: number;
          new_threads: number;
          threads_replied: number;
          threads_not_replied: number;
          reply_rate: number;
          avg_reply_time_sec: number | null;
          min_reply_time_sec: number | null;
          max_reply_time_sec: number | null;
          p50_reply_time_sec: number | null;
          p90_reply_time_sec: number | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          organization_id?: string | null;
          date: string;
          total_received?: number;
          total_sent?: number;
          new_threads?: number;
          threads_replied?: number;
          threads_not_replied?: number;
          reply_rate?: number;
          avg_reply_time_sec?: number | null;
          min_reply_time_sec?: number | null;
          max_reply_time_sec?: number | null;
          p50_reply_time_sec?: number | null;
          p90_reply_time_sec?: number | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          organization_id?: string | null;
          date?: string;
          total_received?: number;
          total_sent?: number;
          new_threads?: number;
          threads_replied?: number;
          threads_not_replied?: number;
          reply_rate?: number;
          avg_reply_time_sec?: number | null;
          min_reply_time_sec?: number | null;
          max_reply_time_sec?: number | null;
          p50_reply_time_sec?: number | null;
          p90_reply_time_sec?: number | null;
        };
        Relationships: [];
      };
      sla_configs: {
        Row: {
          id: string;
          user_id: string;
          organization_id: string | null;
          name: string;
          threshold_hours: number;
          notify_email: boolean;
          notify_inapp: boolean;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          organization_id?: string | null;
          name: string;
          threshold_hours?: number;
          notify_email?: boolean;
          notify_inapp?: boolean;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          organization_id?: string | null;
          name?: string;
          threshold_hours?: number;
          notify_email?: boolean;
          notify_inapp?: boolean;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      sla_breaches: {
        Row: {
          id: string;
          user_id: string;
          thread_id: string;
          config_id: string;
          breached_at: string;
          resolved_at: string | null;
          is_resolved: boolean;
        };
        Insert: {
          id?: string;
          user_id: string;
          thread_id: string;
          config_id: string;
          breached_at?: string;
          resolved_at?: string | null;
          is_resolved?: boolean;
        };
        Update: {
          id?: string;
          user_id?: string;
          thread_id?: string;
          config_id?: string;
          breached_at?: string;
          resolved_at?: string | null;
          is_resolved?: boolean;
        };
        Relationships: [];
      };
      teams: {
        Row: {
          id: string;
          name: string;
          slug: string;
          owner_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          owner_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          owner_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      team_invites: {
        Row: {
          id: string;
          team_id: string;
          email: string;
          token: string;
          accepted_at: string | null;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          team_id: string;
          email: string;
          token?: string;
          accepted_at?: string | null;
          expires_at: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          team_id?: string;
          email?: string;
          token?: string;
          accepted_at?: string | null;
          expires_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      company_contacts: {
        Row: {
          id: string;
          user_id: string;
          organization_id: string | null;
          company_name: string;
          email: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          organization_id?: string | null;
          company_name: string;
          email: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          organization_id?: string | null;
          company_name?: string;
          email?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      company_domains: {
        Row: {
          id: string;
          user_id: string;
          domain: string;
          company_name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          domain: string;
          company_name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          domain?: string;
          company_name?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      internal_domains: {
        Row: {
          id: string;
          user_id: string;
          organization_id: string | null;
          domain: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          organization_id?: string | null;
          domain: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          organization_id?: string | null;
          domain?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: string;
          title: string;
          body: string | null;
          thread_id: string | null;
          is_read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: string;
          title: string;
          body?: string | null;
          thread_id?: string | null;
          is_read?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: string;
          title?: string;
          body?: string | null;
          thread_id?: string | null;
          is_read?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      aggregate_metrics_daily: {
        Args: { p_date?: string };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
  };
}
