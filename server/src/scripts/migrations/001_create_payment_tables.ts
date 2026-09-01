import dbPool from "../../utils/db";

export async function up(): Promise<void> {
  console.log("Running migration: 001_create_payment_tables...");

  // 1. 金流交易表 (payments)
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      merchant_trade_no VARCHAR(20) NOT NULL UNIQUE,
      provider VARCHAR(20) NOT NULL DEFAULT 'ECPAY',
      payment_method VARCHAR(20) DEFAULT 'Credit',
      amount INT NOT NULL,
      currency CHAR(3) NOT NULL DEFAULT 'TWD',
      status ENUM('PENDING', 'PAID', 'FAILED', 'CANCELLED', 'PARTIAL_REFUNDED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
      trade_no VARCHAR(50) NULL UNIQUE,
      rtn_code INT NULL,
      rtn_msg VARCHAR(255) NULL,
      payment_date DATETIME NULL,
      simulated_paid TINYINT(1) NOT NULL DEFAULT 0,
      processed_at DATETIME NULL,
      raw_callback_payload JSON NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_user_status (user_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 2. 外送訂單表 (delivery_orders)
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS delivery_orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      payment_id INT NULL UNIQUE,
      post_id INT NULL,
      pickup_location_id BIGINT UNSIGNED NOT NULL,
      pickup_address_snapshot TEXT NOT NULL,
      pickup_remarks VARCHAR(255) NULL,
      dropoff_location_id BIGINT UNSIGNED NOT NULL,
      dropoff_address_snapshot TEXT NOT NULL,
      dropoff_remarks VARCHAR(255) NULL,
      sender_name VARCHAR(100) NOT NULL,
      sender_phone VARCHAR(50) NOT NULL,
      recipient_name VARCHAR(100) NOT NULL,
      recipient_phone VARCHAR(50) NOT NULL,
      service_type VARCHAR(50) NOT NULL,
      quotation_id VARCHAR(100) NOT NULL UNIQUE,
      lalamove_order_id VARCHAR(100) NULL UNIQUE,
      share_link VARCHAR(255) NULL,
      status ENUM(
        'QUOTED',
        'PAYMENT_PENDING',
        'ORDER_PLACING',
        'ASSIGNING_DRIVER',
        'ON_GOING',
        'PICKED_UP',
        'COMPLETED',
        'FAILED',
        'CANCELLED',
        'EXPIRED'
      ) NOT NULL DEFAULT 'PAYMENT_PENDING',
      fee_total INT NOT NULL,
      expires_at DATETIME NOT NULL,
      driver_name VARCHAR(100) NULL,
      driver_phone VARCHAR(50) NULL,
      driver_plate_number VARCHAR(20) NULL,
      failure_reason VARCHAR(255) NULL,
      raw_webhook_payload JSON NULL,
      version INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE RESTRICT,
      FOREIGN KEY (pickup_location_id) REFERENCES locations(id) ON DELETE RESTRICT,
      FOREIGN KEY (dropoff_location_id) REFERENCES locations(id) ON DELETE RESTRICT,
      INDEX idx_user_status (user_id, status),
      INDEX idx_expires_at (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 3. 外送訂單事件歷史紀錄表 (delivery_order_events)
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS delivery_order_events (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      delivery_order_id INT NOT NULL,
      event_id VARCHAR(100) NULL UNIQUE,
      event_status VARCHAR(50) NOT NULL,
      raw_payload JSON NOT NULL,
      received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (delivery_order_id) REFERENCES delivery_orders(id) ON DELETE CASCADE,
      INDEX idx_delivery_order_id (delivery_order_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 4. 退款紀錄表 (payment_refunds)
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS payment_refunds (
      id INT AUTO_INCREMENT PRIMARY KEY,
      payment_id INT NOT NULL,
      merchant_refund_no VARCHAR(50) NOT NULL UNIQUE,
      refund_amount INT NOT NULL,
      reason VARCHAR(255) NOT NULL,
      status ENUM('PENDING', 'SUCCESS', 'FAILED') NOT NULL DEFAULT 'PENDING',
      provider_refund_id VARCHAR(100) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE RESTRICT,
      INDEX idx_payment_id (payment_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  console.log("Migration 001_create_payment_tables completed successfully.");
}

// 支援直接執行: npx ts-node src/scripts/migrations/001_create_payment_tables.ts
if (require.main === module) {
  up()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}
