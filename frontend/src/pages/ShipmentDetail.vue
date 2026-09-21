<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { shipmentsApi } from '../api/shipments';
import DataTable from '../components/common/DataTable.vue';
import StatusBadge from '../components/common/StatusBadge.vue';
import { ShipmentStatus } from '../constants/enums';
import { PERMISSIONS } from '../constants/permissions';
import { useShipmentStore } from '../stores/shipmentStore';
import type { ShipmentReceipt } from '../types/shipment';
import { formatDate } from '../utils/format';

const route = useRoute();
const store = useShipmentStore();
const id = String(route.params.id);
const submitting = ref(false);

const batchNo = ref('');
const receivedInputs = reactive<Record<string, number>>({});

const shipment = computed(() => store.current);
const canReceive = computed(() => shipment.value?.status === ShipmentStatus.IN_TRANSIT);
const pendingSummary = computed(() => shipment.value?.pendingSummary);

onMounted(async () => {
  await store.fetchDetail(id);
  initInputs();
});

function initInputs() {
  Object.keys(receivedInputs).forEach((key) => delete receivedInputs[key]);
  shipment.value?.items.forEach((item) => {
    receivedInputs[item.id] = item.quantity - item.receivedQuantity;
  });
}

async function submitReceive() {
  if (!batchNo.value.trim()) {
    window.dispatchEvent(new CustomEvent('app-error', { detail: '请填写收货批次号' }));
    return;
  }
  const lines = (shipment.value?.items ?? [])
    .filter((item) => item.receivedQuantity < item.quantity)
    .map((item) => ({ itemId: item.id, receivedQuantity: Number(receivedInputs[item.id] ?? 0) }));
  if (lines.every((line) => line.receivedQuantity === 0)) {
    window.dispatchEvent(new CustomEvent('app-error', { detail: '本次收货至少需要录入一条大于 0 的实收数量' }));
    return;
  }
  submitting.value = true;
  try {
    await shipmentsApi.receive(id, { batchNo: batchNo.value.trim(), lines });
    await store.fetchDetail(id);
    initInputs();
    batchNo.value = '';
  } finally {
    submitting.value = false;
  }
}

async function cancel() { await shipmentsApi.cancel(id); await store.fetchDetail(id); }

const receiptColumns = [
  { key: 'batchNo', title: '收货批次号' },
  { key: 'totalReceivedQuantity', title: '本批次实收' },
  { key: 'operator', title: '收货人' },
  { key: 'createdAt', title: '收货时间' },
];

function receiptRows(receipt: ShipmentReceipt) {
  return receipt.items.map((item) => ({ ...item, id: item.id }));
}
</script>

<template>
  <section v-if="shipment">
    <div class="page-title">
      <h2>{{ shipment.orderNo }}</h2>
      <StatusBadge :value="shipment.status" />
    </div>

    <div v-if="canReceive && pendingSummary" class="panel pending-banner">
      <strong>待收汇总：</strong>
      原始 {{ pendingSummary.originalQuantity }} 件，已累计实收 {{ pendingSummary.receivedQuantity }} 件，
      <span class="pending-count">待收 {{ pendingSummary.totalPendingQuantity }} 件</span>
    </div>

    <div class="grid two">
      <div class="panel">
        <h3>运单信息</h3>
        <p>承运方：{{ shipment.carrier || '-' }}</p>
        <p>追踪号：{{ shipment.trackingNo || '-' }}</p>
        <p>预计到达：{{ formatDate(shipment.estimatedArrival) }}</p>
        <p v-if="shipment.actualArrival">实际签收：{{ formatDate(shipment.actualArrival) }}</p>
        <p>备注：{{ shipment.remark || '-' }}</p>
        <button v-if="shipment.status === ShipmentStatus.PENDING" v-permission="PERMISSIONS.SHIPMENT_WRITE" class="btn secondary" @click="cancel">取消运单</button>
      </div>
      <div class="panel">
        <h3>物流时间线</h3>
        <p v-for="event in shipment.timeline" :key="event.id">
          <StatusBadge :value="event.status" /> {{ event.note }} · {{ event.operator }} · {{ formatDate(event.createdAt) }}
        </p>
      </div>
    </div>

    <h3>运单明细与分批收货</h3>
    <div v-if="canReceive" class="panel receive-panel">
      <div class="toolbar">
        <label>收货批次号：<input v-model="batchNo" placeholder="如 RCV-20260921-01" style="width:240px" /></label>
        <button v-permission="PERMISSIONS.SHIPMENT_RECEIVE" class="btn" :disabled="submitting" @click="submitReceive">
          {{ submitting ? '提交中...' : '提交本批次收货' }}
        </button>
      </div>
      <DataTable
        :columns="[
          { key: 'skuId', title: 'SKU' },
          { key: 'skuName', title: '名称' },
          { key: 'quantity', title: '原始数量' },
          { key: 'receivedQuantity', title: '累计实收' },
          { key: 'pendingQuantity', title: '待收数量' },
          { key: 'input', title: '本次实收' },
        ]"
        :data="(pendingSummary?.items ?? []) as any"
      >
        <template #receivedQuantity="{ row }"><span :class="{ done: row.pendingQuantity === 0 }">{{ row.receivedQuantity }}</span></template>
        <template #pendingQuantity="{ row }"><span :class="{ zero: row.pendingQuantity === 0 }">{{ row.pendingQuantity }}</span></template>
        <template #input="{ row }">
          <input
            v-if="row.pendingQuantity > 0"
            v-model.number="receivedInputs[row.shipmentItemId]"
            type="number"
            min="0"
            :max="row.pendingQuantity"
            style="width:110px"
          />
          <span v-else class="done-tag">已收齐</span>
        </template>
      </DataTable>
      <p class="hint">提示：未收部分继续保留待收，运单保持「运输中」；任一 SKU 超收将整单拒绝且库存不变；同一批次号不可重复提交。</p>
    </div>
    <DataTable
      v-else
      :columns="[{ key: 'skuId', title: 'SKU' }, { key: 'skuName', title: '名称' }, { key: 'quantity', title: '原始数量' }, { key: 'receivedQuantity', title: '累计实收' }, { key: 'pendingQuantity', title: '待收' }]"
      :data="(pendingSummary?.items ?? []) as any"
    >
      <template #pendingQuantity="{ row }"><span :class="{ zero: row.pendingQuantity === 0 }">{{ row.pendingQuantity }}</span></template>
    </DataTable>

    <template v-if="shipment.receipts.length">
      <h3>收货批次记录</h3>
      <div v-for="receipt in shipment.receipts" :key="receipt.id" class="panel receipt-block">
        <div class="receipt-head">
          <DataTable :columns="receiptColumns" :data="[receipt] as any">
            <template #createdAt="{ row }">{{ formatDate(row.createdAt) }}</template>
          </DataTable>
        </div>
        <DataTable
          :columns="[
            { key: 'skuId', title: 'SKU' },
            { key: 'skuName', title: '名称' },
            { key: 'receivedQuantity', title: '本批次实收' },
            { key: 'diffQuantity', title: '批次后差异(待收)' },
          ]"
          :data="receiptRows(receipt) as any"
        >
          <template #diffQuantity="{ row }"><span :class="{ zero: row.diffQuantity === 0 }">{{ row.diffQuantity }}</span></template>
        </DataTable>
      </div>
    </template>
  </section>
</template>

<style scoped>
.pending-banner { margin-bottom: 16px; border-color: #c9b45c; background: #fdf8e7; }
.pending-count { color: #9a6b00; font-weight: 800; }
.receive-panel { margin-bottom: 16px; }
.receipt-block { margin-bottom: 14px; }
.receipt-head { margin-bottom: 10px; }
.hint { margin: 10px 2px 0; font-size: 12px; color: #6b756f; }
.done { color: #2c7a4b; font-weight: 700; }
.zero { color: #2c7a4b; font-weight: 700; }
.done-tag { color: #2c7a4b; font-weight: 700; font-size: 13px; }
button:disabled { opacity: .6; cursor: not-allowed; }
</style>
