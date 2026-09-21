import { InventoryAlertLevel, ShipmentStatus, SupplierStatus } from '../constants/enums.js';

export type RoleCode = 'ADMIN' | 'PURCHASE_MANAGER' | 'WAREHOUSE_MANAGER' | 'VIEWER';

export interface User {
  id: string;
  username: string;
  password: string;
  name: string;
  roles: RoleCode[];
  permissions: string[];
}

export interface Supplier {
  id: string;
  name: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
  status: SupplierStatus;
  rating: number;
  ratingHistory: RatingRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface RatingRecord {
  id: string;
  score: number;
  weight: number;
  remark: string;
  createdAt: string;
}

export interface Warehouse {
  id: string;
  name: string;
  address: string;
  capacity: number;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

export interface Inventory {
  id: string;
  warehouseId: string;
  skuId: string;
  skuName: string;
  quantity: number;
  safetyStock: number;
  alertLevel: InventoryAlertLevel;
  updatedAt: string;
}

export interface ShipmentItem {
  id: string;
  shipmentId: string;
  skuId: string;
  skuName: string;
  quantity: number;
  receivedQuantity: number;
}

export interface ShipmentReceiptItem {
  id: string;
  receiptId: string;
  shipmentItemId: string;
  skuId: string;
  skuName: string;
  receivedQuantity: number;
  diffQuantity: number;
  createdAt: string;
}

export interface ShipmentReceipt {
  id: string;
  shipmentId: string;
  batchNo: string;
  totalReceivedQuantity: number;
  operator: string;
  items: ShipmentReceiptItem[];
  createdAt: string;
}

export interface ShipmentPendingSummary {
  totalPendingQuantity: number;
  receivedQuantity: number;
  originalQuantity: number;
  items: Array<{
    shipmentItemId: string;
    skuId: string;
    skuName: string;
    originalQuantity: number;
    receivedQuantity: number;
    pendingQuantity: number;
    diffQuantity: number;
  }>;
}

export interface Shipment {
  id: string;
  orderNo: string;
  supplierId: string;
  warehouseId: string;
  status: ShipmentStatus;
  trackingNo: string;
  carrier: string;
  estimatedArrival: string;
  actualArrival?: string;
  remark: string;
  items: ShipmentItem[];
  receipts: ShipmentReceipt[];
  timeline: TimelineEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface TimelineEvent {
  id: string;
  status: ShipmentStatus;
  operator: string;
  note: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  username: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'STATUS_CHANGE';
  module: 'SUPPLIER' | 'INVENTORY' | 'SHIPMENT' | 'USER';
  targetId: string;
  targetName: string;
  detail: unknown;
  ip: string;
  createdAt: string;
}
