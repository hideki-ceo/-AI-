// supabase/migrations の内容に合わせた手書きの型。
// Supabase CLI 導入後は `npm run db:types` で自動生成したものに置き換える。

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "admin" | "owner";
export type ReplyMode = "auto" | "approval";
export type MessageStatus = "pending" | "approved" | "sent" | "rejected" | "failed";
export type PaymentSource = "beds24" | "stripe_direct" | "ota";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          role: UserRole;
          is_internal_free: boolean;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          subscription_status: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          role?: UserRole;
          is_internal_free?: boolean;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          subscription_status?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      properties: {
        Row: {
          id: string;
          user_id: string;
          tenant_id: string;
          property_name: string;
          name: string;
          address: string;
          minpaku_registration_no: string | null;
          is_exempt_from_billing: boolean;
          management_contract_ref: string | null;
          beds24_property_id: string;
          reply_mode: ReplyMode;
          house_rules_text: string | null;
          line_basic_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          tenant_id: string;
          property_name: string;
          name: string;
          address?: string;
          minpaku_registration_no?: string | null;
          is_exempt_from_billing?: boolean;
          management_contract_ref?: string | null;
          beds24_property_id: string;
          reply_mode?: ReplyMode;
          house_rules_text?: string | null;
          line_basic_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["properties"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "properties_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      tenants: {
        Row: {
          id: string;
          name: string;
          email: string;
          is_free_tier: boolean;
          free_reason: string | null;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          stripe_subscription_status: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          name: string;
          email: string;
          is_free_tier?: boolean;
          free_reason?: string | null;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          stripe_subscription_status?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["tenants"]["Insert"]>;
        Relationships: [];
      };
      bookings: {
        Row: {
          id: string;
          tenant_id: string;
          property_id: string;
          beds24_booking_id: string;
          source: string | null;
          guest_name: string;
          guest_email: string | null;
          guest_phone: string | null;
          guest_line_user_id: string | null;
          check_in: string;
          check_out: string;
          num_guests: number;
          is_paid: boolean;
          payment_source: PaymentSource | null;
          paid_at: string | null;
          is_guest_info_completed: boolean;
          lock_code_sent: boolean;
          lock_code_delivery_status: "pending" | "processing" | "sent" | "failed";
          lock_code_delivery_error: string | null;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          property_id: string;
          beds24_booking_id: string;
          source?: string | null;
          guest_name?: string;
          guest_email?: string | null;
          guest_phone?: string | null;
          guest_line_user_id?: string | null;
          check_in: string;
          check_out: string;
          num_guests: number;
          is_paid?: boolean;
          payment_source?: PaymentSource | null;
          paid_at?: string | null;
          is_guest_info_completed?: boolean;
          lock_code_sent?: boolean;
          lock_code_delivery_status?: "pending" | "processing" | "sent" | "failed";
          lock_code_delivery_error?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["bookings"]["Insert"]>;
        Relationships: [];
      };
      guest_members: {
        Row: {
          id: string;
          booking_id: string;
          is_representative: boolean;
          full_name: string;
          address: string;
          gender: string;
          phone_number: string;
          nationality: string;
          passport_number: string | null;
          passport_image_key: string | null;
          is_guest_info_completed: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          booking_id: string;
          is_representative?: boolean;
          full_name: string;
          address: string;
          gender: string;
          phone_number: string;
          nationality: string;
          passport_number?: string | null;
          passport_image_key?: string | null;
          is_guest_info_completed?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["guest_members"]["Insert"]>;
        Relationships: [];
      };
      lead_inquiries: {
        Row: {
          id: string;
          name: string;
          email: string;
          company: string | null;
          property_count: number | null;
          message: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          email: string;
          company?: string | null;
          property_count?: number | null;
          message?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["lead_inquiries"]["Insert"]>;
        Relationships: [];
      };
      stripe_webhook_events: {
        Row: { id: string; processed_at: string };
        Insert: { id: string; processed_at?: string };
        Update: Partial<Database["public"]["Tables"]["stripe_webhook_events"]["Insert"]>;
        Relationships: [];
      };
      property_secrets: {
        Row: {
          property_id: string;
          beds24_refresh_token: string;
          beds24_access_token: string | null;
          beds24_access_token_expires_at: string | null;
          line_channel_access_token: string;
          line_channel_secret: string;
          stripe_direct_webhook_secret: string | null;
          updated_at: string;
        };
        Insert: {
          property_id: string;
          beds24_refresh_token: string;
          beds24_access_token?: string | null;
          beds24_access_token_expires_at?: string | null;
          line_channel_access_token: string;
          line_channel_secret: string;
          stripe_direct_webhook_secret?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["property_secrets"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "property_secrets_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: true;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
        ];
      };
      line_guests: {
        Row: {
          id: string;
          property_id: string;
          line_user_id: string;
          beds24_booking_id: string | null;
          booking_snapshot: Json | null;
          booking_synced_at: string | null;
          linked_at: string | null;
          link_failure_count: number;
          link_failure_window_started_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          line_user_id: string;
          beds24_booking_id?: string | null;
          booking_snapshot?: Json | null;
          booking_synced_at?: string | null;
          linked_at?: string | null;
          link_failure_count?: number;
          link_failure_window_started_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["line_guests"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "line_guests_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
        ];
      };
      chat_messages: {
        Row: {
          id: string;
          property_id: string;
          line_user_id: string;
          line_webhook_event_id: string | null;
          beds24_booking_id: string | null;
          guest_language: string | null;
          incoming_message: string;
          ai_reply_draft: string | null;
          ai_reply_japanese: string | null;
          status: MessageStatus;
          error_message: string | null;
          approved_by: string | null;
          approved_at: string | null;
          sent_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          line_user_id: string;
          line_webhook_event_id?: string | null;
          beds24_booking_id?: string | null;
          guest_language?: string | null;
          incoming_message: string;
          ai_reply_draft?: string | null;
          ai_reply_japanese?: string | null;
          status?: MessageStatus;
          error_message?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          sent_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["chat_messages"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "chat_messages_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chat_messages_approved_by_fkey";
            columns: ["approved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean };
      owns_property: { Args: { p_property_id: string }; Returns: boolean };
      submit_guest_registry: {
        Args: { p_booking_id: string; p_guests: Json };
        Returns: undefined;
      };
      claim_lock_delivery: { Args: { p_booking_id: string }; Returns: boolean };
      finish_lock_delivery: {
        Args: { p_booking_id: string; p_error?: string | null };
        Returns: undefined;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
