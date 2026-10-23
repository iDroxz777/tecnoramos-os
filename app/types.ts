export type Role = "admin" | "technician";

export type AppUser = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  status: "active" | "blocked";
  mustChangePassword: boolean;
  createdAt?: number;
};

export type Client = {
  id: string;
  name: string;
  status: "active" | "archived";
  createdAt?: number;
  updatedAt?: number;
};

export type FormState = {
  clientId: string | null;
  equipmentDescription: string;
  call: string[];
  callOther: string;
  callText: string;
  defects: string[];
  defectsOther: string;
  defectText: string;
  procedures: string[];
  procedureOther: string;
  procedureText: string;
  parts: string[];
  partOther: string;
  notes: string;
  arrivalTime: string;
  departureTime: string;
  technicianIds: string[];
  technicians: string[];
  signatureDataUrl: string;
  consentConfirmed: boolean;
  signedAt: number | null;
};

export const initialForm: FormState = {
  clientId: null,
  equipmentDescription: "",
  call: [],
  callOther: "",
  callText: "",
  defects: [],
  defectsOther: "",
  defectText: "",
  procedures: [],
  procedureOther: "",
  procedureText: "",
  parts: [],
  partOther: "",
  notes: "",
  arrivalTime: "",
  departureTime: "",
  technicianIds: [],
  technicians: [],
  signatureDataUrl: "",
  consentConfirmed: false,
  signedAt: null,
};

export type OrderStatus = "completed" | "sync_pending";

export type OrderRecord = {
  id: string;
  orderNumber: number | null;
  clientId: string | null;
  clientName: string;
  equipment: string;
  technicians: string[];
  arrivalTime: string;
  departureTime: string;
  status: OrderStatus;
  createdAt: number;
  finalizedAt: number;
  signedAt: number | null;
  completedBy: string;
  completedByDisplayName?: string;
  revisionNumber: number;
  correctedFromId: string | null;
  correctionReason: string | null;
  deletedAt: number | null;
  deletionReason: string | null;
  clientRequestId: string;
  data: FormState & { clientName?: string };
  /** Office review ("conferida"); absent on orders saved only on the phone. */
  reviewedAt?: number | null;
  reviewedBy?: string | null;
};

export type DraftRecord = {
  id: string;
  clientRequestId: string;
  userId: string;
  clientId: string | null;
  clientName: string;
  data: FormState;
  step: number;
  status: "draft" | "sync_pending";
  createdAt: number;
  updatedAt: number;
  ownerName?: string;
};

export type MonthCycleState = {
  cycle: {
    id: string;
    label: string;
    startedAt: number;
  } | null;
  completions: {
    clientName: string;
    completedAt: number;
  }[];
};

export type AuditRecord = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  createdAt: number;
  actorUsername: string;
  actorDisplayName: string;
};

export type SyncState = "online" | "offline" | "syncing";
