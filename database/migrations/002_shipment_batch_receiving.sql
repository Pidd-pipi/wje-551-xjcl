-- 分批收货差异闭环
-- 1. 运单明细增加累计实收数量，未收部分 = quantity - received_quantity
ALTER TABLE shipment_items
  ADD COLUMN received_quantity INT NOT NULL DEFAULT 0 AFTER quantity,
  ADD INDEX idx_shipment_items_received (shipment_id, received_quantity);

-- 2. 收货批次主表：一次提交对应一个收货批次号
CREATE TABLE shipment_receivings (
  id VARCHAR(36) PRIMARY KEY,
  shipment_id VARCHAR(36) NOT NULL,
  batch_no VARCHAR(64) NOT NULL,
  total_received_quantity INT NOT NULL DEFAULT 0,
  completed TINYINT(1) NOT NULL DEFAULT 0,
  operator VARCHAR(64) NOT NULL DEFAULT '系统',
  created_at DATETIME NOT NULL,
  UNIQUE KEY uk_shipment_receivings_shipment_batch (shipment_id, batch_no),
  INDEX idx_shipment_receivings_batch_no (batch_no),
  INDEX idx_shipment_receivings_shipment_id (shipment_id)
);

-- 3. 收货批次明细：本次实收、累计实收与差异（diff = received_quantity_total - quantity）
CREATE TABLE shipment_receiving_lines (
  id VARCHAR(36) PRIMARY KEY,
  receiving_id VARCHAR(36) NOT NULL,
  shipment_id VARCHAR(36) NOT NULL,
  shipment_item_id VARCHAR(36) NOT NULL,
  sku_id VARCHAR(64) NOT NULL,
  sku_name VARCHAR(128) NOT NULL,
  ordered_quantity INT NOT NULL,
  received_quantity INT NOT NULL DEFAULT 0,
  received_quantity_total INT NOT NULL DEFAULT 0,
  before_quantity INT NOT NULL DEFAULT 0,
  pending_quantity INT NOT NULL DEFAULT 0,
  diff INT NOT NULL DEFAULT 0,
  INDEX idx_shipment_receiving_lines_receiving_id (receiving_id),
  INDEX idx_shipment_receiving_lines_shipment_id (shipment_id)
);

-- 4. 历史已签收运单回填累计实收
UPDATE shipment_items SET received_quantity = quantity
WHERE shipment_id IN (SELECT id FROM shipments WHERE status = 'DELIVERED');
