export const ROLES = ["super_admin", "cumplimiento", "comercio_owner", "comercio_cajero", "cliente"] as const;
export type Role = (typeof ROLES)[number];

export type Permission =
  | "config:fee"
  | "contracts:pause"
  | "metrics:global"
  | "kyc:review"
  | "disputes:resolve"
  | "links:create"
  | "links:cancel"
  | "payments:view"
  | "payments:view_today"
  | "payments:refund"
  | "members:manage"
  | "funds:withdraw";

const MATRIX: Record<Role, Permission[]> = {
  super_admin: ["config:fee", "contracts:pause", "metrics:global", "kyc:review", "disputes:resolve"],
  cumplimiento: ["kyc:review", "disputes:resolve"],
  comercio_owner: [
    "links:create",
    "links:cancel",
    "payments:view",
    "payments:view_today",
    "payments:refund",
    "members:manage",
    "funds:withdraw",
  ],
  comercio_cajero: ["links:create", "payments:view_today"],
  cliente: [],
};

export function can(role: Role, perm: Permission): boolean {
  return MATRIX[role].includes(perm);
}
