# 環境の数字（毎日の集計）

毎朝4:30（日本時間）の「Daily rival decks」（`.github/workflows/daily-decks.yml`、`src/sim/daily.ts`）が、対戦サーバーの公開されている集計をここに保存します。攻略wikiに出ている数字と同じものです（プレイヤーのデッキリストや端末のIDなど、管理用の生データは含みません）。

| ファイル | 中身 |
|---|---|
| `tier.json` | 環境Tier（デッキの型ごとの強さ）と、カードの採用率 `cards`（カードID → [採用率%, 採用された試合数]） |
| `stats.json` | 最新バージョンの実戦成績（カードごとの使用試合数・使ったときの勝率・影響 `lift`） |
| `book.json` | AIのデッキ帳（その日に公開したもの） |
| `report.md` | その日の環境レポート（お試し中のリスト、改良、使用デッキ、新しいデッキ・型の候補） |
| `history/日付-tier.json`, `history/日付-stats.json` | 毎日の記録 |
