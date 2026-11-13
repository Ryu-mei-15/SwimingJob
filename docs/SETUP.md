# GoogleスプレッドシートとGitHub Pagesの設定

## 1. Google側を準備する

1. 使用するGoogleアカウントで [Google Apps Script](https://script.google.com/) を開き、新しいプロジェクトを作ります。
2. 次の5つのスクリプトファイルを追加し、ファイルの内容を貼り付けます。Apps Scriptの編集画面ではファイル名末尾の `.gs` は自動で付きます。
   - `backend/Server.gs`
   - `backend/Core.gs`
   - `backend/Menus.gs`
   - `backend/AuthCrypto.gs`
   - `.local/InitialAccount.gs`（初期アカウント専用。GitHubへは追加しません）
3. プロジェクトの設定でマニフェストファイルの表示を有効にし、`backend/appsscript.json` の内容を設定します。
4. `Server.gs` の末尾に、次の初期設定用関数を一時的に追加して保存します。末尾が `_` の関数は実行一覧に表示されないため、この関数から呼び出します。

   ```javascript
   function runInitialSetup() {
     setupSwimNote_();
   }
   ```

5. 上部の関数一覧で `runInitialSetup` を選んで実行し、Googleの承認を済ませます。この処理で、指定済みの初期アカウントと「スイムノートDB」が作成されます。
6. 実行ログに表示されたスプレッドシートを開きます。共有設定は制限付きのまま使います。`DB_A` / `DB_B` はアプリ用なので直接書き換えません。
7. 追加した `runInitialSetup` の3行だけを削除して保存し、デプロイへ進みます。元の `setupSwimNote_` は残します。

初期アカウント設定ファイルには、パスワードそのものではなく、ランダムなsaltと検証値を設定済みです。パスワードをHTMLやconfig.jsonへ書く必要はありません。初期設定済みの状態でsetupSwimNote_を再実行しても、既存データは消去しません。

## 2. 保存APIをデプロイする

Apps Scriptで「デプロイ」→「新しいデプロイ」→「ウェブアプリ」を選びます。

- 実行するユーザー：自分
- アクセスできるユーザー：全員（Anyone）

この設定で公開されるのは保存APIの入口です。名簿の取得・変更にはアプリのログインが必要で、スプレッドシート自体は非公開のままです。Google Workspaceの制限で「全員」が選べない場合は、そのアカウントの管理者による確認が必要です。

発行された `https://script.google.com/macros/s/.../exec` のURLを控えます。`/dev` のURLは使用しません。
[発行URL](https://script.google.com/macros/s/AKfycbyZjLswLmPDGY111Cs0gifoqcw5kZ6GEEMKHB7gd5zEwcX6l1Vz_Ei7npwHsQIgr1OZ/exec)

## 3. GitHub Pagesへ接続する

1. リポジトリ直下の **`config.json`** にある `apiUrl` に、上記の `/exec` URLを入れます。URLにはパスワードやトークンを付けません。`index.html` と `public/index.html` は公開時にこの設定から再生成されるため、HTML内のURLを直接編集しても公開時に上書きされます。
2. Google側のScript Propertiesの `ALLOWED_ORIGIN` は `https://ryu-mei-15.github.io` に初期設定しています。独自ドメインに変える場合だけ、そのオリジンへ変更します。
3. ソースをGitHubへ反映します。`.local/`、旧「プールバイト」フォルダ、名簿JSON・Excel・バックアップは `.gitignore` で除外しています。
4. GitHubの Settings → Pages → Source を **GitHub Actions** にします。
5. `main` への更新で `.github/workflows/pages.yml` が動きます。ビルドして検査した `public/` だけを公開します。
6. 予定URLは `https://ryu-mei-15.github.io/SwimingJob/` です。リポジトリ名のつづりは `SwimingJob` です。

ローカルで作業する場合は `node tools/build.mjs` でルートとpublicのHTMLを更新します。GitHub上でconfig.jsonを編集した場合は、Actions内でHTMLを生成します。

画面に「Google側の接続設定が未完了です」と出る場合は、まず `config.json` の `apiUrl` を確認してください。GitHub Actionsの最新実行が成功した後、サイトを再表示します。接続先が未設定、または公開HTMLと設定が一致しない場合は、公開前の検査で停止するようにしています。

## 4. 既存データを移行する

1. 以前のローカル版で最新のバックアップJSONを保存します。
2. 新しいPagesのURLで、指定したID・パスワードによりログインします。
3. 「データを開く」からバックアップを選び、「追加・更新する」で反映します。JSONの選択はPC内で行い、保存時に認証済みのGoogle APIへ内容が送られます。
4. 子どもの人数、クラス、合格級、過去の実測タイムを確認します。
5. 一度ログアウトし、再ログインして同じ内容を確認します。別PCでも確認します。
6. 生年月日と学年、100mの目印を印刷プレビューで確認します。

初期状態の練習カードはサンプルです。各クラスに合わせて時間と内容を調整してください。旧バックアップを「名簿全体を入れ替える」で復元しても、そのファイルに練習データが存在しない場合は現在の練習カード・レッスンを保持します。新形式で練習データを含むバックアップは、それらも復元します。

## 運用

- 10分無操作、画面更新、タブ終了の後は再ログインします。
- ログアウトでは未保存のレッスンや入力も消えます。作業途中は「保存する」を使ってください。
- 保存に失敗したときは「保存を再試行」。別PCで変更されていたら、必要に応じてバックアップで未確定の内容を保管し、「最新を取得」を選びます。
- 15分以内にログイン失敗が5回続くと、その期間が終わるまで待機が必要です。
- バックエンド変更後はApps Scriptのデプロイ管理で新バージョンへ更新します。同じデプロイを更新すればURLは維持できます。

## 参照した公式仕様

- [実行一覧での非公開関数の扱い](https://googleappsscript.blogspot.com/2010/06/hiding-helper-functions.html)
- [Google Apps Scriptのウェブアプリ](https://developers.google.com/apps-script/guides/web)
- [HtmlOutputとiframeの設定](https://developers.google.com/apps-script/reference/html/html-output)
- [Google Apps ScriptのLock Service](https://developers.google.com/apps-script/reference/lock/)
- [Script Properties](https://developers.google.com/apps-script/guides/properties)
- [OWASPのパスワード保存指針](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
