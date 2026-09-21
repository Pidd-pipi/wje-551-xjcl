import type { ShipmentStatus } from '../constants/enums';
import type { Supplier } from './supplier';
import type { Warehouse } from './inventory';

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

export interface ShipmentPendingItem {
  shipmentItemId: string;
  skuId: string;
  skuName: string;
  originalQuantity: number;
  receivedQuantity: number;
  pendingQuantity: number;
  diffQuantity: number;
}

export interface ShipmentPendingSummary {
  totalPendingQuantity: number;
  receivedQuantity: number;
  originalQuantity: number;
  items: ShipmentPendingItem[];
}

export interface ReceiveBatchPayload {
  batchNo: string;
  lines: Array<{ itemId: string; receivedQuantity: number }>;
}

export interface TimelineEvent {
  id: string;
  status: ShipmentStatus;
  operator: string;
  note: string;
  createdAt: string;
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
  pendingSummary?: ShipmentPendingSummary;
  supplier?: Supplier;
  warehouse?: Warehouse;
  createdAt: string;
  updatedAt: string;
}
