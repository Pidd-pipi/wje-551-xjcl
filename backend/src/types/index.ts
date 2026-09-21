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
  /** 累计实收数量，未收部分保留待收 */
  receivedQuantity: number;
}

/** 单次分批收货中某条明细的实收与差异 */
export interface ReceivingLine {
  itemId: string;
  skuId: string;
  skuName: string;
  /** 原始（应收）数量 */
  orderedQuantity: number;
  /** 本次实收数量 */
  receivedQuantity: number;
  /** 累计实收数量 */
  receivedQuantityTotal: number;
  /** 本次提交前累计实收数量 */
  beforeQuantity: number;
  /** 本次提交后剩余待收数量 */
  pendingQuantity: number;
  /** 差异：累计实收 - 原始数量，0 表示该 SKU 已收齐 */
  diff: number;
}

/** 一次分批收货提交（对应一个收货批次号） */
export interface ReceivingRecord {
  id: string;
  shipmentId: string;
  /** 收货批次号，同一运单内不可重复提交 */
  batchNo: string;
  lines: ReceivingLine[];
  /** 本次实收合计 */
  totalReceivedQuantity: number;
  /** 本次提交后运单是否全部收齐 */
  completed: boolean;
  operator: string;
  createdAt: string;
}

/** 运单待收汇总 */
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
  /** 仍有待收数量的明细条数 */
  pendingLineCount: number;
  completed: boolean;
  lines: PendingSummaryLine[];
}

export interface ShipmentReceiveItemPayload {
  itemId: string;
  receivedQuantity: number;
}

export interface ShipmentReceivePayload {
  batchNo: string;
  items: ShipmentReceiveItemPayload[];
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
  /** 分批收货记录（按提交时间倒序） */
  receivings: ReceivingRecord[];
  /** 待收汇总（详情接口返回） */
  pendingSummary?: PendingSummary;
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
