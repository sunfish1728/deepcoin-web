# 鯨幣網頁版 0.2.1

正式網址：https://sunfish1728.github.io/deepcoin-web/

獨立原始碼倉庫：https://github.com/sunfish1728/deepcoin-web 。此資料夾保留本次版本的同步副本；之後網頁開發與部署以獨立倉庫為準。
新版直接讀取完整 v1；舊 v2 使用本機快取或內附公開設定備份轉換，不再上傳。deepcoin-web-API 倉庫依使用者指示保留。

開啟網站、刷卡與新增對話只產生暫存草稿，送出第一則訊息才保存紀錄；既有空白紀錄會清理。部署時執行 `node scripts/stage-avatar-packages.js`，核對三個木子惡魔角色包後放入 dist，提供同來源下載。

0.7.0 起寫卡網址留空自動使用上述 Pages，也可填自己的 HTTPS 網站；新卡只存一筆 URI。

# 鯨幣網頁版

手機 App 的網頁移植版，放在獨立的 `網頁版/`，**沒有寫卡功能**。

包含主頁與餘額、卡片 JSON / NFC / 網址載入、四種協議的文字串流聊天、
思考內容與 Markdown、對話管理與匯出匯入、VRM 舞台、角色包匯入與形象庫。
介面沿用鯨幣的暖紙色、青綠／鏽橘和微弧角；支援手機與桌面。

## 在電腦開啟

需要 Node.js 20.19+ 或 22.12+。

```powershell
cd 網頁版
npm install
npm run dev
```

開啟終端顯示的本機網址。`npm test` 執行核心測試；`npm run build` 產生 `dist/`，
可把該資料夾部署到任何 HTTPS 靜態網頁主機。不需要中轉後端。
不要直接雙擊 HTML，瀏覽器儲存、模組與 SHA 校驗需由 HTTP / HTTPS 提供。

## 怎麼載入卡片

- App 設定頁複製卡片 JSON，網頁點「載入卡片」貼上，或選擇 JSON 檔。
- 新版寫卡頁填入部署後的「網頁版網址」，刷卡後網頁從 `#card=` 取得完整卡片。
- Android Chrome 等支援 Web NFC 的瀏覽器，可以點「讀取 NFC」再刷卡。
  Web NFC 需要安全來源（HTTPS 或本機 localhost）與使用者允許；iPhone 或不支援的瀏覽器可用刷卡網址。

0.1.1 起所有方式都不再校驗卡片 SHA-256；舊卡的 sha 會忽略並移除。URL fragment 不會隨網頁請求送給主機，讀取後會從網址列移除。
資料仍包含明文密鑰，和實體卡的既有設計相同。

## 舊版回退模式（0.6.x）

0.6.x 的兩個 Android 寫卡頁新增 **網頁版網址**，保存在草稿／設定檔，不是卡片 JSON 欄位。

- 網址留空：沿用 MIME + 可選 AAR，舊卡行為不變。
- 網址有填：第一筆是 HTTPS URI，帶 Base64url 的卡片 JSON；第二筆保留 MIME；**不寫 AAR**。
  AAR 在未安裝 App 時會找 Play 商店，不能作為網頁回退。
- 手機可能顯示通知，使用者點擊才開啟。既有卡要重新寫入，永久鎖定的卡不能修改。
- 兩份資料會增加卡片容量；寫卡頁顯示整份 NDEF 的容量估算與晶片是否放得下。

### 有 App 時自動開 App

公開網域還沒決定，因此預設 APK 不聲稱攔截某個正式網站；網頁可點「用 App 開啟」。
網域決定後，在讀卡工具編譯：

```powershell
./gradlew.bat assembleDebug -PtokenCoinWebHost=你的網域
```

把 `deployment/assetlinks.example.json` 的憑證指紋換成該 APK 的簽署憑證 SHA-256，
以 JSON 型別放在 **網域根目錄**的 `https://你的網域/.well-known/assetlinks.json`。
不能只放在 `/網頁子目錄/.well-known/`，也不要保留範本的假指紋。
公開 HTTPS 網址填入寫卡表單即可；App 處理 HTTPS 的 NFC intent 與一般 App Link。
Android 16 起 HTTPS NFC 使用 ACTION_VIEW；較舊手機的 NFC 選擇器／預設開啟行為仍須真機確認。

參考：[Android NFC](https://developer.android.com/develop/connectivity/nfc/nfc)、
[網站與 App 關聯](https://developer.android.com/training/app-links/configure-assetlinks)、
[驗證 App Links](https://developer.android.com/training/app-links/verify-applinks)。

## 網頁和 App 的差別

- API 直接從瀏覽器連線，供應商必須允許 **CORS**。這是瀏覽器限制；同一密鑰在 App 可以用，不代表網頁也能用。
- HTTPS 網頁不能連到 HTTP API（例如區網服務），這種情況請用 App，或讓 API 提供 HTTPS。
- 聊天、卡片與設定存在 localStorage；模型快取存在 IndexedDB。清除網站資料會移除這些資料。
- 對話匯出不含密鑰。不能直接匯入 App 的內部聊天檔；這版提供自己的 `deepcoin-chat/1` 匯出格式。
- 角色渲染器複製自 App，支援相同 VRM 互動。模型沒有附在網頁內。
- 模型／形象庫下載也需要 CORS；GitHub Releases 若不允許跨站讀取，要改用允許 CORS 的模型檔主機、倉庫 raw URL 或手動匯入。
- 角色下載上限 300 MB，ZIP 解壓後也限制 300 MB；這版沒有移植 Android 的 Range 續傳。
- 角色和卡片透過角色 ID 記住選擇；下載後快取，刪掉角色再刷卡可重新下載新版。

## 本機測試

另一個終端執行 `node tests/mock-api.js`，會提供 `http://127.0.0.1:18091/card` 的假卡片、
模型清單、餘額與串流 API。複製該卡片 JSON 到網頁就能測聊天，不需要任何真實密鑰。
這是開發測試用伺服器，不包含在部署的 `dist/` 中。

介面依手機 App 還原：主頁形象舞台＋底部卡片／聊天、獨立聊天頁、單欄設定。網頁不含寫卡，底部只保留主頁／設定；桌面同樣顯示這個 App 介面，不改成左右分欄。

## 新增可供網頁自動下载的形象

0.2.2 不再固定三個角色。已加入的形象庫更新 deepcoin-avatars.json 後，重新執行 Pages 部署即可納入新角色，不必改網頁程式。每項需提供 file、size、sha256、authors、license。網站輸出 avatar-mirrors.json 下載映射與 avatar-packages/CREDITS.txt，角色包原樣保存、模型不提交 git。

要加入另一個已允許再發布的形象庫，在根目錄 avatar-mirrors.json 的 sources 增加 index（HTTPS 索引網址）及 permission（確認許可來源），再部署。加入前須確認該庫每個角色均可再發布；索引文字本身不是自動授權。未納入的網址沿用原來源，仍需要 CORS。
