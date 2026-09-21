<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { request } from '../api/request';
import DataTable from '../components/common/DataTable.vue';
import { formatDate } from '../utils/format';

const logs = ref<any[]>([]);
const module = ref('');
async function load() { logs.value = await request.get('/audit-logs', { params: { module: module.value } }) as any[]; }
onMounted(load);

function formatDetail(detail: any): string {
  if (!detail || typeof detail !== 'object') return detail ? String(detail) : '-';
  if (detail.batchNo) {
    const lines = Array.isArray(detail.receipt?.items)
      ? detail.receipt.items.map((item: any) => `${item.skuId} 实收${item.receivedQuantity}/差异${item.diffQuantity}`).join('，')
      : '';
    const pending = detail.pendingSummary?.totalPendingQuantity;
    return `批次 ${detail.batchNo}${lines ? `：${lines}` : ''}${typeof pending === 'number' ? `；待收合计 ${pending}` : ''}`;
  }
  if (detail.before !== undefined && detail.after !== undefined) return `${detail.before} → ${detail.after}`;
  return JSON.stringify(detail);
}
</script>

<template>
  <section>
    <div class="page-title"><h2>审计日志</h2></div>
    <div class="toolbar">
      <select v-model="module" @change="load">
        <option value="">全部模块</option>
        <option>SUPPLIER</option><option>INVENTORY</option><option>SHIPMENT</option><option>USER</option>
      </select>
    </div>
    <DataTable :columns="[{key:'module',title:'模块'},{key:'action',title:'动作'},{key:'username',title:'操作人'},{key:'targetName',title:'目标'},{key:'detail',title:'操作详情'},{key:'createdAt',title:'时间'}]" :data="logs">
      <template #detail="{ row }">
        <span class="detail" :title="formatDetail(row.detail)">{{ formatDetail(row.detail) }}</span>
      </template>
      <template #createdAt="{ row }">{{ formatDate(row.createdAt) }}</template>
    </DataTable>
  </section>
</template>

<style scoped>
.detail { display: inline-block; max-width: 420px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #4a554f; font-size: 13px; vertical-align: middle; }
</style>
