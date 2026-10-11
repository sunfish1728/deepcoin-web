# 網頁介面還原檢查（2026-10-11）

final result: passed（本次 App 配置與操作還原範圍）

對照來源是 Android 的 ClientApp、HomeScreen、ChatScreen、MessageItems、SettingsScreen、TcTheme、TcComponents、AvatarStage。另啟動 TokenCoin_Test_API34 專用模擬器擷取 App 主頁／設定畫面，與網頁同為深色、已載卡、已安裝相同示範 VRM 的狀態對照。卡片測試文字與角色顯示名稱不同；沒有將 Android 系統狀態列／導覽列移植到瀏覽器。

## 已修正

- 原網站左右分欄、宣傳字句與自製插畫，改回 App 上下配置與空舞台文字。
- 原字標尺寸、色票、面板底色與圓角，改用 App 元件設定；字體採本機可變 Roboto／Noto Sans TC。
- 舞台四角與右上鏡頭、角色標記；底部卡片粗條、餘額、54px 置中聊天按鈕。
- 聊天從分頁改整頁，移除永久側欄，改紀錄抽屜；對齊頂部控制、使用者氣泡與模型左線。
- 設定恢復 CARD／BALANCE／APPEARANCE／AVATAR／CHAT／ABOUT；分段標籤與開關還原。
- 提示訊息攔截點擊、桌面捲軸吃掉手機面板寬度、抽屜遮罩可點範圍均已修正。

## 驗證

- Browser：320×700、411×820 與桌面 1280×720 無水平溢位；桌面保留 480px App 欄。
- 匯入示範 VRM、主頁顯示、全身與聊天半身鏡頭；深淺主題。
- 假卡 SHA、模型清單、$9.29 餘額；串流回覆、思考、Markdown 與用量。
- 紀錄抽屜開關、返回、切換設定；對話名稱、溫度 1.1 與輸出上限 80 保存後重開正確。
- npm run build 成功；npm test 13／13；git diff --check 無格式錯誤。
- Browser 觀察到載入時的 MutationObserver 錯誤，沒有來源 URL；網頁 src、renderer、public 沒有使用該 API，判斷與內嵌瀏覽器觀察機制有關。上述頁面與操作不受影響。

## 截圖

截圖存於本次 Codex visualizations 目錄（不放入模型倉庫）：App主頁參考.png、App設定參考.png、網頁還原-主頁.png（淺色）、網頁還原-深色主頁.png、網頁還原-設定頂端.png、網頁還原-設定.png、網頁還原-聊天.png。示範模型未加入專案或提交。

## 細節限制

瀏覽器與 Compose 的文字排版及顆粒隨機算法仍有細微差異；未宣稱逐像素一致。網頁省略寫卡分頁，載入 JSON／Web NFC、對話匯出入等瀏覽器入口保留在既有面板內。尚未用實體手機鍵盤／真卡做此版本的介面確認。
