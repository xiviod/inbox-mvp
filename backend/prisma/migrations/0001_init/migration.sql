CREATE TABLE IF NOT EXISTS conversations (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  conversation_id VARCHAR(191) NOT NULL UNIQUE,
  channel VARCHAR(64) NOT NULL,
  platform_user_id VARCHAR(191),
  last_message TEXT,
  last_ts DATETIME NULL,
  assigned_agent VARCHAR(191),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS messages (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  conversation_id VARCHAR(191),
  message_id VARCHAR(191) UNIQUE,
  channel VARCHAR(64) NOT NULL,
  sender VARCHAR(64) NOT NULL,
  type VARCHAR(64),
  text TEXT,
  attachments JSON,
  metadata JSON,
  timestamp DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_messages_conversation
    FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id)
      ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS inventory_items (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  sku VARCHAR(128) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'EGP',
  stock INT NOT NULL DEFAULT 0,
  attributes JSON,
  image_url VARCHAR(512),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS orders (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  order_number VARCHAR(64) UNIQUE NOT NULL,
  conversation_id VARCHAR(191),
  channel VARCHAR(64),
  customer_name VARCHAR(191),
  customer_contact VARCHAR(191),
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  total DECIMAL(10,2),
  currency VARCHAR(8),
  metadata JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_orders_conversation
    FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id)
      ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS order_items (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  order_id CHAR(36) NOT NULL,
  inventory_id CHAR(36) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2),
  metadata JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_order_item_order
    FOREIGN KEY (order_id) REFERENCES orders(id)
      ON DELETE CASCADE,
  CONSTRAINT fk_order_item_inventory
    FOREIGN KEY (inventory_id) REFERENCES inventory_items(id)
      ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_conv_channel ON conversations(channel);
CREATE INDEX idx_msg_conv ON messages(conversation_id);
CREATE INDEX idx_inventory_sku ON inventory_items(sku);
CREATE INDEX idx_order_conversation ON orders(conversation_id);
CREATE INDEX idx_order_status ON orders(status);
CREATE INDEX idx_order_item_order ON order_items(order_id);
CREATE INDEX idx_order_item_inventory ON order_items(inventory_id);
