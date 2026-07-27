# AWS Lambda Image Resizer Service

此服務專為 AWS Lambda 設計，當圖片上傳至 S3 Bucket 時，會由 S3 Event 自動觸發，將原圖自動生成小圖（`thumb_`）與中圖（`medium_`）並存回 `resized/` 目錄。

## 📁 目錄結構與架構
```text
services/image-resizer/
├── index.mjs           # Lambda 主邏輯 (Node.js ES Module)
├── package.json        # 獨立套件依賴 (@aws-sdk/client-s3, sharp)
└── README.md           # 部署與說明文件
```

---

## 🔒 對 CI/CD 與 Docker 的完全隔離設計
1. **Docker / docker-compose.yml 隔離**：`docker-compose.yml` 只掃描 `./client` 與 `./server`，此 `services/image-resizer/` 目錄不會被打包進 EC2 容器，完全不佔用 EC2 磁碟空間。
2. **GitHub Actions 隔離**：`.github/workflows/megaweaving-cicd.yaml` 使用 `dorny/paths-filter` 僅偵測 `server/**` 與 `client/**`，對此服務資料夾的修改不會誤觸發 CI/CD 部署。

---

## 🛠️ 本地打包說明 (Local Zip Build)
因為 Lambda 執行環境為 Linux (x86_64 / arm64)，在 macOS 上安裝 `sharp` 後欲手動打包 Zip 上傳至 AWS Console 時，請確保安裝目標平台的原生 C++ 二進位檔：

```bash
cd services/image-resizer

# 安裝 Linux 平台所需的 sharp 原生模組
npm install --os=linux --cpu=x64 sharp @aws-sdk/client-s3

# 打包成 ZIP
npm run build
# 會在根目錄生成 function.zip
```

---

## ☁️ AWS Console 設定步驟

### 1. 建立 Lambda Function
- **Runtime**: `Node.js 20.x`
- **Architecture**: `x86_64`
- **Code**: 上傳 `function.zip`
- **Handler**: `index.handler`

### 2. 配置 IAM Role 權限
確保 Lambda 的執行角色擁有以下 S3 權限：
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject"
      ],
      "Resource": "arn:aws:s3:::your-bucket-name/*"
    }
  ]
}
```

### 3. 設定 S3 Event Notification Trigger
1. 前往您的 S3 Bucket 頁面 -> **Properties** -> **Event notifications**。
2. 新增 Notification：
   - **Event types**: `All object create events` (`s3:ObjectCreated:*`)
   - **Prefix**: (選填，如 `uploads/`)
   - **Destination**: 選擇建立好的 **Lambda Function**
