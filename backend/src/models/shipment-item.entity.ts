import type { ShipmentItem } from '../types/index.js';

/**
 * 运单明细实体：
 * - quantity 为原始（应收）数量
 * - receivedQuantity 为累计实收数量，未收部分 = quantity - receivedQuantity
 * 落表见 database/migrations/001_initial.sql 与 002_shipment_batch_receiving.sql
 */
export type ShipmentItemEntity = ShipmentItem;
