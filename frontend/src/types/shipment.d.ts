import type { ShipmentStatus } from '../constants/enums';
import type { Supplier } from './supplier';
import type { Warehouse } from './inventory';

export interface ShipmentItem {
  id: string;
  shipmentId: string;
  skuId: string;
  skuName: string;
  quantity: number;
  /** 累计实收数量 */
  receivedQuantity: number;
}

/** 单次分批收货中某条明细的实收与差异 */
export interface ReceivingLine {
  itemId: string;
  skuId: string;
  skuName: string;
  orderedQuantity: number;
  /** 本次实收数量 */
  receivedQuantity: number;
  /** 累计实收数量 */
  receivedQuantityTotal: number;
  /** 本次提交前累计实收数量 */
  beforeQuantity: number;
  /** 剩余待收数量 */
  pendingQuantity: number;
  /** 差异：累计实收 - 原始数量 */
  diff: number;
}

export interface ReceivingRecord {
  id: string;
  shipmentId: string;
  batchNo: string;
  lines: ReceivingLine[];
  totalReceivedQuantity: number;
  completed: boolean;
  operator: string;
  createdAt: string;
}

export interface PendingSummaryLine {
  itemId: string;
  skuId: string;
  skuName: string;
  orderedQuantity: number;
  receivedQuantity: number;
  pendingQuantity: number;
}

export interface PendingSummary {
  orderedQuantityTotal: number;
  receivedQuantityTotal: number;
  pendingQuantityTotal: number;
  pendingLineCount: number;
  completed: boolean;
  lines: PendingSummaryLine[];
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
  receivings?: ReceivingRecord[];
  pendingSummary?: PendingSummary;
  timeline: TimelineEvent[];
  supplier?: Supplier;
  warehouse?: Warehouse;
  createdAt: string;
  updatedAt: string;
}

export interface ShipmentReceiveItemPayload {
  itemId: string;
  receivedQuantity: number;
}

export interface ShipmentReceivePayload {
  batchNo: string;
  items: ShipmentReceiveItemPayload[];
}
