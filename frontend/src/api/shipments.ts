import { request } from './request';
import type { ReceiveBatchPayload, Shipment, ShipmentPendingSummary } from '../types/shipment';

export const shipmentsApi = {
  list: (params?: Record<string, string>) => request.get<Shipment[]>('/shipments', { params }),
  detail: (id: string) => request.get<Shipment>(`/shipments/${id}`),
  create: (payload: Partial<Shipment>) => request.post<Shipment>('/shipments', payload),
  ship: (id: string, payload: { trackingNo: string; carrier: string }) => request.post(`/shipments/${id}/ship`, payload),
  transit: (id: string) => request.post(`/shipments/${id}/transit`),
  receive: (id: string, payload: ReceiveBatchPayload) => request.post<Shipment>(`/shipments/${id}/receive`, payload),
  pendingSummary: (id: string) => request.get<ShipmentPendingSummary>(`/shipments/${id}/pending-summary`),
  exception: (id: string, reason: string) => request.post(`/shipments/${id}/exception`, { reason }),
  cancel: (id: string) => request.post(`/shipments/${id}/cancel`),
};
