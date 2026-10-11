# 鯨幣網頁版

全專案記憶與權威規格在主專案：https://github.com/sunfish1728/deepcoin 。卡片格式見該倉庫 SPEC.md，角色包格式見 讀卡工具/AVATAR.md。
本站使用 GitHub Actions pages.yml 部署至 https://sunfish1728.github.io/deepcoin-web/ 。
使用者指示：網頁獨立維護，還原手機 App 介面，不移植寫卡。預設網址已確定；Android 仍允許自訂跳轉網址。
2026-10-11 補充指示：網頁介面要還原手機 App；不要再自行增加宣傳頁或桌面分欄。

## 結構

- `src/app.js`：主頁、聊天、設定、卡片／角色管理與畫面狀態。
- `src/style.css`：依 Android TcTheme / TcComponents 的色票、尺寸與排版；寬螢幕保留同一個 App 介面（最大 480px）。
- `src/ui.js`：與 App 相同的 filled Material Icons、區段標籤、開關與分段選項。
- `src/card.js`：正規化 JSON、Base64url 卡片連結，保留未知欄位。
- `src/api.js`：四種協議、SSE、模型列表、餘額；直接連線，不增加中轉後端。
- `src/avatars.js`：VRM 檢查、ZIP 匯入、形象庫、下載與形象選擇。
- `src/storage.js`：localStorage 與 IndexedDB。
- `public/avatar/`：從 App 複製的獨立渲染器；不包含模型。
- `renderer/`：獨立複製的渲染器原始碼；`npm run build` 自行重新打包，不依賴 App 資料夾。
- `deployment/assetlinks.example.json`：未部署的 Android App Links 範本。
- `tests/`：卡片、串流與角色純函式測試，及本機假 API。

## 開發紀錄

- **2026-10-11，0.1.1**：卡片不再校驗 SHA，舊 sha 載入與分享時移除；設定頁移除 SHA 顯示。模型快取改用卡片 ID／協議／地址／密鑰組合，避免移除 SHA 後不同卡片共用錯誤模型列表。形象檔案校驗移至 src/hash.js 並保留。15 項測試與網頁建置通過。


- **2026-10-11，0.1.0**：移植主頁、聊天、設定與 VRM 互動，不含寫卡。
  - 文字串流支援 openai / openai-responses / anthropic / gemini。
  - 對話管理、搜尋、改名、刪除、停止、重試、編輯重送、系統提示詞／參數、Markdown、思考與用量、自動標題、對話匯出匯入。
  - 卡片 SHA 校驗、網址／JSON／Web NFC 載入，讀連結後清除 fragment。
  - 形象包、線上形象庫、VRM 舞台與聊天表情連動；IndexedDB 模型快取。
  - API 餘額、全部模型檢測與快取，主題及角色設定。
  - Android 兩個寫卡工具同步新增可設定網頁回退；完整規則見 SPEC.md。
  - 13 個核心測試全數通過（卡片、四種請求格式、SSE、模型包／IndexedDB、ZIP 路徑與大小限制）；靜態建置成功。
  - 瀏覽器實測：假卡片、模型清單、餘額、思考與 Markdown 串流、用量、自動標題、停止保留部分文字、重載保存、深淺主題。手機 375px DOM 排版無水平溢位。

- **2026-10-11，介面還原**：依使用者要求重新對照 Android 元件原始碼與專用模擬器截圖。
  - 主頁恢復上方形象舞台、舞台四角、右上鏡頭、底部卡片粗條／餘額與置中聊天按鈕。移除自行加入的宣傳文字、插畫及左右分欄。
  - 聊天另開整頁；頂部返回／模型／形象／紀錄／新增／設定，紀錄改側邊抽屜；使用者氣泡、模型左線／狀態／思考／用量和底部送出按鈕對齊 App。
  - 設定恢復 CARD、BALANCE、APPEARANCE、AVATAR、CHAT、ABOUT 單欄面板；主題和鏡頭用獨立標籤，形象與對話設定使用手機底部面板。
  - 使用 App 原始深淺色票、4/6/10px 微弧角、52px 頂欄、54px 聊天按鈕；內附 Roboto / Noto Sans TC 可變字體。
  - 網頁不含寫卡，底部分頁只保留主頁／設定；卡片載入、Web NFC、App 開啟與對話匯出入放在既有面板內。
  - 本機示範 VRM 匯入、舞台／聊天鏡頭、假 API 串流、紀錄抽屜、對話參數保存與深淺主題實測通過；320px / 411px 無水平溢位。建置成功、13 項測試全數通過。
  - 示範模型只用於本機，沒有放進專案；畫面檢查見 design-qa.md。

## 限制與待驗證

- 正式網域與部署尚未設定；不要填不存在的網址後鎖卡。
- App Links 需部署端的憑證指紋與編譯時的網域，不能只填寫卡表單。
- 未用真卡、真機、真實 API 或真實 GitHub Releases 驗證。
- VRM 已以既有示範模型本機驗證；尚未用真實卡片指定的公開形象庫驗證，不公開示範模型。
- API 與模型來源需要 CORS；沒有代理、Range 續傳或角色自動更新。
- Web NFC 只在支援的瀏覽器／裝置可用；可用網址與 JSON 替代。
- 網頁版資料和 Android App 各自獨立。

0.6.1 發布完成：程式碼 eda7244 已推上 deepcoin/main，[GitHub Release v0.6.1](https://github.com/sunfish1728/deepcoin/releases/tag/v0.6.1) 已公開；APK 上傳大小／雜湊核對成功。網頁只更新原始碼，尚未部署。

## 2026-10-11：外部託管與 Pages（0.7.0／0.4.0／0.2.0）

- 使用者定案：網頁獨立公開倉庫 deepcoin-web；設定另存 deepcoin-web-API；共用 token 注入 APK，使用者明確接受可被擷取及倉庫可能被修改。token 只有設定倉庫 Contents 讀寫、Metadata 讀取，原始碼不含 token。
- 卡片規格先更新 SPEC.md，再同步兩個 Android codec／WebCardLink 與網頁；託管卡 v2 只存 id、key、ref，完整設定保持 v1。GitHub 上傳內容排除 key，使用新檔名，上傳並公開回讀核對後才能寫卡。
- 寫卡網址空白預設 https://sunfish1728.github.io/deepcoin-web/ ，自訂 HTTPS 網址仍可用；新卡只存一筆 URI，兼容舊 MIME／AAR 卡。
- 刷託管卡先下載、檢查版本／ID／大小，再本機合併卡上 key；連線失敗可使用同網址已驗證快取，首次失敗停止套用。
- 網頁保留 App 的介面，不含寫卡；獨立倉庫以 main 的 Pages workflow 建置部署。本專案網頁版/ 保留本次同步副本，後續網頁開發以獨立倉庫為準。
- 驗證：鯨幣 78 項、獨立寫卡 17 項、網頁 20 項測試通過，兩份 APK 與網頁建置成功。專用 token 實際 PUT 201、公開 GET 200，公開檔不含 API key；Pages 部署成功、瀏覽器與 Android API34 模擬器都已載入公開 v2 設定並合併假密鑰。未用真實 API key 或真卡測試 NFC。
- GitHub 專案 Pages 無法提供帳號網域根目錄的 assetlinks；Android 是否自動進 App 視系統連結設定而定，網頁保留「用 App 開啟」。64 字元 key 的託管範例 NDEF 約343 bytes（不含標籤 TLV），實際以寫卡頁容量為準。
- 本機重建：在專案根目錄的 hosting.properties 設 token=專用授權；此檔已被 git 忽略。沒有此檔仍可讀託管卡，只有上傳功能不可用；不要把 token 放進網頁或版本庫。
