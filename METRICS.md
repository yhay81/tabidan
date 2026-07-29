# Metrics

`npm run metrics`は、本番D1から個人を特定できない集計だけをJSONで出力します。

## Funnel

| Field       | Meaning                                 |
| ----------- | --------------------------------------- |
| `users`     | `visited`を記録した実利用者             |
| `creators`  | しおりを作成した利用者                  |
| `editors`   | 作成後に内容を1回以上保存した利用者     |
| `sharers`   | 閲覧または共同編集URLをコピーした利用者 |
| `printers`  | 印刷/PDF操作を開始した利用者            |
| `exporters` | JSONまたはiCalendarを書き出した利用者   |
| `returned`  | 別日に再訪した利用者                    |

## Product state

- `active_trips`: 削除期限前のしおり
- `edited_trips`: 作成後に1回以上保存されたしおり
- `collaborative_trips`: 同行者表示名が2件以上あるしおり
- `save_actions`: 全しおりの更新回数

同一人物・同一日の同種イベントは一度だけ数えます。`?qa=1`またはWebDriverによる自動QAはサーバーで破棄します。ページビューだけ、作成直後の空しおり、自動検査を中核job完了とみなしません。
