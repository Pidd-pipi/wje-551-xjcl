import { v4 as uuid } from 'uuid';
import { ShipmentStatus, SupplierStatus } from '../constants/enums.js';
import { shipments, suppliers, warehouses } from '../database/seeds/initial.js';
import type {
  PendingSummary,
  ReceivingLine,
  ReceivingRecord,
  Shipment,
  ShipmentReceivePayload,
  User,
} from '../types/index.js';
import { auditService } from './audit.service.js';
import { inventoryService } from './inventory.service.js';
import { BusinessException } from '../utils/response.js';
import { assertNonNegativeInteger, assertRequired } from '../utils/validation.js';

function nextOrderNo() {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return `SHIP-${date}-${String(shipments.length + 1).padStart(4, '0')}`;
}

function nextBatchNo() {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const rand = uuid().slice(0, 8).toUpperCase();
  return `RCV-${date}-${rand}`;
}

export class ShipmentsService {
  list(query: Record<string, string | undefined>) {
    return shipments
      .filter((item) => !query.orderNo || item.orderNo.includes(query.orderNo))
      .filter((item) => !query.status || item.status === query.status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  detail(id: string) {
    const shipment = shipments.find((item) => item.id === id);
    if (!shipment) throw new BusinessException(404, '运单不存在');
    return {
      ...shipment,
      supplier: suppliers.find((item) => item.id === shipment.supplierId),
      warehouse: warehouses.find((item) => item.id === shipment.warehouseId),
      pendingSummary: this.buildPendingSummary(shipment),
    };
  }

  create(payload: Pick<Shipment, 'supplierId' | 'warehouseId' | 'items' | 'estimatedArrival' | 'remark'>, user?: User) {
    const supplier = suppliers.find((item) => item.id === payload.supplierId);
    if (!supplier) throw new BusinessException(404, '供应商不存在');
    if (supplier.status === SupplierStatus.BLACKLISTED) throw new BusinessException(400, '黑名单供应商不能创建新的运单');
    const warehouse = warehouses.find((item) => item.id === payload.warehouseId);
    if (!warehouse) throw new BusinessException(404, '仓库不存在');
    const now = new Date().toISOString();
    const shipmentId = uuid();
    const shipment: Shipment = {
      id: shipmentId,
      orderNo: nextOrderNo(),
      supplierId: payload.supplierId,
      warehouseId: payload.warehouseId,
      status: ShipmentStatus.PENDING,
      trackingNo: '',
      carrier: '',
      estimatedArrival: payload.estimatedArrival,
      remark: payload.remark ?? '',
      items: payload.items.map((item) => ({ ...item, id: uuid(), shipmentId, receivedQuantity: 0 })),
      receivings: [],
      timeline: [{ id: uuid(), status: ShipmentStatus.PENDING, operator: user?.name ?? '系统', note: '创建运单', createdAt: now }],
      createdAt: now,
      updatedAt: now,
    };
    shipments.unshift(shipment);
    auditService.record({ action: 'CREATE', module: 'SHIPMENT', targetId: shipment.id, targetName: shipment.orderNo, detail: shipment }, user);
    return shipment;
  }

  ship(id: string, payload: { trackingNo: string; carrier: string }, user?: User) {
    const shipment = this.requireStatus(id, [ShipmentStatus.PENDING]);
    shipment.trackingNo = payload.trackingNo;
    shipment.carrier = payload.carrier;
    return this.transition(shipment, ShipmentStatus.SHIPPED, '发货', user);
  }

  transit(id: string, user?: User) {
    return this.transition(this.requireStatus(id, [ShipmentStatus.SHIPPED, ShipmentStatus.EXCEPTION]), ShipmentStatus.IN_TRANSIT, '在途更新', user);
  }

  /**
   * 一次性签收：按各明细剩余待收数量一次性收齐（运单列表快捷签收沿用）。
   */
  receive(id: string, user?: User) {
    const shipment = this.requireStatus(id, [ShipmentStatus.IN_TRANSIT]);
    const payload: ShipmentReceivePayload = {
      batchNo: nextBatchNo(),
      items: shipment.items.map((item) => ({ itemId: item.id, receivedQuantity: item.quantity - item.receivedQuantity })),
    };
    return this.applyReceive(shipment, payload, user, '签收并自动入库');
  }

  /**
   * 分批收货：按明细录入本次实收数量与收货批次号。
   * - 任一 SKU 累计实收超过原始数量：整单拒绝，库存不变
   * - 同一批次号重复提交：拒绝入库
   * - 未收部分保留待收，运单保持运输中；全部收齐后签收并按净增更新库存
   */
  receiveBatch(id: string, payload: ShipmentReceivePayload, user?: User) {
    const shipment = this.requireStatus(id, [ShipmentStatus.IN_TRANSIT]);
    assertRequired(typeof payload?.batchNo === 'string' ? payload.batchNo.trim() : '', '收货批次号');
    if (!Array.isArray(payload.items) || payload.items.length === 0) throw new BusinessException(400, '本次收货明细不能为空');

    const batchNo = payload.batchNo.trim();

    // 所有校验必须在任何库存变动之前完成，确保拒绝时整单无副作用
    if (shipment.receivings.some((record) => record.batchNo === batchNo)) {
      throw new BusinessException(400, `收货批次号 ${batchNo} 已提交，不能重复入库`);
    }

    const lines: Array<{ item: Shipment['items'][number]; receivedThisTime: number }> = [];
    const seenItemIds = new Set<string>();
    for (const entry of payload.items) {
      assertRequired(entry?.itemId, '收货明细ID');
      if (seenItemIds.has(entry.itemId)) throw new BusinessException(400, `明细 ${entry.itemId} 重复提交`);
      seenItemIds.add(entry.itemId);
      const item = shipment.items.find((candidate) => candidate.id === entry.itemId);
      if (!item || item.shipmentId !== shipment.id) throw new BusinessException(400, `明细 ${entry.itemId} 不属于当前运单`);
      const receivedThisTime = Number(entry.receivedQuantity);
      assertNonNegativeInteger(receivedThisTime, `SKU ${item.skuId} 本次实收数量`);
      // 任一 SKU 超收 -> 整单拒绝，库存不变
      if (item.receivedQuantity + receivedThisTime > item.quantity) {
        throw new BusinessException(400, `SKU ${item.skuId} 累计实收 ${item.receivedQuantity + receivedThisTime} 超过原始数量 ${item.quantity}，整单已拒绝收货，库存不变`);
      }
      lines.push({ item, receivedThisTime });
    }

    const receivedThisTimeTotal = lines.reduce((sum, line) => sum + line.receivedThisTime, 0);
    if (receivedThisTimeTotal <= 0) throw new BusinessException(400, '本次实收数量合计必须大于 0');

    const normalized: ShipmentReceivePayload = {
      batchNo,
      items: lines.map((line) => ({ itemId: line.item.id, receivedQuantity: line.receivedThisTime })),
    };
    return this.applyReceive(shipment, normalized, user);
  }

  exception(id: string, reason: string, user?: User) {
    const shipment = this.requireStatus(id, [ShipmentStatus.PENDING, ShipmentStatus.SHIPPED, ShipmentStatus.IN_TRANSIT]);
    shipment.remark = reason;
    return this.transition(shipment, ShipmentStatus.EXCEPTION, reason, user);
  }

  cancel(id: string, user?: User) {
    return this.transition(this.requireStatus(id, [ShipmentStatus.PENDING]), ShipmentStatus.CANCELLED, '取消运单', user);
  }

  /**
   * 应用一次收货。入参已保证：批次号不重复、各明细不超收、合计大于 0。
   */
  private applyReceive(shipment: Shipment, payload: ShipmentReceivePayload, user?: User, fullReceiveNote?: string) {
    const byItemId = new Map(payload.items.map((entry) => [entry.itemId, Number(entry.receivedQuantity)]));
    let totalReceivedThisTime = 0;
    const receivingLines: ReceivingLine[] = shipment.items.map((item) => {
      const receivedThisTime = byItemId.get(item.id) ?? 0;
      const before = item.receivedQuantity;
      item.receivedQuantity += receivedThisTime;
      totalReceivedThisTime += receivedThisTime;
      return {
        itemId: item.id,
        skuId: item.skuId,
        skuName: item.skuName,
        orderedQuantity: item.quantity,
        receivedQuantity: receivedThisTime,
        receivedQuantityTotal: item.receivedQuantity,
        pendingQuantity: item.quantity - item.receivedQuantity,
        diff: item.receivedQuantity - item.quantity,
        beforeQuantity: before,
      };
    });

    const summary = this.buildPendingSummary(shipment);
    const completed = summary.completed;

    const record: ReceivingRecord = {
      id: uuid(),
      shipmentId: shipment.id,
      batchNo: payload.batchNo,
      lines: receivingLines,
      totalReceivedQuantity: totalReceivedThisTime,
      completed,
      operator: user?.name ?? '系统',
      createdAt: new Date().toISOString(),
    };
    shipment.receivings.unshift(record);

    // 本次实收逐 SKU 按净增入库
    const inboundResults = receivingLines
      .filter((line) => line.receivedQuantity > 0)
      .map((line) => {
        const inventory = inventoryService.inbound(
          { warehouseId: shipment.warehouseId, skuId: line.skuId, skuName: line.skuName, quantity: line.receivedQuantity },
          user,
          { shipmentId: shipment.id, orderNo: shipment.orderNo, batchNo: payload.batchNo, itemId: line.itemId },
        );
        return { itemId: line.itemId, skuId: line.skuId, inboundQuantity: line.receivedQuantity, inventoryQuantity: inventory.quantity };
      });

    // 审计记录包含收货批次与差异
    auditService.record(
      {
        action: 'UPDATE',
        module: 'SHIPMENT',
        targetId: shipment.id,
        targetName: shipment.orderNo,
        detail: {
          type: completed ? 'RECEIVE_COMPLETE' : 'RECEIVE_PARTIAL',
          batchNo: payload.batchNo,
          lines: receivingLines,
          totalReceivedQuantity: totalReceivedThisTime,
          pendingSummary: summary,
          inbound: inboundResults,
        },
      },
      user,
    );

    shipment.updatedAt = new Date().toISOString();

    if (completed) {
      shipment.actualArrival = shipment.actualArrival ?? new Date().toISOString();
      this.transition(
        shipment,
        ShipmentStatus.DELIVERED,
        fullReceiveNote ?? `批次 ${payload.batchNo} 收货完成，全部收齐并签收`,
        user,
        { batchNo: payload.batchNo, receiving: { lines: receivingLines, totalReceivedQuantity: totalReceivedThisTime } },
      );
      return { ...shipment, pendingSummary: summary };
    }

    // 部分收货：运单保持运输中，仅追加时间线
    shipment.timeline.unshift({
      id: uuid(),
      status: ShipmentStatus.IN_TRANSIT,
      operator: user?.name ?? '系统',
      note: `分批收货 ${payload.batchNo}：本次实收 ${totalReceivedThisTime}，待收 ${summary.pendingQuantityTotal}`,
      createdAt: shipment.updatedAt,
    });
    return { ...shipment, pendingSummary: summary };
  }

  private buildPendingSummary(shipment: Shipment): PendingSummary {
    const lines = shipment.items.map((item) => ({
      itemId: item.id,
      skuId: item.skuId,
      skuName: item.skuName,
      orderedQuantity: item.quantity,
      receivedQuantity: item.receivedQuantity,
      pendingQuantity: item.quantity - item.receivedQuantity,
    }));
    const orderedQuantityTotal = lines.reduce((sum, line) => sum + line.orderedQuantity, 0);
    const receivedQuantityTotal = lines.reduce((sum, line) => sum + line.receivedQuantity, 0);
    const pendingQuantityTotal = orderedQuantityTotal - receivedQuantityTotal;
    return {
      orderedQuantityTotal,
      receivedQuantityTotal,
      pendingQuantityTotal,
      pendingLineCount: lines.filter((line) => line.pendingQuantity > 0).length,
      completed: pendingQuantityTotal === 0,
      lines,
    };
  }

  private requireStatus(id: string, allowed: ShipmentStatus[]) {
    const shipment = shipments.find((item) => item.id === id);
    if (!shipment) throw new BusinessException(404, '运单不存在');
    if (!allowed.includes(shipment.status)) throw new BusinessException(400, `当前状态${shipment.status}不允许该操作`);
    return shipment;
  }

  private transition(shipment: Shipment, status: ShipmentStatus, note: string, user?: User, extraDetail?: Record<string, unknown>) {
    const before = shipment.status;
    shipment.status = status;
    shipment.updatedAt = new Date().toISOString();
    shipment.timeline.unshift({ id: uuid(), status, operator: user?.name ?? '系统', note, createdAt: shipment.updatedAt });
    auditService.record({ action: 'STATUS_CHANGE', module: 'SHIPMENT', targetId: shipment.id, targetName: shipment.orderNo, detail: { before, after: status, note, ...extraDetail } }, user);
    return shipment;
  }
}

export const shipmentsService = new ShipmentsService();
