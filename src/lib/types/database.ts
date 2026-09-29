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
      event_expenses: {
        Row: {
          amount_cents: number
          category: string
          client_id: string
          event_id: string
          label: string
          ledger_id: string | null
          payload_hash: string
          received_at: string
          spent_at: string
        }
        Insert: {
          amount_cents: number
          category: string
          client_id: string
          event_id: string
          label: string
          ledger_id?: string | null
          payload_hash: string
          received_at?: string
          spent_at: string
        }
        Update: {
          amount_cents?: number
          category?: string
          client_id?: string
          event_id?: string
          label?: string
          ledger_id?: string | null
          payload_hash?: string
          received_at?: string
          spent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_expenses_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_expenses_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
        ]
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
      event_sale_voids: {
        Row: {
          client_id: string
          device_id: string
          received_at: string
          voided_at: string
        }
        Insert: {
          client_id: string
          device_id: string
          received_at?: string
          voided_at: string
        }
        Update: {
          client_id?: string
          device_id?: string
          received_at?: string
          voided_at?: string
        }
        Relationships: []
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
          payload_hash: string | null
          received_at: string
          sold_at: string
          tendered_cents: number
          total_cents: number
          voided_at: string | null
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
          payload_hash?: string | null
          received_at?: string
          sold_at: string
          tendered_cents?: number
          total_cents: number
          voided_at?: string | null
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
          payload_hash?: string | null
          received_at?: string
          sold_at?: string
          tendered_cents?: number
          total_cents?: number
          voided_at?: string | null
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
          closed_hash: string | null
          counted_cents: number | null
          drawer_float_cents: number | null
          ends_at: string | null
          float_cents: number
          former_devices: string[]
          id: string
          loaded: Json
          name: string
          opened_at: string | null
          price_snapshot: Json
          returned: Json
          selling_device: string | null
          starts_at: string
          variance_cents: number | null
        }
        Insert: {
          closed_at?: string | null
          closed_hash?: string | null
          counted_cents?: number | null
          drawer_float_cents?: number | null
          ends_at?: string | null
          float_cents?: number
          former_devices?: string[]
          id?: string
          loaded?: Json
          name: string
          opened_at?: string | null
          price_snapshot?: Json
          returned?: Json
          selling_device?: string | null
          starts_at: string
          variance_cents?: number | null
        }
        Update: {
          closed_at?: string | null
          closed_hash?: string | null
          counted_cents?: number | null
          drawer_float_cents?: number | null
          ends_at?: string | null
          float_cents?: number
          former_devices?: string[]
          id?: string
          loaded?: Json
          name?: string
          opened_at?: string | null
          price_snapshot?: Json
          returned?: Json
          selling_device?: string | null
          starts_at?: string
          variance_cents?: number | null
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
          capacity_weight: number
          id: string
          order_id: string
          product_id: string
          qty: number
          unavailable: boolean
          unit_price_cents: number
          updated_at: string
        }
        Insert: {
          capacity_weight?: number
          id?: string
          order_id: string
          product_id: string
          qty: number
          unavailable?: boolean
          unit_price_cents: number
          updated_at?: string
        }
        Update: {
          capacity_weight?: number
          id?: string
          order_id?: string
          product_id?: string
          qty?: number
          unavailable?: boolean
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
      order_rules: {
        Row: {
          campus_from: string
          campus_to: string
          id: boolean
          lead_max_days: number
          lead_min_days: number
          max_unpaid_per_phone: number
          pickup_cutoff_hour: number
          pickup_days: number[]
          pickup_from_hour: number
          unpaid_hold_hours: number
          updated_at: string
        }
        Insert: {
          campus_from?: string
          campus_to?: string
          id?: boolean
          lead_max_days?: number
          lead_min_days?: number
          max_unpaid_per_phone?: number
          pickup_cutoff_hour?: number
          pickup_days?: number[]
          pickup_from_hour?: number
          unpaid_hold_hours?: number
          updated_at?: string
        }
        Update: {
          campus_from?: string
          campus_to?: string
          id?: boolean
          lead_max_days?: number
          lead_min_days?: number
          max_unpaid_per_phone?: number
          pickup_cutoff_hour?: number
          pickup_days?: number[]
          pickup_from_hour?: number
          unpaid_hold_hours?: number
          updated_at?: string
        }
        Relationships: []
      }
      order_swaps: {
        Row: {
          client_id: string
          from_product: string
          id: string
          order_id: string
          price_delta_cents: number
          qty: number
          swapped_at: string
          to_product: string
        }
        Insert: {
          client_id: string
          from_product: string
          id?: string
          order_id: string
          price_delta_cents: number
          qty: number
          swapped_at?: string
          to_product: string
        }
        Update: {
          client_id?: string
          from_product?: string
          id?: string
          order_id?: string
          price_delta_cents?: number
          qty?: number
          swapped_at?: string
          to_product?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_swaps_from_product_fkey"
            columns: ["from_product"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_swaps_from_product_fkey"
            columns: ["from_product"]
            isOneToOne: false
            referencedRelation: "shop_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_swaps_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_swaps_to_product_fkey"
            columns: ["to_product"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_swaps_to_product_fkey"
            columns: ["to_product"]
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
          client_id: string | null
          collected_at: string | null
          customer_name: string
          drop_id: string | null
          id: string
          ig: string
          notes: string
          packaging_cents: number
          paid_cents: number | null
          pay_method: string | null
          pay_ref: string | null
          pay_state: Database["public"]["Enums"]["pay_state"]
          payload_hash: string | null
          phone: string
          pickup_date: string | null
          pickup_window: string | null
          placed_at: string
          refund_ref: string | null
          state: Database["public"]["Enums"]["order_state"]
          status_token: string | null
          total_cents: number
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          channel?: string
          client_id?: string | null
          collected_at?: string | null
          customer_name: string
          drop_id?: string | null
          id: string
          ig?: string
          notes?: string
          packaging_cents?: number
          paid_cents?: number | null
          pay_method?: string | null
          pay_ref?: string | null
          pay_state?: Database["public"]["Enums"]["pay_state"]
          payload_hash?: string | null
          phone: string
          pickup_date?: string | null
          pickup_window?: string | null
          placed_at?: string
          refund_ref?: string | null
          state?: Database["public"]["Enums"]["order_state"]
          status_token?: string | null
          total_cents?: number
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          channel?: string
          client_id?: string | null
          collected_at?: string | null
          customer_name?: string
          drop_id?: string | null
          id?: string
          ig?: string
          notes?: string
          packaging_cents?: number
          paid_cents?: number | null
          pay_method?: string | null
          pay_ref?: string | null
          pay_state?: Database["public"]["Enums"]["pay_state"]
          payload_hash?: string | null
          phone?: string
          pickup_date?: string | null
          pickup_window?: string | null
          placed_at?: string
          refund_ref?: string | null
          state?: Database["public"]["Enums"]["order_state"]
          status_token?: string | null
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
      payment_methods: {
        Row: {
          account_name: string
          account_number: string
          active: boolean
          id: string
          label: string
          qr_path: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          account_name?: string
          account_number?: string
          active?: boolean
          id: string
          label: string
          qr_path?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          account_name?: string
          account_number?: string
          active?: boolean
          id?: string
          label?: string
          qr_path?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          active: boolean
          allergens: string
          capacity_weight: number
          description: string
          id: string
          image_path: string
          item_type: string
          kind: string
          name: string
          price_cents: number
          published: boolean
          short_name: string
          sort_order: number
          tag: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          allergens?: string
          capacity_weight?: number
          description?: string
          id: string
          image_path?: string
          item_type?: string
          kind: string
          name: string
          price_cents: number
          published?: boolean
          short_name: string
          sort_order?: number
          tag?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          allergens?: string
          capacity_weight?: number
          description?: string
          id?: string
          image_path?: string
          item_type?: string
          kind?: string
          name?: string
          price_cents?: number
          published?: boolean
          short_name?: string
          sort_order?: number
          tag?: string
          updated_at?: string
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
          json_value: Json | null
          key: string
          text_value: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cents_value?: number | null
          int_value?: number | null
          json_value?: Json | null
          key: string
          text_value?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cents_value?: number | null
          int_value?: number | null
          json_value?: Json | null
          key?: string
          text_value?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      shop_texts: {
        Row: {
          allergen_note: string
          id: boolean
          invoice_note: string
          registration_badge: string
          tin_line: string
          updated_at: string
        }
        Insert: {
          allergen_note?: string
          id?: boolean
          invoice_note?: string
          registration_badge?: string
          tin_line?: string
          updated_at?: string
        }
        Update: {
          allergen_note?: string
          id?: boolean
          invoice_note?: string
          registration_badge?: string
          tin_line?: string
          updated_at?: string
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
      waitlist_entries: {
        Row: {
          client_id: string
          contacted_at: string | null
          created_at: string
          id: string
          ig: string
          name: string
          payload_hash: string
          phone: string
          wanted_date: string
        }
        Insert: {
          client_id: string
          contacted_at?: string | null
          created_at?: string
          id?: string
          ig?: string
          name: string
          payload_hash: string
          phone: string
          wanted_date: string
        }
        Update: {
          client_id?: string
          contacted_at?: string | null
          created_at?: string
          id?: string
          ig?: string
          name?: string
          payload_hash?: string
          phone?: string
          wanted_date?: string
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
          allergens: string | null
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
          allergens?: string | null
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
          allergens?: string | null
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
      add_event_expense: {
        Args: { p_expense: Json }
        Returns: {
          client_id: string
          duplicate: boolean
        }[]
      }
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
      close_event: {
        Args: { p_close: Json }
        Returns: {
          cash_expected_cents: number
          closed: boolean
          cookies_sold: number
          counted_cents: number
          event_id: string
          expenses_cents: number
          float_cents: number
          freebie_count: number
          loaded: Json
          name: string
          profit_cents: number
          returned: Json
          revenue_cents: number
          sales_count: number
          variance_cents: number
          voided_count: number
        }[]
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
      event_summary: {
        Args: { p_event: string }
        Returns: {
          cash_expected_cents: number
          closed: boolean
          cookies_sold: number
          counted_cents: number
          event_id: string
          expenses_cents: number
          float_cents: number
          freebie_count: number
          loaded: Json
          name: string
          profit_cents: number
          returned: Json
          revenue_cents: number
          sales_count: number
          variance_cents: number
          voided_count: number
        }[]
      }
      find_order: {
        Args: { p_order_no: string; p_phone: string }
        Returns: string
      }
      get_flavours: {
        Args: never
        Returns: {
          active: boolean
          allergens: string
          capacity_weight: number
          description: string
          id: string
          image_path: string
          item_type: string
          kind: string
          name: string
          price_cents: number
          published: boolean
          short_name: string
          sort_order: number
          tag: string
          updated_at: string
        }[]
      }
      get_operating_settings: {
        Args: never
        Returns: {
          cents_value: number
          int_value: number
          is_default: boolean
          json_value: Json
          key: string
          text_value: string
          updated_at: string
        }[]
      }
      get_order_rules: {
        Args: never
        Returns: {
          campus_from: string
          campus_to: string
          lead_max_days: number
          lead_min_days: number
          max_unpaid_per_phone: number
          pickup_cutoff_hour: number
          pickup_days: number[]
          pickup_from_hour: number
          unpaid_hold_hours: number
          updated_at: string
        }[]
      }
      get_payment_methods: {
        Args: never
        Returns: {
          account_name: string
          account_number: string
          active: boolean
          id: string
          label: string
          qr_path: string
          sort_order: number
          updated_at: string
        }[]
      }
      get_settings: {
        Args: never
        Returns: {
          cents_value: number
          int_value: number
          is_default: boolean
          json_value: Json
          key: string
          text_value: string
          updated_at: string
        }[]
      }
      get_shop_order_rules: { Args: never; Returns: Json }
      get_shop_payment_info: { Args: never; Returns: Json }
      get_staff_orders: { Args: never; Returns: Json }
      is_owner: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      join_waitlist: {
        Args: { p_entry: Json }
        Returns: {
          replayed: boolean
          waitlist_id: string
        }[]
      }
      load_event_stock: {
        Args: { p_event: string; p_float_cents: number; p_loaded: Json }
        Returns: {
          event_id: string
          float_cents: number
          loaded: Json
          opened_at: string
        }[]
      }
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
      order_holds_capacity: {
        Args: {
          p_hold_hours: number
          p_now: string
          p_pay: Database["public"]["Enums"]["pay_state"]
          p_placed_at: string
          p_state: Database["public"]["Enums"]["order_state"]
        }
        Returns: boolean
      }
      order_status: { Args: { p_token: string }; Returns: Json }
      place_order: {
        Args: { p_order: Json }
        Returns: {
          order_no: string
          pickup_date: string
          pickup_window: string
          replayed: boolean
          status_token: string
          total_cents: number
        }[]
      }
      prune_personal_data: { Args: { p_retain_days?: number }; Returns: number }
      prune_rate_limits: { Args: never; Returns: number }
      publish_flavours: {
        Args: { p_ids: string[] }
        Returns: {
          id: string
          published: boolean
          updated_at: string
        }[]
      }
      record_event_sale: {
        Args: { p_sale: Json }
        Returns: {
          client_id: string
          duplicate: boolean
          sale_id: string
          voided: boolean
        }[]
      }
      save_flavour: {
        Args: { p_expected_updated_at: string; p_flavour: Json; p_id: string }
        Returns: {
          id: string
          updated_at: string
        }[]
      }
      save_order_rules: {
        Args: { p_expected_updated_at: string; p_rules: Json }
        Returns: {
          updated_at: string
        }[]
      }
      save_payment_method: {
        Args: { p_expected_updated_at: string; p_id: string; p_method: Json }
        Returns: {
          id: string
          updated_at: string
        }[]
      }
      save_setting: {
        Args: { p_expected_updated_at: string; p_key: string; p_value: Json }
        Returns: {
          key: string
          updated_at: string
        }[]
      }
      save_shop_texts: {
        Args: { p_expected_updated_at: string; p_texts: Json }
        Returns: {
          updated_at: string
        }[]
      }
      set_event_device: {
        Args: { p_device: string; p_event: string }
        Returns: string
      }
      settings_effective: {
        Args: never
        Returns: {
          cents_value: number
          int_value: number
          is_default: boolean
          json_value: Json
          key: string
          text_value: string
        }[]
      }
      staff_confirm_payment: {
        Args: {
          p_expected_updated_at: string
          p_force?: boolean
          p_order_id: string
        }
        Returns: {
          order_id: string
          paid_cents: number
          pay_state: Database["public"]["Enums"]["pay_state"]
          replayed: boolean
          state: Database["public"]["Enums"]["order_state"]
          total_cents: number
          updated_at: string
        }[]
      }
      staff_flag_item: {
        Args: {
          p_expected_updated_at: string
          p_flagged: boolean
          p_order_id: string
          p_product_id: string
        }
        Returns: {
          order_id: string
          paid_cents: number
          pay_state: Database["public"]["Enums"]["pay_state"]
          replayed: boolean
          state: Database["public"]["Enums"]["order_state"]
          total_cents: number
          updated_at: string
        }[]
      }
      staff_refund: {
        Args: {
          p_expected_updated_at: string
          p_order_id: string
          p_ref: string
        }
        Returns: {
          order_id: string
          paid_cents: number
          pay_state: Database["public"]["Enums"]["pay_state"]
          replayed: boolean
          state: Database["public"]["Enums"]["order_state"]
          total_cents: number
          updated_at: string
        }[]
      }
      staff_reject_payment: {
        Args: { p_expected_updated_at: string; p_order_id: string }
        Returns: {
          order_id: string
          paid_cents: number
          pay_state: Database["public"]["Enums"]["pay_state"]
          replayed: boolean
          state: Database["public"]["Enums"]["order_state"]
          total_cents: number
          updated_at: string
        }[]
      }
      staff_reopen_order: {
        Args: { p_expected_updated_at: string; p_order_id: string }
        Returns: {
          order_id: string
          paid_cents: number
          pay_state: Database["public"]["Enums"]["pay_state"]
          replayed: boolean
          state: Database["public"]["Enums"]["order_state"]
          total_cents: number
          updated_at: string
        }[]
      }
      staff_set_status: {
        Args: {
          p_expected_updated_at: string
          p_order_id: string
          p_to: Database["public"]["Enums"]["order_state"]
        }
        Returns: {
          order_id: string
          paid_cents: number
          pay_state: Database["public"]["Enums"]["pay_state"]
          replayed: boolean
          state: Database["public"]["Enums"]["order_state"]
          total_cents: number
          updated_at: string
        }[]
      }
      staff_settle_balance: {
        Args: { p_expected_updated_at: string; p_order_id: string }
        Returns: {
          order_id: string
          paid_cents: number
          pay_state: Database["public"]["Enums"]["pay_state"]
          replayed: boolean
          state: Database["public"]["Enums"]["order_state"]
          total_cents: number
          updated_at: string
        }[]
      }
      staff_swap_item: {
        Args: {
          p_client_id: string
          p_expected_updated_at: string
          p_from_product: string
          p_order_id: string
          p_to_product: string
        }
        Returns: {
          order_id: string
          paid_cents: number
          pay_state: Database["public"]["Enums"]["pay_state"]
          replayed: boolean
          state: Database["public"]["Enums"]["order_state"]
          total_cents: number
          updated_at: string
        }[]
      }
      start_event: {
        Args: {
          p_device: string
          p_event_id?: string
          p_float_cents?: number
          p_name: string
        }
        Returns: {
          event_id: string
          prices: Json
          selling_device: string
          starts_at: string
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
      void_event_sale: {
        Args: { p_void: Json }
        Returns: {
          client_id: string
          duplicate: boolean
          sale_known: boolean
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
