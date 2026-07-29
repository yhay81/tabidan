# たび段

旅程、持ち物、費用を一枚にまとめ、登録なしのURLで同行者と共有できる日本語の旅のしおりです。

- 本番: <https://tabidan.yhay81.com>
- プライバシー: <https://tabidan.yhay81.com/privacy>
- 運営: [yhay81](https://github.com/yhay81)

## Product

- 旅の名前、行き先、出発・帰着日と、行単位の予定を貼り付けてしおりを作成
- 日ごとのタイムライン、場所からGoogle Mapsへの導線、予約URL、費用を管理
- 同行者、共有持ち物、支払者つき費用メモと均等割りの差額を管理
- 閲覧URLと共同編集URLを分離
- JSON、iCalendar、ブラウザ印刷/PDFへ書き出し
- 写真、現在地、メール、電話番号、チャット、決済は扱わない

## Stack

Cloudflare Workers、D1、Rate Limiting、Hono、Hono JSX、Vite+、TypeScriptを使います。所有アカウントや長期セッションを必要とせず、高エントロピーの編集URLで共同編集するため、初期版ではBetter Authを導入していません。

## Local development

Node.js 24 LTSとnpm 11を使用します。

```powershell
npm ci
npx wrangler d1 migrations apply tabidan --local
npm run dev
```

## Verification

```powershell
npm run release:check
npm run check
npm test
npm run build
npm audit --audit-level=high
```

## Deployment

```powershell
npx wrangler d1 migrations apply tabidan --remote
npm run deploy
npm run indexnow
npm run metrics
```

しおりは旅行終了日の35日後に自動削除されます。公開判断は[EXPERIMENT.md](EXPERIMENT.md)、保存境界は[PRIVACY.md](PRIVACY.md)、安全設計は[SECURITY.md](SECURITY.md)を参照してください。
