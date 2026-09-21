import type { ReceivingRecord, Shipment } from '../types/index.js';
import { ShipmentStatus } from '../constants/enums.js';

export type ShipmentEntity = Shipment;
/** 分批收货批次记录实体，落表 shipment_receivings / shipment_receiving_lines */
export type ShipmentReceivingEntity = ReceivingRecord;
export const shipmentStatuses = Object.values(ShipmentStatus);
