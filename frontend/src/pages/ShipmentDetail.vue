<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { shipmentsApi } from '../api/shipments';
import DataTable from '../components/common/DataTable.vue';
import StatusBadge from '../components/common/StatusBadge.vue';
import { ShipmentStatus } from '../constants/enums';
import { PERMISSIONS } from '../constants/permissions';
import { useShipmentStore } from '../stores/shipmentStore';
import { formatDate } from '../utils/format';
import type { ShipmentItem } from '../types/shipment';

const route = useRoute();
const store = useShipmentStore();
const id = String(route.params.id);

const batchNo = ref('');
const quantities = reactive<Record<string, string>>({});
const submitting = ref(false);

const shipment = computed(() => store.current);
const inTransit = computed(() => shipment.value?.status === ShipmentStatus.IN_TRANSIT);
const pendingSummary = computed(() => shipment.value?.pendingSummary);
const receivings = computed(() => shipment.value?.receivings ?? []);

function pendingOf(item: ShipmentItem) {
  return item.quantity - (item.receivedQuantity ?? 0);
}

// 仅对仍有待收的明细预填 0，已收齐明细不可再录
const pendingItems = computed(() => (shipment.value?.items ?? []).filter((item) => pendingOf(item) > 0));

watch(
  pendingItems,
  (items) => {
    for (const item of items) {
      if (quantities[item.id] === undefined) quantities[item.id] = '0';
    }
  },
  { immediate: true },
);

const receivedThisTimeTotal = computed(() =>
  pendingItems.value.reduce((sum, item) => sum + (Number(quantities[item.id]) || 0), 0),
);

function fillAllPending() {
  for (const item of pendingItems.value) quantities[item.id] = String(pendingOf(item));
}

onMounted(() => store.fetchDetail(id));

async function submitReceive() {
  if (!batchNo.value.trim()) {
    window.dispatchEvent(new CustomEvent('app-error', { detail: '请填写收货批次号' }));
    return;
  }
  submitting.value = true;
  try {
    await shipmentsApi.receiveBatch(id, {
      batchNo: batchNo.value.trim(),
      items: pendingItems.value.map((item) => ({ itemId: item.id, receivedQuantity: Number(quantities[item.id]) || 0 })),
    });
    batchNo.value = '';
    await store.fetchDetail(id);
  } finally {
    submitting.value = false;
  }
}

async function receiveAll() {
  await shipmentsApi.receive(id);
  await store.fetchDetail(id);
}
async function cancel() {
  await shipmentsApi.cancel(id);
  await store.fetchDetail(id);
}
</script>

<template>
  <section v-if="shipment">
    <div class="page-title"><h2>{{ shipment.orderNo }}</h2><StatusBadge :value="shipment.status" /></div>
    <div class="grid two">
      <div class="panel">
        <h3>运单信息</h3>
        <p>承运方：{{ shipment.carrier || '-' }}</p>
        <p>追踪号：{{ shipment.trackingNo || '-' }}</p>
        <p>预计到达：{{ formatDate(shipment.estimatedArrival) }}</p>
        <p>实际到达：{{ shipment.actualArrival ? formatDate(shipment.actualArrival) : '-' }}</p>
        <p>备注：{{ shipment.remark || '-' }}</p>
        <button v-if="inTransit" v-permission="PERMISSIONS.SHIPMENT_RECEIVE" class="btn secondary" @click="receiveAll">一次性全部签收</button>
        <button v-if="shipment.status === ShipmentStatus.PENDING" v-permission="PERMISSIONS.SHIPMENT_WRITE" class="btn secondary" @click="cancel">取消运单</button>
      </div>
      <div class="panel">
        <h3>物流时间线</h3>
        <p v-for="event in shipment.timeline" :key="event.id"><StatusBadge :value="event.status" /> {{ event.note }} · {{ event.operator }} · {{ formatDate(event.createdAt) }}</p>
      </div>
    </div>

    <div v-if="inTransit" class="panel receive-panel">
      <h3>分批收货</h3>
      <div class="toolbar">
        <label>收货批次号：<input v-model="batchNo" placeholder="如 RCV-20260921-001" style="width:240px" /></label>
        <button class="btn secondary mini-btn" :disabled="submitting" @click="fillAllPending">全部待收</button>
      </div>
      <table class="receive-table">
        <thead>
          <tr><th>SKU</th><th>名称</th><th>原始数量</th><th>累计实收</th><th>待收</th><th>本次实收</th></tr>
        </thead>
        <tbody>
          <tr v-for="item in shipment.items" :key="item.id">
            <td>{{ item.skuId }}</td>
            <td>{{ item.skuName }}</td>
            <td>{{ item.quantity }}</td>
            <td>{{ item.receivedQuantity ?? 0 }}</td>
            <td :class="{ zero: pendingOf(item) === 0 }">{{ pendingOf(item) }}</td>
            <td>
              <input
                v-if="pendingOf(item) > 0"
                v-model.number="quantities[item.id]"
                type="number"
                min="0"
                :max="pendingOf(item)"
                class="qty-input"
              />
              <span v-else class="done">已收齐</span>
            </td>
          </tr>
        </tbody>
      </table>
      <p class="hint">本次实收合计：{{ receivedThisTimeTotal }}；提交后未收部分继续保留待收，运单保持「运输中」；累计达到原始数量才签收。任一 SKU 超收将整单拒绝且库存不变。</p>
      <button class="btn" :disabled="submitting || receivedThisTimeTotal <= 0" @click="submitReceive">提交本批收货</button>
    </div>

    <div v-if="pendingSummary" class="panel summary-panel" :class="{ done: pendingSummary.completed }">
      <h3>待收汇总</h3>
      <p>
        原始总量 {{ pendingSummary.orderedQuantityTotal }} ·
        累计实收 {{ pendingSummary.receivedQuantityTotal }} ·
        待收 {{ pendingSummary.pendingQuantityTotal }} ·
        待收明细 {{ pendingSummary.pendingLineCount }} 条 ·
        <strong>{{ pendingSummary.completed ? '已全部收齐' : '仍有待收，运单保持运输中' }}</strong>
      </p>
    </div>

    <h3>运单明细</h3>
    <DataTable
      :columns="[
        { key: 'skuId', title: 'SKU' },
        { key: 'skuName', title: '名称' },
        { key: 'quantity', title: '原始数量' },
        { key: 'receivedQuantity', title: '累计实收' },
        { key: 'pending', title: '待收' },
      ]"
      :data="shipment.items.map((item) => ({ ...item, receivedQuantity: item.receivedQuantity ?? 0, pending: item.quantity - (item.receivedQuantity ?? 0) })) as any"
    />

    <template v-if="receivings.length">
      <h3>收货批次记录</h3>
      <div class="panel" v-for="record in receivings" :key="record.id">
        <p>
          <strong>批次 {{ record.batchNo }}</strong> ·
          {{ record.completed ? '本批收齐并签收' : '部分收货' }} ·
          本次实收 {{ record.totalReceivedQuantity }} ·
          {{ record.operator }} · {{ formatDate(record.createdAt) }}
        </p>
        <table class="receive-table">
          <thead>
            <tr><th>SKU</th><th>名称</th><th>原始数量</th><th>本次实收</th><th>累计实收</th><th>待收</th><th>差异</th></tr>
          </thead>
          <tbody>
            <tr v-for="line in record.lines" :key="line.itemId">
              <td>{{ line.skuId }}</td>
              <td>{{ line.skuName }}</td>
              <td>{{ line.orderedQuantity }}</td>
              <td>{{ line.receivedQuantity }}</td>
              <td>{{ line.receivedQuantityTotal }}</td>
              <td>{{ line.pendingQuantity }}</td>
              <td :class="line.diff < 0 ? 'diff-short' : 'diff-ok'">{{ line.diff === 0 ? '无差异' : `少收 ${-line.diff}` }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>

<style scoped>
.receive-panel,
.summary-panel { margin:16px 0; }
.mini-btn { height:32px; padding:0 12px; }
.receive-table { width:100%; border-collapse:collapse; margin-top:10px; }
.receive-table th { background:#e1e8d0; color:#26352f; text-align:left; font-size:13px; padding:8px 10px; }
.receive-table td { border-top:1px solid #e4e8ec; padding:8px 10px; font-size:14px; }
.qty-input { width:96px; height:32px; }
.zero { color:#2c7a4b; font-weight:700; }
.done { color:#2c7a4b; font-weight:700; }
.hint { color:#58635e; font-size:13px; margin:10px 0; }
.summary-panel strong { color:#9a6a00; }
.summary-panel.done strong { color:#2c7a4b; }
.diff-ok { color:#2c7a4b; }
.diff-short { color:#9a6a00; }
</style>
