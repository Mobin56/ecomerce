/**
 * Role-based access control. Permissions are stored in the DB (editable per
 * role in Admin > Users > Roles); this file is the catalogue + defaults that
 * the seed writes, and the pure check used everywhere.
 */

export const PERMISSIONS = {
  "dashboard.view": { group: "Dashboard", label: "View dashboard" },
  "products.view": { group: "Products", label: "View products" },
  "products.create": { group: "Products", label: "Create products" },
  "products.update": { group: "Products", label: "Edit products" },
  "products.delete": { group: "Products", label: "Delete products" },
  "products.import": { group: "Products", label: "Import / export / bulk edit" },
  "categories.manage": { group: "Products", label: "Manage categories & brands" },
  "inventory.view": { group: "Inventory", label: "View inventory" },
  "inventory.adjust": { group: "Inventory", label: "Adjust stock / purchases" },
  "orders.view": { group: "Orders", label: "View orders" },
  "orders.update": { group: "Orders", label: "Update order status / edit" },
  "orders.refund": { group: "Orders", label: "Refund orders" },
  "shipping.manage": { group: "Orders", label: "Create & manage shipments" },
  "customers.view": { group: "Customers", label: "View customers" },
  "customers.update": { group: "Customers", label: "Edit / block customers" },
  "coupons.manage": { group: "Marketing", label: "Manage coupons" },
  "reviews.moderate": { group: "Content", label: "Moderate reviews" },
  "content.manage": { group: "Content", label: "Homepage, pages, FAQ, blog" },
  "marketing.view": { group: "Marketing", label: "View marketing analytics" },
  "marketing.manage": { group: "Marketing", label: "Campaigns, ad spend, tracking settings" },
  "analytics.view": { group: "Analytics", label: "View analytics" },
  "finance.view": { group: "Finance", label: "View profit & expenses" },
  "finance.manage": { group: "Finance", label: "Manage expenses" },
  "payments.manage": { group: "Finance", label: "Payment settings & transactions" },
  "settings.manage": { group: "System", label: "Store settings" },
  "users.manage": { group: "System", label: "Admin users & roles" },
  "activity.view": { group: "System", label: "View activity log" },
  "ai.use": { group: "AI", label: "Use AI tools" },
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionKey[];

export type RoleKey =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "MANAGER"
  | "ORDER_MANAGER"
  | "INVENTORY_MANAGER"
  | "MARKETING_MANAGER"
  | "SUPPORT_AGENT"
  | "CONTENT_MANAGER";

const except = (...keys: PermissionKey[]) => ALL_PERMISSIONS.filter((k) => !keys.includes(k));

export const DEFAULT_ROLES: Record<RoleKey, { name: string; permissions: PermissionKey[] }> = {
  SUPER_ADMIN: { name: "Super Admin", permissions: ALL_PERMISSIONS },
  ADMIN: { name: "Admin", permissions: except("users.manage") },
  MANAGER: {
    name: "Manager",
    permissions: except("users.manage", "settings.manage", "payments.manage", "finance.manage"),
  },
  ORDER_MANAGER: {
    name: "Order Manager",
    permissions: ["dashboard.view", "orders.view", "orders.update", "shipping.manage", "customers.view", "products.view", "inventory.view"],
  },
  INVENTORY_MANAGER: {
    name: "Inventory Manager",
    permissions: ["dashboard.view", "products.view", "products.update", "products.import", "inventory.view", "inventory.adjust", "categories.manage"],
  },
  MARKETING_MANAGER: {
    name: "Marketing Manager",
    permissions: ["dashboard.view", "marketing.view", "marketing.manage", "analytics.view", "coupons.manage", "products.view", "ai.use"],
  },
  SUPPORT_AGENT: {
    name: "Support Agent",
    permissions: ["orders.view", "customers.view", "products.view", "reviews.moderate"],
  },
  CONTENT_MANAGER: {
    name: "Content Manager",
    permissions: ["content.manage", "reviews.moderate", "products.view", "products.update", "ai.use"],
  },
};

/** SUPER_ADMIN always passes, even if its DB permissions drift. */
export function can(
  subject: { roleKey: string; permissions: readonly string[] } | null | undefined,
  permission: PermissionKey,
): boolean {
  if (!subject) return false;
  if (subject.roleKey === "SUPER_ADMIN") return true;
  return subject.permissions.includes(permission);
}

export function canAny(subject: Parameters<typeof can>[0], permissions: PermissionKey[]): boolean {
  return permissions.some((p) => can(subject, p));
}

/** Admin navigation with the permission that gates each entry. */
export const ADMIN_NAV: { href: string; label: string; permission: PermissionKey; group: string }[] = [
  { href: "/admin", label: "Dashboard", permission: "dashboard.view", group: "Overview" },
  { href: "/admin/orders", label: "Orders", permission: "orders.view", group: "Sales" },
  { href: "/admin/customers", label: "Customers", permission: "customers.view", group: "Sales" },
  { href: "/admin/abandoned-carts", label: "Abandoned carts", permission: "customers.view", group: "Sales" },
  { href: "/admin/products", label: "Products", permission: "products.view", group: "Catalog" },
  { href: "/admin/categories", label: "Categories & brands", permission: "categories.manage", group: "Catalog" },
  { href: "/admin/inventory", label: "Inventory", permission: "inventory.view", group: "Catalog" },
  { href: "/admin/reviews", label: "Reviews", permission: "reviews.moderate", group: "Catalog" },
  { href: "/admin/coupons", label: "Coupons", permission: "coupons.manage", group: "Marketing" },
  { href: "/admin/marketing/campaigns", label: "Campaign analytics", permission: "marketing.view", group: "Marketing" },
  { href: "/admin/marketing/meta", label: "Meta tracking", permission: "marketing.manage", group: "Marketing" },
  { href: "/admin/marketing/events", label: "Event logs", permission: "marketing.view", group: "Marketing" },
  { href: "/admin/profit", label: "Profit", permission: "finance.view", group: "Finance" },
  { href: "/admin/expenses", label: "Expenses", permission: "finance.view", group: "Finance" },
  { href: "/admin/content/homepage", label: "Homepage", permission: "content.manage", group: "Content" },
  { href: "/admin/content/pages", label: "Pages & FAQ", permission: "content.manage", group: "Content" },
  { href: "/admin/ai", label: "AI assistant", permission: "ai.use", group: "Tools" },
  { href: "/admin/users", label: "Admin users", permission: "users.manage", group: "System" },
  { href: "/admin/activity", label: "Activity log", permission: "activity.view", group: "System" },
  { href: "/admin/settings", label: "Settings", permission: "settings.manage", group: "System" },
];
