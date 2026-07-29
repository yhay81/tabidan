# 30-day public usage pilot

## User and job

- Target user: 友人、家族、カップル、遠征仲間との旅行で、LINE、地図、予約URL、表計算に情報が散らばる日本語の旅行幹事
- Job: アプリ導入や会員登録を同行者へ頼まず、旅程、持ち物、費用をまとめ、旅行前から当日まで同じしおりを共同利用する
- Current workaround: Tabiori、TabiSync、nicody、LINE、Google Maps、スプレッドシート、紙のしおりの併用

## Hypothesis

行単位の予定を貼り付けて作れる、登録不要の閲覧・共同編集URLがあれば、旅行幹事は新規旅行の計画と当日確認をこのサービスだけで完了し、同行者を自然に招待する。

## Method

- Channel: Tool Shelfと「旅のしおり 作成」「旅行計画 共有」「旅行 日程表」などの自然検索
- Direct outreach: 行わない
- Duration: 2026-07-29から2026-08-28
- Real usage: 自動QAを除外し、実旅程を作成、再編集、共有、印刷または書き出した匿名行動だけを採用する

## Decision

- Continue/improve: 実利用者50人以上、作成者10人以上、編集者6人以上、共有者5人以上、同行者2人以上を登録したしおり3件以上、印刷または書き出し3人以上、別日再訪3人以上
- Stop/redesign: 実利用者10人未満、作成者3人未満、共有または出力0、もしくは既存の無料競合で十分という反証に利用理由が集中する
- Deadline: 2026-08-28
- Maximum monthly infrastructure cost: 10 USD
- Payment: 初期期間は扱わない

## Guardrails

- 共有URLを検索へ掲載せず、閲覧ページは`noindex`にする。
- 編集鍵を平文保存せず、URL fragmentとSHA-256ハッシュに分ける。
- 写真、現在地、予約番号、連絡先、チャット、決済を初期範囲へ入れない。
- 利用者数を増やすために保持期間、入力制限、削除可能性を弱めない。
- 自動QAを実利用として数えない。
