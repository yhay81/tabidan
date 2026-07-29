# Security

## Implemented

- 編集鍵はWeb Cryptoで32 byte生成し、URL fragmentへ置く
- D1には編集鍵のSHA-256ハッシュだけを保存
- Bearer tokenで編集、削除を認可
- 更新番号による楽観ロックで、別端末の上書きを409にする
- JSON bodyは52KB、旅程14日、予定336件以内などに制限
- 外部URLは認証情報を含まないHTTPSだけを許可
- Hono JSXと`textContent`だけで利用者入力を描画し、HTMLを受け取らない
- Same-origin / same-siteの書き込みだけを受理
- Cloudflare Rate Limiting、CSP、HSTS、COOP、CORP、`noindex`
- CSVやファイルアップロード、画像、現在地、決済を扱わない
- 旅行終了35日後の自動削除と編集URLからの即時削除

## Constraints

編集URLを受け取った人は内容を変更できます。共同編集者ごとの権限、変更履歴、編集鍵の再発行は初期版にありません。編集URLを公開場所へ掲載しないでください。

予約番号、自宅住所、連絡先、身分証情報など、漏えい時に困る情報の保管には使わないでください。

脆弱性や公開すべきでない情報を公開Issueへ投稿しないでください。GitHubのprivate vulnerability reportingを利用します。
