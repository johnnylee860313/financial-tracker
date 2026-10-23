# 財務追蹤器 (Financial Tracker)

單一 HTML 檔案、零外部依賴、支援手機與電腦瀏覽器離線執行的個人財務與部位風險追蹤工具。

## 檔案結構

```text
.
├── index.html          # 財務追蹤器主程式（單一檔案，直接以瀏覽器開啟即可使用）
├── README.md           # 專案說明與測試執行指南
└── tests/
    └── calc.test.js    # Node.js 自動化數值與 DOM 渲染驗證測試
```

## 使用方式

直接以手機或電腦瀏覽器開啟 `index.html`。所有輸入資料自動儲存於瀏覽器 `localStorage`，並可透過頁面最下方的「資料管理」區塊匯出／匯入 JSON 備份。

## 執行自動化測試

本專案的核心計算模組（`<script id="core">`）同時支援瀏覽器執行與 Node.js CommonJS 匯出。在專案根目錄執行：

```bash
node tests/calc.test.js
```

測試涵蓋：
- HTML 結構完整性、`MODULE` 標記、無禁用字詞或裝飾符號、15 項可展開指標卡檢查
- 本息平均攤還 `PMT`、各期剩餘本金、攤還表與只付息負債計算
- `XIRR` 牛頓法與二分法 fallback（含單期、多期、提領與非單調現金流）
- 15 項核心財務指標（槓桿倍率、總曝險、淨值、維持率與斷頭安全距離、DSR、Dry Powder、配置偏離度等）與財務操作建議驗證
- 標的官方年化 IRR 市值加權、定期定額（台股與美股複委託 `0050` / `VOO` / `QQQ`）、富邦手續費、二代健保補充保費（`2.11%`）與 54C 股利可抵減稅額（`8.5%`）之未來 10 / 20 / 30 年名目／實質資產走勢預測
- 負債已繳期數（`paidAsOf`）與投資經過年數（`investYearsAsOf`）隨日期自動推進驗證
- 空字串／全形字元／非法輸入防呆與舊版狀態深度合併（`deepMerge` / `normalizeState`）
- UI 腳本初始化與 SVG 圖表渲染測試

## 版本管理與跨版本模組合成指南（`v(n-1)` + `v(n)` → `v(n+1)`）

程式碼皆以 `/* ==== [MODULE: 名稱] ==== */` 標記切分為獨立職責區塊，並以 Git Tag（`v1`、`v2`、`v3`、`v4`、`v5`...）紀錄每一版狀態。

```bash
# 列出所有模組標記與行號
grep -n "MODULE:" index.html

# 比對兩個 Git Tag 版本的差異
git diff v4 v5 -- index.html

# 檢視特定歷史版本的 index.html
git show v4:index.html
```
