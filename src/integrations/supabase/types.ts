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
      about_us_settings: {
        Row: {
          hero_description: string | null
          hero_subtitle: string | null
          hero_title: string | null
          id: string
          mission_text: string | null
          team_json: Json | null
          updated_at: string
          values_json: Json | null
        }
        Insert: {
          hero_description?: string | null
          hero_subtitle?: string | null
          hero_title?: string | null
          id?: string
          mission_text?: string | null
          team_json?: Json | null
          updated_at?: string
          values_json?: Json | null
        }
        Update: {
          hero_description?: string | null
          hero_subtitle?: string | null
          hero_title?: string | null
          id?: string
          mission_text?: string | null
          team_json?: Json | null
          updated_at?: string
          values_json?: Json | null
        }
        Relationships: []
      }
      activity_logs: {
        Row: {
          action_type: string
          created_at: string
          description: string
          details: Json | null
          entity_id: string | null
          entity_type: string | null
          id: string
          performed_by: string | null
          portal: string
          store_id: string | null
        }
        Insert: {
          action_type: string
          created_at?: string
          description: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          performed_by?: string | null
          portal?: string
          store_id?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string
          description?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          performed_by?: string | null
          portal?: string
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          address: string | null
          city: string | null
          contact_email: string | null
          contact_person: string | null
          country: string
          created_at: string
          description: string | null
          description_long: string | null
          employee_count: string | null
          founded_year: number | null
          iban: string | null
          id: string
          industry: string | null
          logo_url: string | null
          name: string
          revenue_range: string | null
          status: string
          ticker: string | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          contact_email?: string | null
          contact_person?: string | null
          country?: string
          created_at?: string
          description?: string | null
          description_long?: string | null
          employee_count?: string | null
          founded_year?: number | null
          iban?: string | null
          id?: string
          industry?: string | null
          logo_url?: string | null
          name: string
          revenue_range?: string | null
          status?: string
          ticker?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          contact_email?: string | null
          contact_person?: string | null
          country?: string
          created_at?: string
          description?: string | null
          description_long?: string | null
          employee_count?: string | null
          founded_year?: number | null
          iban?: string | null
          id?: string
          industry?: string | null
          logo_url?: string | null
          name?: string
          revenue_range?: string | null
          status?: string
          ticker?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      company_documents: {
        Row: {
          company_id: string
          document_type: string | null
          file_name: string
          file_size_bytes: number | null
          file_url: string
          id: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          company_id: string
          document_type?: string | null
          file_name: string
          file_size_bytes?: number | null
          file_url: string
          id?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          company_id?: string
          document_type?: string | null
          file_name?: string
          file_size_bytes?: number | null
          file_url?: string
          id?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_settings: {
        Row: {
          additional_info: string | null
          address: string | null
          email: string | null
          id: string
          opening_hours: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          additional_info?: string | null
          address?: string | null
          email?: string | null
          id?: string
          opening_hours?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          additional_info?: string | null
          address?: string | null
          email?: string | null
          id?: string
          opening_hours?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      currency_settings: {
        Row: {
          id: string
          sek_to_chf: number
          transport_chf_per_kg: number
          updated_at: string
        }
        Insert: {
          id?: string
          sek_to_chf?: number
          transport_chf_per_kg?: number
          updated_at?: string
        }
        Update: {
          id?: string
          sek_to_chf?: number
          transport_chf_per_kg?: number
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          city: string | null
          contact_person: string | null
          created_at: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          store_id: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          contact_person?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          store_id?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          contact_person?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      deleted_stock_log: {
        Row: {
          deleted_at: string
          deleted_by: string | null
          id: string
          location_id: string
          product_id: string
          quantity: number
          reason: string
        }
        Insert: {
          deleted_at?: string
          deleted_by?: string | null
          id?: string
          location_id: string
          product_id: string
          quantity?: number
          reason: string
        }
        Update: {
          deleted_at?: string
          deleted_by?: string | null
          id?: string
          location_id?: string
          product_id?: string
          quantity?: number
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "deleted_stock_log_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "storage_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deleted_stock_log_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
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
      delivery_receiving_reports: {
        Row: {
          id: string
          notes: string | null
          order_line_id: string
          quantity_received: number | null
          report_type: string | null
          reported_at: string
          reported_by: string | null
          shop_order_id: string
          status: string
          store_id: string
        }
        Insert: {
          id?: string
          notes?: string | null
          order_line_id: string
          quantity_received?: number | null
          report_type?: string | null
          reported_at?: string
          reported_by?: string | null
          shop_order_id: string
          status?: string
          store_id: string
        }
        Update: {
          id?: string
          notes?: string | null
          order_line_id?: string
          quantity_received?: number | null
          report_type?: string | null
          reported_at?: string
          reported_by?: string | null
          shop_order_id?: string
          status?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_receiving_reports_order_line_id_fkey"
            columns: ["order_line_id"]
            isOneToOne: false
            referencedRelation: "shop_order_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_receiving_reports_shop_order_id_fkey"
            columns: ["shop_order_id"]
            isOneToOne: false
            referencedRelation: "shop_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_receiving_reports_store_id_fkey"
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
      inventory_report_lines: {
        Row: {
          category: string | null
          cost_price: number
          id: string
          line_value: number
          product_id: string
          product_name: string
          quantity: number
          report_id: string
          sku: string | null
          unit: string | null
        }
        Insert: {
          category?: string | null
          cost_price?: number
          id?: string
          line_value?: number
          product_id: string
          product_name: string
          quantity?: number
          report_id: string
          sku?: string | null
          unit?: string | null
        }
        Update: {
          category?: string | null
          cost_price?: number
          id?: string
          line_value?: number
          product_id?: string
          product_name?: string
          quantity?: number
          report_id?: string
          sku?: string | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_report_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_report_lines_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "inventory_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_reports: {
        Row: {
          id: string
          line_count: number
          location_id: string | null
          location_name: string | null
          notes: string | null
          reported_at: string
          reported_by: string | null
          store_id: string
          total_value: number
        }
        Insert: {
          id?: string
          line_count?: number
          location_id?: string | null
          location_name?: string | null
          notes?: string | null
          reported_at?: string
          reported_by?: string | null
          store_id: string
          total_value?: number
        }
        Update: {
          id?: string
          line_count?: number
          location_id?: string | null
          location_name?: string | null
          notes?: string | null
          reported_at?: string
          reported_by?: string | null
          store_id?: string
          total_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_reports_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "storage_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reports_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      investor_profiles: {
        Row: {
          account_type: string
          address: string | null
          base_currency: string
          country: string | null
          created_at: string
          date_of_birth: string | null
          email: string
          first_name: string
          iban: string | null
          id: string
          investor_classification: string | null
          kyc_completed: boolean
          last_name: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          suitability_passed: boolean
          telephone: string | null
          user_id: string
          verification_status: string
        }
        Insert: {
          account_type?: string
          address?: string | null
          base_currency?: string
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          email: string
          first_name: string
          iban?: string | null
          id?: string
          investor_classification?: string | null
          kyc_completed?: boolean
          last_name: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          suitability_passed?: boolean
          telephone?: string | null
          user_id: string
          verification_status?: string
        }
        Update: {
          account_type?: string
          address?: string | null
          base_currency?: string
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string
          first_name?: string
          iban?: string | null
          id?: string
          investor_classification?: string | null
          kyc_completed?: boolean
          last_name?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          suitability_passed?: boolean
          telephone?: string | null
          user_id?: string
          verification_status?: string
        }
        Relationships: []
      }
      manual_schedule_entries: {
        Row: {
          created_at: string
          departure_date: string
          departure_time: string
          id: string
          notes: string | null
          product_id: string
          quantity: number
          schedule_type: string
        }
        Insert: {
          created_at?: string
          departure_date: string
          departure_time?: string
          id?: string
          notes?: string | null
          product_id: string
          quantity?: number
          schedule_type?: string
        }
        Update: {
          created_at?: string
          departure_date?: string
          departure_time?: string
          id?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          schedule_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_schedule_entries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      map_settings: {
        Row: {
          center_latitude: number
          center_longitude: number
          id: string
          scale: number
          updated_at: string
        }
        Insert: {
          center_latitude?: number
          center_longitude?: number
          id?: string
          scale?: number
          updated_at?: string
        }
        Update: {
          center_latitude?: number
          center_longitude?: number
          id?: string
          scale?: number
          updated_at?: string
        }
        Relationships: []
      }
      meeting_protocol_items: {
        Row: {
          assigned_to: string | null
          calendar_event_id: string | null
          completed: boolean
          content: string
          deadline: string | null
          id: string
          protocol_id: string
          sort_order: number
        }
        Insert: {
          assigned_to?: string | null
          calendar_event_id?: string | null
          completed?: boolean
          content?: string
          deadline?: string | null
          id?: string
          protocol_id: string
          sort_order?: number
        }
        Update: {
          assigned_to?: string | null
          calendar_event_id?: string | null
          completed?: boolean
          content?: string
          deadline?: string | null
          id?: string
          protocol_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "meeting_protocol_items_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_protocol_items_protocol_id_fkey"
            columns: ["protocol_id"]
            isOneToOne: false
            referencedRelation: "meeting_protocols"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_protocols: {
        Row: {
          attendees: string | null
          created_at: string
          id: string
          meeting_date: string
          notes: string | null
          store_id: string
          title: string
        }
        Insert: {
          attendees?: string | null
          created_at?: string
          id?: string
          meeting_date?: string
          notes?: string | null
          store_id: string
          title?: string
        }
        Update: {
          attendees?: string | null
          created_at?: string
          id?: string
          meeting_date?: string
          notes?: string | null
          store_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_protocols_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          funds_received: boolean
          id: string
          investment_confirmed: boolean
          new_opportunity: boolean
          payout_approaching: boolean
          payout_completed: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          funds_received?: boolean
          id?: string
          investment_confirmed?: boolean
          new_opportunity?: boolean
          payout_approaching?: boolean
          payout_completed?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          funds_received?: boolean
          id?: string
          investment_confirmed?: boolean
          new_opportunity?: boolean
          payout_approaching?: boolean
          payout_completed?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          is_read: boolean
          message: string
          portal: string
          store_id: string | null
          target_page: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean
          message: string
          portal?: string
          store_id?: string | null
          target_page: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean
          message?: string
          portal?: string
          store_id?: string | null
          target_page?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_documents: {
        Row: {
          file_name: string
          file_size_bytes: number | null
          file_url: string
          id: string
          is_current: boolean
          offer_id: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          file_name: string
          file_size_bytes?: number | null
          file_url: string
          id?: string
          is_current?: boolean
          offer_id: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          file_name?: string
          file_size_bytes?: number | null
          file_url?: string
          id?: string
          is_current?: boolean
          offer_id?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offer_documents_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "trade_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          admin_user_id: string | null
          created_at: string
          event_type: string
          id: string
          notes: string | null
          pledge_id: string
        }
        Insert: {
          admin_user_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          notes?: string | null
          pledge_id: string
        }
        Update: {
          admin_user_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          notes?: string | null
          pledge_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_pledge_id_fkey"
            columns: ["pledge_id"]
            isOneToOne: false
            referencedRelation: "pledges"
            referencedColumns: ["id"]
          },
        ]
      }
      pledges: {
        Row: {
          amount: number
          created_at: string
          id: string
          offer_id: string
          payment_reference: string | null
          status: string
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          offer_id: string
          payment_reference?: string | null
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          offer_id?: string
          payment_reference?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pledges_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "trade_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_settings: {
        Row: {
          display_name: string | null
          logo_url: string | null
          portal_name: string
          updated_at: string | null
        }
        Insert: {
          display_name?: string | null
          logo_url?: string | null
          portal_name: string
          updated_at?: string | null
        }
        Update: {
          display_name?: string | null
          logo_url?: string | null
          portal_name?: string
          updated_at?: string | null
        }
        Relationships: []
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
      product_stock_locations: {
        Row: {
          arrival_date: string | null
          expiry_date: string | null
          id: string
          location_id: string
          min_stock: number | null
          product_id: string
          quantity: number
          shop_order_id: string | null
          unit_cost: number | null
          updated_at: string | null
        }
        Insert: {
          arrival_date?: string | null
          expiry_date?: string | null
          id?: string
          location_id: string
          min_stock?: number | null
          product_id: string
          quantity?: number
          shop_order_id?: string | null
          unit_cost?: number | null
          updated_at?: string | null
        }
        Update: {
          arrival_date?: string | null
          expiry_date?: string | null
          id?: string
          location_id?: string
          min_stock?: number | null
          product_id?: string
          quantity?: number
          shop_order_id?: string | null
          unit_cost?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_stock_locations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "storage_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_stock_locations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_stock_locations_shop_order_id_fkey"
            columns: ["shop_order_id"]
            isOneToOne: false
            referencedRelation: "shop_orders"
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
      production_report_lines: {
        Row: {
          created_at: string | null
          id: string
          notes: string | null
          operator: string | null
          product_id: string | null
          product_name: string
          production_date: string | null
          quantity: number
          report_id: string
          status: string
          target_quantity: number | null
          unit: string | null
          yield_percent: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          notes?: string | null
          operator?: string | null
          product_id?: string | null
          product_name: string
          production_date?: string | null
          quantity?: number
          report_id: string
          status?: string
          target_quantity?: number | null
          unit?: string | null
          yield_percent?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          notes?: string | null
          operator?: string | null
          product_id?: string | null
          product_name?: string
          production_date?: string | null
          quantity?: number
          report_id?: string
          status?: string
          target_quantity?: number | null
          unit?: string | null
          yield_percent?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "production_report_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_report_lines_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "production_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      production_reports: {
        Row: {
          archived_at: string | null
          created_at: string | null
          display_name: string | null
          id: string
          notes: string | null
          report_name: string
          status: string
          total_quantity: number | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          notes?: string | null
          report_name: string
          status?: string
          total_quantity?: number | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          notes?: string | null
          report_name?: string
          status?: string
          total_quantity?: number | null
        }
        Relationships: []
      }
      products: {
        Row: {
          active: boolean | null
          barcode: string | null
          category: string
          cost_price: number
          created_at: string | null
          hs_code: string | null
          id: string
          name: string
          origin: string | null
          parent_product_id: string | null
          producer: string | null
          retail_suggested: number | null
          shelf_life_days: number | null
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
          barcode?: string | null
          category: string
          cost_price?: number
          created_at?: string | null
          hs_code?: string | null
          id?: string
          name: string
          origin?: string | null
          parent_product_id?: string | null
          producer?: string | null
          retail_suggested?: number | null
          shelf_life_days?: number | null
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
          barcode?: string | null
          category?: string
          cost_price?: number
          created_at?: string | null
          hs_code?: string | null
          id?: string
          name?: string
          origin?: string | null
          parent_product_id?: string | null
          producer?: string | null
          retail_suggested?: number | null
          shelf_life_days?: number | null
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
            foreignKeyName: "products_parent_product_id_fkey"
            columns: ["parent_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_report_lines: {
        Row: {
          created_at: string | null
          id: string
          line_total: number | null
          product_id: string | null
          product_name: string
          purchase_date: string | null
          quantity: number
          report_id: string
          status: string
          supplier_name: string | null
          unit: string | null
          unit_price: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          line_total?: number | null
          product_id?: string | null
          product_name: string
          purchase_date?: string | null
          quantity?: number
          report_id: string
          status?: string
          supplier_name?: string | null
          unit?: string | null
          unit_price?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          line_total?: number | null
          product_id?: string | null
          product_name?: string
          purchase_date?: string | null
          quantity?: number
          report_id?: string
          status?: string
          supplier_name?: string | null
          unit?: string | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_report_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_report_lines_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "purchase_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_reports: {
        Row: {
          archived_at: string | null
          created_at: string | null
          display_name: string | null
          file_name: string
          file_url: string
          id: string
          notes: string | null
          status: string
          total_amount: number | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string | null
          display_name?: string | null
          file_name: string
          file_url: string
          id?: string
          notes?: string | null
          status?: string
          total_amount?: number | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string | null
          display_name?: string | null
          file_name?: string
          file_url?: string
          id?: string
          notes?: string | null
          status?: string
          total_amount?: number | null
        }
        Relationships: []
      }
      schedule_events: {
        Row: {
          all_day: boolean
          assigned_to: string | null
          created_at: string
          created_by: string | null
          description: string | null
          end_time: string | null
          event_date: string
          event_type: string
          id: string
          is_done: boolean
          meeting_item_id: string | null
          portal: string
          recurrence_end_date: string | null
          recurrence_type: string
          severity: string
          start_time: string | null
          store_id: string | null
          title: string
        }
        Insert: {
          all_day?: boolean
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          event_date: string
          event_type?: string
          id?: string
          is_done?: boolean
          meeting_item_id?: string | null
          portal?: string
          recurrence_end_date?: string | null
          recurrence_type?: string
          severity?: string
          start_time?: string | null
          store_id?: string | null
          title: string
        }
        Update: {
          all_day?: boolean
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          event_date?: string
          event_type?: string
          id?: string
          is_done?: boolean
          meeting_item_id?: string | null
          portal?: string
          recurrence_end_date?: string | null
          recurrence_type?: string
          severity?: string
          start_time?: string | null
          store_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_events_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_events_meeting_item_id_fkey"
            columns: ["meeting_item_id"]
            isOneToOne: false
            referencedRelation: "meeting_protocol_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_events_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_order_change_requests: {
        Row: {
          change_type: string
          created_at: string
          id: string
          new_value: string
          old_value: string | null
          order_line_id: string | null
          product_id: string | null
          requested_by: string
          resolved_at: string | null
          resolved_by: string | null
          shop_order_id: string
          status: string
          unit: string | null
        }
        Insert: {
          change_type: string
          created_at?: string
          id?: string
          new_value: string
          old_value?: string | null
          order_line_id?: string | null
          product_id?: string | null
          requested_by?: string
          resolved_at?: string | null
          resolved_by?: string | null
          shop_order_id: string
          status?: string
          unit?: string | null
        }
        Update: {
          change_type?: string
          created_at?: string
          id?: string
          new_value?: string
          old_value?: string | null
          order_line_id?: string | null
          product_id?: string | null
          requested_by?: string
          resolved_at?: string | null
          resolved_by?: string | null
          shop_order_id?: string
          status?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shop_order_change_requests_order_line_id_fkey"
            columns: ["order_line_id"]
            isOneToOne: false
            referencedRelation: "shop_order_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_order_change_requests_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_order_change_requests_shop_order_id_fkey"
            columns: ["shop_order_id"]
            isOneToOne: false
            referencedRelation: "shop_orders"
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
          desired_delivery_date: string | null
          id: string
          invoice_status: string | null
          notes: string | null
          order_week: string
          packer_name: string | null
          priority: number | null
          status: string
          store_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          desired_delivery_date?: string | null
          id?: string
          invoice_status?: string | null
          notes?: string | null
          order_week: string
          packer_name?: string | null
          priority?: number | null
          status?: string
          store_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          desired_delivery_date?: string | null
          id?: string
          invoice_status?: string | null
          notes?: string | null
          order_week?: string
          packer_name?: string | null
          priority?: number | null
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
      shop_report_lines: {
        Row: {
          amount: number
          category: string
          id: string
          line_type: string
          notes: string | null
          report_id: string
        }
        Insert: {
          amount?: number
          category: string
          id?: string
          line_type: string
          notes?: string | null
          report_id: string
        }
        Update: {
          amount?: number
          category?: string
          id?: string
          line_type?: string
          notes?: string | null
          report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_report_lines_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "shop_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_reports: {
        Row: {
          closing_inventory: number
          created_at: string | null
          id: string
          notes: string | null
          opening_inventory: number
          report_month: string | null
          report_type: string
          store_id: string
          updated_at: string | null
          week_number: number | null
          year: number
        }
        Insert: {
          closing_inventory?: number
          created_at?: string | null
          id?: string
          notes?: string | null
          opening_inventory?: number
          report_month?: string | null
          report_type?: string
          store_id: string
          updated_at?: string | null
          week_number?: number | null
          year: number
        }
        Update: {
          closing_inventory?: number
          created_at?: string | null
          id?: string
          notes?: string | null
          opening_inventory?: number
          report_month?: string | null
          report_type?: string
          store_id?: string
          updated_at?: string | null
          week_number?: number | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "shop_reports_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_wishes: {
        Row: {
          archived: boolean
          category: string
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          status: string
          store_id: string
          title: string
          updated_at: string
        }
        Insert: {
          archived?: boolean
          category?: string
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          status?: string
          store_id: string
          title: string
          updated_at?: string
        }
        Update: {
          archived?: boolean
          category?: string
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          status?: string
          store_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_wishes_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          age: number | null
          created_at: string | null
          email: string | null
          first_name: string
          id: string
          last_name: string
          phone: string | null
          profile_image_url: string | null
          store_id: string | null
          workplace: string | null
        }
        Insert: {
          age?: number | null
          created_at?: string | null
          email?: string | null
          first_name: string
          id?: string
          last_name: string
          phone?: string | null
          profile_image_url?: string | null
          store_id?: string | null
          workplace?: string | null
        }
        Update: {
          age?: number | null
          created_at?: string | null
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          phone?: string | null
          profile_image_url?: string | null
          store_id?: string | null
          workplace?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_locations: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          store_id: string | null
          zone: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          store_id?: string | null
          zone?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          store_id?: string | null
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "storage_locations_store_id_fkey"
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
          logo_url: string | null
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
          logo_url?: string | null
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
          logo_url?: string | null
          manager?: string | null
          name?: string
          phone?: string | null
          sqm?: number | null
        }
        Relationships: []
      }
      suitability_responses: {
        Row: {
          id: string
          is_18_plus: boolean
          is_not_us_person: boolean
          submitted_at: string
          understands_no_deposit_guarantee: boolean
          understands_risk: boolean
          user_id: string
        }
        Insert: {
          id?: string
          is_18_plus?: boolean
          is_not_us_person?: boolean
          submitted_at?: string
          understands_no_deposit_guarantee?: boolean
          understands_risk?: boolean
          user_id: string
        }
        Update: {
          id?: string
          is_18_plus?: boolean
          is_not_us_person?: boolean
          submitted_at?: string
          understands_no_deposit_guarantee?: boolean
          understands_risk?: boolean
          user_id?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          address: string | null
          contact_person: string | null
          country: string | null
          created_at: string | null
          email: string | null
          id: string
          name: string
          phone: string | null
          supplier_type: string | null
        }
        Insert: {
          address?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          supplier_type?: string | null
        }
        Update: {
          address?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          supplier_type?: string | null
        }
        Relationships: []
      }
      trade_offers: {
        Row: {
          annual_return: number | null
          collateral: string | null
          company_iban: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          document_url: string | null
          downside: string | null
          funded_amount: number
          gross_margin: number | null
          id: string
          interest_rate: number
          ltv: number | null
          maturity_date: string
          max_pledge: number | null
          min_pledge: number | null
          origin: string | null
          payment_reference_prefix: string | null
          primary_exit: string | null
          product_id_display: string | null
          product_image_url: string | null
          published_at: string | null
          published_by: string | null
          purchase_date: string | null
          purchase_price: number | null
          quantity: number
          repayment_type: string | null
          risk_level: string | null
          risk_note: string | null
          sales_value: number | null
          secondary_exit: string | null
          sector: string | null
          status: string
          structure: string | null
          supplier_name: string | null
          target_amount: number
          tenor_days: number | null
          title: string
          updated_at: string
          visibility: string
          volume: string | null
        }
        Insert: {
          annual_return?: number | null
          collateral?: string | null
          company_iban?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          document_url?: string | null
          downside?: string | null
          funded_amount?: number
          gross_margin?: number | null
          id?: string
          interest_rate?: number
          ltv?: number | null
          maturity_date: string
          max_pledge?: number | null
          min_pledge?: number | null
          origin?: string | null
          payment_reference_prefix?: string | null
          primary_exit?: string | null
          product_id_display?: string | null
          product_image_url?: string | null
          published_at?: string | null
          published_by?: string | null
          purchase_date?: string | null
          purchase_price?: number | null
          quantity?: number
          repayment_type?: string | null
          risk_level?: string | null
          risk_note?: string | null
          sales_value?: number | null
          secondary_exit?: string | null
          sector?: string | null
          status?: string
          structure?: string | null
          supplier_name?: string | null
          target_amount?: number
          tenor_days?: number | null
          title: string
          updated_at?: string
          visibility?: string
          volume?: string | null
        }
        Update: {
          annual_return?: number | null
          collateral?: string | null
          company_iban?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          document_url?: string | null
          downside?: string | null
          funded_amount?: number
          gross_margin?: number | null
          id?: string
          interest_rate?: number
          ltv?: number | null
          maturity_date?: string
          max_pledge?: number | null
          min_pledge?: number | null
          origin?: string | null
          payment_reference_prefix?: string | null
          primary_exit?: string | null
          product_id_display?: string | null
          product_image_url?: string | null
          published_at?: string | null
          published_by?: string | null
          purchase_date?: string | null
          purchase_price?: number | null
          quantity?: number
          repayment_type?: string | null
          risk_level?: string | null
          risk_note?: string | null
          sales_value?: number | null
          secondary_exit?: string | null
          sector?: string | null
          status?: string
          structure?: string | null
          supplier_name?: string | null
          target_amount?: number
          tenor_days?: number | null
          title?: string
          updated_at?: string
          visibility?: string
          volume?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trade_offers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_schedules: {
        Row: {
          badge_color: string
          created_at: string | null
          departure_time: string
          departure_weekday: number
          id: string
          label: string
          updated_at: string | null
          zone_key: string
        }
        Insert: {
          badge_color?: string
          created_at?: string | null
          departure_time?: string
          departure_weekday?: number
          id?: string
          label: string
          updated_at?: string | null
          zone_key: string
        }
        Update: {
          badge_color?: string
          created_at?: string | null
          departure_time?: string
          departure_weekday?: number
          id?: string
          label?: string
          updated_at?: string | null
          zone_key?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      weekly_report_cost_lines: {
        Row: {
          amount: number
          id: string
          label: string
          report_id: string
          sort_order: number
        }
        Insert: {
          amount?: number
          id?: string
          label: string
          report_id: string
          sort_order?: number
        }
        Update: {
          amount?: number
          id?: string
          label?: string
          report_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "weekly_report_cost_lines_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "weekly_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_report_inventory_lines: {
        Row: {
          id: string
          product_id: string
          quantity: number
          report_id: string
          total: number
          unit: string
          unit_price: number
        }
        Insert: {
          id?: string
          product_id: string
          quantity?: number
          report_id: string
          total?: number
          unit?: string
          unit_price?: number
        }
        Update: {
          id?: string
          product_id?: string
          quantity?: number
          report_id?: string
          total?: number
          unit?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "weekly_report_inventory_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_report_inventory_lines_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "weekly_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_report_sales_lines: {
        Row: {
          amount: number
          channel: string
          id: string
          last_year_amount: number | null
          quantity: number
          report_id: string
          sort_order: number
        }
        Insert: {
          amount?: number
          channel: string
          id?: string
          last_year_amount?: number | null
          quantity?: number
          report_id: string
          sort_order?: number
        }
        Update: {
          amount?: number
          channel?: string
          id?: string
          last_year_amount?: number | null
          quantity?: number
          report_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "weekly_report_sales_lines_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "weekly_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_report_social_lines: {
        Row: {
          closing_followers: number
          follower_change: number
          id: string
          opening_followers: number
          platform: string
          posts_count: number
          report_id: string
          sort_order: number
        }
        Insert: {
          closing_followers?: number
          follower_change?: number
          id?: string
          opening_followers?: number
          platform: string
          posts_count?: number
          report_id: string
          sort_order?: number
        }
        Update: {
          closing_followers?: number
          follower_change?: number
          id?: string
          opening_followers?: number
          platform?: string
          posts_count?: number
          report_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "weekly_report_social_lines_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "weekly_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_reports: {
        Row: {
          closing_inventory: number
          created_at: string
          gross_margin: number
          gross_margin_pct: number
          id: string
          inventory_change: number
          notes: string | null
          opening_inventory: number
          status: string
          store_id: string
          total_costs: number
          total_sales: number
          updated_at: string
          week_number: number
          year: number
        }
        Insert: {
          closing_inventory?: number
          created_at?: string
          gross_margin?: number
          gross_margin_pct?: number
          id?: string
          inventory_change?: number
          notes?: string | null
          opening_inventory?: number
          status?: string
          store_id: string
          total_costs?: number
          total_sales?: number
          updated_at?: string
          week_number: number
          year: number
        }
        Update: {
          closing_inventory?: number
          created_at?: string
          gross_margin?: number
          gross_margin_pct?: number
          id?: string
          inventory_change?: number
          notes?: string | null
          opening_inventory?: number
          status?: string
          store_id?: string
          total_costs?: number
          total_sales?: number
          updated_at?: string
          week_number?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "weekly_reports_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "client"
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
      app_role: ["admin", "client"],
    },
  },
} as const
