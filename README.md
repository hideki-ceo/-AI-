# Minpaku AI Concierge

Beds24 × Gemini × LINE の民泊自動応答SaaS。仕様は Obsidian vault 内の `Desktop/24時間自動オペレーターシステム/spec.md` を参照。

## セットアップ

前提: Node.js 20 以上、Docker Desktop（ローカル Supabase 用）

```powershell
npm install
npx supabase init        # supabase/config.toml を生成（migrations はそのまま残る）
npm run db:start         # ローカル Supabase 起動。表示される anon / service_role key を控える
copy .env.local.example .env.local   # 値を記入
npm run db:reset         # migrations を適用
npm run db:types         # 型を自動生成して src/types/database.ts を置き換え
npm run dev
```

## Supabase クラウド環境

`supabase/config.toml` は生成済み。

1. [supabase.com](https://supabase.com/dashboard) でプロジェクトを作成（Region: Northeast Asia (Tokyo)）。DB パスワードは控えておく
2. `.env.local` に値を記入（下記「環境変数」）
3. migrations をクラウドに適用し、型を生成
   ```powershell
   npx supabase login
   npx supabase link --project-ref <Project ID>   # DB パスワードを聞かれる
   npm run db:push
   npx supabase gen types typescript --linked > src/types/database.ts
   ```
4. `npm run check:connections` で接続を確認する

パスワード再設定メールを使う場合は、Supabase の Authentication > URL Configuration で Redirect URLs に、開発URL（`http://localhost:3000/auth/confirm` と `http://127.0.0.1:3000/auth/confirm`）および本番の `NEXT_PUBLIC_APP_URL` に `/auth/confirm` を付けたURLを登録する。

## 環境変数

`.env.local`（テンプレートは `.env.local.example`）。各項目の取得場所はファイル内のコメントにある。

| 区分 | 変数 | 必須 |
|---|---|---|
| Supabase | `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | ○ |
| Gemini | `GEMINI_API_KEY` / `GEMINI_MODEL` | ○ |
| Beds24 | `BEDS24_INVITE_CODE` → `BEDS24_REFRESH_TOKEN` / `BEDS24_PROPERTY_ID` / `BEDS24_TEST_BOOKING_ID` | テスト・登録用 |
| LINE | `LINE_CHANNEL_ACCESS_TOKEN` / `LINE_CHANNEL_SECRET` / `LINE_TEST_USER_ID` | テスト・登録用 |
| App | `NEXT_PUBLIC_APP_URL` | ○ |

アプリ本体が使う Beds24 / LINE の認証情報は物件ごとに `property_secrets`（DB）に保存される。`.env.local` の Beds24 / LINE は、1物件分の接続テストと `property:register` の入力省略に使う。

Beds24 の招待コードは1回限り。`BEDS24_INVITE_CODE` に記入して `npm run beds24:setup` を実行すると、refresh token に交換して `BEDS24_REFRESH_TOKEN` に書き込み、物件 ID の一覧を表示する。

### 接続テスト

```powershell
npm run check:connections                       # すべて（未設定のサービスはスキップ）
npm run check:connections -- beds24 line        # supabase / gemini / beds24 / line / properties から指定
npm run check:connections -- line --send-line   # LINE_TEST_USER_ID に実際にテストメッセージを送る
```

| サービス | 確認内容 |
|---|---|
| supabase | URL・キーの形式、service_role での接続、migrations 適用状況、anon から `property_secrets` が読めないこと |
| gemini | テスト用ハウスルールで返答を1件生成 |
| beds24 | refresh token での認証、`BEDS24_PROPERTY_ID` の存在、`BEDS24_TEST_BOOKING_ID` の予約取得（個人情報は表示しない） |
| line | チャネルアクセストークン、チャネルシークレットの形式、Webhook URL の設定状況、（`--send-line` 時）push 送信 |
| properties | DB に登録済みの物件ごとの LINE / Beds24 認証 |

## 物件の登録

ログイン後、管理画面の「物件・連携設定」から設定する。オーナーは自分のアカウントに物件を登録し、管理者は登録先オーナーを選択して代行登録できる。

1. ログイン画面の「新規登録はこちら」からオーナー用アカウントを作成する（または Supabase の Authentication > Users > Add user で作成）。確認メールを有効にする場合は、Redirect URLs に登録済みの `/auth/confirm` を設定する
2. Beds24: Settings > Marketplace > API で招待コードを発行（1回限り。権限は bookings の read と properties の read）
3. LINE Developers: Messaging API チャネルの「チャネルアクセストークン（長期）」と「チャネルシークレット」を控える
4. 管理画面の「物件・連携設定」から、物件名・Beds24物件ID・Beds24認証・LINE認証を登録する。通常物件は1物件あたり月額11,000円（税込）。契約中のStripe物件数は登録時に同期される
5. 登録後に表示されるゲスト用リンクを Beds24 の予約確認メールテンプレートに貼る。`[BOOKID]` は Beds24 の予約番号に置き換える。ゲストがリンクから LINE を開いて予約番号を送ると、予約と LINE アカウントが紐づく
6. CLI で登録する場合:
   ```powershell
   npm run property:register -- --owner-email you@example.com --name "物件名" --beds24-property-id 123456 --house-rules-file rules.txt
   ```
   `.env.local` の Beds24 / LINE の値があればそれを使い、なければ対話入力で聞かれる。LINE トークン → Beds24 招待コード → Beds24 物件 ID の順に検証して登録し、`NEXT_PUBLIC_APP_URL` が公開 https URL なら LINE の Webhook URL 設定とテスト送信まで行う
7. `npm run check:connections` で物件ごとの LINE / Beds24 接続も確認できる

## データベース構成

| テーブル | 内容 | ブラウザ (authenticated) からの権限 |
|---|---|---|
| `profiles` | ユーザー・課金状態。auth.users 作成時にトリガーで自動作成 | 本人のみ SELECT |
| `properties` | 物件設定（返信モード・ハウスルール） | 本人のみ SELECT / UPDATE |
| `property_secrets` | Beds24 / LINE の認証情報 | なし（service_role のみ） |
| `chat_messages` | 受信メッセージと AI 返答案 | 物件オーナーが SELECT / UPDATE |

- `role = 'admin'` のユーザーは全テーブルを閲覧できる。
- 物件の追加・削除は Stripe quantity の同期を伴うため、Server Action から service_role で行う。
- LINE Webhook URL は物件ごとに `/api/webhooks/line/{property_id}` とし、`property_secrets.line_channel_secret` で署名を検証する。

## LINE 自動応答の流れ

`src/app/api/webhooks/line/[propertyId]/route.ts`

1. `property_secrets.line_channel_secret` で署名を検証（失敗は 401）
2. オーナーが未契約（`is_internal_free = false` かつ Subscription が active / trialing / past_due 以外）なら何もせず 200
3. 200 を即返し、`after()` で以下を実行
4. `chat_messages` に保存（`line_webhook_event_id` の UNIQUE で再送を除外）
5. 予約番号を含むメッセージなら Beds24 で照合して `line_guests` に紐付け、定型文で結果を返す（返信モードに関係なく即時送信）
6. 有効な予約（キャンセルされておらず、チェックアウト日前）に紐付いていないゲストには、予約番号の送信を求める定型文を返す。AI は使わない
7. 直近10件の会話・ハウスルール・予約情報を渡して Gemini で返答案＋日本語訳を生成
8. `reply_mode = 'auto'` かつ AI が「人の判断が必要」と判定しなければ送信 → `sent`。それ以外は `pending`（承認待ち）。失敗時は `failed` + `error_message`

友だち追加（follow）時も、予約が未確認なら予約番号の送信を案内する。

LINE Developers 側の設定: Webhook URL に `{APP_URL}/api/webhooks/line/{property_id}` を登録し、「Webhookの利用」を ON、「応答メッセージ」と「あいさつメッセージ」を OFF にする。

## 予約とゲストの紐付け

Beds24 の予約確認メールテンプレートに以下のリンクを入れる（`[BOOKID]` は Beds24 のテンプレート変数）:

```
{APP_URL}/l/{property_id}/[BOOKID]
```

開くとゲストの LINE で公式アカウントのトークが開き、`予約番号 / Booking No: 12345678` が入力済みになる。このメッセージは予約番号だけで照合する。

リンクを使わなかったゲストには、**予約番号とチェックイン日**を一緒に送るよう案内し、両方を Beds24 で照合する（`2026-11-03` / `2026年11月3日` / `11月3日` / `11/3` / `Nov 3` などに対応。`11/3` のように月日と日月のどちらとも取れる書き方は両方で照合する）。

総当たり対策として、照合に24時間で5回失敗した LINE ユーザーは24時間受け付けない（`line_guests.link_failure_count`）。

## 鍵番号の送信条件と支払い判定

鍵番号は次の4つがすべて揃ったときだけ送る（`claim_lock_delivery`）:

1. サービス利用可: テナントが無料（`is_free_tier`）・物件が課金免除（`is_exempt_from_billing`）・月額サブスクが `active` のいずれか
2. 宿泊代金の支払い済み（`bookings.is_paid`）
3. 宿泊者名簿の提出が 100%
4. チェックインの1週間（7日）前以降（JST）

送信時期:

- 1週間前の時点で 1〜3 が揃っている → その日の 9:00 JST に送る（Vercel Cron が `/api/cron/lock-delivery` を毎日呼ぶ。`vercel.json`）
- 1週間前を過ぎてから揃った → 揃った時点（名簿の提出・支払いの確認）で送る

定期実行は、送信に失敗した予約（LINE 未連携など）の再試行も兼ねる。Vercel の環境変数に `CRON_SECRET` を設定すること。日数を変えるときは `LOCK_CODE_LEAD_DAYS`（[src/lib/lock-delivery.ts](src/lib/lock-delivery.ts)）と `claim_lock_delivery` の両方を変える。

`is_paid` の判定元（`bookings.payment_source`）:

| 判定元 | 条件 | 受け口 |
|---|---|---|
| `beds24` | Beds24 の請求項目で支払い合計 ≥ 請求合計（請求項目がなければ予約金額）。0円の予約は対象外 | `/api/webhooks/beds24/{property_id}` が Beds24 API で毎回確認 |
| `stripe_direct` | オーナー独自サイトの予約代金が、オーナーの Stripe で支払われた | `/api/webhooks/stripe-direct/{property_id}` |
| `ota` | Airbnb 経由の予約（Beds24 の `channel` / `referer` / `apiSource` に airbnb を含む）。代金は Airbnb が回収済み | `/api/webhooks/beds24/{property_id}` |

`stripe_direct` で支払い済みになった予約は、Beds24 側に入金記録がなくても未払いに戻さない。

Booking.com / Agoda / Expedia は現地払いの予約もあるため `ota` に含めず、Beds24 の入金記録で判定する（対象は [src/lib/ota.ts](src/lib/ota.ts)）。

### オーナー独自サイトの Stripe 決済を連携する

1. オーナーのサイトで Checkout Session を作るとき、`metadata[beds24_booking_id]` に Beds24 の予約番号を入れる（PaymentIntent を直接使う場合は PaymentIntent の metadata）
2. オーナーの Stripe ダッシュボード > Webhook で、エンドポイント `{APP_URL}/api/webhooks/stripe-direct/{property_id}` を追加。イベントは `checkout.session.completed` / `checkout.session.async_payment_succeeded` / `payment_intent.succeeded`
3. 表示された署名シークレット（`whsec_...`）を SQL Editor で保存:
   ```sql
   update public.property_secrets
   set stripe_direct_webhook_secret = 'whsec_...'
   where property_id = '<property_id>';
   ```

予約が Beds24 から同期される前に決済の通知が届いた場合は 409 を返し、Stripe の自動再送で後から反映する。

## 定期報告・宿泊者名簿

`/dashboard/reports`（`/login` でログイン）で、2か月ごとの宿泊日数・宿泊者数・延べ宿泊者数・国籍別内訳を表示し、月別の宿泊者名簿を PDF / CSV で出力する。

PDF は Noto Sans JP と、ハングルを含む欄だけ Noto Sans KR を埋め込む（`assets/fonts/`、SIL Open Font License）。使った文字だけを埋め込むため、ファイルサイズは小さい。タイ文字・アラビア文字など、両フォントにない文字は表示されない。

## 開発状況

- [x] DB スキーマ・RLS、Supabase クライアント
- [x] LINE Webhook → Gemini → 自動返信 / 承認待ち
- [x] Beds24 予約とゲストの紐付け（メールのリンク＋予約番号の手入力）
- [x] 物件登録（Beds24 招待コード交換・LINE 認証情報の検証・Webhook 自動設定）。CLI のみ
- [x] 接続確認 CLI（`npm run check:connections`）
- [ ] Supabase クラウドへの migrations 適用（`.env.local` の記入後）
- [ ] 認証画面・ダッシュボード（承認待ち一覧、承認時は push 送信）
- [ ] 物件の追加・削除 Server Action + Stripe quantity 同期
- [ ] Stripe Checkout / Webhook（`subscription_status` の更新）

## ソアリング合同会社アカウントの無料化

対象ユーザーがサインアップした後、SQL Editor で実行:

```sql
update public.profiles
set is_internal_free = true, role = 'admin'
where email = 'xxx@example.com';
```
