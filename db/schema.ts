import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull(),
    displayName: text("display_name").notNull().default(""),
    passwordHash: text("password_hash").notNull(),
    salt: text("salt").notNull(),
    passwordIterations: integer("password_iterations").notNull().default(100000),
    role: text("role").notNull().default("technician"),
    status: text("status").notNull().default("active"),
    mustChangePassword: integer("must_change_password").notNull().default(0),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: integer("locked_until"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull().default(0),
  },
  (table) => [
    uniqueIndex("users_username_idx").on(table.username),
    index("users_status_idx").on(table.status),
  ],
);

export const sessions = sqliteTable(
  "sessions",
  {
    token: text("token").primaryKey(),
    userId: text("user_id").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    orderNumber: integer("order_number").notNull(),
    clientName: text("client_name").notNull(),
    equipment: text("equipment").notNull(),
    techniciansJson: text("technicians_json").notNull(),
    arrivalTime: text("arrival_time").notNull(),
    departureTime: text("departure_time").notNull(),
    dataJson: text("data_json").notNull(),
    status: text("status").notNull().default("completed"),
    clientId: text("client_id"),
    clientRequestId: text("client_request_id"),
    revisionNumber: integer("revision_number").notNull().default(1),
    correctedFromId: text("corrected_from_id"),
    correctionReason: text("correction_reason"),
    supersededById: text("superseded_by_id"),
    finalizedAt: integer("finalized_at"),
    signedAt: integer("signed_at"),
    consentConfirmed: integer("consent_confirmed").notNull().default(0),
    deletedAt: integer("deleted_at"),
    deletedBy: text("deleted_by"),
    deletionReason: text("deletion_reason"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("orders_user_id_idx").on(table.userId),
    index("orders_created_at_idx").on(table.createdAt),
    uniqueIndex("orders_client_request_idx").on(table.clientRequestId),
    index("orders_deleted_at_idx").on(table.deletedAt),
    index("orders_client_id_idx").on(table.clientId),
    index("orders_superseded_by_idx").on(table.supersededById),
  ],
);

export const clients = sqliteTable(
  "clients",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    createdBy: text("created_by").notNull(),
    archivedAt: integer("archived_at"),
    archivedBy: text("archived_by"),
  },
  (table) => [
    uniqueIndex("clients_normalized_name_idx").on(table.normalizedName),
    index("clients_status_idx").on(table.status),
  ],
);

export const drafts = sqliteTable(
  "drafts",
  {
    id: text("id").primaryKey(),
    clientRequestId: text("client_request_id").notNull(),
    userId: text("user_id").notNull(),
    clientId: text("client_id"),
    clientName: text("client_name").notNull().default(""),
    dataJson: text("data_json").notNull(),
    step: integer("step").notNull().default(1),
    status: text("status").notNull().default("draft"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("drafts_client_request_idx").on(table.clientRequestId),
    index("drafts_user_id_idx").on(table.userId),
    index("drafts_updated_at_idx").on(table.updatedAt),
  ],
);

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    actorUserId: text("actor_user_id").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    summary: text("summary").notNull(),
    metadataJson: text("metadata_json").notNull().default("{}"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("audit_logs_created_at_idx").on(table.createdAt),
    index("audit_logs_entity_idx").on(table.entityType, table.entityId),
  ],
);

export const orderRevisions = sqliteTable(
  "order_revisions",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id").notNull(),
    revisionNumber: integer("revision_number").notNull(),
    dataJson: text("data_json").notNull(),
    reason: text("reason").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("order_revisions_order_revision_idx").on(table.orderId, table.revisionNumber),
    index("order_revisions_order_id_idx").on(table.orderId),
  ],
);

export const appCounters = sqliteTable("app_counters", {
  name: text("name").primaryKey(),
  value: integer("value").notNull(),
});

export const loginAttempts = sqliteTable(
  "login_attempts",
  {
    username: text("username").primaryKey(),
    failedCount: integer("failed_count").notNull().default(0),
    lockedUntil: integer("locked_until"),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [index("login_attempts_updated_at_idx").on(table.updatedAt)],
);

export const serviceCycles = sqliteTable(
  "service_cycles",
  {
    id: text("id").primaryKey(),
    label: text("label").notNull(),
    isActive: integer("is_active").notNull().default(1),
    startedAt: integer("started_at").notNull(),
    startedBy: text("started_by").notNull(),
  },
  (table) => [index("service_cycles_active_idx").on(table.isActive)],
);

export const serviceCycleCompletions = sqliteTable(
  "service_cycle_completions",
  {
    id: text("id").primaryKey(),
    cycleId: text("cycle_id").notNull(),
    clientName: text("client_name").notNull(),
    orderId: text("order_id"),
    completedAt: integer("completed_at").notNull(),
    completedBy: text("completed_by").notNull(),
  },
  (table) => [
    uniqueIndex("service_cycle_client_idx").on(table.cycleId, table.clientName),
    index("service_cycle_completions_cycle_idx").on(table.cycleId),
  ],
);

// Office review marks ("conferida") live apart from orders, so marking or
// unmarking never touches a signed service order.
export const orderReviews = sqliteTable(
  "order_reviews",
  {
    orderId: text("order_id").primaryKey(),
    reviewedAt: integer("reviewed_at").notNull(),
    reviewedBy: text("reviewed_by").notNull(),
  },
  (table) => [index("order_reviews_reviewed_at_idx").on(table.reviewedAt)],
);
