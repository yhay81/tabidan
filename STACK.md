# Stack

## Selected

- Cloudflare Workers: Honoアプリ、Custom Domain、Cron
- D1: 期限付きの共有しおりと匿名日次イベント
- Cloudflare Rate Limiting: 作成・編集操作
- Hono / Hono JSX: HTTP routingとエスケープ済みSSR
- Vite+ / TypeScript / Vitest / Oxlint / Oxfmt
- Browser Web APIs: Clipboard、印刷、Blob、iCalendar/JSON生成、Web Crypto

## Deliberately deferred

- Better Auth: 個人所有アカウント、一人ごとの権限、複数端末の棚が必要になるまで導入しない
- R2/Images: 写真や予約確認書を扱わない
- Maps API: 場所文字列からGoogle Mapsの公開検索URLを作るだけで、位置座標や検索履歴を保持しない
- Email/Push: 連絡先と通知運用を持たない
- Payments: 30日パイロットでは扱わない
- AI: 予定貼り付けは端末内の決定的な行解析で行い、旅程を外部モデルへ送らない

## Production origin

正規URLは`https://tabidan.yhay81.com`だけとし、`workers.dev`とpreview URLを無効にします。Cookieを使わず、編集鍵を`.yhay81.com`全体へ共有しません。
