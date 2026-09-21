import { v4 as uuid } from 'uuid';
import { ShipmentStatus, SupplierStatus } from '../constants/enums.js';
import { shipments, suppliers, warehouses } from '../database/seeds/initial.js';
import type { Shipment, ShipmentReceipt, ShipmentReceiptItem, ShipmentPendingSummary, User } from '../types/index.js';
import { auditService } from './audit.service.js';
import { inventoryService } from './inventory.service.js';
import { BusinessException } from '../utils/response.js';
import { assertRequired } from '../utils/validation.js';

export interface ReceiveLinePayload {
  itemId: string;
  receivedQuantity: number;
}

export interface ReceiveBatchPayload {
  batchNo: string;
  lines: ReceiveLinePayload[];
}

function nextOrderNo() {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return `SHIP-${date}-${String(shipments.length + 1).padStart(4, '0')}`;
}

export class ShipmentsService {
  list(query: Record<string, string | undefined>) {
    return shipments
      .filter((item) => !query.orderNo || item.orderNo.includes(query.orderNo))
      .filter((item) => !query.status || item.status === query.status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  detail(id: string) {
    const shipment = this.findShipment(id);
    return {
      ...shipment,
      pendingSummary: this.buildPendingSummary(shipment),
      supplier: suppliers.find((item) => item.id === shipment.supplierId),
      warehouse: warehouses.find((item) => item.id === shipment.warehouseId),
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
      receipts: [],
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
   * 分批收货：仓库按明细录入本次实收数量与收货批次号。
   * - 未收部分保留待收，运单保持运输中；累计实收达到原始数量后才签收；
   * - 任一 SKU 超收时整单拒绝，库存不变；
   * - 同一批次号重复提交不能重复入库。
   */
  receive(id: string, payload: ReceiveBatchPayload, user?: User) {
    const shipment = this.requireStatus(id, [ShipmentStatus.IN_TRANSIT]);
    assertRequired(payload?.batchNo, '收货批次号');
    const batchNo = String(payload.batchNo).trim();
    if (!batchNo) throw new BusinessException(400, '收货批次号不能为空');
    if (!Array.isArray(payload.lines) || payload.lines.length === 0) throw new BusinessException(400, '收货明细不能为空');

    // 同一批次号重复提交不能重复入库
    if (shipment.receipts.some((receipt) => receipt.batchNo === batchNo)) {
      throw new BusinessException(400, `收货批次号 ${batchNo} 已提交，不能重复入库`);
    }

    // 同一批次内同一明细只能出现一次
    const lineItemIds = payload.lines.map((line) => line.itemId);
    if (new Set(lineItemIds).size !== lineItemIds.length) {
      throw new BusinessException(400, '同一收货批次中存在重复的运单明细');
    }

    // 先完成全部校验，任一 SKU 超收则整单拒绝、库存不变
    const validated = payload.lines.map((line) => {
      const item = shipment.items.find((candidate) => candidate.id === line.itemId);
      if (!item) throw new BusinessException(400, `运单明细 ${line.itemId} 不存在`);
      const receivedQuantity = Number(line.receivedQuantity);
      if (!Number.isInteger(receivedQuantity) || receivedQuantity < 0) {
        throw new BusinessException(400, `SKU ${item.skuId} 的本次实收数量必须是非负整数`);
      }
      if (item.receivedQuantity + receivedQuantity > item.quantity) {
        throw new BusinessException(400, `SKU ${item.skuId} 超收：原始数量 ${item.quantity}，累计已收 ${item.receivedQuantity}，本次实收 ${receivedQuantity}`);
      }
      return { item, receivedQuantity };
    });

    if (validated.every((line) => line.receivedQuantity === 0)) {
      throw new BusinessException(400, '本次收货至少需要录入一条大于 0 的实收数量');
    }

    const now = new Date().toISOString();
    const receiptId = uuid();
    const receiptItems: ShipmentReceiptItem[] = validated
      .filter((line) => line.receivedQuantity > 0)
      .map((line) => ({
        id: uuid(),
        receiptId,
        shipmentItemId: line.item.id,
        skuId: line.item.skuId,
        skuName: line.item.skuName,
        receivedQuantity: line.receivedQuantity,
        diffQuantity: line.item.quantity - (line.item.receivedQuantity + line.receivedQuantity),
        createdAt: now,
      }));

    // 先完成库存入账，任一 SKU 入库失败则回滚已增库存，保证库存净增与收货一致
    const appliedInventory: Array<{ warehouseId: string; skuId: string; quantity: number }> = [];
    try {
      receiptItems.forEach((receiptItem) => {
        inventoryService.inbound(
          {
            warehouseId: shipment.warehouseId,
            skuId: receiptItem.skuId,
            skuName: receiptItem.skuName,
            quantity: receiptItem.receivedQuantity,
            batchNo,
            sourceOrderNo: shipment.orderNo,
          },
          user,
        );
        appliedInventory.push({ warehouseId: shipment.warehouseId, skuId: receiptItem.skuId, quantity: receiptItem.receivedQuantity });
      });
    } catch (error) {
      appliedInventory.forEach((applied) => {
        const inventory = inventoryService.list({ warehouseId: applied.warehouseId }).find((candidate) => candidate.skuId === applied.skuId);
        if (inventory) {
          inventory.quantity -= applied.quantity;
        }
      });
      throw error;
    }

    // 库存全部入账成功后才提交累计实收与批次记录
    validated.forEach((line) => { line.item.receivedQuantity += line.receivedQuantity; });

    const totalReceivedQuantity = receiptItems.reduce((sum, item) => sum + item.receivedQuantity, 0);
    const receipt: ShipmentReceipt = {
      id: receiptId,
      shipmentId: shipment.id,
      batchNo,
      totalReceivedQuantity,
      operator: user?.name ?? '系统',
      items: receiptItems,
      createdAt: now,
    };
    shipment.receipts.unshift(receipt);
    shipment.updatedAt = now;

    const summaryAfter = this.buildPendingSummary(shipment);
    const fullyReceived = shipment.items.every((item) => item.receivedQuantity === item.quantity);

    if (fullyReceived) {
      shipment.actualArrival = now;
      this.transition(
        shipment,
        ShipmentStatus.DELIVERED,
        `批次 ${batchNo} 收货完成，累计实收达到原始数量，签收并入库`,
        user,
        { batchNo, receipt, pendingSummary: summaryAfter },
      );
    } else {
      shipment.timeline.unshift({ id: uuid(), status: ShipmentStatus.IN_TRANSIT, operator: user?.name ?? '系统', note: `批次 ${batchNo} 部分收货 ${totalReceivedQuantity} 件，待收 ${summaryAfter.totalPendingQuantity} 件`, createdAt: now });
      auditService.record(
        {
          action: 'UPDATE',
          module: 'SHIPMENT',
          targetId: shipment.id,
          targetName: shipment.orderNo,
          detail: {
            type: 'PARTIAL_RECEIVE',
            batchNo,
            receipt,
            pendingSummary: summaryAfter,
          },
        },
        user,
      );
    }

    return { ...shipment, pendingSummary: summaryAfter, receipt };
  }

  exception(id: string, reason: string, user?: User) {
    const shipment = this.requireStatus(id, [ShipmentStatus.PENDING, ShipmentStatus.SHIPPED, ShipmentStatus.IN_TRANSIT]);
    shipment.remark = reason;
    return this.transition(shipment, ShipmentStatus.EXCEPTION, reason, user);
  }

  cancel(id: string, user?: User) {
    return this.transition(this.requireStatus(id, [ShipmentStatus.PENDING]), ShipmentStatus.CANCELLED, '取消运单', user);
  }

  pendingSummary(id: string): ShipmentPendingSummary {
    return this.buildPendingSummary(this.findShipment(id));
  }

  private findShipment(id: string) {
    const shipment = shipments.find((item) => item.id === id);
    if (!shipment) throw new BusinessException(404, '运单不存在');
    return shipment;
  }

  private requireStatus(id: string, allowed: ShipmentStatus[]) {
    const shipment = this.findShipment(id);
    if (!allowed.includes(shipment.status)) throw new BusinessException(400, `当前状态${shipment.status}不允许该操作`);
    return shipment;
  }

  private buildPendingSummary(shipment: Shipment): ShipmentPendingSummary {
    const items = shipment.items.map((item) => {
      const receivedQuantity = item.receivedQuantity;
      const pendingQuantity = item.quantity - receivedQuantity;
      return {
        shipmentItemId: item.id,
        skuId: item.skuId,
        skuName: item.skuName,
        originalQuantity: item.quantity,
        receivedQuantity,
        pendingQuantity,
        diffQuantity: pendingQuantity,
      };
    });
    return {
      originalQuantity: items.reduce((sum, item) => sum + item.originalQuantity, 0),
      receivedQuantity: items.reduce((sum, item) => sum + item.receivedQuantity, 0),
      totalPendingQuantity: items.reduce((sum, item) => sum + item.pendingQuantity, 0),
      items,
    };
  }

  private transition(
    shipment: Shipment,
    status: ShipmentStatus,
    note: string,
    user?: User,
    extraDetail?: Record<string, unknown>,
  ) {
    const before = shipment.status;
    shipment.status = status;
    shipment.updatedAt = new Date().toISOString();
    shipment.timeline.unshift({ id: uuid(), status, operator: user?.name ?? '系统', note, createdAt: shipment.updatedAt });
    auditService.record(
      {
        action: 'STATUS_CHANGE',
        module: 'SHIPMENT',
        targetId: shipment.id,
        targetName: shipment.orderNo,
        detail: { before, after: status, note, ...extraDetail },
      },
      user,
    );
    return shipment;
  }
}

export const shipmentsService = new ShipmentsService();
