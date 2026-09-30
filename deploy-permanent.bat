@echo off
echo ========================================================
echo   CIVIC INFRASTRUCTURE AI - PERMANENT ACCESS DEPLOYMENT
echo ========================================================
echo.
echo Option 1: Deploy 24/7 Free to Cloud (Render.com)
echo Option 2: Run High-Speed Cloudflare Tunnel
echo Option 3: Exit
echo.
set /p opt="Choose an option (1, 2, or 3): "

if "%opt%"=="1" (
    echo.
    echo To deploy 24/7 permanently to the cloud:
    echo 1. Create a free repository on https://github.com/new
    echo 2. Paste the repository URL below:
    set /p repo="Enter GitHub Repo URL (e.g. https://github.com/username/repo.git): "
    if not "%repo%"=="" (
        git remote remove origin 2>nul
        git remote add origin %repo%
        git branch -M main
        git push -u origin main
        echo.
        echo Code pushed to GitHub successfully!
        echo Now go to https://dashboard.render.com -> "New +" -> "Web Service" -> Connect this repo.
        echo Render will build and host your app permanently 24/7 with HTTPS!
    )
    pause
)

if "%opt%"=="2" (
    echo Starting Cloudflare Tunnel...
    .\cloudflared.exe tunnel --url http://localhost:3000
)
