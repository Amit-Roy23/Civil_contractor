CREATE TABLE "approval_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"voucher_type" varchar(50) NOT NULL,
	"voucher_id" uuid NOT NULL,
	"voucher_no" varchar(100) NOT NULL,
	"requested_by" uuid NOT NULL,
	"approver_role_id" uuid NOT NULL,
	"action" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"action_by" uuid,
	"action_remarks" text,
	"action_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"voucher_type" varchar(50) NOT NULL,
	"min_amount" varchar(30) DEFAULT '0' NOT NULL,
	"location_id" uuid,
	"required_role_id" uuid NOT NULL,
	"step_order" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" uuid NOT NULL,
	"s3_key" varchar(255) NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"size_bytes" integer NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"user_id" uuid,
	"username" varchar(100),
	"entity" varchar(50) NOT NULL,
	"entity_id" varchar(100) NOT NULL,
	"action" varchar(20) NOT NULL,
	"before_json" jsonb,
	"after_json" jsonb,
	"reason" text,
	"ip" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"valuation_method" varchar(30) DEFAULT 'WEIGHTED_AVERAGE' NOT NULL,
	"max_backdate_days" integer DEFAULT 3 NOT NULL,
	"include_pending_in_reports" boolean DEFAULT false NOT NULL,
	"consumption_tolerance_percent" integer DEFAULT 5 NOT NULL,
	"fuel_variance_tolerance_percent" integer DEFAULT 10 NOT NULL,
	"attendance_lock_time" varchar(10) DEFAULT '12:00' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "company_settings_company_id_unique" UNIQUE("company_id")
);
--> statement-breakpoint
CREATE TABLE "financial_years" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(20) NOT NULL,
	"start_date" varchar(10) NOT NULL,
	"end_date" varchar(10) NOT NULL,
	"is_closed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"message" text NOT NULL,
	"link" varchar(255),
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "period_locks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"financial_year_id" uuid NOT NULL,
	"locked_until_date" varchar(10) NOT NULL,
	"reason" text,
	"locked_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_id" uuid NOT NULL,
	"permission_key" varchar(100) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_location_scopes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"site_id" uuid,
	"location_id" uuid,
	"plant_id" uuid
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"username" varchar(50) NOT NULL,
	"full_name" varchar(100) NOT NULL,
	"email" varchar(100),
	"mobile" varchar(20) NOT NULL,
	"password_hash" text NOT NULL,
	"totp_secret" text,
	"is_totp_enabled" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "voucher_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"voucher_type" varchar(50) NOT NULL,
	"prefix" varchar(20) NOT NULL,
	"location_prefix" varchar(20) NOT NULL,
	"financial_year_code" varchar(20) NOT NULL,
	"current_number" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "boq_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"item_number" varchar(30) NOT NULL,
	"description" text NOT NULL,
	"unit_code" varchar(10) NOT NULL,
	"tender_qty" numeric(18, 4) NOT NULL,
	"tender_rate" numeric(18, 4) NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(150) NOT NULL,
	"gstin" varchar(15),
	"pan" varchar(10),
	"department" varchar(100),
	"address" text NOT NULL,
	"state" varchar(50) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(20) NOT NULL,
	"name" varchar(150) NOT NULL,
	"pan" varchar(10) NOT NULL,
	"gstin" varchar(15),
	"registered_address" text NOT NULL,
	"state" varchar(50) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "companies_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "expense_heads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(150) NOT NULL,
	"category" varchar(50) NOT NULL,
	"parent_head_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fuel_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(100) NOT NULL,
	"is_external_pump" boolean DEFAULT false NOT NULL,
	"location_id" uuid,
	"supplier_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_unit_conversions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"unit_code" varchar(10) NOT NULL,
	"conversion_factor" numeric(18, 4) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(150) NOT NULL,
	"category" varchar(50) NOT NULL,
	"base_unit_code" varchar(10) NOT NULL,
	"hsn_code" varchar(10),
	"reorder_level" numeric(18, 4) DEFAULT '0' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(150) NOT NULL,
	"type" varchar(50) NOT NULL,
	"site_id" uuid,
	"plant_id" uuid,
	"current_site_id" uuid,
	"address" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(150) NOT NULL,
	"type" varchar(50) NOT NULL,
	"address" text NOT NULL,
	"capacity_tph" numeric(10, 2),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"raw_material_item_id" uuid NOT NULL,
	"standard_qty_per_batch" numeric(18, 4) NOT NULL,
	"tolerance_percent" numeric(5, 2) DEFAULT '2' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(100) NOT NULL,
	"plant_type" varchar(50) NOT NULL,
	"output_item_id" uuid NOT NULL,
	"batch_size" numeric(18, 4) DEFAULT '1' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(150) NOT NULL,
	"client_name" varchar(150),
	"contract_number" varchar(100),
	"location_address" text NOT NULL,
	"chainage_start_km" numeric(10, 3),
	"chainage_end_km" numeric(10, 3),
	"sanctioned_budget" numeric(18, 2) DEFAULT '0',
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subcontractors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(150) NOT NULL,
	"pan" varchar(10),
	"gstin" varchar(15),
	"specialisation" varchar(100),
	"phone" varchar(20),
	"address" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(150) NOT NULL,
	"gstin" varchar(15),
	"pan" varchar(10),
	"contact_person" varchar(100),
	"phone" varchar(20),
	"email" varchar(100),
	"address" text NOT NULL,
	"state" varchar(50) NOT NULL,
	"payment_terms_days" integer DEFAULT 30 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(30) NOT NULL,
	"registration_number" varchar(20) NOT NULL,
	"asset_name" varchar(100) NOT NULL,
	"ownership" varchar(20) NOT NULL,
	"meter_type" varchar(20) NOT NULL,
	"standard_kmpl" numeric(10, 2),
	"standard_lph" numeric(10, 2),
	"insurance_expiry_date" varchar(10),
	"fitness_expiry_date" varchar(10),
	"tax_token_expiry_date" varchar(10),
	"puc_expiry_date" varchar(10),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(150) NOT NULL,
	"trade" varchar(50) NOT NULL,
	"aadhaar_masked" varchar(20),
	"daily_wage_rate" numeric(18, 2),
	"phone" varchar(20),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"txn_date" varchar(10) NOT NULL,
	"cost_head" varchar(50) NOT NULL,
	"sub_head" varchar(100),
	"amount" numeric(18, 2) NOT NULL,
	"qty" numeric(18, 4),
	"unit" varchar(10),
	"source_voucher_type" varchar(50) NOT NULL,
	"source_voucher_id" uuid NOT NULL,
	"source_voucher_no" varchar(100) NOT NULL,
	"boq_item_id" uuid,
	"vehicle_id" uuid,
	"plant_id" uuid,
	"status" varchar(20) DEFAULT 'POSTED' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "party_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"party_type" varchar(50) NOT NULL,
	"txn_date" varchar(10) NOT NULL,
	"debit" numeric(18, 2) DEFAULT '0' NOT NULL,
	"credit" numeric(18, 2) DEFAULT '0' NOT NULL,
	"voucher_type" varchar(50) NOT NULL,
	"voucher_id" uuid NOT NULL,
	"voucher_no" varchar(100) NOT NULL,
	"due_date" varchar(10),
	"remarks" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_balance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"current_qty" numeric(18, 4) DEFAULT '0' NOT NULL,
	"current_value" numeric(18, 2) DEFAULT '0' NOT NULL,
	"valuation_rate" numeric(18, 4) DEFAULT '0' NOT NULL,
	"last_updated_txn_date" varchar(10),
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"txn_date" varchar(10) NOT NULL,
	"voucher_type" varchar(50) NOT NULL,
	"voucher_id" uuid NOT NULL,
	"voucher_line_id" uuid,
	"voucher_no" varchar(100) NOT NULL,
	"qty_in" numeric(18, 4) DEFAULT '0' NOT NULL,
	"qty_out" numeric(18, 4) DEFAULT '0' NOT NULL,
	"rate" numeric(18, 4) DEFAULT '0' NOT NULL,
	"value_in" numeric(18, 2) DEFAULT '0' NOT NULL,
	"value_out" numeric(18, 2) DEFAULT '0' NOT NULL,
	"batch_id" varchar(50),
	"running_qty" numeric(18, 4) NOT NULL,
	"running_value" numeric(18, 2) NOT NULL,
	"valuation_rate" numeric(18, 4) NOT NULL,
	"site_id" uuid,
	"boq_item_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grn_headers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"financial_year_id" uuid NOT NULL,
	"voucher_no" varchar(100) NOT NULL,
	"po_id" uuid,
	"supplier_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"txn_date" varchar(10) NOT NULL,
	"status" varchar(30) DEFAULT 'POSTED' NOT NULL,
	"supplier_challan_no" varchar(100) NOT NULL,
	"supplier_challan_date" varchar(10),
	"vehicle_number" varchar(50) NOT NULL,
	"weighbridge_slip_no" varchar(100),
	"gross_weight_kg" numeric(18, 4),
	"tare_weight_kg" numeric(18, 4),
	"net_weight_kg" numeric(18, 4),
	"total_value" numeric(18, 2) DEFAULT '0' NOT NULL,
	"remarks" text,
	"cancel_reason" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "grn_headers_voucher_no_unique" UNIQUE("voucher_no")
);
--> statement-breakpoint
CREATE TABLE "grn_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grn_id" uuid NOT NULL,
	"po_line_id" uuid,
	"item_id" uuid NOT NULL,
	"received_qty" numeric(18, 4) NOT NULL,
	"accepted_qty" numeric(18, 4) NOT NULL,
	"rejected_qty" numeric(18, 4) DEFAULT '0' NOT NULL,
	"entered_unit_code" varchar(10) NOT NULL,
	"base_qty" numeric(18, 4) NOT NULL,
	"unit_rate" numeric(18, 4) NOT NULL,
	"gst_percent" numeric(5, 2) DEFAULT '18' NOT NULL,
	"line_value" numeric(18, 2) NOT NULL,
	"remarks" text
);
--> statement-breakpoint
CREATE TABLE "purchase_order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"po_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"entered_qty" numeric(18, 4) NOT NULL,
	"entered_unit_code" varchar(10) NOT NULL,
	"base_qty" numeric(18, 4) NOT NULL,
	"received_qty" numeric(18, 4) DEFAULT '0' NOT NULL,
	"unit_rate" numeric(18, 4) NOT NULL,
	"gst_percent" numeric(5, 2) DEFAULT '18' NOT NULL,
	"line_amount" numeric(18, 2) NOT NULL,
	"remarks" text
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"financial_year_id" uuid NOT NULL,
	"voucher_no" varchar(100) NOT NULL,
	"supplier_id" uuid NOT NULL,
	"delivery_location_id" uuid NOT NULL,
	"txn_date" varchar(10) NOT NULL,
	"status" varchar(30) DEFAULT 'DRAFT' NOT NULL,
	"sub_total" numeric(18, 2) DEFAULT '0' NOT NULL,
	"tax_total" numeric(18, 2) DEFAULT '0' NOT NULL,
	"grand_total" numeric(18, 2) DEFAULT '0' NOT NULL,
	"payment_terms" text,
	"delivery_terms" text,
	"remarks" text,
	"cancel_reason" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_orders_voucher_no_unique" UNIQUE("voucher_no")
);
--> statement-breakpoint
CREATE TABLE "site_consumption_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"consumption_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"entered_qty" numeric(18, 4) NOT NULL,
	"entered_unit_code" varchar(10) NOT NULL,
	"base_qty" numeric(18, 4) NOT NULL,
	"valuation_rate" numeric(18, 4) DEFAULT '0' NOT NULL,
	"line_value" numeric(18, 2) DEFAULT '0' NOT NULL,
	"boq_item_id" uuid,
	"chainage_text" varchar(100),
	"purpose" text
);
--> statement-breakpoint
CREATE TABLE "site_consumptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"financial_year_id" uuid NOT NULL,
	"voucher_no" varchar(100) NOT NULL,
	"site_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"txn_date" varchar(10) NOT NULL,
	"status" varchar(30) DEFAULT 'POSTED' NOT NULL,
	"work_section" varchar(100),
	"total_value" numeric(18, 2) DEFAULT '0' NOT NULL,
	"remarks" text,
	"cancel_reason" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "site_consumptions_voucher_no_unique" UNIQUE("voucher_no")
);
--> statement-breakpoint
CREATE TABLE "stock_adjustment_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"adjustment_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"system_qty" numeric(18, 4) NOT NULL,
	"physical_qty" numeric(18, 4) NOT NULL,
	"variance_qty" numeric(18, 4) NOT NULL,
	"entered_unit_code" varchar(10) NOT NULL,
	"base_variance_qty" numeric(18, 4) NOT NULL,
	"valuation_rate" numeric(18, 4) DEFAULT '0' NOT NULL,
	"variance_value" numeric(18, 2) DEFAULT '0' NOT NULL,
	"reason" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"financial_year_id" uuid NOT NULL,
	"voucher_no" varchar(100) NOT NULL,
	"location_id" uuid NOT NULL,
	"txn_date" varchar(10) NOT NULL,
	"status" varchar(30) DEFAULT 'PENDING_APPROVAL' NOT NULL,
	"remarks" text,
	"approved_by" uuid,
	"approved_at" timestamp,
	"cancel_reason" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stock_adjustments_voucher_no_unique" UNIQUE("voucher_no")
);
--> statement-breakpoint
CREATE TABLE "transfer_issue_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transfer_issue_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"entered_qty" numeric(18, 4) NOT NULL,
	"entered_unit_code" varchar(10) NOT NULL,
	"base_qty" numeric(18, 4) NOT NULL,
	"confirmed_qty" numeric(18, 4) DEFAULT '0' NOT NULL,
	"valuation_rate" numeric(18, 4) DEFAULT '0' NOT NULL,
	"line_value" numeric(18, 2) DEFAULT '0' NOT NULL,
	"remarks" text
);
--> statement-breakpoint
CREATE TABLE "transfer_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"financial_year_id" uuid NOT NULL,
	"voucher_no" varchar(100) NOT NULL,
	"from_location_id" uuid NOT NULL,
	"to_location_id" uuid NOT NULL,
	"in_transit_location_id" uuid NOT NULL,
	"txn_date" varchar(10) NOT NULL,
	"status" varchar(30) DEFAULT 'POSTED' NOT NULL,
	"challan_no" varchar(100) NOT NULL,
	"vehicle_number" varchar(50) NOT NULL,
	"driver_name" varchar(100),
	"driver_mobile" varchar(20),
	"remarks" text,
	"cancel_reason" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "transfer_issues_voucher_no_unique" UNIQUE("voucher_no")
);
--> statement-breakpoint
CREATE TABLE "transfer_receipt_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transfer_receipt_id" uuid NOT NULL,
	"transfer_line_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"accepted_qty" numeric(18, 4) NOT NULL,
	"rejected_qty" numeric(18, 4) DEFAULT '0' NOT NULL,
	"entered_unit_code" varchar(10) NOT NULL,
	"base_qty" numeric(18, 4) NOT NULL,
	"valuation_rate" numeric(18, 4) DEFAULT '0' NOT NULL,
	"line_value" numeric(18, 2) DEFAULT '0' NOT NULL,
	"remarks" text
);
--> statement-breakpoint
CREATE TABLE "transfer_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"financial_year_id" uuid NOT NULL,
	"voucher_no" varchar(100) NOT NULL,
	"transfer_issue_id" uuid NOT NULL,
	"received_location_id" uuid NOT NULL,
	"txn_date" varchar(10) NOT NULL,
	"status" varchar(30) DEFAULT 'POSTED' NOT NULL,
	"remarks" text,
	"cancel_reason" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "transfer_receipts_voucher_no_unique" UNIQUE("voucher_no")
);
--> statement-breakpoint
CREATE TABLE "wastage_voucher_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wastage_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"entered_qty" numeric(18, 4) NOT NULL,
	"entered_unit_code" varchar(10) NOT NULL,
	"base_qty" numeric(18, 4) NOT NULL,
	"valuation_rate" numeric(18, 4) DEFAULT '0' NOT NULL,
	"line_value" numeric(18, 2) DEFAULT '0' NOT NULL,
	"reason" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wastage_vouchers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"financial_year_id" uuid NOT NULL,
	"voucher_no" varchar(100) NOT NULL,
	"location_id" uuid NOT NULL,
	"txn_date" varchar(10) NOT NULL,
	"status" varchar(30) DEFAULT 'PENDING_APPROVAL' NOT NULL,
	"reason_description" text NOT NULL,
	"total_value" numeric(18, 2) DEFAULT '0' NOT NULL,
	"remarks" text,
	"approved_by" uuid,
	"approved_at" timestamp,
	"cancel_reason" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wastage_vouchers_voucher_no_unique" UNIQUE("voucher_no")
);
--> statement-breakpoint
CREATE TABLE "alert_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"alert_type" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"cron_expression" varchar(50) DEFAULT '0 8 * * *' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"txn_date" varchar(10) NOT NULL,
	"expense_head_id" uuid NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"paid_to" varchar(150) NOT NULL,
	"payment_mode" varchar(50) DEFAULT 'CASH' NOT NULL,
	"voucher_ref" varchar(100),
	"remarks" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fuel_loads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"txn_date" varchar(10) NOT NULL,
	"current_meter_reading" numeric(10, 2) NOT NULL,
	"previous_meter_reading" numeric(10, 2) NOT NULL,
	"distance_run_or_hours" numeric(10, 2) NOT NULL,
	"litres_issued" numeric(18, 4) NOT NULL,
	"expected_litres" numeric(18, 4) NOT NULL,
	"variance_litres" numeric(18, 4) NOT NULL,
	"is_full_tank_fill" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fuel_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"invoice_no" varchar(100) NOT NULL,
	"txn_date" varchar(10) NOT NULL,
	"litres" numeric(18, 4) NOT NULL,
	"rate_per_litre" numeric(18, 4) NOT NULL,
	"total_amount" numeric(18, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "labour_attendances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"attendance_date" varchar(10) NOT NULL,
	"worker_id" uuid,
	"subcontractor_id" uuid,
	"headcount" integer DEFAULT 1 NOT NULL,
	"trade" varchar(50) NOT NULL,
	"shift_hours" numeric(4, 2) DEFAULT '8.00' NOT NULL,
	"wage_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plant_dispatches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"from_location_id" uuid NOT NULL,
	"to_site_id" uuid NOT NULL,
	"recipe_id" uuid NOT NULL,
	"txn_date" varchar(10) NOT NULL,
	"dispatched_qty" numeric(18, 4) NOT NULL,
	"transfer_rate" numeric(18, 4) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plant_productions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"recipe_id" uuid NOT NULL,
	"txn_date" varchar(10) NOT NULL,
	"output_batch_qty" numeric(18, 4) NOT NULL,
	"cost_per_unit" numeric(18, 4) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plant_raw_material_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plant_dispatch_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"raw_material_item_id" uuid NOT NULL,
	"allocated_qty" numeric(18, 4) NOT NULL,
	"allocated_rate" numeric(18, 4) NOT NULL,
	"allocated_amount" numeric(18, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ra_bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"bill_number" varchar(50) NOT NULL,
	"bill_date" varchar(10) NOT NULL,
	"gross_amount" numeric(18, 2) NOT NULL,
	"retention_deduction" numeric(18, 2) DEFAULT '0' NOT NULL,
	"tds_deduction" numeric(18, 2) DEFAULT '0' NOT NULL,
	"gst_tds_deduction" numeric(18, 2) DEFAULT '0' NOT NULL,
	"net_payable_amount" numeric(18, 2) NOT NULL,
	"status" varchar(30) DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_logbooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"log_date" varchar(10) NOT NULL,
	"start_meter" numeric(10, 2) NOT NULL,
	"end_meter" numeric(10, 2) NOT NULL,
	"total_units_run" numeric(10, 2) NOT NULL,
	"work_details" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_approver_role_id_roles_id_fk" FOREIGN KEY ("approver_role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_action_by_users_id_fk" FOREIGN KEY ("action_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_rules" ADD CONSTRAINT "approval_rules_required_role_id_roles_id_fk" FOREIGN KEY ("required_role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_locks" ADD CONSTRAINT "period_locks_financial_year_id_financial_years_id_fk" FOREIGN KEY ("financial_year_id") REFERENCES "public"."financial_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_locks" ADD CONSTRAINT "period_locks_locked_by_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_location_scopes" ADD CONSTRAINT "user_location_scopes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boq_items" ADD CONSTRAINT "boq_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boq_items" ADD CONSTRAINT "boq_items_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_heads" ADD CONSTRAINT "expense_heads_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuel_sources" ADD CONSTRAINT "fuel_sources_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuel_sources" ADD CONSTRAINT "fuel_sources_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuel_sources" ADD CONSTRAINT "fuel_sources_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_unit_conversions" ADD CONSTRAINT "item_unit_conversions_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_current_site_id_sites_id_fk" FOREIGN KEY ("current_site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plants" ADD CONSTRAINT "plants_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_raw_material_item_id_items_id_fk" FOREIGN KEY ("raw_material_item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_output_item_id_items_id_fk" FOREIGN KEY ("output_item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcontractors" ADD CONSTRAINT "subcontractors_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workers" ADD CONSTRAINT "workers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_ledger" ADD CONSTRAINT "cost_ledger_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_ledger" ADD CONSTRAINT "cost_ledger_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_ledger" ADD CONSTRAINT "cost_ledger_boq_item_id_boq_items_id_fk" FOREIGN KEY ("boq_item_id") REFERENCES "public"."boq_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_ledger" ADD CONSTRAINT "party_ledger_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_balance" ADD CONSTRAINT "stock_balance_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_balance" ADD CONSTRAINT "stock_balance_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_balance" ADD CONSTRAINT "stock_balance_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_boq_item_id_boq_items_id_fk" FOREIGN KEY ("boq_item_id") REFERENCES "public"."boq_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grn_headers" ADD CONSTRAINT "grn_headers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grn_headers" ADD CONSTRAINT "grn_headers_financial_year_id_financial_years_id_fk" FOREIGN KEY ("financial_year_id") REFERENCES "public"."financial_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grn_headers" ADD CONSTRAINT "grn_headers_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grn_headers" ADD CONSTRAINT "grn_headers_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grn_headers" ADD CONSTRAINT "grn_headers_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grn_headers" ADD CONSTRAINT "grn_headers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grn_lines" ADD CONSTRAINT "grn_lines_grn_id_grn_headers_id_fk" FOREIGN KEY ("grn_id") REFERENCES "public"."grn_headers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grn_lines" ADD CONSTRAINT "grn_lines_po_line_id_purchase_order_lines_id_fk" FOREIGN KEY ("po_line_id") REFERENCES "public"."purchase_order_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grn_lines" ADD CONSTRAINT "grn_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_financial_year_id_financial_years_id_fk" FOREIGN KEY ("financial_year_id") REFERENCES "public"."financial_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_delivery_location_id_locations_id_fk" FOREIGN KEY ("delivery_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_consumption_lines" ADD CONSTRAINT "site_consumption_lines_consumption_id_site_consumptions_id_fk" FOREIGN KEY ("consumption_id") REFERENCES "public"."site_consumptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_consumption_lines" ADD CONSTRAINT "site_consumption_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_consumption_lines" ADD CONSTRAINT "site_consumption_lines_boq_item_id_boq_items_id_fk" FOREIGN KEY ("boq_item_id") REFERENCES "public"."boq_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_consumptions" ADD CONSTRAINT "site_consumptions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_consumptions" ADD CONSTRAINT "site_consumptions_financial_year_id_financial_years_id_fk" FOREIGN KEY ("financial_year_id") REFERENCES "public"."financial_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_consumptions" ADD CONSTRAINT "site_consumptions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_consumptions" ADD CONSTRAINT "site_consumptions_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_consumptions" ADD CONSTRAINT "site_consumptions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustment_lines" ADD CONSTRAINT "stock_adjustment_lines_adjustment_id_stock_adjustments_id_fk" FOREIGN KEY ("adjustment_id") REFERENCES "public"."stock_adjustments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustment_lines" ADD CONSTRAINT "stock_adjustment_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_financial_year_id_financial_years_id_fk" FOREIGN KEY ("financial_year_id") REFERENCES "public"."financial_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_issue_lines" ADD CONSTRAINT "transfer_issue_lines_transfer_issue_id_transfer_issues_id_fk" FOREIGN KEY ("transfer_issue_id") REFERENCES "public"."transfer_issues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_issue_lines" ADD CONSTRAINT "transfer_issue_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_issues" ADD CONSTRAINT "transfer_issues_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_issues" ADD CONSTRAINT "transfer_issues_financial_year_id_financial_years_id_fk" FOREIGN KEY ("financial_year_id") REFERENCES "public"."financial_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_issues" ADD CONSTRAINT "transfer_issues_from_location_id_locations_id_fk" FOREIGN KEY ("from_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_issues" ADD CONSTRAINT "transfer_issues_to_location_id_locations_id_fk" FOREIGN KEY ("to_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_issues" ADD CONSTRAINT "transfer_issues_in_transit_location_id_locations_id_fk" FOREIGN KEY ("in_transit_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_issues" ADD CONSTRAINT "transfer_issues_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_receipt_lines" ADD CONSTRAINT "transfer_receipt_lines_transfer_receipt_id_transfer_receipts_id_fk" FOREIGN KEY ("transfer_receipt_id") REFERENCES "public"."transfer_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_receipt_lines" ADD CONSTRAINT "transfer_receipt_lines_transfer_line_id_transfer_issue_lines_id_fk" FOREIGN KEY ("transfer_line_id") REFERENCES "public"."transfer_issue_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_receipt_lines" ADD CONSTRAINT "transfer_receipt_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_receipts" ADD CONSTRAINT "transfer_receipts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_receipts" ADD CONSTRAINT "transfer_receipts_financial_year_id_financial_years_id_fk" FOREIGN KEY ("financial_year_id") REFERENCES "public"."financial_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_receipts" ADD CONSTRAINT "transfer_receipts_transfer_issue_id_transfer_issues_id_fk" FOREIGN KEY ("transfer_issue_id") REFERENCES "public"."transfer_issues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_receipts" ADD CONSTRAINT "transfer_receipts_received_location_id_locations_id_fk" FOREIGN KEY ("received_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_receipts" ADD CONSTRAINT "transfer_receipts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wastage_voucher_lines" ADD CONSTRAINT "wastage_voucher_lines_wastage_id_wastage_vouchers_id_fk" FOREIGN KEY ("wastage_id") REFERENCES "public"."wastage_vouchers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wastage_voucher_lines" ADD CONSTRAINT "wastage_voucher_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wastage_vouchers" ADD CONSTRAINT "wastage_vouchers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wastage_vouchers" ADD CONSTRAINT "wastage_vouchers_financial_year_id_financial_years_id_fk" FOREIGN KEY ("financial_year_id") REFERENCES "public"."financial_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wastage_vouchers" ADD CONSTRAINT "wastage_vouchers_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wastage_vouchers" ADD CONSTRAINT "wastage_vouchers_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wastage_vouchers" ADD CONSTRAINT "wastage_vouchers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_entries" ADD CONSTRAINT "expense_entries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_entries" ADD CONSTRAINT "expense_entries_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuel_loads" ADD CONSTRAINT "fuel_loads_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuel_loads" ADD CONSTRAINT "fuel_loads_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuel_loads" ADD CONSTRAINT "fuel_loads_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuel_loads" ADD CONSTRAINT "fuel_loads_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuel_purchases" ADD CONSTRAINT "fuel_purchases_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuel_purchases" ADD CONSTRAINT "fuel_purchases_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuel_purchases" ADD CONSTRAINT "fuel_purchases_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labour_attendances" ADD CONSTRAINT "labour_attendances_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labour_attendances" ADD CONSTRAINT "labour_attendances_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labour_attendances" ADD CONSTRAINT "labour_attendances_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labour_attendances" ADD CONSTRAINT "labour_attendances_subcontractor_id_subcontractors_id_fk" FOREIGN KEY ("subcontractor_id") REFERENCES "public"."subcontractors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plant_dispatches" ADD CONSTRAINT "plant_dispatches_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plant_dispatches" ADD CONSTRAINT "plant_dispatches_from_location_id_locations_id_fk" FOREIGN KEY ("from_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plant_dispatches" ADD CONSTRAINT "plant_dispatches_to_site_id_sites_id_fk" FOREIGN KEY ("to_site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plant_dispatches" ADD CONSTRAINT "plant_dispatches_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plant_productions" ADD CONSTRAINT "plant_productions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plant_productions" ADD CONSTRAINT "plant_productions_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plant_productions" ADD CONSTRAINT "plant_productions_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plant_raw_material_allocations" ADD CONSTRAINT "plant_raw_material_allocations_plant_dispatch_id_plant_dispatches_id_fk" FOREIGN KEY ("plant_dispatch_id") REFERENCES "public"."plant_dispatches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plant_raw_material_allocations" ADD CONSTRAINT "plant_raw_material_allocations_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plant_raw_material_allocations" ADD CONSTRAINT "plant_raw_material_allocations_raw_material_item_id_items_id_fk" FOREIGN KEY ("raw_material_item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ra_bills" ADD CONSTRAINT "ra_bills_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ra_bills" ADD CONSTRAINT "ra_bills_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_logbooks" ADD CONSTRAINT "vehicle_logbooks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_logbooks" ADD CONSTRAINT "vehicle_logbooks_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_logbooks" ADD CONSTRAINT "vehicle_logbooks_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_voucher_series_lookup" ON "voucher_series" USING btree ("company_id","voucher_type","location_prefix","financial_year_code");--> statement-breakpoint
CREATE INDEX "idx_cost_ledger_site_head" ON "cost_ledger" USING btree ("site_id","cost_head","txn_date");--> statement-breakpoint
CREATE INDEX "idx_party_ledger_party_date" ON "party_ledger" USING btree ("party_id","txn_date");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_stock_balance_loc_item" ON "stock_balance" USING btree ("location_id","item_id");--> statement-breakpoint
CREATE INDEX "idx_stock_balance_item" ON "stock_balance" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_stock_ledger_loc_item_date" ON "stock_ledger" USING btree ("location_id","item_id","txn_date");--> statement-breakpoint
CREATE INDEX "idx_stock_ledger_voucher" ON "stock_ledger" USING btree ("voucher_type","voucher_id");