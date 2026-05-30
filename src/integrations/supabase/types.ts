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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          actor_name: string | null
          actor_user_id: string
          ca_firm_id: string
          client_id: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json
        }
        Insert: {
          action: string
          actor_name?: string | null
          actor_user_id: string
          ca_firm_id: string
          client_id: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
        }
        Update: {
          action?: string
          actor_name?: string | null
          actor_user_id?: string
          ca_firm_id?: string
          client_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
        }
        Relationships: []
      }
      ca_firms: {
        Row: {
          created_at: string
          id: string
          logo_url: string | null
          name: string
          owner_user_id: string
          phone: string | null
          primary_color: string | null
          subdomain_slug: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          owner_user_id: string
          phone?: string | null
          primary_color?: string | null
          subdomain_slug?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          owner_user_id?: string
          phone?: string | null
          primary_color?: string | null
          subdomain_slug?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ca_staff_assignments: {
        Row: {
          assigned_by: string | null
          ca_firm_id: string
          client_id: string
          created_at: string
          id: string
          staff_user_id: string
        }
        Insert: {
          assigned_by?: string | null
          ca_firm_id: string
          client_id: string
          created_at?: string
          id?: string
          staff_user_id: string
        }
        Update: {
          assigned_by?: string | null
          ca_firm_id?: string
          client_id?: string
          created_at?: string
          id?: string
          staff_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ca_staff_assignments_ca_firm_id_fkey"
            columns: ["ca_firm_id"]
            isOneToOne: false
            referencedRelation: "ca_firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ca_staff_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_compliance_profile: {
        Row: {
          ca_firm_id: string
          client_id: string
          created_at: string
          entity_type: Database["public"]["Enums"]["entity_type"]
          gst_filing_frequency: string
          has_employees: boolean
          id: string
          is_audit_applicable: boolean
          is_company: boolean
          is_gst_registered: boolean
          is_tds_deductor: boolean
          updated_at: string
        }
        Insert: {
          ca_firm_id: string
          client_id: string
          created_at?: string
          entity_type?: Database["public"]["Enums"]["entity_type"]
          gst_filing_frequency?: string
          has_employees?: boolean
          id?: string
          is_audit_applicable?: boolean
          is_company?: boolean
          is_gst_registered?: boolean
          is_tds_deductor?: boolean
          updated_at?: string
        }
        Update: {
          ca_firm_id?: string
          client_id?: string
          created_at?: string
          entity_type?: Database["public"]["Enums"]["entity_type"]
          gst_filing_frequency?: string
          has_employees?: boolean
          id?: string
          is_audit_applicable?: boolean
          is_company?: boolean
          is_gst_registered?: boolean
          is_tds_deductor?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      client_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          ca_firm_id: string
          client_id: string
          created_at: string
          created_by: string
          email: string | null
          expires_at: string
          id: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          ca_firm_id: string
          client_id: string
          created_at?: string
          created_by: string
          email?: string | null
          expires_at?: string
          id?: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          ca_firm_id?: string
          client_id?: string
          created_at?: string
          created_by?: string
          email?: string | null
          expires_at?: string
          id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_invites_ca_firm_id_fkey"
            columns: ["ca_firm_id"]
            isOneToOne: false
            referencedRelation: "ca_firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_invites_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_onboarding: {
        Row: {
          ca_firm_id: string
          client_id: string
          completed_at: string | null
          completion_percentage: number
          created_at: string
          engagement_letter_signed: boolean
          engagement_letter_signed_at: string | null
          id: string
          notes: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["onboarding_status"]
          template_id: string | null
          updated_at: string
        }
        Insert: {
          ca_firm_id: string
          client_id: string
          completed_at?: string | null
          completion_percentage?: number
          created_at?: string
          engagement_letter_signed?: boolean
          engagement_letter_signed_at?: string | null
          id?: string
          notes?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["onboarding_status"]
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          ca_firm_id?: string
          client_id?: string
          completed_at?: string | null
          completion_percentage?: number
          created_at?: string
          engagement_letter_signed?: boolean
          engagement_letter_signed_at?: string | null
          id?: string
          notes?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["onboarding_status"]
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_onboarding_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "onboarding_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      client_onboarding_items: {
        Row: {
          created_at: string
          description: string | null
          document_category: Database["public"]["Enums"]["onboarding_doc_category"]
          id: string
          invoice_id: string | null
          is_mandatory: boolean
          item_name: string
          onboarding_id: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sort_order: number
          status: Database["public"]["Enums"]["onboarding_item_status"]
          template_item_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          document_category?: Database["public"]["Enums"]["onboarding_doc_category"]
          id?: string
          invoice_id?: string | null
          is_mandatory?: boolean
          item_name: string
          onboarding_id: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["onboarding_item_status"]
          template_item_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          document_category?: Database["public"]["Enums"]["onboarding_doc_category"]
          id?: string
          invoice_id?: string | null
          is_mandatory?: boolean
          item_name?: string
          onboarding_id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["onboarding_item_status"]
          template_item_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_onboarding_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_onboarding_items_onboarding_id_fkey"
            columns: ["onboarding_id"]
            isOneToOne: false
            referencedRelation: "client_onboarding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_onboarding_items_template_item_id_fkey"
            columns: ["template_item_id"]
            isOneToOne: false
            referencedRelation: "onboarding_template_items"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          business_name: string
          ca_firm_id: string
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          gstin: string | null
          id: string
          owner_user_id: string | null
          status: Database["public"]["Enums"]["client_status"]
          updated_at: string
        }
        Insert: {
          business_name: string
          ca_firm_id: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          gstin?: string | null
          id?: string
          owner_user_id?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
        }
        Update: {
          business_name?: string
          ca_firm_id?: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          gstin?: string | null
          id?: string
          owner_user_id?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_ca_firm_id_fkey"
            columns: ["ca_firm_id"]
            isOneToOne: false
            referencedRelation: "ca_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_deadlines: {
        Row: {
          assigned_to: string | null
          ca_firm_id: string
          client_id: string
          completed_at: string | null
          compliance_type_id: string
          created_at: string
          due_date: string
          filing_reference: string | null
          id: string
          notes: string | null
          period_label: string
          status: Database["public"]["Enums"]["compliance_deadline_status"]
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          ca_firm_id: string
          client_id: string
          completed_at?: string | null
          compliance_type_id: string
          created_at?: string
          due_date: string
          filing_reference?: string | null
          id?: string
          notes?: string | null
          period_label: string
          status?: Database["public"]["Enums"]["compliance_deadline_status"]
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          ca_firm_id?: string
          client_id?: string
          completed_at?: string | null
          compliance_type_id?: string
          created_at?: string
          due_date?: string
          filing_reference?: string | null
          id?: string
          notes?: string | null
          period_label?: string
          status?: Database["public"]["Enums"]["compliance_deadline_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_deadlines_compliance_type_id_fkey"
            columns: ["compliance_type_id"]
            isOneToOne: false
            referencedRelation: "compliance_types"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_notification_log: {
        Row: {
          bucket: string
          ca_firm_id: string
          client_id: string
          created_at: string
          deadline_id: string
          id: string
          notified_user_id: string | null
        }
        Insert: {
          bucket: string
          ca_firm_id: string
          client_id: string
          created_at?: string
          deadline_id: string
          id?: string
          notified_user_id?: string | null
        }
        Update: {
          bucket?: string
          ca_firm_id?: string
          client_id?: string
          created_at?: string
          deadline_id?: string
          id?: string
          notified_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_notification_log_deadline_id_fkey"
            columns: ["deadline_id"]
            isOneToOne: false
            referencedRelation: "compliance_deadlines"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_types: {
        Row: {
          applies_to: Database["public"]["Enums"]["compliance_applies_to"]
          category: Database["public"]["Enums"]["compliance_category"]
          code: string
          created_at: string
          default_due_day: number
          default_due_month: number | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          recurrence: Database["public"]["Enums"]["compliance_recurrence"]
        }
        Insert: {
          applies_to?: Database["public"]["Enums"]["compliance_applies_to"]
          category: Database["public"]["Enums"]["compliance_category"]
          code: string
          created_at?: string
          default_due_day: number
          default_due_month?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          recurrence: Database["public"]["Enums"]["compliance_recurrence"]
        }
        Update: {
          applies_to?: Database["public"]["Enums"]["compliance_applies_to"]
          category?: Database["public"]["Enums"]["compliance_category"]
          code?: string
          created_at?: string
          default_due_day?: number
          default_due_month?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          recurrence?: Database["public"]["Enums"]["compliance_recurrence"]
        }
        Relationships: []
      }
      document_request_uploads: {
        Row: {
          created_at: string
          id: string
          invoice_id: string
          request_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          id?: string
          invoice_id: string
          request_id: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          id?: string
          invoice_id?: string
          request_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_request_uploads_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "document_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      document_requests: {
        Row: {
          ca_firm_id: string
          client_id: string
          created_at: string
          created_by: string
          doc_type: Database["public"]["Enums"]["doc_request_type"]
          due_date: string | null
          fulfilled_at: string | null
          id: string
          note: string | null
          period_label: string | null
          status: Database["public"]["Enums"]["doc_request_status"]
          updated_at: string
        }
        Insert: {
          ca_firm_id: string
          client_id: string
          created_at?: string
          created_by: string
          doc_type: Database["public"]["Enums"]["doc_request_type"]
          due_date?: string | null
          fulfilled_at?: string | null
          id?: string
          note?: string | null
          period_label?: string | null
          status?: Database["public"]["Enums"]["doc_request_status"]
          updated_at?: string
        }
        Update: {
          ca_firm_id?: string
          client_id?: string
          created_at?: string
          created_by?: string
          doc_type?: Database["public"]["Enums"]["doc_request_type"]
          due_date?: string | null
          fulfilled_at?: string | null
          id?: string
          note?: string | null
          period_label?: string | null
          status?: Database["public"]["Enums"]["doc_request_status"]
          updated_at?: string
        }
        Relationships: []
      }
      engagement_letter_templates: {
        Row: {
          ca_firm_id: string
          content_html: string
          created_at: string
          id: string
          is_default: boolean
          name: string
          updated_at: string
        }
        Insert: {
          ca_firm_id: string
          content_html: string
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          ca_firm_id?: string
          content_html?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      engagement_letters: {
        Row: {
          ca_firm_id: string
          client_id: string
          content_html: string
          created_at: string
          id: string
          sent_at: string | null
          sign_token: string | null
          signature_otp_expires_at: string | null
          signature_otp_hash: string | null
          signed_at: string | null
          signed_document_url: string | null
          signer_ip: string | null
          signer_name: string | null
          status: Database["public"]["Enums"]["engagement_letter_status"]
          template_id: string | null
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          ca_firm_id: string
          client_id: string
          content_html: string
          created_at?: string
          id?: string
          sent_at?: string | null
          sign_token?: string | null
          signature_otp_expires_at?: string | null
          signature_otp_hash?: string | null
          signed_at?: string | null
          signed_document_url?: string | null
          signer_ip?: string | null
          signer_name?: string | null
          status?: Database["public"]["Enums"]["engagement_letter_status"]
          template_id?: string | null
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          ca_firm_id?: string
          client_id?: string
          content_html?: string
          created_at?: string
          id?: string
          sent_at?: string | null
          sign_token?: string | null
          signature_otp_expires_at?: string | null
          signature_otp_hash?: string | null
          signed_at?: string | null
          signed_document_url?: string | null
          signer_ip?: string | null
          signer_name?: string | null
          status?: Database["public"]["Enums"]["engagement_letter_status"]
          template_id?: string | null
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "engagement_letters_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "engagement_letter_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          created_at: string
          description: string | null
          gst_amount: number | null
          gst_rate: number | null
          hsn: string | null
          id: string
          invoice_id: string
          quantity: number | null
          taxable_value: number | null
          unit_price: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          gst_amount?: number | null
          gst_rate?: number | null
          hsn?: string | null
          id?: string
          invoice_id: string
          quantity?: number | null
          taxable_value?: number | null
          unit_price?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          gst_amount?: number | null
          gst_rate?: number | null
          hsn?: string | null
          id?: string
          invoice_id?: string
          quantity?: number | null
          taxable_value?: number | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          buyer_gstin: string | null
          buyer_name: string | null
          ca_firm_id: string
          category_confidence: number | null
          cess: number | null
          cgst: number | null
          client_id: string
          confidence: number | null
          created_at: string
          currency: string | null
          document_category:
            | Database["public"]["Enums"]["document_category"]
            | null
          due_date: string | null
          file_name: string | null
          file_path: string | null
          id: string
          igst: number | null
          invoice_date: string | null
          invoice_number: string | null
          notes: string | null
          place_of_supply: string | null
          raw_extraction: Json | null
          sgst: number | null
          status: Database["public"]["Enums"]["invoice_status"]
          taxable_value: number | null
          total_amount: number | null
          updated_at: string
          uploaded_by: string
          validation_flags: Json | null
          vendor_gstin: string | null
          vendor_name: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          buyer_gstin?: string | null
          buyer_name?: string | null
          ca_firm_id: string
          category_confidence?: number | null
          cess?: number | null
          cgst?: number | null
          client_id: string
          confidence?: number | null
          created_at?: string
          currency?: string | null
          document_category?:
            | Database["public"]["Enums"]["document_category"]
            | null
          due_date?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          igst?: number | null
          invoice_date?: string | null
          invoice_number?: string | null
          notes?: string | null
          place_of_supply?: string | null
          raw_extraction?: Json | null
          sgst?: number | null
          status?: Database["public"]["Enums"]["invoice_status"]
          taxable_value?: number | null
          total_amount?: number | null
          updated_at?: string
          uploaded_by: string
          validation_flags?: Json | null
          vendor_gstin?: string | null
          vendor_name?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          buyer_gstin?: string | null
          buyer_name?: string | null
          ca_firm_id?: string
          category_confidence?: number | null
          cess?: number | null
          cgst?: number | null
          client_id?: string
          confidence?: number | null
          created_at?: string
          currency?: string | null
          document_category?:
            | Database["public"]["Enums"]["document_category"]
            | null
          due_date?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          igst?: number | null
          invoice_date?: string | null
          invoice_number?: string | null
          notes?: string | null
          place_of_supply?: string | null
          raw_extraction?: Json | null
          sgst?: number | null
          status?: Database["public"]["Enums"]["invoice_status"]
          taxable_value?: number | null
          total_amount?: number | null
          updated_at?: string
          uploaded_by?: string
          validation_flags?: Json | null
          vendor_gstin?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_ca_firm_id_fkey"
            columns: ["ca_firm_id"]
            isOneToOne: false
            referencedRelation: "ca_firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_records: {
        Row: {
          approved_by: string | null
          ca_firm_id: string
          created_at: string
          id: string
          leave_date: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          reason: string | null
          staff_user_id: string
          status: Database["public"]["Enums"]["leave_status"]
        }
        Insert: {
          approved_by?: string | null
          ca_firm_id: string
          created_at?: string
          id?: string
          leave_date: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          reason?: string | null
          staff_user_id: string
          status?: Database["public"]["Enums"]["leave_status"]
        }
        Update: {
          approved_by?: string | null
          ca_firm_id?: string
          created_at?: string
          id?: string
          leave_date?: string
          leave_type?: Database["public"]["Enums"]["leave_type"]
          reason?: string | null
          staff_user_id?: string
          status?: Database["public"]["Enums"]["leave_status"]
        }
        Relationships: []
      }
      onboarding_template_items: {
        Row: {
          created_at: string
          description: string | null
          document_category: Database["public"]["Enums"]["onboarding_doc_category"]
          id: string
          is_mandatory: boolean
          item_name: string
          sort_order: number
          template_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          document_category?: Database["public"]["Enums"]["onboarding_doc_category"]
          id?: string
          is_mandatory?: boolean
          item_name: string
          sort_order?: number
          template_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          document_category?: Database["public"]["Enums"]["onboarding_doc_category"]
          id?: string
          is_mandatory?: boolean
          item_name?: string
          sort_order?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "onboarding_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_templates: {
        Row: {
          ca_firm_id: string | null
          created_at: string
          description: string | null
          entity_type: Database["public"]["Enums"]["entity_type"] | null
          id: string
          is_default: boolean
          is_system: boolean
          template_name: string
          updated_at: string
        }
        Insert: {
          ca_firm_id?: string | null
          created_at?: string
          description?: string | null
          entity_type?: Database["public"]["Enums"]["entity_type"] | null
          id?: string
          is_default?: boolean
          is_system?: boolean
          template_name: string
          updated_at?: string
        }
        Update: {
          ca_firm_id?: string | null
          created_at?: string
          description?: string | null
          entity_type?: Database["public"]["Enums"]["entity_type"] | null
          id?: string
          is_default?: boolean
          is_system?: boolean
          template_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          company_name: string | null
          created_at: string
          full_name: string | null
          gstin: string | null
          id: string
          updated_at: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          full_name?: string | null
          gstin?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          company_name?: string | null
          created_at?: string
          full_name?: string | null
          gstin?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      reminder_rules: {
        Row: {
          ca_firm_id: string
          channels: Database["public"]["Enums"]["reminder_channel"][]
          client_id: string | null
          created_at: string
          created_by: string
          day_of_month: number | null
          enabled: boolean
          id: string
          message_template: string
          name: string
          offset_days: number | null
          trigger_type: Database["public"]["Enums"]["reminder_trigger"]
          updated_at: string
        }
        Insert: {
          ca_firm_id: string
          channels?: Database["public"]["Enums"]["reminder_channel"][]
          client_id?: string | null
          created_at?: string
          created_by: string
          day_of_month?: number | null
          enabled?: boolean
          id?: string
          message_template?: string
          name: string
          offset_days?: number | null
          trigger_type: Database["public"]["Enums"]["reminder_trigger"]
          updated_at?: string
        }
        Update: {
          ca_firm_id?: string
          channels?: Database["public"]["Enums"]["reminder_channel"][]
          client_id?: string | null
          created_at?: string
          created_by?: string
          day_of_month?: number | null
          enabled?: boolean
          id?: string
          message_template?: string
          name?: string
          offset_days?: number | null
          trigger_type?: Database["public"]["Enums"]["reminder_trigger"]
          updated_at?: string
        }
        Relationships: []
      }
      reminders: {
        Row: {
          ca_firm_id: string
          channel: Database["public"]["Enums"]["reminder_channel"]
          client_id: string
          created_at: string
          due_for_date: string | null
          id: string
          message: string
          rule_id: string | null
          sent_at: string | null
          sent_by: string | null
          status: Database["public"]["Enums"]["reminder_status"]
        }
        Insert: {
          ca_firm_id: string
          channel: Database["public"]["Enums"]["reminder_channel"]
          client_id: string
          created_at?: string
          due_for_date?: string | null
          id?: string
          message: string
          rule_id?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: Database["public"]["Enums"]["reminder_status"]
        }
        Update: {
          ca_firm_id?: string
          channel?: Database["public"]["Enums"]["reminder_channel"]
          client_id?: string
          created_at?: string
          due_for_date?: string | null
          id?: string
          message?: string
          rule_id?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: Database["public"]["Enums"]["reminder_status"]
        }
        Relationships: []
      }
      staff_profiles: {
        Row: {
          billing_rate_per_hour: number
          ca_firm_id: string
          cost_rate_per_hour: number
          created_at: string
          designation: string | null
          id: string
          is_active: boolean
          joining_date: string | null
          leave_balance: number
          updated_at: string
          user_id: string
          weekly_target_hours: number
        }
        Insert: {
          billing_rate_per_hour?: number
          ca_firm_id: string
          cost_rate_per_hour?: number
          created_at?: string
          designation?: string | null
          id?: string
          is_active?: boolean
          joining_date?: string | null
          leave_balance?: number
          updated_at?: string
          user_id: string
          weekly_target_hours?: number
        }
        Update: {
          billing_rate_per_hour?: number
          ca_firm_id?: string
          cost_rate_per_hour?: number
          created_at?: string
          designation?: string | null
          id?: string
          is_active?: boolean
          joining_date?: string | null
          leave_balance?: number
          updated_at?: string
          user_id?: string
          weekly_target_hours?: number
        }
        Relationships: []
      }
      task_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_url: string
          id: string
          task_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_url: string
          id?: string
          task_id: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_url?: string
          id?: string
          task_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          comment: string
          created_at: string
          id: string
          task_id: string
          user_id: string
        }
        Insert: {
          comment: string
          created_at?: string
          id?: string
          task_id: string
          user_id: string
        }
        Update: {
          comment?: string
          created_at?: string
          id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_subtasks: {
        Row: {
          created_at: string
          id: string
          is_done: boolean
          sort_order: number
          task_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_done?: boolean
          sort_order?: number
          task_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_done?: boolean
          sort_order?: number
          task_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_subtasks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          ca_firm_id: string
          client_id: string | null
          completed_at: string | null
          compliance_deadline_id: string | null
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          estimated_hours: number | null
          id: string
          is_recurring: boolean
          parent_task_id: string | null
          period_label: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          recurrence_rule: string | null
          status: Database["public"]["Enums"]["task_status"]
          task_type: Database["public"]["Enums"]["task_type"]
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          ca_firm_id: string
          client_id?: string | null
          completed_at?: string | null
          compliance_deadline_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          id?: string
          is_recurring?: boolean
          parent_task_id?: string | null
          period_label?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          recurrence_rule?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          task_type?: Database["public"]["Enums"]["task_type"]
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          ca_firm_id?: string
          client_id?: string | null
          completed_at?: string | null
          compliance_deadline_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          id?: string
          is_recurring?: boolean
          parent_task_id?: string | null
          period_label?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          recurrence_rule?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          task_type?: Database["public"]["Enums"]["task_type"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      time_logs: {
        Row: {
          billable_amount: number
          billing_rate_per_hour: number
          ca_firm_id: string
          client_id: string | null
          created_at: string
          description: string | null
          duration_minutes: number | null
          ended_at: string | null
          id: string
          is_billable: boolean
          staff_user_id: string
          started_at: string
          task_id: string | null
        }
        Insert: {
          billable_amount?: number
          billing_rate_per_hour?: number
          ca_firm_id: string
          client_id?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          ended_at?: string | null
          id?: string
          is_billable?: boolean
          staff_user_id: string
          started_at?: string
          task_id?: string | null
        }
        Update: {
          billable_amount?: number
          billing_rate_per_hour?: number
          ca_firm_id?: string
          client_id?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          ended_at?: string | null
          id?: string
          is_billable?: boolean
          staff_user_id?: string
          started_at?: string
          task_id?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          ca_firm_id: string | null
          client_id: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          ca_firm_id?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          ca_firm_id?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_ca_firm_id_fkey"
            columns: ["ca_firm_id"]
            isOneToOne: false
            referencedRelation: "ca_firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_client: {
        Args: { _client_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_ca_firm_member: {
        Args: { _ca_firm_id: string; _user_id: string }
        Returns: boolean
      }
      is_ca_owner: {
        Args: { _ca_firm_id: string; _user_id: string }
        Returns: boolean
      }
      recompute_onboarding_progress: {
        Args: { _onboarding_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "ca_owner"
        | "ca_staff"
        | "client_owner"
        | "client_employee"
      client_status: "pending_invite" | "active" | "archived"
      compliance_applies_to:
        | "ALL"
        | "GST_REGISTERED"
        | "COMPANIES_ONLY"
        | "TDS_DEDUCTOR"
        | "EMPLOYER"
      compliance_category:
        | "GST"
        | "TDS"
        | "ITR"
        | "ROC_MCA"
        | "PF_ESI"
        | "AUDIT"
      compliance_deadline_status:
        | "PENDING"
        | "IN_PROGRESS"
        | "COMPLETED"
        | "OVERDUE"
        | "NOT_APPLICABLE"
      compliance_recurrence: "MONTHLY" | "QUARTERLY" | "ANNUAL" | "EVENT_BASED"
      doc_request_status: "pending" | "partial" | "complete" | "cancelled"
      doc_request_type:
        | "purchase_bills"
        | "sales_invoices"
        | "bank_statement"
        | "expense_proofs"
        | "other"
      document_category:
        | "sales_invoice"
        | "purchase_bill"
        | "expense_receipt"
        | "bank_statement"
        | "asset_purchase"
        | "other"
      engagement_letter_status: "DRAFT" | "SENT" | "SIGNED" | "EXPIRED"
      entity_type:
        | "PROPRIETOR"
        | "PARTNERSHIP"
        | "LLP"
        | "PRIVATE_LTD"
        | "PUBLIC_LTD"
        | "TRUST"
      invoice_status:
        | "uploaded"
        | "processing"
        | "review"
        | "validated"
        | "filed"
        | "error"
        | "approved"
      leave_status: "PENDING" | "APPROVED" | "REJECTED"
      leave_type: "CASUAL" | "SICK" | "EARNED" | "HALF_DAY" | "COMP_OFF"
      onboarding_doc_category:
        | "IDENTITY"
        | "GST"
        | "TAX"
        | "BANKING"
        | "CORPORATE"
        | "OTHER"
      onboarding_item_status:
        | "PENDING"
        | "UPLOADED"
        | "REVIEWED"
        | "APPROVED"
        | "REJECTED"
      onboarding_status:
        | "NOT_STARTED"
        | "IN_PROGRESS"
        | "PENDING_REVIEW"
        | "COMPLETED"
      reminder_channel: "in_app" | "email" | "whatsapp"
      reminder_status: "scheduled" | "sent" | "skipped" | "failed"
      reminder_trigger:
        | "gst_due_offset"
        | "monthly_day"
        | "stale_upload_days"
        | "manual"
      task_priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT"
      task_status: "TODO" | "IN_PROGRESS" | "REVIEW" | "COMPLETED" | "CANCELLED"
      task_type:
        | "GST_FILING"
        | "TDS_RETURN"
        | "ITR_FILING"
        | "AUDIT"
        | "BOOKKEEPING"
        | "NOTICE_REPLY"
        | "DOCUMENT_COLLECTION"
        | "OTHER"
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
      app_role: [
        "super_admin",
        "ca_owner",
        "ca_staff",
        "client_owner",
        "client_employee",
      ],
      client_status: ["pending_invite", "active", "archived"],
      compliance_applies_to: [
        "ALL",
        "GST_REGISTERED",
        "COMPANIES_ONLY",
        "TDS_DEDUCTOR",
        "EMPLOYER",
      ],
      compliance_category: ["GST", "TDS", "ITR", "ROC_MCA", "PF_ESI", "AUDIT"],
      compliance_deadline_status: [
        "PENDING",
        "IN_PROGRESS",
        "COMPLETED",
        "OVERDUE",
        "NOT_APPLICABLE",
      ],
      compliance_recurrence: ["MONTHLY", "QUARTERLY", "ANNUAL", "EVENT_BASED"],
      doc_request_status: ["pending", "partial", "complete", "cancelled"],
      doc_request_type: [
        "purchase_bills",
        "sales_invoices",
        "bank_statement",
        "expense_proofs",
        "other",
      ],
      document_category: [
        "sales_invoice",
        "purchase_bill",
        "expense_receipt",
        "bank_statement",
        "asset_purchase",
        "other",
      ],
      engagement_letter_status: ["DRAFT", "SENT", "SIGNED", "EXPIRED"],
      entity_type: [
        "PROPRIETOR",
        "PARTNERSHIP",
        "LLP",
        "PRIVATE_LTD",
        "PUBLIC_LTD",
        "TRUST",
      ],
      invoice_status: [
        "uploaded",
        "processing",
        "review",
        "validated",
        "filed",
        "error",
        "approved",
      ],
      leave_status: ["PENDING", "APPROVED", "REJECTED"],
      leave_type: ["CASUAL", "SICK", "EARNED", "HALF_DAY", "COMP_OFF"],
      onboarding_doc_category: [
        "IDENTITY",
        "GST",
        "TAX",
        "BANKING",
        "CORPORATE",
        "OTHER",
      ],
      onboarding_item_status: [
        "PENDING",
        "UPLOADED",
        "REVIEWED",
        "APPROVED",
        "REJECTED",
      ],
      onboarding_status: [
        "NOT_STARTED",
        "IN_PROGRESS",
        "PENDING_REVIEW",
        "COMPLETED",
      ],
      reminder_channel: ["in_app", "email", "whatsapp"],
      reminder_status: ["scheduled", "sent", "skipped", "failed"],
      reminder_trigger: [
        "gst_due_offset",
        "monthly_day",
        "stale_upload_days",
        "manual",
      ],
      task_priority: ["LOW", "MEDIUM", "HIGH", "URGENT"],
      task_status: ["TODO", "IN_PROGRESS", "REVIEW", "COMPLETED", "CANCELLED"],
      task_type: [
        "GST_FILING",
        "TDS_RETURN",
        "ITR_FILING",
        "AUDIT",
        "BOOKKEEPING",
        "NOTICE_REPLY",
        "DOCUMENT_COLLECTION",
        "OTHER",
      ],
    },
  },
} as const
