
/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

LOCK TABLES `categories` WRITE;
/*!40000 ALTER TABLE `categories` DISABLE KEYS */;
INSERT INTO `categories` VALUES (1,'家電','Appliances','電冰箱、洗衣機、冷氣、電風扇、微波爐、電鍋、烤箱、吸塵器、除濕機、飲水機、電暖器、小家電、其他家電','active','2025-07-06 14:21:26','2025-10-18 14:13:28');
INSERT INTO `categories` VALUES (2,'寵物與輔助用品','Pets','寵物食品、寵物工具、寵物推車、寵物玩具、寵物屋、輪椅、輔具','active','2025-07-06 14:21:26','2025-10-18 14:13:28');
INSERT INTO `categories` VALUES (3,'展覽與建材','Materials','展櫃、展台、展板、帆布、材料、展示道具、展燈與軌道、塗料、建材、包裝材、棧板、地材','active','2025-07-06 14:21:26','2025-10-18 14:13:28');
INSERT INTO `categories` VALUES (4,'其他','Others','其他','active','2025-07-06 14:21:26','2025-07-27 12:19:18');
INSERT INTO `categories` VALUES (5,'書籍與文創','Books & Crafts','圖書、雜誌、漫畫、文具、美術用品、禮品、筆記本、製圖用具','active','2025-07-06 14:21:26','2025-10-18 14:13:28');
INSERT INTO `categories` VALUES (6,'服飾與配件','Fashion','衣服、鞋子、褲子、裙子、機能服、包包、手錶、飾品、配件','active','2025-07-06 14:21:26','2025-10-18 14:13:28');
INSERT INTO `categories` VALUES (7,'生活與居家用品','Home & Living','家具、燈具、餐廚用品、修繕工具、收納、清潔用品、五金、日用品、寢具、傢飾、戶外用品、交通工具、植栽、園藝用品','active','2025-07-06 14:21:26','2025-10-18 14:13:28');
INSERT INTO `categories` VALUES (8,'育兒與兒童用品','Kids & Baby','嬰兒用品、尿布、童裝、玩具、哺育用品、布偶、教材、手推車、巧拼地墊','active','2025-07-23 14:54:42','2025-10-18 14:13:28');
INSERT INTO `categories` VALUES (9,'電子產品','Electronics','手機、平板、筆電、桌機、螢幕、鍵盤滑鼠、耳機、喇叭、攝影機、電競設備','active','2025-07-23 14:55:37','2025-07-27 12:19:18');
INSERT INTO `categories` VALUES (10,'視聽娛樂','Audio & Games','樂器、音響設備、錄音設備、影音播放設備、唱片、遊戲機、遊戲片、娛樂周邊','active','2025-07-23 14:55:37','2025-10-18 14:13:28');
/*!40000 ALTER TABLE `categories` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `conditions` WRITE;
/*!40000 ALTER TABLE `conditions` DISABLE KEYS */;
INSERT INTO `conditions` VALUES (1,1,'Brand New','Unused, sealed in original packaging','active','2025-07-06 14:12:30','2026-07-29 08:43:40');
INSERT INTO `conditions` VALUES (2,2,'Like New','Minimal signs of use','active','2025-07-06 14:12:30','2026-07-29 08:43:40');
INSERT INTO `conditions` VALUES (3,3,'Good','Normal wear, fully functional','active','2025-07-06 14:12:30','2026-07-29 08:43:40');
INSERT INTO `conditions` VALUES (4,4,'Fair','Noticeable wear, fully functional','active','2025-07-06 14:12:30','2026-07-29 08:43:40');
INSERT INTO `conditions` VALUES (5,5,'For Parts or Repair','Damaged or not fully functional','active','2025-07-06 14:12:30','2026-07-29 08:43:40');
/*!40000 ALTER TABLE `conditions` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

