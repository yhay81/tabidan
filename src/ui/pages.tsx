import type { TripBundle, TripDay, TripItem, TripPlan } from "../domain";
import { product } from "../config/product";
import { Layout } from "./layout";

const kindCopy = {
  food: { icon: "♨", label: "食べる" },
  free: { icon: "•", label: "自由" },
  move: { icon: "→", label: "移動" },
  see: { icon: "◇", label: "立ち寄る" },
  stay: { icon: "⌂", label: "泊まる" },
} as const;

function localIso(offsetDays: number) {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.valueOf() - offset).toISOString().slice(0, 10);
}

function formatDate(value: string, options?: Intl.DateTimeFormatOptions) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("ja-JP", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    weekday: "short",
    ...options,
  }).format(date);
}

function dayNumber(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) ? "--" : String(date.getUTCDate()).padStart(2, "0");
}

function monthName(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.valueOf())
    ? "---"
    : new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" })
        .format(date)
        .toUpperCase();
}

function dateRangeLabel(start: string, end: string) {
  return start === end
    ? formatDate(start, { year: "numeric" })
    : `${formatDate(start, { year: "numeric" })} — ${formatDate(end)}`;
}

function itemCount(plan: TripPlan) {
  return plan.days.reduce((total, day) => total + day.items.length, 0);
}

function yen(value: number) {
  return new Intl.NumberFormat("ja-JP", {
    currency: "JPY",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function MapLink({ place }: { place: string }) {
  return place ? (
    <a
      class="map-link"
      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`}
      rel="noreferrer"
      target="_blank"
    >
      地図
    </a>
  ) : null;
}

function TimelineItem({ item }: { item: TripItem }) {
  const kind = kindCopy[item.kind];
  return (
    <article class="timeline-item" data-item-id={item.id} data-kind={item.kind}>
      <time>{item.time || "—"}</time>
      <span class="item-pin" aria-hidden="true">
        {kind.icon}
      </span>
      <div class="item-card">
        <header>
          <div>
            <span class="kind-label">{kind.label}</span>
            <h3>{item.title}</h3>
          </div>
          <div class="item-actions editor-only">
            <button data-edit-item={item.id} type="button">
              編集
            </button>
            <button data-delete-item={item.id} type="button">
              削除
            </button>
          </div>
        </header>
        {item.place ? (
          <p class="item-place">
            {item.place} <MapLink place={item.place} />
          </p>
        ) : null}
        {item.note ? <p class="item-note">{item.note}</p> : null}
        {item.cost || item.url ? (
          <footer>
            {item.cost ? <span>{yen(item.cost)}</span> : <span></span>}
            {item.url ? (
              <a href={item.url} rel="noreferrer" target="_blank">
                予約・案内 ↗
              </a>
            ) : null}
          </footer>
        ) : null}
      </div>
    </article>
  );
}

function DayTimeline({ day, index }: { day: TripDay; index: number }) {
  return (
    <section class="day-timeline" data-day-panel={day.date} hidden={index !== 0}>
      <header class="day-heading">
        <span>DAY {index + 1}</span>
        <h2>{day.label || formatDate(day.date)}</h2>
        <time>{formatDate(day.date, { year: "numeric" })}</time>
      </header>
      <div class="timeline-list">
        {day.items.length ? (
          day.items.map((item) => <TimelineItem item={item} />)
        ) : (
          <div class="empty-state">
            <span aria-hidden="true">＋</span>
            <strong>この日の予定はまだありません</strong>
            <p>編集URLから、移動や立ち寄り先を追加できます。</p>
          </div>
        )}
      </div>
    </section>
  );
}

function ItineraryView({ plan }: { plan: TripPlan }) {
  return (
    <>
      <div class="day-tabs" id="day-tabs" role="tablist">
        {plan.days.map((day, index) => (
          <button
            aria-selected={index === 0 ? "true" : "false"}
            data-day-tab={day.date}
            type="button"
          >
            <span>DAY {index + 1}</span>
            <strong>{dayNumber(day.date)}</strong>
            <small>{monthName(day.date)}</small>
          </button>
        ))}
      </div>
      <div id="timeline-root">
        {plan.days.map((day, index) => (
          <DayTimeline day={day} index={index} />
        ))}
      </div>
    </>
  );
}

function ChecklistView({ plan }: { plan: TripPlan }) {
  const checked = plan.checklist.filter((item) => item.checked).length;
  return (
    <section class="checklist-view">
      <header class="section-heading">
        <div>
          <span>PACKING</span>
          <h2>持ち物</h2>
        </div>
        <strong>
          {checked} / {plan.checklist.length}
        </strong>
      </header>
      <div class="progress-track" aria-hidden="true">
        <i
          style={{
            width: `${plan.checklist.length ? (checked / plan.checklist.length) * 100 : 0}%`,
          }}
        ></i>
      </div>
      <div class="checklist-grid" id="checklist-root">
        {plan.checklist.length ? (
          plan.checklist.map((item) => (
            <label class="check-row" data-check-id={item.id}>
              <input checked={item.checked} data-toggle-check={item.id} type="checkbox" />
              <span class="check-box" aria-hidden="true"></span>
              <span>
                <strong>{item.text}</strong>
                {item.owner ? <small>{item.owner}</small> : null}
              </span>
              <button class="editor-only" data-delete-check={item.id} type="button">
                削除
              </button>
            </label>
          ))
        ) : (
          <div class="empty-state">
            <span aria-hidden="true">✓</span>
            <strong>持ち物はまだありません</strong>
            <p>みんなで確認したい物を追加できます。</p>
          </div>
        )}
      </div>
    </section>
  );
}

function ExpenseView({ plan }: { plan: TripPlan }) {
  const total = plan.expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const perPerson = plan.travelers.length ? Math.round(total / plan.travelers.length) : 0;
  const paid = new Map<string, number>();
  for (const traveler of plan.travelers) paid.set(traveler, 0);
  for (const expense of plan.expenses) {
    if (expense.paidBy) paid.set(expense.paidBy, (paid.get(expense.paidBy) ?? 0) + expense.amount);
  }
  return (
    <section class="expense-view">
      <header class="section-heading">
        <div>
          <span>COST</span>
          <h2>費用メモ</h2>
        </div>
        <strong>{yen(total)}</strong>
      </header>
      <div class="cost-summary">
        <div>
          <span>合計</span>
          <strong>{yen(total)}</strong>
        </div>
        <div>
          <span>ひとり目安</span>
          <strong>{plan.travelers.length ? yen(perPerson) : "—"}</strong>
        </div>
        <div>
          <span>人数</span>
          <strong>{plan.travelers.length || "—"}</strong>
        </div>
      </div>
      <div class="expense-list" id="expense-root">
        {plan.expenses.length ? (
          plan.expenses.map((expense) => (
            <article data-expense-id={expense.id}>
              <span class="expense-dot" aria-hidden="true"></span>
              <div>
                <strong>{expense.label}</strong>
                <small>{expense.paidBy ? `${expense.paidBy} が支払い` : "支払者未定"}</small>
              </div>
              <b>{yen(expense.amount)}</b>
              <button class="editor-only" data-delete-expense={expense.id} type="button">
                削除
              </button>
            </article>
          ))
        ) : (
          <div class="empty-state">
            <span aria-hidden="true">¥</span>
            <strong>費用メモはまだありません</strong>
            <p>交通費や宿代を入れると、一人分の目安が見えます。</p>
          </div>
        )}
      </div>
      {plan.travelers.length && total ? (
        <div class="settlement-list">
          <h3>同じ金額で分けた場合</h3>
          {plan.travelers.map((traveler) => {
            const balance = (paid.get(traveler) ?? 0) - perPerson;
            return (
              <div>
                <span>{traveler}</span>
                <strong data-balance={balance >= 0 ? "plus" : "minus"}>
                  {balance >= 0 ? "+" : "−"}
                  {yen(Math.abs(balance))}
                </strong>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

export function HomePage() {
  const startDate = localIso(14);
  const endDate = localIso(15);
  return (
    <Layout>
      <section class="home-workspace">
        <form class="create-panel" id="create-trip-form">
          <header class="panel-heading">
            <div>
              <span>NEW TRIP</span>
              <h1>新しいしおり</h1>
            </div>
            <span class="privacy-chip">登録なし</span>
          </header>

          <label class="field wide">
            <span>旅の名前</span>
            <input
              autocomplete="off"
              id="trip-title"
              maxlength={80}
              name="title"
              required
              value="週末の金沢"
            />
          </label>
          <label class="field wide">
            <span>行き先</span>
            <input
              autocomplete="off"
              id="trip-destination"
              maxlength={100}
              name="destination"
              required
              value="石川県 金沢"
            />
          </label>
          <div class="field-row">
            <label class="field">
              <span>出発日</span>
              <input id="start-date" name="startDate" required type="date" value={startDate} />
            </label>
            <label class="field">
              <span>帰着日</span>
              <input id="end-date" name="endDate" required type="date" value={endDate} />
            </label>
          </div>
          <label class="field wide">
            <span>
              予定を貼り付け <small>任意</small>
            </span>
            <textarea
              id="paste-plan"
              maxlength={4000}
              name="pastePlan"
              placeholder={"09:00 東京駅 集合\n11:32 金沢駅 到着\n12:00 近江町市場で昼食"}
              rows={5}
            ></textarea>
            <small>1行に「時刻 予定」。あとで何度でも編集できます。</small>
          </label>
          <fieldset class="accent-field">
            <legend>しおりの色</legend>
            <div class="accent-choices">
              {["sunrise", "coast", "forest", "night"].map((accent, index) => (
                <button
                  aria-label={["朝焼け", "海", "森", "夜"][index]}
                  aria-pressed={index === 0 ? "true" : "false"}
                  data-accent={accent}
                  data-selected={index === 0 ? "true" : "false"}
                  type="button"
                >
                  <i></i>
                </button>
              ))}
            </div>
          </fieldset>
          <input autocomplete="off" class="honey" name="website" tabindex={-1} />
          <p class="form-error" hidden id="create-error" role="alert"></p>
          <button class="primary-button" type="submit">
            <span>しおりを作る</span>
            <i aria-hidden="true">→</i>
          </button>
          <p class="form-note">
            旅程は共有URLを知る人だけが閲覧できます。旅の35日後に自動削除します。
          </p>
        </form>

        <section class="trip-preview" data-accent="sunrise" aria-label="しおりの見本">
          <header class="preview-ticket">
            <div class="ticket-date">
              <span id="preview-month">{monthName(startDate)}</span>
              <strong id="preview-day">{dayNumber(startDate)}</strong>
            </div>
            <div>
              <span class="ticket-kicker">TRIP PLAN</span>
              <h2 id="preview-title">週末の金沢</h2>
              <p id="preview-destination">石川県 金沢</p>
            </div>
            <span class="ticket-days" id="preview-days">
              2 DAYS
            </span>
          </header>
          <div class="preview-tabs" aria-hidden="true">
            <span data-active="true">旅程</span>
            <span>持ち物</span>
            <span>費用</span>
          </div>
          <div class="preview-route">
            <div>
              <time>09:00</time>
              <i>→</i>
              <span>
                <strong>東京駅から出発</strong>
                <small>北陸新幹線</small>
              </span>
            </div>
            <div>
              <time>11:32</time>
              <i>◇</i>
              <span>
                <strong>金沢駅</strong>
                <small>鼓門で集合写真</small>
              </span>
            </div>
            <div>
              <time>12:00</time>
              <i>♨</i>
              <span>
                <strong>近江町市場</strong>
                <small>昼食 · ひとり ¥2,000</small>
              </span>
            </div>
            <div>
              <time>14:00</time>
              <i>◇</i>
              <span>
                <strong>21世紀美術館</strong>
                <small>企画展は予約済み</small>
              </span>
            </div>
          </div>
          <footer class="preview-footer">
            <span>
              <i></i> 予定 4
            </span>
            <span>
              <i></i> 持ち物 8
            </span>
            <span>
              <i></i> 共有できる
            </span>
          </footer>
        </section>
      </section>

      <section class="create-success" hidden id="create-success">
        <span class="success-mark" aria-hidden="true">
          ✓
        </span>
        <div>
          <p class="section-kicker">READY</p>
          <h1>しおりを作りました</h1>
          <p>閲覧用URLと編集用URLは別です。編集用URLは一緒に計画する人だけへ渡してください。</p>
        </div>
        <div class="url-stack">
          <label>
            <span>みんなに見せるURL</span>
            <div>
              <input id="share-url" readonly />
              <button data-copy-target="share-url" type="button">
                コピー
              </button>
            </div>
          </label>
          <label>
            <span>一緒に編集するURL</span>
            <div>
              <input id="edit-url" readonly />
              <button data-copy-target="edit-url" type="button">
                コピー
              </button>
            </div>
          </label>
          <a class="primary-button" id="open-trip" href="/">
            しおりを開く <i>→</i>
          </a>
        </div>
      </section>
    </Layout>
  );
}

export function TripPage({ bundle }: { bundle: TripBundle }) {
  const { plan, trip } = bundle;
  const encodedPlan = encodeURIComponent(JSON.stringify(plan));
  const encodedTrip = encodeURIComponent(JSON.stringify(trip));
  const checked = plan.checklist.filter((item) => item.checked).length;
  const total = plan.expenses.reduce((sum, item) => sum + item.amount, 0);
  return (
    <Layout
      canonicalPath={`/t/${trip.id}`}
      description={`${trip.destination}への旅程、持ち物、費用をまとめた共有しおり。`}
      noIndex
      page="trip"
      title={`${trip.title} | ${product.name}`}
    >
      <article
        class="trip-page"
        data-accent={trip.accent}
        data-plan={encodedPlan}
        data-trip={encodedTrip}
        data-trip-id={trip.id}
      >
        <header class="trip-ticket">
          <div class="ticket-date large">
            <span id="trip-month">{monthName(trip.start_date)}</span>
            <strong id="trip-day">{dayNumber(trip.start_date)}</strong>
          </div>
          <div class="trip-identity">
            <span class="ticket-kicker">SHARED TRIP</span>
            <h1 id="trip-title-label">{trip.title}</h1>
            <p>
              <span id="trip-destination-label">{trip.destination}</span>
              <span aria-hidden="true"> · </span>
              <time id="trip-date-label">{dateRangeLabel(trip.start_date, trip.end_date)}</time>
            </p>
          </div>
          <div class="trip-sync">
            <span id="sync-dot"></span>
            <strong id="sync-state">閲覧モード</strong>
            <small>更新 {new Date(trip.updated_at * 1000).toLocaleDateString("ja-JP")}</small>
          </div>
        </header>

        <nav class="view-tabs" aria-label="しおりの内容">
          <button aria-selected="true" data-view-tab="itinerary" type="button">
            <span>ROUTE</span>
            <strong>旅程</strong>
            <small>{itemCount(plan)}</small>
          </button>
          <button aria-selected="false" data-view-tab="checklist" type="button">
            <span>PACK</span>
            <strong>持ち物</strong>
            <small>
              {checked}/{plan.checklist.length}
            </small>
          </button>
          <button aria-selected="false" data-view-tab="expenses" type="button">
            <span>COST</span>
            <strong>費用</strong>
            <small>{total ? yen(total) : "—"}</small>
          </button>
        </nav>

        <div class="trip-layout">
          <section class="trip-content">
            <div data-view-panel="itinerary">
              <ItineraryView plan={plan} />
            </div>
            <div data-view-panel="checklist" hidden>
              <ChecklistView plan={plan} />
            </div>
            <div data-view-panel="expenses" hidden>
              <ExpenseView plan={plan} />
            </div>
          </section>

          <aside class="trip-rail">
            <section class="rail-card share-card">
              <header>
                <span aria-hidden="true">↗</span>
                <h2>しおりを共有</h2>
              </header>
              <button id="copy-view-url" type="button">
                閲覧URLをコピー
              </button>
              <button class="editor-only" id="copy-edit-url" type="button">
                共同編集URLをコピー
              </button>
              <p>編集URLを知る人は予定を変更できます。</p>
            </section>
            <section class="rail-card travel-party">
              <header>
                <span aria-hidden="true">◎</span>
                <h2>一緒に行く人</h2>
              </header>
              <div id="traveler-list">
                {plan.travelers.length ? (
                  plan.travelers.map((traveler, index) => (
                    <span>
                      <i aria-hidden="true">{traveler.slice(0, 1)}</i>
                      {traveler}
                      <button
                        class="editor-only"
                        data-delete-traveler={index}
                        title={`${traveler}を削除`}
                        type="button"
                      >
                        ×
                      </button>
                    </span>
                  ))
                ) : (
                  <p>まだ登録されていません</p>
                )}
              </div>
              <form class="compact-form editor-only" id="traveler-form">
                <input maxlength={40} name="traveler" placeholder="名前" required />
                <button type="submit">追加</button>
              </form>
            </section>
            <section class="rail-card utility-card">
              <button id="print-trip" type="button">
                <span aria-hidden="true">▤</span> 印刷・PDF
              </button>
              <button id="export-trip" type="button">
                <span aria-hidden="true">↓</span> JSON保存
              </button>
              <button id="calendar-trip" type="button">
                <span aria-hidden="true">□</span> カレンダー
              </button>
            </section>
          </aside>
        </div>

        <section class="editor-drawer" hidden id="editor-panel">
          <header>
            <div>
              <span class="section-kicker">EDIT</span>
              <h2>しおりを編集</h2>
            </div>
            <span class="save-state" id="save-state">
              保存済み
            </span>
          </header>
          <div class="editor-grid">
            <form id="item-form">
              <h3>予定</h3>
              <div class="field-row">
                <label class="field">
                  <span>日</span>
                  <select id="item-day" name="day" required>
                    {plan.days.map((day) => (
                      <option value={day.date}>{formatDate(day.date)}</option>
                    ))}
                  </select>
                </label>
                <label class="field">
                  <span>時刻</span>
                  <input id="item-time" name="time" type="time" />
                </label>
                <label class="field">
                  <span>種類</span>
                  <select id="item-kind" name="kind">
                    <option value="move">移動</option>
                    <option value="see">立ち寄る</option>
                    <option value="food">食べる</option>
                    <option value="stay">泊まる</option>
                    <option value="free">自由</option>
                  </select>
                </label>
              </div>
              <label class="field wide">
                <span>予定名</span>
                <input id="item-title" maxlength={80} name="title" required />
              </label>
              <label class="field wide">
                <span>場所</span>
                <input id="item-place" maxlength={120} name="place" />
              </label>
              <label class="field wide">
                <span>メモ</span>
                <textarea id="item-note" maxlength={300} name="note" rows={2}></textarea>
              </label>
              <div class="field-row">
                <label class="field">
                  <span>案内URL</span>
                  <input id="item-url" maxlength={300} name="url" type="url" />
                </label>
                <label class="field">
                  <span>費用</span>
                  <input id="item-cost" max={10000000} min={0} name="cost" type="number" />
                </label>
              </div>
              <div class="form-actions">
                <button class="small-primary" id="save-item" type="submit">
                  予定を追加
                </button>
                <button hidden id="cancel-item-edit" type="button">
                  編集をやめる
                </button>
              </div>
            </form>

            <div class="editor-stack">
              <form id="check-form">
                <h3>持ち物</h3>
                <label class="field wide">
                  <span>品目</span>
                  <input maxlength={100} name="text" required />
                </label>
                <label class="field wide">
                  <span>
                    担当 <small>任意</small>
                  </span>
                  <input maxlength={40} name="owner" />
                </label>
                <button class="small-primary" type="submit">
                  持ち物を追加
                </button>
              </form>
              <form id="expense-form">
                <h3>費用</h3>
                <label class="field wide">
                  <span>内容</span>
                  <input maxlength={80} name="label" required />
                </label>
                <div class="field-row">
                  <label class="field">
                    <span>金額</span>
                    <input max={10000000} min={0} name="amount" required type="number" />
                  </label>
                  <label class="field">
                    <span>支払った人</span>
                    <select name="paidBy">
                      <option value="">未定</option>
                      {plan.travelers.map((traveler) => (
                        <option value={traveler}>{traveler}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <button class="small-primary" type="submit">
                  費用を追加
                </button>
              </form>
            </div>

            <form id="settings-form">
              <h3>しおり情報</h3>
              <label class="field wide">
                <span>旅の名前</span>
                <input maxlength={80} name="title" required value={trip.title} />
              </label>
              <label class="field wide">
                <span>行き先</span>
                <input maxlength={100} name="destination" required value={trip.destination} />
              </label>
              <div class="field-row">
                <label class="field">
                  <span>出発日</span>
                  <input name="startDate" required type="date" value={trip.start_date} />
                </label>
                <label class="field">
                  <span>帰着日</span>
                  <input name="endDate" required type="date" value={trip.end_date} />
                </label>
              </div>
              <button class="small-primary" type="submit">
                しおり情報を保存
              </button>
              <button class="danger-button" id="delete-trip" type="button">
                しおりを削除
              </button>
            </form>
          </div>
          <p class="form-error" hidden id="edit-error" role="alert"></p>
        </section>

        <div class="auth-message" hidden id="edit-auth-error">
          <strong>編集用URLを確認できませんでした</strong>
          <p>作成時に発行された編集用URLを、そのまま開いてください。</p>
        </div>
      </article>
    </Layout>
  );
}

export function PrivacyPage() {
  return (
    <Layout page="privacy" title={`プライバシー | ${product.name}`}>
      <article class="prose">
        <p class="section-kicker">PRIVACY</p>
        <h1>旅の情報を、必要な間だけ預かります</h1>
        <h2>しおりに保存するもの</h2>
        <p>
          旅の名前、行き先、日程、予定、場所、メモ、案内URL、費用、同行者の表示名、持ち物をCloudflare
          D1へ保存します。写真、現在地、メールアドレス、電話番号、チャット、予約確認書は扱いません。
        </p>
        <h2>共有と編集</h2>
        <p>
          閲覧URLを知る人はしおりを閲覧できます。編集URLには43文字のランダムな鍵が含まれ、そのURLを知る人は内容を変更できます。鍵はURL
          fragmentに置き、サーバーにはSHA-256ハッシュだけを保存します。公開して困る住所、予約番号、連絡先は入力しないでください。
        </p>
        <h2>保持期間と削除</h2>
        <p>
          しおりは旅行終了日の35日後に自動削除します。編集URLを持つ人は、編集欄からいつでも即時削除できます。ブラウザには匿名の利用識別子と、最後に開いた日だけを保存します。
        </p>
        <h2>匿名集計</h2>
        <p>
          訪問、作成、編集、共有、印刷、書き出し、別日の再訪を日単位で匿名集計し、35日後に削除します。旅程本文、検索語、URL、表示名、IPアドレスは集計へ保存しません。広告Cookieや外部解析SDKは使いません。自動QAは集計前に破棄します。
        </p>
      </article>
    </Layout>
  );
}

export function NotFoundPage() {
  return (
    <Layout noIndex page="not-found" title={`見つかりません | ${product.name}`}>
      <section class="not-found">
        <span aria-hidden="true">⌁</span>
        <h1>このしおりは見つかりません</h1>
        <p>URLが違うか、旅行終了から35日が経過して削除された可能性があります。</p>
        <a href="/">新しいしおりを作る</a>
      </section>
    </Layout>
  );
}
