export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      delivery_note_lines: {
        Row: {
          delivery_note_id: string
          id: string
          product_id: string
          quantity: number
          total: number | null
          wholesale_price: number
        }
        Insert: {
          delivery_note_id: string
          id?: string
          product_id: string
          quantity: number
          total?: number | null
          wholesale_price: number
        }
        Update: {
          delivery_note_id?: string
          id?: string
          product_id?: string
          quantity?: number
          total?: number | null
          wholesale_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "delivery_note_lines_delivery_note_id_fkey"
            columns: ["delivery_note_id"]
            isOneToOne: false
            referencedRelation: "delivery_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_note_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_notes: {
        Row: {
          created_at: string | null
          created_by: string | null
          created_date: string
          delivery_date: string
          id: string
          note_number: string
          notes: string | null
          status: string
          store_id: string
          total_amount: number | null
          total_weight: number | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          created_date?: string
          delivery_date: string
          id?: string
          note_number: string
          notes?: string | null
          status?: string
          store_id: string
          total_amount?: number | null
          total_weight?: number | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          created_date?: string
          delivery_date?: string
          id?: string
          note_number?: string
          notes?: string | null
          status?: string
          store_id?: string
          total_amount?: number | null
          total_weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_notes_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      incoming_deliveries: {
        Row: {
          created_at: string | null
          delivery_number: string
          id: string
          notes: string | null
          received_by: string | null
          received_date: string
          status: string
          supplier_id: string | null
          total_cost: number | null
          total_weight: number | null
        }
        Insert: {
          created_at?: string | null
          delivery_number: string
          id?: string
          notes?: string | null
          received_by?: string | null
          received_date?: string
          status?: string
          supplier_id?: string | null
          total_cost?: number | null
          total_weight?: number | null
        }
        Update: {
          created_at?: string | null
          delivery_number?: string
          id?: string
          notes?: string | null
          received_by?: string | null
          received_date?: string
          status?: string
          supplier_id?: string | null
          total_cost?: number | null
          total_weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "incoming_deliveries_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      incoming_delivery_lines: {
        Row: {
          batch_number: string | null
          best_before: string | null
          delivery_id: string
          id: string
          notes: string | null
          product_id: string
          quantity: number
          total_cost: number | null
          unit_cost: number
        }
        Insert: {
          batch_number?: string | null
          best_before?: string | null
          delivery_id: string
          id?: string
          notes?: string | null
          product_id: string
          quantity: number
          total_cost?: number | null
          unit_cost: number
        }
        Update: {
          batch_number?: string | null
          best_before?: string | null
          delivery_id?: string
          id?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          total_cost?: number | null
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "incoming_delivery_lines_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "incoming_deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incoming_delivery_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      price_history: {
        Row: {
          changed_by: string | null
          cost_price: number | null
          created_at: string | null
          id: string
          product_id: string
          reason: string | null
          retail_suggested: number | null
          wholesale_price: number | null
        }
        Insert: {
          changed_by?: string | null
          cost_price?: number | null
          created_at?: string | null
          id?: string
          product_id: string
          reason?: string | null
          retail_suggested?: number | null
          wholesale_price?: number | null
        }
        Update: {
          changed_by?: string | null
          cost_price?: number | null
          created_at?: string | null
          id?: string
          product_id?: string
          reason?: string | null
          retail_suggested?: number | null
          wholesale_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "price_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      production_batches: {
        Row: {
          batch_number: string
          created_at: string | null
          description: string | null
          end_time: string | null
          id: string
          notes: string | null
          operator: string | null
          planned_date: string
          product_id: string
          quantity: number
          start_time: string | null
          status: string
          unit: string | null
          waste_kg: number | null
        }
        Insert: {
          batch_number: string
          created_at?: string | null
          description?: string | null
          end_time?: string | null
          id?: string
          notes?: string | null
          operator?: string | null
          planned_date?: string
          product_id: string
          quantity: number
          start_time?: string | null
          status?: string
          unit?: string | null
          waste_kg?: number | null
        }
        Update: {
          batch_number?: string
          created_at?: string | null
          description?: string | null
          end_time?: string | null
          id?: string
          notes?: string | null
          operator?: string | null
          planned_date?: string
          product_id?: string
          quantity?: number
          start_time?: string | null
          status?: string
          unit?: string | null
          waste_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "production_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean | null
          category: string
          cost_price: number
          created_at: string | null
          hs_code: string | null
          id: string
          name: string
          origin: string | null
          retail_suggested: number | null
          sku: string
          stock: number
          supplier_id: string | null
          unit: string
          updated_at: string | null
          weight_per_piece: number | null
          wholesale_price: number
        }
        Insert: {
          active?: boolean | null
          category: string
          cost_price?: number
          created_at?: string | null
          hs_code?: string | null
          id?: string
          name: string
          origin?: string | null
          retail_suggested?: number | null
          sku: string
          stock?: number
          supplier_id?: string | null
          unit?: string
          updated_at?: string | null
          weight_per_piece?: number | null
          wholesale_price?: number
        }
        Update: {
          active?: boolean | null
          category?: string
          cost_price?: number
          created_at?: string | null
          hs_code?: string | null
          id?: string
          name?: string
          origin?: string | null
          retail_suggested?: number | null
          sku?: string
          stock?: number
          supplier_id?: string | null
          unit?: string
          updated_at?: string | null
          weight_per_piece?: number | null
          wholesale_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_order_lines: {
        Row: {
          category_section: string | null
          delivery_date: string | null
          deviation: string | null
          id: string
          order_date: string | null
          ordered_elsewhere: string | null
          product_id: string
          quantity_delivered: number | null
          quantity_ordered: number
          shop_order_id: string
          status: string | null
          unit: string | null
        }
        Insert: {
          category_section?: string | null
          delivery_date?: string | null
          deviation?: string | null
          id?: string
          order_date?: string | null
          ordered_elsewhere?: string | null
          product_id: string
          quantity_delivered?: number | null
          quantity_ordered?: number
          shop_order_id: string
          status?: string | null
          unit?: string | null
        }
        Update: {
          category_section?: string | null
          delivery_date?: string | null
          deviation?: string | null
          id?: string
          order_date?: string | null
          ordered_elsewhere?: string | null
          product_id?: string
          quantity_delivered?: number | null
          quantity_ordered?: number
          shop_order_id?: string
          status?: string | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shop_order_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_order_lines_shop_order_id_fkey"
            columns: ["shop_order_id"]
            isOneToOne: false
            referencedRelation: "shop_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_orders: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          notes: string | null
          order_week: string
          status: string
          store_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          order_week: string
          status?: string
          store_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          order_week?: string
          status?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          address: string | null
          city: string
          created_at: string | null
          hours: string | null
          id: string
          is_wholesale: boolean | null
          manager: string | null
          name: string
          phone: string | null
          sqm: number | null
        }
        Insert: {
          address?: string | null
          city: string
          created_at?: string | null
          hours?: string | null
          id?: string
          is_wholesale?: boolean | null
          manager?: string | null
          name: string
          phone?: string | null
          sqm?: number | null
        }
        Update: {
          address?: string | null
          city?: string
          created_at?: string | null
          hours?: string | null
          id?: string
          is_wholesale?: boolean | null
          manager?: string | null
          name?: string
          phone?: string | null
          sqm?: number | null
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          contact_person: string | null
          country: string | null
          created_at: string | null
          email: string | null
          id: string
          name: string
          phone: string | null
        }
        Insert: {
          contact_person?: string | null
          country?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name: string
          phone?: string | null
        }
        Update: {
          contact_person?: string | null
          country?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
