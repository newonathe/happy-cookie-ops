export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor: string | null
          at: string
          detail: Json
          entity: string
          entity_id: string | null
          id: number
        }
        Insert: {
          action: string
          actor?: string | null
          at?: string
          detail?: Json
          entity: string
          entity_id?: string | null
          id?: number
        }
        Update: {
          action?: string
          actor?: string | null
          at?: string
          detail?: Json
          entity?: string
          entity_id?: string | null
          id?: number
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_fkey"
            columns: ["actor"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bake_batches: {
        Row: {
          baked_qty: number
          baker: string
          drop_id: string | null
          finished_at: string | null
          id: string
          planned_qty: number
          product_id: string
          started_at: string | null
          updated_at: string
        }
        Insert: {
          baked_qty?: number
          baker?: string
          drop_id?: string | null
          finished_at?: string | null
          id?: string
          planned_qty: number
          product_id: string
          started_at?: string | null
          updated_at?: string
        }
        Update: {
          baked_qty?: number
          baker?: string
          drop_id?: string | null
          finished_at?: string | null
          id?: string
          planned_qty?: number
          product_id?: string
          started_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bake_batches_drop_id_fkey"
            columns: ["drop_id"]
            isOneToOne: false
            referencedRelation: "drops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bake_batches_drop_id_fkey"
            columns: ["drop_id"]
            isOneToOne: false
            referencedRelation: "shop_drops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bake_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bake_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "shop_products"
            referencedColumns: ["id"]
          },
        ]
      }
      drops: {
        Row: {
          capacity: number
          closes_at: string
          created_at: string
          id: string
          opens_at: string
          pickup_at: string
          published: boolean
          updated_at: string
          week_label: string
        }
        Insert: {
          capacity: number
          closes_at: string
          created_at?: string
          id?: string
          opens_at: string
          pickup_at: string
          published?: boolean
          updated_at?: string
          week_label: string
        }
        Update: {
          capacity?: number
          closes_at?: string
          created_at?: string
          id?: string
          opens_at?: string
          pickup_at?: string
          published?: boolean
          updated_at?: string
          week_label?: string
        }
        Relationships: []
      }
      erasure_requests: {
        Row: {
          action: string | null
          actioned_at: string | null
          id: string
          note: string
          orders_affected: number
          phone_hash: string
          requested_at: string
        }
        Insert: {
          action?: string | null
          actioned_at?: string | null
          id?: string
          note?: string
          orders_affected?: number
          phone_hash: string
          requested_at?: string
        }
        Update: {
          action?: string | null
          actioned_at?: string | null
          id?: string
          note?: string
          orders_affected?: number
          phone_hash?: string
          requested_at?: string
        }
        Relationships: []
      }
      event_sale_items: {
        Row: {
          id: string
          product_id: string
          qty: number
          sale_id: string
          unit_price_cents: number
        }
        Insert: {
          id?: string
          product_id: string
          qty: number
          sale_id: string
          unit_price_cents: number
        }
        Update: {
          id?: string
          product_id?: string
          qty?: number
          sale_id?: string
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "shop_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "event_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      event_sales: {
        Row: {
          change_cents: number
          clerk: string
          client_id: string
          discount_cents: number
          event_id: string | null
          gross_cents: number
          id: string
          ledger_id: string | null
          pay_method: string
          pay_ref: string
          received_at: string
          sold_at: string
          tendered_cents: number
          total_cents: number
        }
        Insert: {
          change_cents?: number
          clerk?: string
          client_id: string
          discount_cents?: number
          event_id?: string | null
          gross_cents: number
          id?: string
          ledger_id?: string | null
          pay_method: string
          pay_ref?: string
          received_at?: string
          sold_at: string
          tendered_cents?: number
          total_cents: number
        }
        Update: {
          change_cents?: number
          clerk?: string
          client_id?: string
          discount_cents?: number
          event_id?: string | null
          gross_cents?: number
          id?: string
          ledger_id?: string | null
          pay_method?: string
          pay_ref?: string
          received_at?: string
          sold_at?: string
          tendered_cents?: number
          total_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_sales_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_sales_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          closed_at: string | null
          ends_at: string | null
          float_cents: number
          id: string
          name: string
          starts_at: string
        }
        Insert: {
          closed_at?: string | null
          ends_at?: string | null
          float_cents?: number
          id?: string
          name: string
          starts_at: string
        }
        Update: {
          closed_at?: string | null
          ends_at?: string | null
          float_cents?: number
          id?: string
          name?: string
          starts_at?: string
        }
        Relationships: []
      }
      inventory_items: {
        Row: {
          category: string
          id: string
          last_counted: string | null
          name: string
          on_hand: number
          pack_label: string
          pack_size: number | null
          par_level: number
          supplier_id: string | null
          unit: string
          updated_at: string
          use_by_days: number | null
        }
        Insert: {
          category?: string
          id: string
          last_counted?: string | null
          name: string
          on_hand?: number
          pack_label?: string
          pack_size?: number | null
          par_level?: number
          supplier_id?: string | null
          unit: string
          updated_at?: string
          use_by_days?: number | null
        }
        Update: {
          category?: string
          id?: string
          last_counted?: string | null
          name?: string
          on_hand?: number
          pack_label?: string
          pack_size?: number | null
          par_level?: number
          supplier_id?: string | null
          unit?: string
          updated_at?: string
          use_by_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          amount_cents: number
          category: string
          created_at: string
          created_by: string | null
          id: string
          kind: Database["public"]["Enums"]["ledger_kind"]
          memo: string
          occurred_at: string
          order_id: string | null
          sale_id: string | null
        }
        Insert: {
          amount_cents: number
          category: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind: Database["public"]["Enums"]["ledger_kind"]
          memo?: string
          occurred_at: string
          order_id?: string | null
          sale_id?: string | null
        }
        Update: {
          amount_cents?: number
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["ledger_kind"]
          memo?: string
          occurred_at?: string
          order_id?: string | null
          sale_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          product_id: string
          qty: number
          unit_price_cents: number
          updated_at: string
        }
        Insert: {
          id?: string
          order_id: string
          product_id: string
          qty: number
          unit_price_cents: number
          updated_at?: string
        }
        Update: {
          id?: string
          order_id?: string
          product_id?: string
          qty?: number
          unit_price_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "shop_products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          cancelled_at: string | null
          channel: string
          collected_at: string | null
          customer_name: string
          drop_id: string | null
          id: string
          notes: string
          packaging_cents: number
          pay_method: string | null
          pay_ref: string | null
          pay_state: Database["public"]["Enums"]["pay_state"]
          phone: string
          placed_at: string
          state: Database["public"]["Enums"]["order_state"]
          total_cents: number
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          channel?: string
          collected_at?: string | null
          customer_name: string
          drop_id?: string | null
          id: string
          notes?: string
          packaging_cents?: number
          pay_method?: string | null
          pay_ref?: string | null
          pay_state?: Database["public"]["Enums"]["pay_state"]
          phone: string
          placed_at?: string
          state?: Database["public"]["Enums"]["order_state"]
          total_cents?: number
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          channel?: string
          collected_at?: string | null
          customer_name?: string
          drop_id?: string | null
          id?: string
          notes?: string
          packaging_cents?: number
          pay_method?: string | null
          pay_ref?: string | null
          pay_state?: Database["public"]["Enums"]["pay_state"]
          phone?: string
          placed_at?: string
          state?: Database["public"]["Enums"]["order_state"]
          total_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_drop_id_fkey"
            columns: ["drop_id"]
            isOneToOne: false
            referencedRelation: "drops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_drop_id_fkey"
            columns: ["drop_id"]
            isOneToOne: false
            referencedRelation: "shop_drops"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          description: string
          id: string
          image_path: string
          kind: string
          name: string
          price_cents: number
          published: boolean
          short_name: string
          sort_order: number
          tag: string
        }
        Insert: {
          active?: boolean
          description?: string
          id: string
          image_path?: string
          kind: string
          name: string
          price_cents: number
          published?: boolean
          short_name: string
          sort_order?: number
          tag?: string
        }
        Update: {
          active?: boolean
          description?: string
          id?: string
          image_path?: string
          kind?: string
          name?: string
          price_cents?: number
          published?: boolean
          short_name?: string
          sort_order?: number
          tag?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          display_name: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_name: string
          id: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          active?: boolean
          created_at?: string
          display_name?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          count: number
          key: string
          window_start: string
        }
        Insert: {
          count?: number
          key: string
          window_start: string
        }
        Update: {
          count?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      recipe_ingredients: {
        Row: {
          id: string
          item_name: string
          product_id: string
          qty: number
          unit: string
        }
        Insert: {
          id?: string
          item_name: string
          product_id: string
          qty: number
          unit: string
        }
        Update: {
          id?: string
          item_name?: string
          product_id?: string
          qty?: number
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["product_id"]
          },
        ]
      }
      recipes: {
        Row: {
          product_id: string
          yield_count: number
        }
        Insert: {
          product_id: string
          yield_count: number
        }
        Update: {
          product_id?: string
          yield_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "recipes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "shop_products"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          cents_value: number | null
          int_value: number | null
          key: string
          text_value: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cents_value?: number | null
          int_value?: number | null
          key: string
          text_value?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cents_value?: number | null
          int_value?: number | null
          key?: string
          text_value?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      supplier_prices: {
        Row: {
          id: string
          item_name: string
          last_bought: string
          pack_label: string
          preferred: boolean
          previous_cents: number[]
          price_cents: number
          supplier_id: string
        }
        Insert: {
          id?: string
          item_name: string
          last_bought?: string
          pack_label: string
          preferred?: boolean
          previous_cents?: number[]
          price_cents: number
          supplier_id: string
        }
        Update: {
          id?: string
          item_name?: string
          last_bought?: string
          pack_label?: string
          preferred?: boolean
          previous_cents?: number[]
          price_cents?: number
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_prices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          id: string
          name: string
          notes: string
          phone: string
          place: string
        }
        Insert: {
          id: string
          name: string
          notes?: string
          phone?: string
          place?: string
        }
        Update: {
          id?: string
          name?: string
          notes?: string
          phone?: string
          place?: string
        }
        Relationships: []
      }
    }
    Views: {
      shop_drops: {
        Row: {
          closes_at: string | null
          id: string | null
          opens_at: string | null
          pickup_at: string | null
          week_label: string | null
        }
        Insert: {
          closes_at?: string | null
          id?: string | null
          opens_at?: string | null
          pickup_at?: string | null
          week_label?: string | null
        }
        Update: {
          closes_at?: string | null
          id?: string | null
          opens_at?: string | null
          pickup_at?: string | null
          week_label?: string | null
        }
        Relationships: []
      }
      shop_products: {
        Row: {
          description: string | null
          id: string | null
          image_path: string | null
          kind: string | null
          name: string | null
          price_cents: number | null
          short_name: string | null
          sort_order: number | null
          tag: string | null
        }
        Insert: {
          description?: string | null
          id?: string | null
          image_path?: string | null
          kind?: string | null
          name?: string | null
          price_cents?: number | null
          short_name?: string | null
          sort_order?: number | null
          tag?: string | null
        }
        Update: {
          description?: string | null
          id?: string | null
          image_path?: string | null
          kind?: string | null
          name?: string | null
          price_cents?: number | null
          short_name?: string | null
          sort_order?: number | null
          tag?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      anonymise_customer: {
        Args: { p_note?: string; p_phone: string }
        Returns: number
      }
      bff_session_acquire_refresh: {
        Args: { p_session_hash: string }
        Returns: {
          p_credential_envelope: string
          p_credentials_version: number
          p_lease_until: string
          p_next_credentials_version: number
          p_provider_session_id: string
          p_refresh_fence: number
          p_user_id: string
        }[]
      }
      bff_session_begin_revoke: {
        Args: { p_session_hash: string }
        Returns: {
          p_credential_envelope: string
          p_credentials_version: number
          p_provider_session_id: string
          p_refresh_fence: number
          p_user_id: string
        }[]
      }
      bff_session_claim_cleanup: {
        Args: { p_limit: number }
        Returns: {
          p_credential_envelope: string
          p_credentials_version: number
          p_provider_session_id: string
          p_refresh_fence: number
          p_session_hash: string
          p_user_id: string
        }[]
      }
      bff_session_complete_cleanup: {
        Args: { p_refresh_fence: number; p_session_hash: string }
        Returns: {
          p_completed_at: string
        }[]
      }
      bff_session_complete_if_provider_absent: {
        Args: {
          p_provider_session_id: string
          p_refresh_fence: number
          p_session_hash: string
          p_user_id: string
        }
        Returns: {
          p_completed_at: string
        }[]
      }
      bff_session_create: {
        Args: {
          p_credential_envelope: string
          p_csrf_token: string
          p_provider_session_id: string
          p_session_hash: string
          p_user_id: string
        }
        Returns: {
          p_csrf_token_out: string
          p_expires_at: number
          p_role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      bff_session_finalize_refresh: {
        Args: {
          p_credential_envelope: string
          p_next_credentials_version: number
          p_provider_session_id: string
          p_refresh_fence: number
          p_session_hash: string
          p_user_id: string
        }
        Returns: {
          p_csrf_token: string
          p_expires_at: number
          p_role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      bff_session_read: {
        Args: { p_session_hash: string }
        Returns: {
          p_csrf_token: string
          p_expires_at: number
          p_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }[]
      }
      bff_session_save_cleanup_rotation: {
        Args: {
          p_credential_envelope: string
          p_credentials_version: number
          p_next_credentials_version: number
          p_provider_session_id: string
          p_refresh_fence: number
          p_session_hash: string
          p_user_id: string
        }
        Returns: {
          p_saved_credentials_version: number
        }[]
      }
      capacity_allows: {
        Args: { p_capacity: number; p_committed: number; p_requested: number }
        Returns: boolean
      }
      consume_rate_limit: {
        Args: { p_key: string; p_limit: number; p_window_s: number }
        Returns: {
          allowed: boolean
          remaining: number
          reset_at: string
        }[]
      }
      current_role_name: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      drop_remaining: { Args: { p_drop_id: string }; Returns: number }
      get_operating_settings: {
        Args: never
        Returns: {
          cents_value: number
          int_value: number
          is_default: boolean
          key: string
          text_value: string
          updated_at: string
        }[]
      }
      get_settings: {
        Args: never
        Returns: {
          cents_value: number
          int_value: number
          is_default: boolean
          key: string
          text_value: string
          updated_at: string
        }[]
      }
      is_owner: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      lookup_order: {
        Args: { p_order_id: string; p_phone: string }
        Returns: {
          customer_name: string
          id: string
          pay_state: Database["public"]["Enums"]["pay_state"]
          pickup_at: string
          placed_at: string
          state: Database["public"]["Enums"]["order_state"]
          total_cents: number
        }[]
      }
      prune_personal_data: { Args: { p_retain_days?: number }; Returns: number }
      prune_rate_limits: { Args: never; Returns: number }
      save_setting: {
        Args: { p_expected_updated_at: string; p_key: string; p_value: Json }
        Returns: {
          key: string
          updated_at: string
        }[]
      }
      settings_effective: {
        Args: never
        Returns: {
          cents_value: number
          int_value: number
          is_default: boolean
          key: string
          text_value: string
        }[]
      }
      state_is_recognised: {
        Args: { p_state: Database["public"]["Enums"]["order_state"] }
        Returns: boolean
      }
      state_reserves_capacity: {
        Args: { p_state: Database["public"]["Enums"]["order_state"] }
        Returns: boolean
      }
      sync_event_sale: {
        Args: { p_sale: Json }
        Returns: {
          client_id: string
          duplicate: boolean
          sale_id: string
        }[]
      }
      update_order_state: {
        Args: {
          p_order_id: string
          p_pay_ref?: string
          p_pay_state?: string
          p_seen_at: string
          p_state?: string
        }
        Returns: {
          id: string
          pay_state: string
          state: string
          updated_at: string
        }[]
      }
    }
    Enums: {
      app_role: "owner" | "helper" | "support"
      ledger_kind: "sale" | "cost" | "adjustment"
      order_state:
        | "Payment review"
        | "Confirmed"
        | "Preparing"
        | "Ready"
        | "Completed"
        | "Cancelled"
        | "No-show"
      pay_state: "unpaid" | "claimed" | "confirmed" | "refunded"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "helper", "support"],
      ledger_kind: ["sale", "cost", "adjustment"],
      order_state: [
        "Payment review",
        "Confirmed",
        "Preparing",
        "Ready",
        "Completed",
        "Cancelled",
        "No-show",
      ],
      pay_state: ["unpaid", "claimed", "confirmed", "refunded"],
    },
  },
} as const
