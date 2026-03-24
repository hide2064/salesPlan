@echo off
chcp 65001 > nul
setlocal

echo ============================================
echo  売上管理システム 起動スクリプト
echo ============================================
echo.

:: .env ファイルがなければコピー
if not exist ".env" (
    echo [INFO] .env ファイルが見つかりません。.env.example からコピーします。
    copy ".env.example" ".env" > nul
    echo [INFO] .env を作成しました。必要に応じてパスワードを変更してください。
    echo.
)

:: Docker が起動しているか確認
docker info > nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker が起動していません。Docker Desktop を起動してから再実行してください。
    pause
    exit /b 1
)

:: 起動モードの選択
echo 起動モードを選択してください:
echo   1. 開発モード  (ホットリロード対応 / http://localhost:5173)
echo   2. 本番モード  (ビルド済み / http://localhost:80)
echo   3. 停止        (全コンテナを停止)
echo   4. 終了
echo.
set /p MODE="番号を入力してください [1-4]: "

if "%MODE%"=="1" goto DEV
if "%MODE%"=="2" goto PROD
if "%MODE%"=="3" goto STOP
if "%MODE%"=="4" goto END

echo [ERROR] 無効な選択です。
pause
exit /b 1

:: ─────────────────────────────────────
:DEV
echo.
echo [INFO] 開発モードで起動します...
docker compose -f docker-compose.dev.yml up --build -d
if errorlevel 1 (
    echo [ERROR] 起動に失敗しました。ログを確認してください。
    pause
    exit /b 1
)

echo.
echo [INFO] 起動完了！
echo ─────────────────────────────────────
echo  フロントエンド : http://localhost:5173
echo  APIサーバー    : http://localhost:3001
echo  初期ログイン   : admin / Admin1234!
echo ─────────────────────────────────────
echo.
echo [ヒント] サンプルデータを投入するには:
echo   docker exec sales_server npx tsx src/seed.ts
echo.
echo [ヒント] ログを確認するには:
echo   docker compose -f docker-compose.dev.yml logs -f
echo.

set /p SEED="サンプルデータを投入しますか？ [y/N]: "
if /i "%SEED%"=="y" (
    echo [INFO] サンプルデータを投入中...（MySQLの起動を待っています）
    timeout /t 10 /nobreak > nul
    docker exec sales_server npx tsx src/seed.ts
    if errorlevel 1 (
        echo [WARN] サンプルデータの投入に失敗しました。MySQLの起動が完了していない可能性があります。
        echo        少し待ってから手動で実行してください:
        echo        docker exec sales_server npx tsx src/seed.ts
    ) else (
        echo [INFO] サンプルデータの投入が完了しました。
    )
)

goto OPEN_BROWSER

:: ─────────────────────────────────────
:PROD
echo.
echo [INFO] 本番モードでビルド・起動します（初回は数分かかります）...
docker compose up --build -d
if errorlevel 1 (
    echo [ERROR] 起動に失敗しました。ログを確認してください。
    pause
    exit /b 1
)

echo.
echo [INFO] 起動完了！
echo ─────────────────────────────────────
echo  フロントエンド : http://localhost:80
echo  初期ログイン   : admin / Admin1234!
echo ─────────────────────────────────────
echo.
set URL=http://localhost

goto OPEN_BROWSER_PROD

:: ─────────────────────────────────────
:STOP
echo.
echo [INFO] コンテナを停止します...
docker compose -f docker-compose.dev.yml down 2> nul
docker compose down 2> nul
echo [INFO] 停止しました。
pause
exit /b 0

:: ─────────────────────────────────────
:OPEN_BROWSER
set URL=http://localhost:5173

:OPEN_BROWSER_PROD
echo ブラウザを開きますか？ [y/N]:
set /p OPEN=
if /i "%OPEN%"=="y" (
    start "" "%URL%"
)

echo.
echo [INFO] 終了するにはこのウィンドウを閉じてください。
echo        コンテナはバックグラウンドで動作を続けます。
echo        停止するには start.bat の「3. 停止」を選択してください。
pause
exit /b 0

:: ─────────────────────────────────────
:END
exit /b 0
